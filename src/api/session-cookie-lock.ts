import { ApiError } from "./errors";

// Browser cookie mutations require a lock that survives tab suspension.
// Expiring cross-tab leases can overlap when the owner is frozen.
let fallbackTail: Promise<unknown> = Promise.resolve();
const LOCK_NAME = "nexgrid-user-session-cookie";
const unavailable = () => new ApiError({ kind: "configuration", message: "COOKIE_LOCK_UNAVAILABLE" });

export function withSessionCookieLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    let entered = false;
    return navigator.locks.request(LOCK_NAME, () => {
      entered = true;
      return work();
    }).catch((error) => { throw entered ? error : unavailable(); });
  }
  if (typeof window !== "undefined") return Promise.reject(unavailable());
  const result = fallbackTail.then(work, work);
  fallbackTail = result.then(() => undefined, () => undefined);
  return result;
}
