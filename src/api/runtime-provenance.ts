import type { ApiResponseEnvironment } from "./runtime-config";
import { isCurrentCommerceSandboxRun } from "./order-api";

export type ServerSourceEnvironment = "PRODUCTION" | "SANDBOX";

/**
 * A remote API response is accepted only on the rail that created it.  In an
 * explicit App sandbox, the catalogue is the authority for the active RunID;
 * a well-shaped but different RunID is still stale data.
 */
export function matchesRuntimeProvenance(
  source: Record<string, unknown>,
  mode: ApiResponseEnvironment,
  expectedSource: string,
): source is Record<string, unknown> & {
  source: string;
  sourceEnvironment: ServerSourceEnvironment;
  runId: string;
} {
  if (source.source !== expectedSource || typeof source.sourceEnvironment !== "string" || typeof source.runId !== "string") return false;
  if (mode === "prod") return source.sourceEnvironment === "PRODUCTION" && source.runId === "";
  if (mode === "dev") return source.sourceEnvironment === "SANDBOX" && isCurrentCommerceSandboxRun(source.runId);
  return false;
}
