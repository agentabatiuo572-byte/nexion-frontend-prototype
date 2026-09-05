/**
 * Phone capability-tier YIELD config — per-tier daily yield for a phone device.
 *
 * A phone's calibrated capability tier (1–5, from lib/device-capability.ts) maps
 * to its daily USDT + NEX yield. These are BUSINESS values the operator tunes in
 * the ops console (the "手机算力档位收益 / phone hashpower tier yield" config) —
 * NOT engineering constants — so they live here as a single, operator-owned,
 * backend-replaceable config surface instead of buried in the scoring lib.
 *
 * ⚠️ MOCK-ONLY: PRODUCTION reads `GET /api/config/phone-tiers` (operator-set in
 * the ops backend; mirrors Nexion-admin-prototype's phone-tier-yield config).
 * The shape `{ tier, baseRateUsdt, baseRateNex }` is exactly what production
 * returns — swap getPhoneTierYields()'s body for the fetched result at cutover,
 * zero call-site changes.
 *
 * Invariants the operator config must preserve (enforced upstream by the ops
 * console + the economic model's 后台参数处方): values stay within the credible
 * display band, non-decreasing in tier, and Tier 3 anchors the "typical phone"
 * ($0.06/d) marketing copy.
 */
export interface PhoneTierYield {
  /** Capability tier 1–5. */
  tier: number;
  /** Daily USDT yield for a phone at this tier. */
  baseRateUsdt: number;
  /** Daily NEX yield for a phone at this tier. */
  baseRateNex: number;
}

export const PHONE_TIER_YIELDS: PhoneTierYield[] = [
  { tier: 1, baseRateUsdt: 0.04, baseRateNex: 6 },
  { tier: 2, baseRateUsdt: 0.05, baseRateNex: 8 },
  { tier: 3, baseRateUsdt: 0.06, baseRateNex: 10 },
  { tier: 4, baseRateUsdt: 0.08, baseRateNex: 13 },
  { tier: 5, baseRateUsdt: 0.095, baseRateNex: 16 },
];

/** Replace the legacy read surface with the already validated server snapshot. */
export function applyCanonicalPhoneTierYields(
  tiers: ReadonlyArray<Pick<PhoneTierYield, "tier" | "baseRateUsdt" | "baseRateNex">>,
): void {
  PHONE_TIER_YIELDS.splice(0, PHONE_TIER_YIELDS.length, ...tiers.map((row) => ({
    tier: row.tier,
    baseRateUsdt: row.baseRateUsdt,
    baseRateNex: row.baseRateNex,
  })));
}

/** Single accessor. PROD: replace body with the GET /api/config/phone-tiers result. */
export function getPhoneTierYields(): PhoneTierYield[] {
  return PHONE_TIER_YIELDS;
}

/** Resolve a tier's yield, falling back to the highest configured tier. An
 * empty table is an authority-unavailable state and therefore yields zero. */
export function phoneTierYield(tier: number): { baseRateUsdt: number; baseRateNex: number } {
  const cfg = getPhoneTierYields();
  const hit = cfg.find((c) => c.tier === tier) ?? cfg[cfg.length - 1] ?? { baseRateUsdt: 0, baseRateNex: 0 };
  return { baseRateUsdt: hit.baseRateUsdt, baseRateNex: hit.baseRateNex };
}

/**
 * The tier marketing copy speaks for — "a typical phone" — per the invariant
 * documented above. Store pages compare against THIS tier, not the visitor's own
 * calibrated device: the store is browsed before any device is calibrated, and a
 * comparison that shifted per visitor would make the advertised multiple unstable.
 */
export const TYPICAL_PHONE_TIER = 3;

/**
 * Phone daily USDT the store compares boxes against. 0 means the operator config
 * is unavailable (empty table) — callers must degrade, never substitute a guess:
 * a fabricated baseline would misstate the advertised multiple.
 */
export function typicalPhoneDailyUsdt(): number {
  return phoneTierYield(TYPICAL_PHONE_TIER).baseRateUsdt;
}
