import { ApiError } from "@/api/errors";
import { createPageReadController, type PageActivationOptions } from "./passive-page-activation";

/** Ephemeral results for one activation and periods of rapid Tab navigation. */
let writeRevision = 0;
export const capturePassiveWriteRevision = () => writeRevision;
export function invalidatePassiveTabReads(): void { writeRevision += 1; }

type Attempt = { resource: string; visit: number; retryUntil: number | null; pending: boolean; cached: boolean; hasCache?: () => boolean; promise: Promise<unknown> };
export function createPassiveReadWindow(now = () => Date.now(), activations = createPageReadController(now)) {
  let activeScope = "", scopeVersion = 0;
  let executing: { scope: string; version: number; key: string; attempt: Attempt; rawClaimed: boolean } | null = null;
  const attempts = new Map<string, Attempt>();
  const keyOf = (resource: string, query?: unknown) => JSON.stringify([resource, query ?? null], (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  function selectScope(scope: string): void {
    if (scope !== activeScope) {
      if (activeScope !== "") activations.resetProtection();
      attempts.clear(); activeScope = scope; scopeVersion += 1;
    }
  }
  function ownsDispatch(key: string): boolean {
    return executing?.scope === activeScope && executing.version === scopeVersion
      && executing.key === key && attempts.get(key) === executing.attempt;
  }
  function invalidate(resource: string, preserveOwnDispatch = false): void {
    for (const [key, attempt] of attempts) if (attempt.resource === resource) {
      if (preserveOwnDispatch && ownsDispatch(key) && executing && !executing.rawClaimed) executing.rawClaimed = true;
      else attempts.delete(key);
    }
  }
  function track<T>(resource: string, promise: Promise<T>, hasCache?: () => boolean): Attempt {
    const attempt: Attempt = { resource, visit: activations.snapshot().visit, retryUntil: null, pending: true, cached: false, hasCache, promise };
    void promise.then(value => {
      attempt.pending = false;
      attempt.cached = value !== false && value !== null && (value !== undefined || !!hasCache) && (!hasCache || hasCache());
    }, cause => {
      attempt.pending = false;
      if (cause instanceof ApiError && cause.kind === "http" && cause.status === 429)
        attempt.retryUntil = now() + (cause.retryAfterMs ?? 30_000);
    });
    return attempt;
  }
  function remember<T>(scope: string, resource: string, promise: Promise<T>, query?: unknown, _attemptedAt?: number, hasCache?: () => boolean): Promise<T> {
    const key = keyOf(resource, query);
    if (scope === activeScope && ownsDispatch(key)) return promise;
    // A nested manual read already replaced this outer dispatch; do not restore it.
    if (executing?.key === key && scope === activeScope && attempts.has(key)) return promise;
    selectScope(scope);
    attempts.set(key, track(resource, promise, hasCache));
    return promise;
  }
  function run<T>(scope: string, resource: string, read: () => Promise<T>, query?: unknown, hasCache?: () => boolean): Promise<T> {
    selectScope(scope);
    const key = keyOf(resource, query), previous = attempts.get(key);
    const activation = activations.snapshot();
    if (previous && (previous.pending || (previous.retryUntil !== null ? now() < previous.retryUntil
      : previous.visit === activation.visit || (activation.protected && previous.cached && (!previous.hasCache || previous.hasCache()))))) {
      previous.visit = activation.visit;
      return previous.promise as Promise<T>;
    }
    let resolve!: (value: T | PromiseLike<T>) => void, reject!: (cause: unknown) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    const attempt = track(resource, promise, hasCache);
    // Register a real shared promise before invoking readers: sync watchers may reenter.
    attempts.set(key, attempt);
    const parent = executing;
    executing = { scope, version: scopeVersion, key, attempt, rawClaimed: false };
    try { Promise.resolve(read()).then(resolve, reject); }
    catch (cause) { reject(cause); }
    finally { executing = parent; }
    // Settling only updates this attempt; it can never reinstall a superseded owner.
    return promise;
  }
  return { run, invalidate, remember, notifyPageActivation: activations.notifyPageActivation };
}

export const passiveTabReadWindow = createPassiveReadWindow();
export function notifyPageActivation(route: string, options?: PageActivationOptions): () => void {
  return passiveTabReadWindow.notifyPageActivation(route, options);
}
/** API leaf modules can supersede reads without importing the runtime client. */
export function invalidateBeforePassiveTabRead(resource: string): void { passiveTabReadWindow.invalidate(resource, true); }
