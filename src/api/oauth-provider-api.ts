import type { ApiClient } from "./api-client";
import type { AuthSessionResponse } from "./contracts";
import { consumeLoginResponse } from "./auth-api";
import { ApiError } from "./errors";
import type { RefreshCredentialMode, SessionVault } from "./session-vault";

export type ThirdPartyProvider = "GOOGLE" | "APPLE" | "TELEGRAM";
export interface OAuthFlow {
  flowId: string; flowKey: string; authorizationUrl: string; expiresInSec: number;
  receipt?: string;
}
export interface OAuthStatus {
  status: "PENDING" | "VERIFIED" | "FAILED" | "CONSUMED";
  provider: ThirdPartyProvider; displayName: string | null;
}
const ROOT = "/auth/users/oauth/provider";
const PROVIDERS = ["GOOGLE", "APPLE", "TELEGRAM"] as const;
const invalid = () => new ApiError({ kind: "protocol", message: "OAUTH_RESPONSE_INVALID" });
function providerList(value: unknown): ThirdPartyProvider[] {
  if (!Array.isArray(value) || value.some(p => !PROVIDERS.includes(p)) || new Set(value).size !== value.length)
    throw invalid();
  return value;
}
export function validateOAuthFlow(value: unknown): OAuthFlow {
  const flow = value as OAuthFlow;
  if (!flow || !/^OIDC-[a-f0-9]{32}$/.test(flow.flowId) || !/^[A-Za-z0-9_-]{43}$/.test(flow.flowKey)
      || !Number.isInteger(flow.expiresInSec) || flow.expiresInSec < 1 || flow.expiresInSec > 600) throw invalid();
  // App Plus service JS has no browser URL constructor. Accept only the backend's
  // canonical HTTPS handoff route, with an optional deployment path prefix.
  const address = /^https:\/\/(?:\[[a-f\d:.]+\]|[a-z\d.-]+)(?::(\d{1,5}))?((?:\/[^\s?#\\]*)?\/auth\/users\/oauth\/provider\/authorize\/[A-Za-z0-9_-]{43})$/i.exec(flow.authorizationUrl);
  if (!address || address[1] && (Number(address[1]) < 1 || Number(address[1]) > 65535)) throw invalid();
  let path: string;
  try { path = decodeURIComponent(address[2]); } catch { throw invalid(); }
  if (path.includes("\\") || path.split("/").some(segment => segment === "." || segment === "..")) throw invalid();
  return flow;
}
export function createOAuthProviderApi(client: ApiClient, vault: SessionVault, options: {
  surface: "APP" | "H5"; refreshCredentialMode: RefreshCredentialMode;
  installationId: () => string; executionSupported: () => boolean;
}) {
  const proof = (flow: OAuthFlow) => ({ flowId: flow.flowId, flowKey: flow.flowKey, receipt: flow.receipt });
  return {
    async available() {
      return providerList(await client.request({ path: `${ROOT}/available`, authenticated: false }));
    },
    async linked() {
      return providerList(await client.request({ path: `${ROOT}/linked` }));
    },
    async start(provider: ThirdPartyProvider, intent: "LOGIN" | "LINK") {
      return validateOAuthFlow(await client.request({
        path: `${ROOT}/start`, method: "POST", body: { provider, intent }, authenticated: intent === "LINK",
      }));
    },
    async status(flow: OAuthFlow): Promise<OAuthStatus> {
      const value = await client.request<OAuthStatus>({
        path: `${ROOT}/status`, method: "POST", body: proof(flow), authenticated: false,
      });
      if (!value || !PROVIDERS.includes(value.provider)
          || !["PENDING", "VERIFIED", "FAILED", "CONSUMED"].includes(value.status)
          || value.status === "VERIFIED" && typeof value.displayName !== "string") throw invalid();
      return value;
    },
    async complete(provider: ThirdPartyProvider, flow: OAuthFlow, expectedRevision: number,
        challengeNo?: string, code?: string, captchaTicket?: string) {
      if (!flow.receipt || !/^[A-Za-z0-9_-]{43}$/.test(flow.receipt)) throw invalid();
      if (vault.revision() !== expectedRevision)
        throw new ApiError({ kind: "auth", message: "SESSION_CHANGED_DURING_AUTH" });
      const data = await client.request<AuthSessionResponse>({
        path: `${ROOT}/complete`, method: "POST",
        body: { provider, ...proof(flow), challengeNo, code, captchaTicket }, authenticated: false,
        headers: {
          ...(options.refreshCredentialMode === "cookie" ? { "X-Nexion-Refresh-Mode": "cookie" } : {}),
          ...(options.surface === "APP" ? { "X-NexGrid-Client-Surface": "APP" } : {}),
          "X-NexGrid-Installation-Id": options.surface === "APP" ? options.installationId() : "",
          "X-NexGrid-Execution-Supported": String(options.surface === "APP" && options.executionSupported()),
          // Server-generated attempt/proof remain stable across retries and interrupted responses.
          "X-NexGrid-Login-Attempt-Id": flow.flowId,
          "X-NexGrid-Login-Recovery-Key": flow.flowKey,
        },
        acceptedResponses: [{ status: 428, code: 428, message: "USER_TWO_FACTOR_VERIFICATION_REQUIRED" }],
      });
      return consumeLoginResponse(data, vault, expectedRevision, options.refreshCredentialMode);
    },
    async link(flow: OAuthFlow, password: string) {
      if (!flow.receipt || !/^[A-Za-z0-9_-]{43}$/.test(flow.receipt)) throw invalid();
      await client.request({ path: `${ROOT}/link`, method: "POST", body: { ...proof(flow), password } });
    },
  };
}
