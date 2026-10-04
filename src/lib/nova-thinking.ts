import { createAbortController } from "./abort-controller-compat";

export type NovaThinkingStage = "understanding" | "checking" | "composing";

export const NOVA_MIN_THINKING_MS = 1_800;
export const NOVA_THINKING_CHECKING_MS = 600;
export const NOVA_THINKING_COMPOSING_MS = 1_200;

export interface AbortableNovaRequest {
  epoch: number;
  signal: AbortSignal;
  abort(): void;
}

export interface LatestAbortableRequestControl {
  begin(): AbortableNovaRequest;
  cancel(): void;
  finish(epoch: number): boolean;
  isCurrent(epoch: number): boolean;
}

export function createLatestAbortableRequest(): LatestAbortableRequestControl {
  let epoch = 0;
  let activeController: AbortController | undefined;
  return {
    begin() {
      activeController?.abort();
      activeController = createAbortController();
      const controller = activeController;
      return { epoch: ++epoch, signal: controller.signal, abort: () => controller.abort() };
    },
    cancel() {
      epoch += 1;
      activeController?.abort();
      activeController = undefined;
    },
    finish(candidateEpoch) {
      if (candidateEpoch !== epoch) return false;
      activeController = undefined;
      return true;
    },
    isCurrent(candidateEpoch) {
      return candidateEpoch === epoch;
    },
  };
}

export function novaThinkingNow(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

/**
 * Returns only the presentation time still needed for a quick answer. The model
 * request starts immediately, and naturally slow answers receive no extra wait.
 */
export function remainingNovaThinkingMs(
  startedAtMs: number,
  nowMs: number,
  minimumMs = NOVA_MIN_THINKING_MS,
): number {
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  return Math.max(0, minimumMs - elapsedMs);
}

export function novaThinkingStageAt(elapsedMs: number): NovaThinkingStage {
  const safeElapsedMs = Math.max(0, elapsedMs);
  if (safeElapsedMs >= NOVA_THINKING_COMPOSING_MS) return "composing";
  if (safeElapsedMs >= NOVA_THINKING_CHECKING_MS) return "checking";
  return "understanding";
}
