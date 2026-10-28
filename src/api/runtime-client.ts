import { createApiClient, type ApiClient, type HttpTransport, type HttpUploadRequest, type HttpDownloadRequest } from "./api-client";
import type { ApiRuntimeConfig } from "./runtime-config";
import type { SessionVault } from "./session-vault";
import type { RefreshCredentialMode } from "./session-vault";
import { withTabReadTrace } from "./tab-read-trace";
import { ApiError } from "./errors";

export interface RuntimeApiClientOptions {
  config: ApiRuntimeConfig;
  vault: SessionVault;
  transport: HttpTransport;
  development: boolean;
  /** Only the local loopback H5 preview may proxy its same-origin HTTP gateway. */
  localPreview?: boolean;
  onUnauthorized?: (reason?: string) => void | Promise<void>;
  onSessionRefreshed?: () => void;
  refreshCredentialMode?: RefreshCredentialMode;
  nativeRefreshRecovery?: boolean;
}

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1");
  } catch {
    return false;
  }
}

/**
 * Both development and production are server-backed. The selected Java profile
 * owns behavior; this client only chooses the configured HTTP origin.
 */
export function createRuntimeApiClient(options: RuntimeApiClientOptions): ApiClient {
  const origin = () => JSON.stringify([options.config.environment, options.config.baseUrl]);
  const constructedOrigin = origin();
  let observedOrigin = constructedOrigin, originVersion = 0;
  const changed = () => new ApiError({ kind: "configuration", message: "API_RUNTIME_ORIGIN_CHANGED" });
  function assertOrigin(expectedVersion?: number): number {
    const current = origin();
    if (current !== observedOrigin) { observedOrigin = current; originVersion += 1; }
    if (current !== constructedOrigin || (expectedVersion !== undefined && expectedVersion !== originVersion)) throw changed();
    return originVersion;
  }
  // The trace remains inside this guard, so refused reads are not counted as dispatches.
  const source = withTabReadTrace(options.transport);
  const transport: HttpTransport = {
    ...source,
    async request(request) {
      const version = assertOrigin();
      try { return await source.request(request); }
      finally { if (request.method === "GET") assertOrigin(version); }
    },
    ...(source.upload ? { async upload(request: HttpUploadRequest) { assertOrigin(); return source.upload!(request); } } : {}),
    ...(source.download ? { async download(request: HttpDownloadRequest) {
      const version = assertOrigin();
      try { return await source.download!(request); }
      finally { assertOrigin(version); }
    } } : {}),
  };
  return createApiClient({
    baseUrl: options.config.baseUrl,
    transport,
    vault: options.vault,
    // This is not a production HTTP exception: it is limited to the local
    // preview gateway, which proxies to the isolated acceptance backend.
    allowInsecureHttp: options.development || (options.localPreview === true && isLoopbackHttpUrl(options.config.baseUrl)),
    onUnauthorized: options.onUnauthorized,
    onSessionRefreshed: options.onSessionRefreshed,
    refreshCredentialMode: options.refreshCredentialMode,
    nativeRefreshRecovery: options.nativeRefreshRecovery,
  });
}
