import { ApiError } from "@/api/errors";

export function leadershipPoolFailureState(cause: unknown): "hold" | "error" {
  return cause instanceof ApiError && cause.message === "F4_LEADERSHIP_POOL_HOLD"
    && (cause.kind === "business" || cause.kind === "http") ? "hold" : "error";
}
