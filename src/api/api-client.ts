import { isUserSession, type ApiResult, type AuthSessionResponse } from "./contracts";
import { ApiError, asApiError } from "./errors";
import type { SessionSnapshot, SessionVault } from "./session-vault";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface HttpRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export interface HttpTransport {
  request(request: HttpRequest): Promise<HttpResponse>;
  upload?(request: HttpUploadRequest): Promise<HttpResponse>;
}

export interface HttpUploadRequest {
  url: string;
  filePath: string;
  name: string;
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
  signal?: AbortSignal;
  acceptedResponses?: ReadonlyArray<{
    status: number;
    code: number;
    message: string;
  }>;
}

export interface ApiClient {
  request<T>(request: ApiRequest): Promise<T>;
  upload<T>(request: ApiUploadRequest): Promise<T>;
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
}

interface ApiClientOptions {
  baseUrl: string;
  transport: HttpTransport;
  vault: SessionVault;
  onUnauthorized?: () => void | Promise<void>;
  allowInsecureHttp?: boolean;
}

function normalizeBaseUrl(value: string, allowInsecureHttp: boolean): string {
  const baseUrl = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ApiError({ kind: "configuration", message: "API_BASE_URL_INVALID" });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ApiError({ kind: "configuration", message: "API_BASE_URL_INVALID" });
  }
  if (parsed.protocol === "http:" && !allowInsecureHttp) {
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
  if (status !== 401 && code !== 401) return false;
  return /^(AUTH_REQUIRED|USER_AUTH_REQUIRED|TOKEN_|USER_REFRESH_TOKEN_|REFRESH_)/.test(message);
}

function authenticatedSession(value: unknown): value is AuthSessionResponse & {
  accessToken: string;
  refreshToken: string;
} {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSessionResponse>;
  return (
    typeof session.accessToken === "string"
    && session.accessToken.length > 0
    && typeof session.refreshToken === "string"
    && session.refreshToken.length > 0
    && typeof session.tokenType === "string"
    && session.tokenType.toLowerCase() === "bearer"
    && isUserSession(session.user)
  );
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl, options.allowInsecureHttp ?? true);
  let refreshInFlight: Promise<SessionSnapshot> | null = null;

  async function execute<T>(
    request: HttpRequest,
    acceptedResponses: ApiRequest["acceptedResponses"] = [],
  ): Promise<T> {
    let response: HttpResponse;
    try {
      response = await options.transport.request(request);
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

  async function expireSession(expectedRevision: number): Promise<never> {
    if (!options.vault.clearIfUnchanged(expectedRevision)) {
      throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REFRESH" });
    }
    await options.onUnauthorized?.();
    throw new ApiError({ kind: "auth", message: "SESSION_EXPIRED", status: 401, code: 401 });
  }

  async function refreshNow(): Promise<SessionSnapshot> {
    const revision = options.vault.revision();
    const current = options.vault.read();
    if (!current?.refreshToken) return expireSession(revision);
    try {
      const data = await execute<AuthSessionResponse>({
        url: `${baseUrl}/auth/users/refresh`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { refreshToken: current.refreshToken },
        timeoutMs: 12_000,
      });
      if (!authenticatedSession(data)) {
        throw new ApiError({ kind: "protocol", message: "AUTH_RESPONSE_INVALID" });
      }
      if (data.user.userId !== current.user.userId) {
        throw new ApiError({ kind: "protocol", message: "REFRESH_USER_MISMATCH" });
      }
      const next: SessionSnapshot = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenType: data.tokenType,
        user: data.user,
      };
      if (!options.vault.saveIfUnchanged(next, revision)) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REFRESH" });
      }
      return next;
    } catch (error) {
      if (
        error instanceof ApiError
        && (error.message === "SESSION_EXPIRED" || error.message === "SESSION_CHANGED_DURING_REFRESH")
      ) throw error;
      const apiError = asApiError(error);
      if (apiError.kind === "auth") return expireSession(revision);
      throw apiError;
    }
  }

  function refreshSession(): Promise<SessionSnapshot> {
    if (!refreshInFlight) {
      refreshInFlight = refreshNow().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function request<T>(apiRequest: ApiRequest): Promise<T> {
    const authenticated = apiRequest.authenticated !== false;
    let session = options.vault.read();
    if (authenticated && !session?.accessToken) {
      // A protected prefetch started from Login has no authority to mutate the
      // global auth lifecycle. Treat the missing vault as a local caller-state
      // error; onUnauthorized is reserved for a session that existed and was
      // rejected/expired by the server. This also prevents a stale pre-login
      // promise from clearing a newer successful login.
      throw new ApiError({ kind: "auth", message: "AUTH_SESSION_REQUIRED" });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
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
    };
    if (apiRequest.body !== undefined) httpRequest.body = apiRequest.body;

    try {
      return await execute<T>(httpRequest, apiRequest.acceptedResponses);
    } catch (error) {
      const apiError = asApiError(error);
      if (!authenticated || apiError.kind !== "auth") throw apiError;
      const latest = options.vault.read();
      if (!session || !latest || latest.user.userId !== session.user.userId) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
      }
      const refreshed = latest?.accessToken && latest.accessToken !== session?.accessToken
        ? latest
        : await refreshSession();
      return execute<T>(
        {
          ...httpRequest,
          headers: {
            ...httpRequest.headers,
            Authorization: `${refreshed.tokenType || "Bearer"} ${refreshed.accessToken}`,
          },
        },
        apiRequest.acceptedResponses,
      );
    }
  }

  async function upload<T>(apiRequest: ApiUploadRequest): Promise<T> {
    if (!options.transport.upload) {
      throw new ApiError({ kind: "configuration", message: "FILE_UPLOAD_TRANSPORT_UNAVAILABLE" });
    }
    const authenticated = apiRequest.authenticated !== false;
    let session = options.vault.read();
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
    };
    const executeUpload = () => options.transport.upload!(uploadRequest)
      .then((response) => executeResponse<T>(response));
    try {
      return await executeUpload();
    } catch (error) {
      const apiError = asApiError(error);
      if (!authenticated || apiError.kind !== "auth") throw apiError;
      const latest = options.vault.read();
      if (!session || !latest || latest.user.userId !== session.user.userId) {
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_REQUEST" });
      }
      const refreshed = latest.accessToken && latest.accessToken !== session.accessToken
        ? latest : await refreshSession();
      uploadRequest.headers.Authorization = `${refreshed.tokenType || "Bearer"} ${refreshed.accessToken}`;
      return executeUpload();
    }
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

  return { request, upload, refreshSession };
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
          method: request.method,
          header: request.headers,
          data: request.body as UniNamespace.RequestOptions["data"],
          timeout: request.timeoutMs,
          success: (response) => resolveOnce({
            status: response.statusCode,
            data: response.data,
            headers: response.header as Record<string, string>,
          }),
          fail: () => rejectOnce(request.signal?.aborted
            ? new ApiError({ kind: "network", message: "REQUEST_ABORTED", retryable: false })
            : new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE", retryable: true })),
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
  };
}
