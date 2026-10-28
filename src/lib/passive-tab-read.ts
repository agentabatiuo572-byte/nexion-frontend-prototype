import { getActivePinia } from "pinia";
import * as runtime from "@/api/runtime";
import { captureRuntimeRevision } from "@/api/order-api";
import { useLocaleStore } from "@/store/locale";
import { remoteAccountScope } from "./remote-account-epoch";
import { capturePassiveWriteRevision, passiveTabReadWindow as window } from "./passive-read-window";
export { invalidateBeforePassiveTabRead, notifyPageActivation } from "./passive-read-window";

const piniaIds = new WeakMap<object, number>();
let nextPiniaId = 0;
let lastVault: object | null = null, lastAuthRevision: number | null = null, authBinding = 0;
/** Display reads only. Commands and their fresh eligibility checks call their APIs directly. */
export function runPassiveTabRead<T>(resource: string, read: () => Promise<T>, query?: unknown, hasCache?: () => boolean): Promise<T> {
  return window.run(passiveTabReadScope(), resource, read, query, hasCache);
}
export function invalidatePassiveTabRead(resource: string): void { window.invalidate(resource); }
/** Seed the same window at an actual startup/manual store dispatch, without gating it. */
export function rememberPassiveTabRead<T>(resource: string, promise: Promise<T>, query?: unknown, attemptedAt?: number, hasCache?: () => boolean): Promise<T> {
  return window.remember(passiveTabReadScope(), resource, promise, query, attemptedAt, hasCache);
}
export function passiveTabReadScope(): string {
  const account = remoteAccountScope.snapshot();
  const pinia = getActivePinia();
  if (pinia && !piniaIds.has(pinia)) piniaIds.set(pinia, ++nextPiniaId);
  const vault = "sessionVault" in runtime ? runtime.sessionVault : null;
  const revision = vault && typeof vault.revision === "function" ? vault.revision() : null;
  if (vault !== lastVault || (revision !== lastAuthRevision && lastAuthRevision !== null
    && !vault?.isRefreshContinuation(lastAuthRevision))) authBinding += 1;
  lastVault = vault; lastAuthRevision = revision;
  return JSON.stringify([account.accountKey, account.epoch, runtime.apiRuntimeConfig.environment,
    runtime.apiRuntimeConfig.baseUrl, vault?.read()?.user.userId ?? null, authBinding,
    pinia ? useLocaleStore().code : "", pinia ? piniaIds.get(pinia) : null, captureRuntimeRevision().runId,
    capturePassiveWriteRevision()]);
}
