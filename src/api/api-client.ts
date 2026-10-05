import { isUserSession, type ApiResult, type AuthSessionResponse } from "./contracts";
import { ApiError, asApiError } from "./errors";
import type { RefreshCredentialMode, SessionSnapshot, SessionVault } from "./session-vault";
import { withSessionCookieLock } from "./session-cookie-lock";
import { acquireRotationNonce, clearRotationNonce, discardRotationNonce } from "./session-rotation-nonce";
import { reportNativeSessionStage } from "./native-session-storage";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  withCredentials?: boolean;
}

export interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export interface HttpTransport {
  request(request: HttpRequest): Promise<HttpResponse>;
  upload?(request: HttpUploadRequest): Promise<HttpResponse>;
  download?(request: HttpDownloadRequest): Promise<{ status: number; filePath?: string; blob?: Blob }>;
}

export interface HttpUploadRequest {
  url: string;
  filePath: string;
  name: string;
  headers: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
  formData?: Record<string, string>;
}

export interface HttpDownloadRequest {
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ApiRequest {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  authenticated?: boolean;
  idempotencyKey?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  acceptedResponses?: ReadonlyArray<{
    status: number;
    code: number;
    message: string;
  }>;
}

export interface ApiClient {
  /** Holds the current authentication identity across a multi-request operation. */
  captureSessionGuard?(): () => void;
  request<T>(request: ApiRequest): Promise<T>;
  upload<T>(request: ApiUploadRequest): Promise<T>;
  download?(request: { path: string; signal?: AbortSignal }): Promise<string>;
  refreshSession(): Promise<SessionSnapshot>;
}

export interface ApiUploadRequest {
  path: string;
  filePath: string;
  name?: string;
  authenticated?: boolean;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  formData?: Record<string, string>;
}

interface ApiClientOptions {
  baseUrl: string;
  transport: HttpTransport;
  vault: SessionVault;
  onUnauthorized?: () => void | Promise<void>;
  onSessionRefreshed?: () => void;
  allowInsecureHttp?: boolean;
  refreshCredentialMode?: RefreshCredentialMode;
}

function normalizeBaseUrl(value: string, allowInsecureHttp: boolean): string {
  const baseUrl = value.trim().replace(/\/+$/, "");
  let protocol = "";
  if (typeof URL === "function") {
    try {
      protocol = new URL(baseUrl).protocol;
    } catch {
      // Keep the same configuration error in browser runtimes.
    }
  } else {
    // App Plus service JS does not provide the browser URL constructor.
    const match = /^(https?):\/\/(?:\[[\da-f:.]+\]|[a-z\d.-]+)(?::(\d{1,5}))?(?:\/[^\s?#]*)?$/i.exec(baseUrl);
    if (match && (!match[2] || Number(match[2]) <= 65535)) protocol = `${match[1].toLowerCase()}:`;
  }
  if (protocol !== "https:" && protocol !== "http:") {
    throw new ApiError({ kind: "configuration", message: "API_BASE_URL_INVALID" });
  }
  if (protocol === "http:" && !allowInsecureHttp) {
    throw new ApiError({ kind: "configuration", message: "API_HTTPS_REQUIRED" });
  }
  return baseUrl;
}

function isEnvelope(value: unknown): value is ApiResult<unknown> {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<ApiResult<unknown>>;
  return typeof envelope.code === "number" && typeof envelope.message === "string" && "data" in envelope;
}

function decodeTransportData(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function authFailure(status: number, code?: number, message = ""): boolean {
  if (terminalAuthFailure(status, code, message)) return true;
  if (status !== 401 && code !== 401) return false;
  return /^(AUTH_REQUIRED|USER_AUTH_REQUIRED|TOKEN_|USER_REFRESH_TOKEN_|REFRESH_)/.test(message);
}

/** A blocklisted account is a terminal server decision, never a refreshable token expiry. */
function terminalAuthFailure(status: number, code?: number, message = ""): boolean {
  return (status === 403 || code === 403)
    && (message === "ACCOUNT_BLOCKLISTED" || message === "USER_REFRESH_NOT_ALLOWED");
}

function authenticatedSession(value: unknown, credentialMode: RefreshCredentialMode): value is AuthSessionResponse & {
  accessToken: string;
} {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSessionResponse>;
  return (
    typeof session.accessToken === "string"
    && session.accessToken.length > 0
    && (credentialMode === "cookie"
      ? session.refreshToken === null
      : typeof session.refreshToken === "string" && session.refreshToken.length > 0)
    && typeof session.tokenType === "string"
    && session.tokenType.toLowerCase() === "bearer"
    && isUserSession(session.user)
  );
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl, options.allowInsecureHttp ?? true);
  const refreshCredentialMode = options.refreshCredentialMode ?? "token";
  let refreshInFlight: Promise<SessionSnapshot> | null = null;

  async function execute<T>(
    request: HttpRequest,
    acceptedResponses: ApiRequest["acceptedResponses"] = [],
  ): Promise<T> {
    let response: HttpResponse;
    try {
      const send = () => options.transport.request(request);
      response = refreshCredentialMode === "cookie" && request.method === "POST"
        && request.url.startsWith(`${baseUrl}/auth/users/`)
        && request.url !== `${baseUrl}/auth/users/refresh`
        // Logout revokes the whole refresh chain even if another tab rotates
        // concurrently. It must remain available if Web Locks is disabled.
        && request.url !== `${baseUrl}/auth/users/logout`
        ? await withSessionCookieLock(send)
        : await send();
    } catch (error) {
      throw asApiError(error);
    }

    const responseData = decodeTransportData(response.data);
    const envelope = isEnvelope(responseData) ? responseData : null;
    const explicitlyAccepted = !!envelope && acceptedResponses.some(
      (accepted) => accepted.status === response.status
        && accepted.code === envelope.code
        && accepted.message === envelope.message,
    );
    if (authFailure(response.status, envelope?.code, envelope?.message)) {
      throw new ApiError({
        kind: "auth",
        message: envelope?.message || "AUTH_REQUIRED",
        status: response.status,
        code: envelope?.code,
      });
    }
    if ((response.status < 200 || response.status >= 300) && !explicitlyAccepted) {
      throw new ApiError({
        kind: "http",
        message: envelope?.message || `HTTP_${response.status}`,
        status: response.status,
        code: envelope?.code,
        retryable: response.status >= 500,
      });
    }
    if (!envelope) {
      throw new ApiError({ kind: "protocol", message: "API_ENVELOPE_INVALID", status: response.status });
    }
    if (envelope.code !== 0 && !explicitlyAccepted) {
      throw new ApiError({
        kind: "business",
        message: envelope.message || "BUSINESS_ERROR",
        status: response.status,
        code: envelope.code,
      });
    }
    return envelope.data as T;
  }

  async function terminateSession(
    expectedRevision: number,
    message = "SESSION_EXPIRED",
    status = 401,
    code = 401,
  ): Promise<never> {
    if (!options.vault.clearIfUnchanged(expectedRevision)) {
      throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REFRESH" });
    }
    if (refreshCredentialMode === "cookie") discardRotationNonce();
    await options.onUnauthorized?.();
    throw new ApiError({ kind: "auth", message, status, code });
  }

  async function expireSession(expectedRevision: number): Promise<never> {
    return terminateSession(expectedRevision);
  }

  async function refreshNow(rotationNonce?: string): Promise<SessionSnapshot> {
    const revision = options.vault.revision();
    const current = options.vault.read();
    if (refreshCredentialMode === "token" && !current?.refreshToken) return expireSession(revision);
    try {
      reportNativeSessionStage("REFRESH_BEGIN");
      const data = await execute<AuthSessionResponse>({
        url: `${baseUrl}/auth/users/refresh`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(refreshCredentialMode === "cookie" ? { "X-Nexion-Refresh-Mode": "cookie" } : {}),
          ...(rotationNonce ? { "X-NexGrid-Rotation-Key": rotationNonce } : {}),
        },
        ...(refreshCredentialMode === "token" ? { body: { refreshToken: current!.refreshToken } } : {}),
        timeoutMs: 12_000,
        withCredentials: refreshCredentialMode === "cookie",
      });
      if (!authenticatedSession(data, refreshCredentialMode)) {
        reportNativeSessionStage("REFRESH_RESPONSE_INVALID");
        throw new ApiError({ kind: "protocol", message: "AUTH_RESPONSE_INVALID" });
      }
      if (current && data.user.userId !== current.user.userId) {
        reportNativeSessionStage("REFRESH_DENIED");
        return expireSession(revision);
      }
      reportNativeSessionStage("REFRESH_SERVER_ACCEPTED");
      const next: SessionSnapshot = {
        accessToken: data.accessToken,
        refreshToken: refreshCredentialMode === "cookie" ? "" : data.refreshToken as string,
        tokenType: data.tokenType,
        user: data.user,
        refreshCredentialMode,
        sessionSyncKey: typeof data.sessionSyncKey === "string" ? data.sessionSyncKey : undefined,
      };
      const commitRevision = options.vault.revision();
      if (commitRevision !== revision && !options.vault.isRefreshContinuation(revision)) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REFRESH" });
      }
      const previousAccessToken = options.vault.read()?.accessToken;
      if (!options.vault.refreshIfUnchanged(next, commitRevision)) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REFRESH" });
      }
      reportNativeSessionStage("REFRESH_COMMITTED");
      if (current && next.accessToken !== previousAccessToken) {
        try { options.onSessionRefreshed?.(); } catch { /* The accepted session remains committed. */ }
      }
      return next;
    } catch (error) {
      if (
        error instanceof ApiError
        && (error.message === "SESSION_EXPIRED" || error.message === "SESSION_CHANGED_DURING_REFRESH")
      ) {
        reportNativeSessionStage(error.message === "SESSION_EXPIRED" ? "REFRESH_DENIED" : "REFRESH_SUPERSEDED");
        throw error;
      }
      const apiError = asApiError(error);
      // A denial from the refresh endpoint is terminal, unlike a resource's
      // ordinary permission 403. Never evict a newer revision or an empty boot.
      if (current && (apiError.kind === "auth" || apiError.status === 401 || apiError.status === 403
          || apiError.code === 401 || apiError.code === 403)) {
        reportNativeSessionStage("REFRESH_DENIED");
        return expireSession(revision);
      }
      reportNativeSessionStage("REFRESH_FAILED");
      throw apiError;
    }
  }

  function refreshSession(): Promise<SessionSnapshot> {
    if (!refreshInFlight) {
      const revision = options.vault.revision();
      const refresh = refreshCredentialMode === "cookie"
        ? withSessionCookieLock(async () => {
          const nonce = acquireRotationNonce();
          let session: SessionSnapshot;
          try {
            session = await refreshNow(nonce);
          } catch (error) {
            if (asApiError(error).message !== "USER_REFRESH_ROTATION_SUPERSEDED") throw error;
            // Another tab may still be installing the newer shared cookie.
            await new Promise(resolve => setTimeout(resolve, 100));
            try {
              session = await refreshNow(nonce);
            } catch (retryError) {
              if (asApiError(retryError).message === "USER_REFRESH_ROTATION_SUPERSEDED") {
                return terminateSession(revision);
              }
              throw retryError;
            }
          }
          clearRotationNonce(nonce);
          return session;
        }) : refreshNow();
      refreshInFlight = refresh.catch(async (error: unknown) => {
        const apiError = asApiError(error);
        if ((apiError.message === "COOKIE_LOCK_UNAVAILABLE"
            || apiError.message === "COOKIE_ROTATION_STORAGE_UNAVAILABLE") && options.vault.read()
            && options.vault.clearIfUnchanged(revision)) await options.onUnauthorized?.();
        throw apiError;
      }).finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function request<T>(apiRequest: ApiRequest): Promise<T> {
    const authenticated = apiRequest.authenticated !== false;
    let session = options.vault.read();
    const sessionRevision = options.vault.revision();
    if (authenticated && !session?.accessToken) {
      // A protected prefetch started from Login has no authority to mutate the
      // global auth lifecycle. Treat the missing vault as a local caller-state
      // error; onUnauthorized is reserved for a session that existed and was
      // rejected/expired by the server. This also prevents a stale pre-login
      // promise from clearing a newer successful login.
      throw new ApiError({ kind: "auth", message: "AUTH_SESSION_REQUIRED" });
    }

    const headers: Record<string, string> = {
      ...(apiRequest.headers ?? {}),
      "Content-Type": "application/json",
    };
    if (authenticated && session?.accessToken) {
      headers.Authorization = `${session.tokenType || "Bearer"} ${session.accessToken}`;
    }
    if (apiRequest.idempotencyKey) headers["Idempotency-Key"] = apiRequest.idempotencyKey;

    const httpRequest: HttpRequest = {
      url: `${baseUrl}/${apiRequest.path.replace(/^\/+/, "")}`,
      method: apiRequest.method ?? "GET",
      headers,
      timeoutMs: apiRequest.timeoutMs ?? 12_000,
      signal: apiRequest.signal,
      withCredentials: refreshCredentialMode === "cookie",
    };
    if (apiRequest.body !== undefined) httpRequest.body = apiRequest.body;

    try {
      return await execute<T>(httpRequest, apiRequest.acceptedResponses);
    } catch (error) {
      const apiError = asApiError(error);
      if (!authenticated || apiError.kind !== "auth") throw apiError;
      if (terminalAuthFailure(apiError.status ?? 0, apiError.code, apiError.message)) {
        return terminateSession(sessionRevision, apiError.message, apiError.status ?? 403, apiError.code ?? 403);
      }
      const latest = options.vault.read();
      if (!session || !latest || latest.user.userId !== session.user.userId
          || (options.vault.revision() !== sessionRevision && !options.vault.isRefreshContinuation(sessionRevision))) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
      }
      const refreshed = latest?.accessToken && latest.accessToken !== session?.accessToken
        ? latest
        : await refreshSession();
      if (options.vault.revision() !== sessionRevision && !options.vault.isRefreshContinuation(sessionRevision)) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
      }
      const retryRevision = options.vault.revision();
      try {
        return await execute<T>(
          {
            ...httpRequest,
            headers: {
              ...httpRequest.headers,
              Authorization: `${refreshed.tokenType || "Bearer"} ${refreshed.accessToken}`,
            },
          },
          apiRequest.acceptedResponses,
        );
      } catch (retryError) {
        const rejected = asApiError(retryError);
        if (rejected.kind === "auth" && options.vault.revision() === retryRevision) {
          return terminateSession(retryRevision, rejected.message, rejected.status ?? 401, rejected.code ?? 401);
        }
        throw rejected;
      }
    }
  }

  async function upload<T>(apiRequest: ApiUploadRequest): Promise<T> {
    if (!options.transport.upload) {
      throw new ApiError({ kind: "configuration", message: "FILE_UPLOAD_TRANSPORT_UNAVAILABLE" });
    }
    const authenticated = apiRequest.authenticated !== false;
    let session = options.vault.read();
    const sessionRevision = options.vault.revision();
    if (authenticated && !session?.accessToken) {
      throw new ApiError({ kind: "auth", message: "AUTH_SESSION_REQUIRED" });
    }
    const headers: Record<string, string> = {};
    if (authenticated && session?.accessToken) {
      headers.Authorization = `${session.tokenType || "Bearer"} ${session.accessToken}`;
    }
    if (apiRequest.idempotencyKey) headers["Idempotency-Key"] = apiRequest.idempotencyKey;
    const uploadRequest: HttpUploadRequest = {
      url: `${baseUrl}/${apiRequest.path.replace(/^\/+/, "")}`,
      filePath: apiRequest.filePath,
      name: apiRequest.name ?? "file",
      headers,
      timeoutMs: apiRequest.timeoutMs ?? 30_000,
      signal: apiRequest.signal,
      formData: apiRequest.formData,
    };
    const executeUpload = () => options.transport.upload!(uploadRequest)
      .then((response) => executeResponse<T>(response));
    try {
      return await executeUpload();
    } catch (error) {
      const apiError = asApiError(error);
      if (!authenticated || apiError.kind !== "auth") throw apiError;
      if (terminalAuthFailure(apiError.status ?? 0, apiError.code, apiError.message)) {
        return terminateSession(sessionRevision, apiError.message, apiError.status ?? 403, apiError.code ?? 403);
      }
      const latest = options.vault.read();
      if (!session || !latest || latest.user.userId !== session.user.userId
          || (options.vault.revision() !== sessionRevision && !options.vault.isRefreshContinuation(sessionRevision))) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
      }
      const refreshed = latest.accessToken && latest.accessToken !== session.accessToken
        ? latest : await refreshSession();
      if (options.vault.revision() !== sessionRevision && !options.vault.isRefreshContinuation(sessionRevision)) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
      }
      const retryRevision = options.vault.revision();
      uploadRequest.headers.Authorization = `${refreshed.tokenType || "Bearer"} ${refreshed.accessToken}`;
      try {
        return await executeUpload();
      } catch (retryError) {
        const rejected = asApiError(retryError);
        if (rejected.kind === "auth" && options.vault.revision() === retryRevision) {
          return terminateSession(retryRevision, rejected.message, rejected.status ?? 401, rejected.code ?? 401);
        }
        throw rejected;
      }
    }
  }

  async function download(apiRequest: { path: string; signal?: AbortSignal }): Promise<string> {
    if (!options.transport.download) throw new ApiError({ kind: "configuration", message: "FILE_DOWNLOAD_TRANSPORT_UNAVAILABLE" });
    const session = options.vault.read();
    if (!session?.accessToken) throw new ApiError({ kind: "auth", message: "AUTH_SESSION_REQUIRED" });
    const sessionRevision = options.vault.revision();
    const run = (token: string) => options.transport.download!({
      url: `${baseUrl}/${apiRequest.path.replace(/^\/+/, "")}`,
      headers: { Authorization: `${session.tokenType || "Bearer"} ${token}`, "Cache-Control": "no-store" },
      timeoutMs: 30_000,
      signal: apiRequest.signal,
    });
    let expectedRevision = sessionRevision;
    let result = await run(session.accessToken);
    if (result.status === 401 && options.vault.revision() === sessionRevision) {
      const renewed = await refreshSession();
      if (!renewed?.accessToken || renewed.user.userId !== session.user.userId) throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
      expectedRevision = options.vault.revision();
      result = await run(renewed.accessToken);
    }
    if (apiRequest.signal?.aborted) throw new ApiError({ kind: "network", message: "REQUEST_ABORTED", retryable: false });
    captureSessionGuardForDownload(session.user.userId, expectedRevision);
    if (result.status < 200 || result.status >= 300) throw new ApiError({ kind: result.status === 401 ? "auth" : "http", message: `HTTP_${result.status}`, status: result.status });
    if (result.blob) return URL.createObjectURL(result.blob);
    if (result.filePath) return result.filePath;
    throw new ApiError({ kind: "protocol", message: "FILE_DOWNLOAD_INVALID" });
  }

  function captureSessionGuardForDownload(userId: number, revision: number): void {
    if (options.vault.revision() !== revision || options.vault.read()?.user.userId !== userId) throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
  }

  async function executeResponse<T>(response: HttpResponse): Promise<T> {
    const responseData = decodeTransportData(response.data);
    const envelope = isEnvelope(responseData) ? responseData : null;
    if (authFailure(response.status, envelope?.code, envelope?.message)) {
      throw new ApiError({ kind: "auth", message: envelope?.message || "AUTH_REQUIRED", status: response.status, code: envelope?.code });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ApiError({
        kind: "http",
        message: envelope?.message || `HTTP_${response.status}`,
        status: response.status,
        code: envelope?.code,
        retryable: response.status >= 500,
      });
    }
    if (!envelope) throw new ApiError({ kind: "protocol", message: "API_ENVELOPE_INVALID", status: response.status });
    if (envelope.code !== 0) {
      throw new ApiError({ kind: "business", message: envelope.message || "BUSINESS_ERROR", status: response.status, code: envelope.code });
    }
    return envelope.data as T;
  }

  function captureSessionGuard(): () => void {
    const original = options.vault.read();
    const revision = options.vault.revision();
    return () => {
      const current = options.vault.read();
      if (!original || !current || current.user.userId !== original.user.userId
          || (options.vault.revision() !== revision && !options.vault.isRefreshContinuation(revision))) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
      }
    };
  }
  return { request, upload, download, refreshSession, captureSessionGuard };
}

export function createUniHttpTransport(): HttpTransport {
  return {
    request(request) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let task: { abort?: () => void } | undefined;
        const cleanup = () => request.signal?.removeEventListener("abort", onAbort);
        const resolveOnce = (response: HttpResponse) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(response);
        };
        const rejectOnce = (error: ApiError) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };
        const onAbort = () => {
          task?.abort?.();
          rejectOnce(new ApiError({
            kind: "network",
            message: "REQUEST_ABORTED",
            retryable: false,
          }));
        };
        if (request.signal?.aborted) {
          onAbort();
          return;
        }
        request.signal?.addEventListener("abort", onAbort, { once: true });
        task = uni.request({
          url: request.url,
          method: request.method as UniNamespace.RequestOptions["method"],
          header: request.headers,
          data: request.body as UniNamespace.RequestOptions["data"],
          timeout: request.timeoutMs,
          withCredentials: request.withCredentials,
          success: (response) => resolveOnce({
            status: response.statusCode,
            data: response.data,
            headers: response.header as Record<string, string>,
          }),
          fail: (error) => rejectOnce(request.signal?.aborted
            ? new ApiError({ kind: "network", message: "REQUEST_ABORTED", retryable: false })
            : new ApiError({ kind: "network", message: /timeout/i.test(error.errMsg ?? "")
              ? "REQUEST_TIMEOUT" : "NETWORK_UNAVAILABLE", retryable: true })),
        });
      });
    },
    upload(request) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let task: { abort?: () => void } | undefined;
        const cleanup = () => request.signal?.removeEventListener("abort", onAbort);
        const finish = (action: () => void) => {
          if (settled) return;
          settled = true;
          cleanup();
          action();
        };
        const onAbort = () => {
          task?.abort?.();
          finish(() => reject(new ApiError({ kind: "network", message: "REQUEST_ABORTED", retryable: false })));
        };
        if (request.signal?.aborted) {
          onAbort();
          return;
        }
        request.signal?.addEventListener("abort", onAbort, { once: true });
        task = uni.uploadFile({
          url: request.url,
          filePath: request.filePath,
          name: request.name,
          formData: request.formData,
          header: request.headers,
          timeout: request.timeoutMs,
          success: (response) => finish(() => resolve({
            status: response.statusCode,
            data: response.data,
            headers: {},
          })),
          fail: () => finish(() => reject(request.signal?.aborted
            ? new ApiError({ kind: "network", message: "REQUEST_ABORTED", retryable: false })
            : new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE", retryable: true }))),
        });
      });
    },
    download(request) {
      // #ifdef H5
      return (async () => {
        if (request.signal?.aborted) throw new ApiError({ kind: "network", message: "REQUEST_ABORTED", retryable: false });
        const controller = new AbortController();
        let timedOut = false;
        const onAbort = () => controller.abort();
        request.signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, request.timeoutMs);
        try {
          const response = await fetch(request.url, {
            method: "GET", headers: request.headers, cache: "no-store", signal: controller.signal,
          });
          if (!response.ok) return { status: response.status };
          const blob = await response.blob();
          if (request.signal?.aborted || timedOut) throw new ApiError({ kind: "network", message: request.signal?.aborted ? "REQUEST_ABORTED" : "REQUEST_TIMEOUT", retryable: !request.signal?.aborted });
          return { status: response.status, blob };
        } catch (cause) {
          if (cause instanceof ApiError) throw cause;
          throw new ApiError({ kind: "network", message: request.signal?.aborted ? "REQUEST_ABORTED" : timedOut ? "REQUEST_TIMEOUT" : "NETWORK_UNAVAILABLE", retryable: !request.signal?.aborted });
        } finally {
          clearTimeout(timer);
          request.signal?.removeEventListener("abort", onAbort);
        }
      })();
      // #endif
      // #ifndef H5
      return new Promise((resolve, reject) => {
        let settled = false;
        let task: { abort?: () => void } | undefined;
        const cleanup = () => request.signal?.removeEventListener("abort", onAbort);
        const finish = (action: () => void) => { if (!settled) { settled = true; cleanup(); action(); } };
        const onAbort = () => { task?.abort?.(); finish(() => reject(new ApiError({ kind: "network", message: "REQUEST_ABORTED", retryable: false }))); };
        if (request.signal?.aborted) { onAbort(); return; }
        request.signal?.addEventListener("abort", onAbort, { once: true });
        task = uni.downloadFile({
          url: request.url, header: request.headers, timeout: request.timeoutMs,
          success: response => finish(() => resolve({ status: response.statusCode, filePath: response.tempFilePath })),
          fail: () => finish(() => reject(new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE", retryable: true }))),
        });
      });
      // #endif
    },
  };
}
