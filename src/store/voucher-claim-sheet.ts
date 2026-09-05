import { defineStore } from "pinia";
import { ref } from "vue";
import { mockServerNow } from "./server-time";

/**
 * Voucher claim sheet — the Home auto-popup that surfaces claimable vouchers,
 * plus a manual entry from the fallback banner. Ported pattern from
 * trial-claim-sheet.ts (same cooldown + session-cap throttle).
 *
 * Persistence: `lastClosedAt` survives across sessions so the cooldown is
 * honored. `sessionShownCount` is non-persisted — resets every reload.
 * Real backend: the autoPush throttle params (VOUCHER_POPUP in mock/vouchers.ts)
 * would ride along in the `GET /api/vouchers` catalog response (a `popup` config
 * envelope), so ops can tune cadence without a client release.
 */
export const useVoucherClaimSheet = defineStore("voucherClaimSheet", () => {
  function hydrateLastClosedAt(): number {
    try {
      const s = uni.getStorageSync("nexgrid-voucher-claim-sheet-v1") as { lastClosedAt?: number } | "";
      if (s && typeof s === "object" && typeof s.lastClosedAt === "number") return s.lastClosedAt;
    } catch {
      // first run
    }
    return 0;
  }

  const open = ref(false);
  const lastClosedAt = ref(hydrateLastClosedAt());
  const sessionShownCount = ref(0);

  function persist() {
    try {
      uni.setStorageSync("nexgrid-voucher-claim-sheet-v1", { lastClosedAt: lastClosedAt.value });
    } catch {
      // storage unavailable
    }
  }

  // Manual show (from the fallback banner) MUST NOT bump sessionShownCount
  // (reserved for the auto-push throttle).
  function show() {
    open.value = true;
  }

  function tryAutoPush(opts: { cooldownHours: number; maxPerSession: number }): boolean {
    const now = mockServerNow();
    const cooldownMs = opts.cooldownHours * 3_600_000;
    const inCooldown = lastClosedAt.value > 0 && now - lastClosedAt.value < cooldownMs;
    const sessionCapHit = sessionShownCount.value >= opts.maxPerSession;
    if (inCooldown || sessionCapHit) return false;
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

  return { open, lastClosedAt, sessionShownCount, show, tryAutoPush, hide, closeTransient, resetCooldown };
});
