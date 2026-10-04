// The account rows share one storage key, so every Genesis writer uses the
// same lock, including primary purchases. Busy callers never queue a stale
// confirmation for later execution.
let localOwner = false;

export function withGenesisCommandLock<T>(work: () => Promise<T>, unavailable: T): Promise<T> {
  const exclusive = async (): Promise<T> => {
    if (localOwner) return unavailable;
    localOwner = true;
    try { return await work(); } finally { localOwner = false; }
  };
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("nexgrid-genesis-accounts-v1", { mode: "exclusive", ifAvailable: true },
      (lock) => lock ? exclusive() : unavailable);
  }
  // A process-local mutex cannot coordinate browser tabs. Native service
  // runtimes have one JS context; H5 requires the browser's cross-tab lock.
  if (typeof window !== "undefined") return Promise.resolve(unavailable);
  return exclusive();
}
