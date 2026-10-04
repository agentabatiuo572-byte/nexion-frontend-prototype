import { ApiError } from "./errors";

const STORAGE_KEY = "nexgrid-h5-refresh-rotation-v1";
let testNonce: string | null = null;
const unavailable = () => new ApiError({ kind: "configuration", message: "COOKIE_ROTATION_STORAGE_UNAVAILABLE" });

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    if (!window.localStorage) throw unavailable();
    return window.localStorage;
  } catch { throw unavailable(); }
}

export function acquireRotationNonce(): string {
  const target = storage();
  try {
    const existing = target ? target.getItem(STORAGE_KEY) : testNonce;
    if (existing !== null) {
      if (!/^[0-9a-f]{64}$/.test(existing)) throw unavailable();
      return existing;
    }
    if (!globalThis.crypto?.getRandomValues) throw unavailable();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    if (target) {
      target.setItem(STORAGE_KEY, nonce);
      if (target.getItem(STORAGE_KEY) !== nonce) throw unavailable();
    } else testNonce = nonce;
    return nonce;
  } catch { throw unavailable(); }
}

export function clearRotationNonce(nonce: string): void {
  try {
    const target = storage();
    if (target?.getItem(STORAGE_KEY) === nonce) target.removeItem(STORAGE_KEY);
    else if (!target && testNonce === nonce) testNonce = null;
  } catch { /* A stale nonce cannot create authentication authority. */ }
}

export function discardRotationNonce(): void {
  try {
    const target = storage();
    if (target) target.removeItem(STORAGE_KEY);
    else testNonce = null;
  } catch { /* Logout and confirmed denial still clear the in-memory session. */ }
}
