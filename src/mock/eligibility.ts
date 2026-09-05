/**
 * Device purchase eligibility — pure-function rule evaluator.
 * Ported from Nexion-prototype/lib/v3/eligibility.ts (zero React deps — plain
 * functions over a context object; "use client" stripped, import paths
 * rewritten to @/mock + @/store).
 *
 * ⚠️ MOCK-ONLY client-side check. Production: GET /api/devices/eligibility?kind=X
 * (TBD; candidate, not yet in PRD §9.11). Server is sole authority; client
 * eligibility is for UI affordance only (which sheet to open / lock button +
 * hint) and never gates the actual POST /api/orders call.
 *
 * Each device kind has a `mode` (open / any-of / all-of) and a list of `rules`
 * (see @/mock/tradein-config schema). We evaluate every rule and aggregate per
 * mode.
 */

import type { Device, DeviceKind } from "@/store/types";
import type {
  EligibilityRule,
  EligibilityMode,
  TradeinConfig,
} from "@/mock/tradein-config";
import {
  previousTier,
  UPGRADE_LADDER,
  TRADEIN_LADDER_RULES,
  computeTradeInCredit,
} from "@/mock/tradein-config";
import { DEVICE_PRICE_USDT } from "@/store/device-types";

// ─────────────────────────────────────────────────────────────── Context

export interface EligibilityContext {
  /** Full device list (active + inventory). */
  devices: Device[];
  /** V-rank level (1-13). */
  vRank: number;
  /** Cumulative USDT deposit lifetime. */
  cumulativeDepositUsdt: number;
  /** Account creation timestamp (ms epoch). */
  accountCreatedAt: number;
  /** Confirmed referral count (binding completed + not refunded). */
  referralConfirmedCount: number;
  /** If user is currently in a trade-in flow trading in this kind, the
   *  `trade-in` rule for `fromKind` will pass. Null = not in trade-in flow. */
  tradeInFromKind?: DeviceKind | null;
}

// ─────────────────────────────────────────────────────────────── Result

export interface EligibilityResult {
  eligible: boolean;
  mode: EligibilityMode;
  /** Rules that passed under this context. */
  passed: EligibilityRule[];
  /** Rules that failed, with current/required values + i18n hint key. */
  missing: Array<{
    rule: EligibilityRule;
    current?: number | string;
    required?: number | string;
    /** i18n key under `t.tradein.eligibilityHint*` describing what to do. */
    hintKey: string;
  }>;
}

// ─────────────────────────────────────────────────────────────── Helpers

function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}

function countOwned(devices: Device[], kind: DeviceKind): number {
  // Count both active (activatedAt !== null) AND inventory devices of kind.
  return devices.filter((d) => d.kind === kind).length;
}

// ─────────────────────────────────────────────────────────────── Single-rule check

/**
 * Evaluate a single rule. Returns { pass: boolean, current?, required?, hintKey }.
 */
export function checkRule(
  rule: EligibilityRule,
  ctx: EligibilityContext,
): {
  pass: boolean;
  current?: number | string;
  required?: number | string;
  hintKey: string;
} {
  switch (rule.type) {
    case "open":
      return { pass: true, hintKey: "tradein.eligibilityHintOpen" };

    case "own-kind": {
      const have = countOwned(ctx.devices, rule.kind);
      return {
        pass: have >= rule.count,
        current: have,
        required: rule.count,
        hintKey: "tradein.eligibilityHintOwnKind",
      };
    }

    case "own-prev-tier": {
      // Caller doesn't know the target kind — we'd need it for previousTier.
      // This rule is rarely used directly; prefer `own-kind` with explicit kind.
      // If used, fall back to checking S1 ownership (most-likely floor).
      const have = countOwned(ctx.devices, "stellarbox-s1");
      return {
        pass: have >= rule.count,
        current: have,
        required: rule.count,
        hintKey: "tradein.eligibilityHintOwnPrevTier",
      };
    }

    case "v-rank-min":
      return {
        pass: ctx.vRank >= rule.level,
        current: ctx.vRank,
        required: rule.level,
        hintKey: "tradein.eligibilityHintVRank",
      };

    case "cumulative-deposit-usdt":
      return {
        pass: ctx.cumulativeDepositUsdt >= rule.amount,
        current: ctx.cumulativeDepositUsdt,
        required: rule.amount,
        hintKey: "tradein.eligibilityHintDeposit",
      };

    case "days-active": {
      const days = daysSince(ctx.accountCreatedAt);
      return {
        pass: days >= rule.days,
        current: days,
        required: rule.days,
        hintKey: "tradein.eligibilityHintDaysActive",
      };
    }

    case "referral-count":
      return {
        pass: ctx.referralConfirmedCount >= rule.count,
        current: ctx.referralConfirmedCount,
        required: rule.count,
        hintKey: "tradein.eligibilityHintReferral",
      };

    case "trade-in":
      // FEAT-DEV02:去 fromKind 定向——处于置换流程(任意合格设备)即通过;
      // 若规则仍指定 fromKind(遗留配置),按定向匹配。
      return {
        pass:
          ctx.tradeInFromKind != null &&
          (rule.fromKind == null || ctx.tradeInFromKind === rule.fromKind),
        current: ctx.tradeInFromKind ?? "none",
        required: rule.fromKind ?? "any",
        hintKey: "tradein.eligibilityHintTradeIn",
      };
  }
}

// ─────────────────────────────────────────────────────────────── Top-level

/**
 * Evaluate eligibility for a specific device kind.
 *
 * If the kind has no entry in cfg.eligibility, treat as `open` (default).
 */
export function checkEligibility(
  kind: DeviceKind,
  cfg: TradeinConfig,
  ctx: EligibilityContext,
): EligibilityResult {
  const elig = cfg.eligibility[kind];
  if (!elig) {
    return {
      eligible: true,
      mode: "open",
      passed: [{ type: "open" }],
      missing: [],
    };
  }

  const evals = elig.rules.map((rule) => ({ rule, ...checkRule(rule, ctx) }));
  const passed = evals.filter((e) => e.pass).map((e) => e.rule);
  const missing = evals
    .filter((e) => !e.pass)
    .map((e) => ({
      rule: e.rule,
      current: e.current,
      required: e.required,
      hintKey: e.hintKey,
    }));

  let eligible: boolean;
  switch (elig.mode) {
    case "open":
      eligible = true;
      break;
    case "any-of":
      eligible = passed.length > 0;
      break;
    case "all-of":
      eligible = missing.length === 0;
      break;
  }

  return { eligible, mode: elig.mode, passed, missing };
}

// ─────────────────────────────────────────────────────────────── Trade-in eligibility

/**
 * FEAT-DEV02:目标 SKU 视角的可抵扣设备清单(设备级,替代旧的 kind 级 sources)。
 * 资格 = 实付价 > 0(赠送/免费排除)∧ kind ∈ ladder applyTo ∧ 目标目录价严格更高
 * ∧ 置换总开关开 ∧ 无运行中任务(需先完成/放弃当前任务,入口层给阻断提示)。
 * 活跃与库存设备都可抵(随时下架);排序按可抵金额高→低(转化优先)。
 */
export function eligibleTradeInDevices(
  targetKind: DeviceKind,
  cfg: TradeinConfig,
  ctx: EligibilityContext,
): Device[] {
  if (!cfg.enabled) return [];
  const targetPrice = DEVICE_PRICE_USDT[targetKind] ?? 0;
  if (targetPrice <= 0) return [];
  return ctx.devices
    .filter((d) => {
      const paid = d.paidPriceUsdt ?? 0;
      if (paid <= 0) return false;
      if (!TRADEIN_LADDER_RULES.applyTo.includes(d.kind)) return false;
      if (TRADEIN_LADDER_RULES.requireHigherPrice && !(targetPrice > paid)) return false;
      if (isDeviceTaskBlocked(d)) return false; // 激活中且任务运行 → 入口阻断,不入候选
      return true;
    })
    .sort(
      (a, b) =>
        computeTradeInCredit(b.paidPriceUsdt ?? 0, b.cumulativeEarningsUsdt ?? 0, targetPrice) -
        computeTradeInCredit(a.paidPriceUsdt ?? 0, a.cumulativeEarningsUsdt ?? 0, targetPrice),
    );
}

/** 置换任务阻断判定单源:只有「激活中且有运行中任务」才算阻断——库存机上的
 *  出厂任务不在跑(tick 跳过未激活设备),不能锁死下架;激活机走「先停用(自带
 *  等任务/强停保护)→ 库存态再置换」既有链路。四个消费点(候选过滤/设备页入口/
 *  确认弹层/结算复检)必须同用本判定。 */
export function isDeviceTaskBlocked(d: Pick<Device, "activatedAt" | "currentTask">): boolean {
  return d.activatedAt !== null && !!d.currentTask;
}

/**
 * Returns next tier above the user's highest-tier owned device.
 * Used by trade-in promo banner: "Trade in to upgrade to Pro / Rack".
 */
export function nextUpgradeTier(ctx: EligibilityContext): DeviceKind | null {
  const owned = new Set(ctx.devices.map((d) => d.kind));
  // Walk ladder from top down; find highest owned kind, return next above.
  for (let i = UPGRADE_LADDER.length - 1; i >= 0; i--) {
    if (owned.has(UPGRADE_LADDER[i])) {
      return i < UPGRADE_LADDER.length - 1 ? UPGRADE_LADDER[i + 1] : null;
    }
  }
  return UPGRADE_LADDER[1]; // first tier above phone
}

// Re-export previousTier for callers that need ladder math.
export { previousTier };
