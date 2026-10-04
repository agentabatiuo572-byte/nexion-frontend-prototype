import { defineStore } from "pinia";
import { ref } from "vue";
import { mockServerNow } from "./server-time";
import type { VoucherSurface } from "@/mock/vouchers";

export type VoucherPopupScope = {
  accountKey: string;
  accountEpoch: number;
  runId: string | null;
  runEpoch: number;
};

type PersistedPopupRow = { lastClosedAt?: number };
type PersistedPopupTable = Record<string, PersistedPopupRow>;

function normalizeScopePart(value: string): string {
  return encodeURIComponent(String(value || "").trim() || "default");
}

function scopeKey(scope: VoucherPopupScope): string {
  const accountEpoch = Number.isSafeInteger(scope.accountEpoch) ? scope.accountEpoch : 0;
  const runEpoch = Number.isSafeInteger(scope.runEpoch) ? scope.runEpoch : 0;
  return `${normalizeScopePart(scope.accountKey)}:${accountEpoch}:${normalizeScopePart(scope.runId || "production")}:${runEpoch}`;
}

/**
 * Voucher claim sheet — the Home auto-popup that surfaces claimable vouchers,
 * plus a manual entry from the fallback banner. Ported pattern from
 * trial-claim-sheet.ts (same cooldown + session-cap throttle).
 *
 * Persistence: `lastClosedAt` survives across sessions so the cooldown is
 * honored. `sessionShownCount` is non-persisted — resets every reload.
 * Remote mode receives the authoritative H7 cadence with `GET /api/vouchers`;
 * the Home chassis reports a successful auto-open through `popup-seen`.
 */
export const useVoucherClaimSheet = defineStore("voucherClaimSheet", () => {
  let currentScopeKey = "default";

  function hydrateLastClosedAt(key = currentScopeKey): number {
    try {
      const s = uni.getStorageSync("nexgrid-voucher-claim-sheet-v1") as PersistedPopupTable | PersistedPopupRow | "";
      // Accept the pre-scope row only for the default boot scope. It cannot be
      // inherited by an authenticated account or a different Sandbox RunID.
      if (key === "default" && s && typeof s === "object" && typeof s.lastClosedAt === "number") return s.lastClosedAt;
      const table = s as PersistedPopupTable;
      if (s && typeof s === "object" && !("lastClosedAt" in (s as PersistedPopupRow))) {
        const row = table[key];
        if (row && typeof row.lastClosedAt === "number") return row.lastClosedAt;
      }
    } catch {
      // first run
    }
    return 0;
  }

  const open = ref(false);
  const surface = ref<VoucherSurface>("home");
  const lastClosedAt = ref(hydrateLastClosedAt());
  const sessionShownCount = ref(0);

  function persist() {
    try {
      const raw = uni.getStorageSync("nexgrid-voucher-claim-sheet-v1") as PersistedPopupTable | PersistedPopupRow | "";
      const table: PersistedPopupTable = raw && typeof raw === "object" && !("lastClosedAt" in raw)
        ? { ...raw as PersistedPopupTable }
        : {};
      table[currentScopeKey] = { lastClosedAt: lastClosedAt.value };
      uni.setStorageSync("nexgrid-voucher-claim-sheet-v1", table);
    } catch {
      // storage unavailable
    }
  }

  /** Rebind popup throttle state whenever the authenticated account or the
   * commerce Sandbox RunID changes. Both cooldown and session cap are scoped;
   * an account/run must never inherit another scope's popup history. */
  function bindScope(scope: VoucherPopupScope): void {
    const nextKey = scopeKey(scope);
    if (nextKey === currentScopeKey) return;
    currentScopeKey = nextKey;
    open.value = false;
    lastClosedAt.value = hydrateLastClosedAt(nextKey);
    sessionShownCount.value = 0;
  }

  // Manual show (from the fallback banner) MUST NOT bump sessionShownCount
  // (reserved for the auto-push throttle).
  function show(entrySurface: VoucherSurface) {
    surface.value = entrySurface;
    open.value = true;
  }

  function tryAutoPush(opts: { surface: VoucherSurface; cooldownHours: number; maxPerSession: number }): boolean {
    const now = mockServerNow();
    const cooldownMs = opts.cooldownHours * 3_600_000;
    const inCooldown = lastClosedAt.value > 0 && now - lastClosedAt.value < cooldownMs;
    const sessionCapHit = sessionShownCount.value >= opts.maxPerSession;
    if (inCooldown || sessionCapHit) return false;
    surface.value = opts.surface;
    open.value = true;
    sessionShownCount.value += 1;
    return true;
  }

  function hide() {
    open.value = false;
    lastClosedAt.value = mockServerNow();
    persist();
  }

  function closeTransient() {
    open.value = false;
  }

  function resetCooldown() {
    lastClosedAt.value = 0;
    sessionShownCount.value = 0;
    persist();
  }

  return { open, surface, lastClosedAt, sessionShownCount, bindScope, show, tryAutoPush, hide, closeTransient, resetCooldown };
});
