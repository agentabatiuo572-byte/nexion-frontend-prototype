export type ComputeShareConfigStatus = "idle" | "loading" | "ready" | "failed";
export type ComputeShareDownloadGatePhase = "pending" | "ready" | "disabled" | "failed";

interface ComputeShareDownloadGateDeps {
  status(): ComputeShareConfigStatus;
  enabled(): boolean;
  settle(): Promise<void>;
  setPhase(phase: ComputeShareDownloadGatePhase): void;
  suspend(): void;
  redirectDisabled(): void;
  resume(): void;
}

/**
 * Keeps a cold deep link on its page until the PC-owned E6 projection is known.
 * A failed projection is actionable retry state; it is never evidence that
 * Operations disabled the feature.
 */
export function createComputeShareDownloadGate(deps: ComputeShareDownloadGateDeps) {
  let mounted = false;
  let generation = 0;
  let redirectedGeneration = -1;
  let phase: ComputeShareDownloadGatePhase = "pending";
  let resumeRequired = true;

  function current(expected: number): boolean {
    return mounted && generation === expected;
  }

  function apply(expected: number): void {
    if (!current(expected)) return;
    const status = deps.status();
    if (status === "idle" || status === "loading") {
      if (phase === "ready") deps.suspend();
      phase = "pending";
      resumeRequired = true;
      deps.setPhase(phase);
      return;
    }
    if (status === "failed") {
      if (phase === "ready") deps.suspend();
      phase = "failed";
      resumeRequired = true;
      deps.setPhase(phase);
      return;
    }
    if (!deps.enabled()) {
      if (phase === "ready") deps.suspend();
      phase = "disabled";
      resumeRequired = true;
      deps.setPhase(phase);
      if (redirectedGeneration !== expected) {
        redirectedGeneration = expected;
        deps.redirectDisabled();
      }
      return;
    }
    phase = "ready";
    deps.setPhase(phase);
    if (resumeRequired) {
      resumeRequired = false;
      deps.resume();
    }
  }

  async function settle(): Promise<void> {
    const expected = generation;
    if (!current(expected)) return;
    phase = "pending";
    deps.setPhase(phase);
    if (deps.status() === "ready") {
      apply(expected);
      return;
    }
    await deps.settle();
    apply(expected);
  }

  return {
    mount(): Promise<void> {
      mounted = true;
      generation += 1;
      return settle();
    },
    retry(): Promise<void> {
      if (!mounted) return Promise.resolve();
      generation += 1;
      return settle();
    },
    reconcile(): void {
      apply(generation);
    },
    unmount(): void {
      mounted = false;
      generation += 1;
    },
  };
}
