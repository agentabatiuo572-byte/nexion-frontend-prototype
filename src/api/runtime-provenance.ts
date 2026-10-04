import type { ApiEnvironment } from "./runtime-config";

export type ServerSourceEnvironment = "PRODUCTION";

/**
 * Development and production both consume backend-canonical data. The build
 * mode selects the Java endpoint only; it never selects a client-side data rail.
 */
export function matchesRuntimeProvenance(
  source: Record<string, unknown>,
  mode: ApiEnvironment,
  expectedSource: string,
): source is Record<string, unknown> & {
  source: string;
  sourceEnvironment: ServerSourceEnvironment;
  runId: string;
} {
  if (source.source !== expectedSource || typeof source.sourceEnvironment !== "string" || typeof source.runId !== "string") return false;
  if (mode === "prod" || mode === "dev") return source.sourceEnvironment === "PRODUCTION" && source.runId === "";
  return false;
}
