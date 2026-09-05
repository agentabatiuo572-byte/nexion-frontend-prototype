/**
 * Shares one in-flight mutation between repeated taps. A caller decides whether
 * an authoritative GET can recover a failed mutation; this helper never retries
 * the POST by itself.
 */
export function createSingleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (inFlight) return inFlight;
    const current = Promise.resolve().then(operation);
    inFlight = current;
    void current.then(
      () => { if (inFlight === current) inFlight = null; },
      () => { if (inFlight === current) inFlight = null; },
    );
    return current;
  };
}
