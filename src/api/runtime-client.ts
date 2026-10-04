import { createApiClient, type ApiClient, type HttpTransport } from "./api-client";
import type { ApiRuntimeConfig } from "./runtime-config";
import type { SessionVault } from "./session-vault";
import type { RefreshCredentialMode } from "./session-vault";

export interface RuntimeApiClientOptions {
  config: ApiRuntimeConfig;
  vault: SessionVault;
  transport: HttpTransport;
  development: boolean;
  /** Only the local loopback H5 preview may proxy its same-origin HTTP gateway. */
  localPreview?: boolean;
  onUnauthorized?: () => void | Promise<void>;
  onSessionRefreshed?: () => void;
  refreshCredentialMode?: RefreshCredentialMode;
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
  return createApiClient({
    baseUrl: options.config.baseUrl,
    transport: options.transport,
    vault: options.vault,
    // This is not a production HTTP exception: it is limited to the local
    // preview gateway, which proxies to the isolated acceptance backend.
    allowInsecureHttp: options.development || (options.localPreview === true && isLoopbackHttpUrl(options.config.baseUrl)),
    onUnauthorized: options.onUnauthorized,
    onSessionRefreshed: options.onSessionRefreshed,
    refreshCredentialMode: options.refreshCredentialMode,
  });
}
