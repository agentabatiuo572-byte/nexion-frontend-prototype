import { earningsReleaseApi } from "@/api/runtime";
import type { EarningsReleaseStatus } from "@/api/earnings-release-api";
import { captureRuntimeRevision, isCurrentRuntimeRevision } from "@/api/order-api";
import type { RiskClusterSummary } from "@/store/risk-cluster";
import { shallowRef } from "vue";

export type LedgerRoute = "pending_review" | "bonus_locked";
export type ReleaseSource = "attest" | "manual";
export interface EarningLedgerEntry { id: string; accountKey: string; clusterId: string; route: LedgerRoute; usdt: number; nex: number; bucketedAt: number; }
export interface ReleaseOutcome {
  releasedPendingUsdt: number; releasedPendingNex: number;
  releasedLockedUsdt: number; releasedLockedNex: number;
  escalatedUsdt: number; escalatedNex: number; releasedBy: ReleaseSource | null;
}

export const earningsReleaseSnapshot = shallowRef<EarningsReleaseStatus | null>(null);
export const earningsReleaseStatus = shallowRef<"idle" | "loading" | "ready" | "error">("idle");
export const earningsReleaseHasSnapshot = shallowRef(false);
let activeEarningsReleaseAccountKey = "default";
let earningsReleaseRefreshSequence = 0;

export function bindEarningsReleaseAccount(accountKey: string): void {
  activeEarningsReleaseAccountKey = accountKey || "default";
  earningsReleaseRefreshSequence += 1;
  earningsReleaseSnapshot.value = null;
  earningsReleaseHasSnapshot.value = false;
  earningsReleaseStatus.value = "idle";
}

export async function refreshEarningsReleaseStatus(
  requestedAccountKey = activeEarningsReleaseAccountKey,
): Promise<EarningsReleaseStatus> {
  // A caller that already belongs to an older account generation must not
  // advance the current request sequence or put the current account into a
  // loading state. Its request has no financial authority here.
  if (activeEarningsReleaseAccountKey !== requestedAccountKey) {
    throw new Error("EARNINGS_RELEASE_ACCOUNT_CHANGED");
  }
  const runScope = captureRuntimeRevision();
  const refreshSequence = ++earningsReleaseRefreshSequence;
  earningsReleaseStatus.value = "loading";
  try {
    const status = await earningsReleaseApi.status();
    // A response from an account that signed out or switched while the request
    // was in flight must never become the next account's financial truth.
    if (activeEarningsReleaseAccountKey !== requestedAccountKey
      || !isCurrentRuntimeRevision(runScope)
      || refreshSequence !== earningsReleaseRefreshSequence) return status;
    earningsReleaseSnapshot.value = status;
    earningsReleaseHasSnapshot.value = true;
    earningsReleaseStatus.value = "ready";
    return status;
  } catch (error) {
    if (activeEarningsReleaseAccountKey === requestedAccountKey
      && isCurrentRuntimeRevision(runScope)
      && refreshSequence === earningsReleaseRefreshSequence) {
      // This store is read directly by wallet surfaces that do not consume the
      // status ref. Do not leave a failed quote visible for them to present as
      // current; a refresh may retain its snapshot only while it is loading.
      earningsReleaseSnapshot.value = null;
      earningsReleaseHasSnapshot.value = false;
      earningsReleaseStatus.value = "error";
    }
    throw error;
  }
}
export function currentEarningsReleaseStatus(): EarningsReleaseStatus | null { return earningsReleaseSnapshot.value; }
const zero = (): ReleaseOutcome => ({ releasedPendingUsdt: 0, releasedPendingNex: 0, releasedLockedUsdt: 0, releasedLockedNex: 0, escalatedUsdt: 0, escalatedNex: 0, releasedBy: null });
export function hasReleaseEffect(_outcome?: ReleaseOutcome): boolean { return false; }
/** Client reward producers are disabled: only the backend credit facade may create entries. */
export function appendLedgerEntry(..._ignored: unknown[]): boolean { return false; }
/** Read-only client: Janus reports are evaluated by the backend, never here. */
export function evaluateAttestRelease(_accountKey: string, _cluster: RiskClusterSummary): ReleaseOutcome { return zero(); }
export function _devGrantManualRelease(..._ignored: unknown[]): ReleaseOutcome { return zero(); }
export function listLedgerEntries(..._ignored: unknown[]): EarningLedgerEntry[] { return []; }
