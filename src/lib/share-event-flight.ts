export interface ShareEventFlightDependencies {
  send(): Promise<void>;
  isCurrent(): boolean;
  refresh(): Promise<boolean>;
  onFailure(): void;
}

let activeFlight: Promise<boolean> | null = null;

/** Coalesces rapid share taps and accepts success only after canonical readback. */
export async function runShareEventFlight(deps: ShareEventFlightDependencies): Promise<boolean> {
  if (activeFlight) return activeFlight;
  const flight = (async () => {
    try {
      await deps.send();
      if (!deps.isCurrent()) return false;
      if (!(await deps.refresh()) || !deps.isCurrent()) throw new Error("SHARE_EVENT_READBACK_FAILED");
      return true;
    } catch {
      if (deps.isCurrent()) deps.onFailure();
      return false;
    }
  })();
  activeFlight = flight;
  try {
    return await flight;
  } finally {
    if (activeFlight === flight) activeFlight = null;
  }
}
