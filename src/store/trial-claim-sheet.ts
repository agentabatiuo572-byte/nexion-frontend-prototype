import { defineStore } from "pinia";
import { ref } from "vue";
import { mockServerNow } from "./server-time";

/**
 * Trial claim sheet — shown when user is eligible (idle + cooldown clear +
 * phase open). Surfaced from Home auto-push on mount + manual entry CTAs.
 * Ported from Nexion-prototype/lib/store/trial-claim-sheet.ts.
 *
 * Persistence: `lastClosedAt` survives across sessions so the 24h cooldown is
 * honored. `sessionShownCount` is non-persisted — resets every reload.
 * Real backend: autoPush* fields are TrialConfig (PRD §9.11b).
 */
export const useTrialClaimSheet = defineStore("trialClaimSheet", () => {
  // Only lastClosedAt is persisted; sessionShownCount is session-scoped.
  function hydrateLastClosedAt(): number {
    try {
      const s = uni.getStorageSync("nexgrid-trial-claim-sheet-v1") as { lastClosedAt?: number } | "";
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
      uni.setStorageSync("nexgrid-trial-claim-sheet-v1", { lastClosedAt: lastClosedAt.value });
    } catch {
      // storage unavailable
    }
  }

  // Manual show MUST NOT bump sessionShownCount (reserved for auto-push throttle).
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
