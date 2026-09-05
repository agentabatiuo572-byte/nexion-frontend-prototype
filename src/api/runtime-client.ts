import { createApiClient, type ApiClient, type HttpTransport } from "./api-client";
import { ApiError } from "./errors";
import type { ApiRuntimeConfig } from "./runtime-config";
import type { SessionVault } from "./session-vault";

export interface RuntimeApiClientOptions {
  config: ApiRuntimeConfig;
  vault: SessionVault;
  transport: HttpTransport;
  development: boolean;
  /** Only the local loopback H5 preview may proxy its same-origin HTTP gateway. */
  localPreview?: boolean;
  onUnauthorized?: () => void | Promise<void>;
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

function createMockModeApiClient(): ApiClient {
  const remoteDisabled = () => Promise.reject(new ApiError({
    kind: "configuration",
    message: "REMOTE_API_DISABLED_IN_MOCK_MODE",
  }));
  return {
    request: remoteDisabled,
    upload: remoteDisabled,
    refreshSession: remoteDisabled,
  };
}

/**
 * Remote candidates must be fully configured before boot. Explicit mock builds
 * are self-contained and receive a fail-closed client so no incidental path can
 * use the network or a same-origin fallback.
 */
export function createRuntimeApiClient(options: RuntimeApiClientOptions): ApiClient {
  if (options.config.environment === "mock") return createMockModeApiClient();
  return createApiClient({
    baseUrl: options.config.baseUrl,
    transport: options.transport,
    vault: options.vault,
    // This is not a production HTTP exception: it is limited to the local
    // preview gateway, which proxies to the isolated acceptance backend.
    allowInsecureHttp: options.development || (options.localPreview === true && isLoopbackHttpUrl(options.config.baseUrl)),
    onUnauthorized: options.onUnauthorized,
  });
}
