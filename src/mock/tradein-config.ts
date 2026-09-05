/**
 * ⚠️ MOCK-ONLY TRADEIN_CONFIG — server-authoritative business config.
 * Production: GET /api/config/tradein (TBD; candidate name, not yet in PRD §9.11).
 * Admin mutates via PUT /api/admin/tradein/config (TBD; candidate).
 * FEAT-DEV02 (Aligned 2026-07-06):随时下架 + 产出阶梯抵扣。抵扣由文件底部的
 * TRADEIN_CREDIT_LADDER / computeTradeInCredit 承载(按「累计产出 ÷ 实付价」
 * 落档,仅结算抵减,永不入余额);无持有时长门槛。
 *
 * Schema:
 *   - enabled: 置换总开关(关闭=前端全部置换入口隐藏)。
 *   - eligibility: per-deviceKind 购买资格门(mode: open|any-of|all-of + rules[];
 *     转化漏斗机制,与置换资格正交;`trade-in` 规则不限定来源型号 ——
 *     任意合格设备的置换即满足该通道)。
 *   - promo: 置换推送节奏(冷却/频次/延迟/最低龄/路由;只控推送,不限制用户随时主动置换)。
 *   - inventory: 回收库存软/硬上限(预留)。
 */

import type { DeviceKind } from "@/store/types";

// ─────────────────────────────────────────────────────────────── Rule schema

export type EligibilityRule =
  | { type: "open" }
  | { type: "own-kind"; kind: DeviceKind; count: number }
  | { type: "own-prev-tier"; count: number }
  | { type: "v-rank-min"; level: number }
  | { type: "cumulative-deposit-usdt"; amount: number }
  | { type: "days-active"; days: number }
  | { type: "referral-count"; count: number }
  // FEAT-DEV02:fromKind 可省 = 任意合格设备的置换均满足本通道。
  | { type: "trade-in"; fromKind?: DeviceKind };

export type EligibilityMode = "open" | "any-of" | "all-of";

export interface DeviceEligibility {
  mode: EligibilityMode;
  rules: EligibilityRule[];
}

// ─────────────────────────────────────────────────────────────── Top-level

export interface TradeinConfig {
  enabled: boolean;
  /** Eligibility per device kind. Devices not listed = treated as `open`. */
  eligibility: Partial<Record<DeviceKind, DeviceEligibility>>;
  /** Trade-in promo banner config. Surfaces when user has eligible device. */
  promo: {
    enabled: boolean;
    cooldownHours: number;
    maxPerSession: number;
    delayMs: number;
    /** Routes where the banner can show. */
    routes: string[];
    triggerWhen: {
      hasEligibleDeviceInInventoryOrSlot: boolean;
      /** Don't promo on freshly-purchased devices. */
      minDeviceAgeDays: number;
    };
  };
  /** Inventory soft/hard caps (currently no upper limit per product decision,
   *  but reserved for future abuse-prevention). */
  inventory: {
    /** Soft hint shown to user when approaching this count. 0 = disabled. */
    softMax: number;
    /** Hard server-side cap. 0 = unlimited. */
    hardMax: number;
  };
}

// ─────────────────────────────────────────────────────────────── Default

export const DEFAULT_TRADEIN_CONFIG: TradeinConfig = {
  enabled: true,
  eligibility: {
    "stellarbox-s1": {
      mode: "open",
      rules: [{ type: "open" }],
    },
    "stellarbox-pro": {
      mode: "any-of",
      rules: [
        { type: "own-kind", kind: "stellarbox-s1", count: 1 },
        { type: "v-rank-min", level: 2 },
        { type: "cumulative-deposit-usdt", amount: 1000 },
        { type: "trade-in" },
      ],
    },
    "stellarbox-pro-v2": {
      mode: "any-of",
      rules: [
        { type: "own-kind", kind: "stellarbox-s1", count: 1 },
        { type: "own-kind", kind: "stellarbox-pro", count: 1 },
        { type: "v-rank-min", level: 2 },
        { type: "cumulative-deposit-usdt", amount: 1000 },
        { type: "trade-in" },
      ],
    },
    "stellarrack-p1": {
      mode: "any-of",
      rules: [
        { type: "own-kind", kind: "stellarbox-pro", count: 1 },
        { type: "v-rank-min", level: 4 },
        { type: "cumulative-deposit-usdt", amount: 5000 },
        { type: "trade-in" },
      ],
    },
    "stellarrack-p2": {
      mode: "any-of",
      rules: [
        { type: "own-kind", kind: "stellarrack-p1", count: 1 },
        { type: "v-rank-min", level: 4 },
        { type: "cumulative-deposit-usdt", amount: 5000 },
        { type: "trade-in" },
      ],
    },
  },
  promo: {
    enabled: true,
    cooldownHours: 24,
    maxPerSession: 1,
    delayMs: 1500,
    // Routes the banner may render on. Must align with actual mount sites —
    // expansion to additional routes requires either trimming this list to
    // only mounted routes OR moving the mount to a chassis-level component.
    // Production: server-canonical via GET /api/config/tradein.promo.routes.
    routes: ["/pages/me/devices"],
    triggerWhen: {
      hasEligibleDeviceInInventoryOrSlot: true,
      // Don't push trade-in on freshly-bought devices (UX trust).
      minDeviceAgeDays: 30,
    },
  },
  inventory: {
    softMax: 0, // no soft hint by default
    hardMax: 0, // no hard limit per product decision (2026-05-26)
  },
};

// ─────────────────────────────────────────────────────────────── Helpers

/** Upgrade ladder used by `own-prev-tier` rule and trade-in inference. */
export const UPGRADE_LADDER: DeviceKind[] = [
  "phone",
  "stellarbox-s1",
  "stellarbox-pro",
  "stellarbox-pro-v2",
  "stellarrack-p1",
  "stellarrack-p2",
];

/** Returns the kind one tier below `kind`, or null if at floor. */
export function previousTier(kind: DeviceKind): DeviceKind | null {
  const idx = UPGRADE_LADDER.indexOf(kind);
  return idx > 0 ? UPGRADE_LADDER[idx - 1] : null;
}

// ───────────────────────── FEAT-DEV02: earnings-ladder credit ────
// 唯一抵扣引擎(无持有时长门槛)。Server-authoritative: same GET
// /api/config/tradein payload, `creditLadder` + `ladderRules` keys; admin edits
// via「升级置换阶梯」panel (E domain);canon 哨兵三端对账默认值。
// Ladder semantics (FEAT-DEV02 ③, Aligned 2026-07-06): credit = paidPrice ×
// creditPct(band of cumulative-output ÷ paid-price) × promoMult, checkout-only,
// NEVER credited to balance. Bands are left-closed right-open, contiguous from
// 0%, strictly decreasing creditPct (structure enforced by
// scripts/check-capacity-curve-parity.mjs).

export interface CreditLadderRow {
  /** Inclusive lower bound of cumulative-output ÷ paid-price, in percent. */
  minRatioPct: number;
  /** Exclusive upper bound in percent; null = open-ended top band. */
  maxRatioPct: number | null;
  /** Percent of the paid price returned as checkout-only credit. */
  creditPct: number;
}

export const TRADEIN_CREDIT_LADDER: CreditLadderRow[] = [
  { minRatioPct: 0, maxRatioPct: 25, creditPct: 75 },
  { minRatioPct: 25, maxRatioPct: 50, creditPct: 60 },
  { minRatioPct: 50, maxRatioPct: 75, creditPct: 45 },
  { minRatioPct: 75, maxRatioPct: 100, creditPct: 30 },
  { minRatioPct: 100, maxRatioPct: null, creditPct: 15 },
];

export const TRADEIN_LADDER_RULES = {
  /** Target catalog price must be STRICTLY greater than the device's paid price. */
  requireHigherPrice: true,
  /** Max devices credited against a single checkout. */
  maxDevicesPerOrder: 1,
  /** Promo multiplier applied to the final credit. */
  promoMult: 1.0,
  /** Kinds eligible for retire-and-credit(与 paidPriceUsdt>0 双重门;镜像 admin
   *  E.tradein.applyTo,phone/pc-gpu 免费天然排除但仍列显式白名单)。 */
  applyTo: [
    "cloud-share",
    "stellarbox-s1",
    "stellarbox-pro",
    "stellarbox-pro-v2",
    "stellarrack-p1",
    "stellarrack-p2",
  ] as DeviceKind[],
} as const;

/**
 * USD checkout credit for retiring a device against a higher-priced purchase.
 *
 *   credit = paidPrice × creditPct(band of cumulative ÷ paidPrice) × promoMult
 *
 * paidPrice ≤ 0 (gifted/free device) → 0: NOT eligible at all (FEAT-DEV02A
 * 异常3 — not an Infinity-ratio band). Clamped to the target price so payable
 * can never go negative (defensive: unreachable under default rules where
 * requireHigherPrice holds and creditPct ≤ 100, but the ladder is
 * operator-editable).
 */
/** 产出比所在档(1-based)与该档抵扣率;paidPrice≤0 → null(不可置换,非落档)。 */
export function ladderBandFor(
  paidPriceUsdt: number,
  cumulativeEarningsUsdt: number,
  ladder: CreditLadderRow[] = TRADEIN_CREDIT_LADDER,
): { band: number; creditPct: number } | null {
  if (paidPriceUsdt <= 0) return null;
  const ratioPct = (Math.max(0, cumulativeEarningsUsdt) / paidPriceUsdt) * 100;
  const idx = ladder.findIndex(
    (r) => ratioPct >= r.minRatioPct && (r.maxRatioPct === null || ratioPct < r.maxRatioPct),
  );
  return idx < 0 ? null : { band: idx + 1, creditPct: ladder[idx].creditPct };
}

export function computeTradeInCredit(
  paidPriceUsdt: number,
  cumulativeEarningsUsdt: number,
  targetPriceUsdt: number,
  ladder: CreditLadderRow[] = TRADEIN_CREDIT_LADDER,
  promoMult: number = TRADEIN_LADDER_RULES.promoMult,
): number {
  if (paidPriceUsdt <= 0) return 0;
  const ratioPct = (Math.max(0, cumulativeEarningsUsdt) / paidPriceUsdt) * 100;
  const row = ladder.find(
    (r) => ratioPct >= r.minRatioPct && (r.maxRatioPct === null || ratioPct < r.maxRatioPct),
  );
  if (!row) return 0;
  const raw = paidPriceUsdt * (row.creditPct / 100) * promoMult;
  // Lower clamp guards operator-editable inputs (negative promoMult / target
  // price) — credit may reduce payable, never increase it or go negative.
  return +Math.max(0, Math.min(raw, targetPriceUsdt)).toFixed(2);
}
