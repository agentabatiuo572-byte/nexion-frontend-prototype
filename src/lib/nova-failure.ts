import { asApiError } from "@/api/errors";

export type NovaFailure = "busy" | "timeout" | "network" | "unavailable" | "auth" | "failed" | "interrupted" | "input-rejected";

export function novaFailure(error: unknown): NovaFailure {
  const failure = asApiError(error);
  // AppNovaAiService.validate rejects this exact envelope before reserving a turn.
  if (failure.kind === "http" && failure.status === 400 && failure.code === 400
      && failure.message === "NOVA_AI_INPUT_INVALID") return "input-rejected";
  if (failure.kind === "auth") return "auth";
  if (failure.status === 429 || ["NOVA_AI_BUSY", "NOVA_AI_CONVERSATION_BUSY", "NOVA_AI_TURN_IN_PROGRESS"].includes(failure.message)) return "busy";
  if (failure.status === 504 || failure.status === 408 || /timeout/i.test(failure.message)) return "timeout";
  if (["NOVA_AI_DISABLED", "NOVA_AI_UNAVAILABLE"].includes(failure.message)) return "unavailable";
  if (failure.kind === "network") return "network";
  return "failed";
}
