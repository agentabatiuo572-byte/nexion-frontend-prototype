/**
 * Ported from Nexion-prototype/lib/store/product-phase.ts
 * (zustand persist → Pinia + uni storage).
 *
 * ⚠️ MOCK-ONLY H1 PHASES table (12-month platform tightening dials).
 * Production H1 business parameters are mirrored from
 * GET /api/admin/platform/phase-config. Storefront release is a separate E1
 * concern computed by backend StorefrontProductReleasePolicy; these P1-P6
 * values never decide whether a remote catalog item is available.
 * getMonthsSince uses mockServerNow() → server time in production.
 *
 * Computes the current operational phase from `user.joinedAt` and exposes a
 * single source of truth for time-varying platform parameters. The companion
 * override store (`useProductPhaseOverride`) lets a PM demo pin a phase without
 * time-traveling user.joinedAt.
 */

import { defineStore } from "pinia";
import { ref } from "vue";
import { remoteApiEnabled } from "@/api/runtime";
import { ONE_MONTH_MS, mockServerNow } from "./server-time";

export type PhaseId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

/**
 * 创世节点排放开阀的平台生命周期月（P4「上所」窗口）。
 * ⚠️ 上所是**全平台一次性事件**，非按用户 joinedAt 月龄——故排放开阀的运行时信号是
 * genesis store 的 server-canonical `nexListed`（fail-closed），**不得**用按用户月龄的
 * `isPhaseReached(userPhase, "P4")`（否则晚注册用户永远等不到排放）。本常量仅记录
 * 「该在第几月开」的运营意图，后台 H1 `genesisDivOpen` 逐月旋钮据此翻。
 */
export const GENESIS_DIVIDEND_OPENS_AT_PLATFORM_MONTH = 7;

export interface PhaseParams {
  id: PhaseId;
  label: string;             // i18n key suffix (resolved by caller)
  monthsFrom: number;        // inclusive lower bound
  monthsTo: number;          // exclusive upper bound
  // Tightening dials (everything goes from "loose" to "harsh" across P1 → P6)
  inviteBonusMultiplier: number;       // 2.0 P1 → 1.0 by P3 onward
  nexFeeOffsetRate: number;            // 0.40 USDT/NEX — 烧 1 NEX 抵扣的手续费(远高于市价 → #3 优惠抵扣)
  withdrawalCooldownDays: number;      // 30 P1-P4, 45 P5+
  binaryDailyCapUSD: number;           // 5000 P1-P3, 2000 P4+
  complianceHoldEnabled: boolean;      // P5+ adds an extra compliance-review step to withdrawal
}

export const PHASES: ReadonlyArray<PhaseParams> = [
  {
    id: "P1",
    label: "rapidAcquisition",
    monthsFrom: 0,
    monthsTo: 2,
    inviteBonusMultiplier: 2.0,
    nexFeeOffsetRate: 0.4,
    withdrawalCooldownDays: 30,
    binaryDailyCapUSD: 5_000,
    complianceHoldEnabled: false,
  },
  {
    id: "P2",
    label: "softTransition",
    monthsFrom: 2,
    monthsTo: 4,
    inviteBonusMultiplier: 1.5,
    nexFeeOffsetRate: 0.4,
    withdrawalCooldownDays: 30,
    binaryDailyCapUSD: 5_000,
    complianceHoldEnabled: false,
  },
  {
    id: "P3",
    label: "firstUpgradeWave",
    monthsFrom: 4,
    monthsTo: 6,
    inviteBonusMultiplier: 1.0,
    nexFeeOffsetRate: 0.4,
    withdrawalCooldownDays: 30,
    binaryDailyCapUSD: 5_000,
    complianceHoldEnabled: false,
  },
  {
    id: "P4",
    label: "subscriptionPush",
    monthsFrom: 6,
    monthsTo: 8,
    inviteBonusMultiplier: 1.0,
    nexFeeOffsetRate: 0.4,
    withdrawalCooldownDays: 30,
    binaryDailyCapUSD: 2_000,
    complianceHoldEnabled: false,
  },
  {
    id: "P5",
    label: "depositLockIn",
    monthsFrom: 8,
    monthsTo: 10,
    inviteBonusMultiplier: 1.0,
    nexFeeOffsetRate: 0.4,
    withdrawalCooldownDays: 45,
    binaryDailyCapUSD: 2_000,
    complianceHoldEnabled: true,
  },
  {
    id: "P6",
    label: "softExit",
    monthsFrom: 10,
    monthsTo: 999,
    inviteBonusMultiplier: 1.0,
    nexFeeOffsetRate: 0.4,
    withdrawalCooldownDays: 45,
    binaryDailyCapUSD: 2_000,
    complianceHoldEnabled: true,
  },
];

export function getMonthsSince(joinedAt: number, now: number = mockServerNow()): number {
  return Math.max(0, (now - joinedAt) / ONE_MONTH_MS);
}

export function getPhaseForMonth(month: number): PhaseParams {
  for (const p of PHASES) {
    if (month >= p.monthsFrom && month < p.monthsTo) return p;
  }
  return PHASES[PHASES.length - 1];
}

export function getPhaseParams(id: PhaseId): PhaseParams {
  return PHASES.find((phase) => phase.id === id) ?? PHASES[0];
}

/**
 * True when `current` has advanced to or past `target` on the P1 → P6 scale.
 * Used by gen-2 product gating: Pro v2 unlocks at P3, Rack P2 at P5.
 */
export function isPhaseReached(current: PhaseParams, target: PhaseId): boolean {
  const currentIdx = PHASES.findIndex((p) => p.id === current.id);
  const targetIdx = PHASES.findIndex((p) => p.id === target);
  return currentIdx >= targetIdx;
}

// PM-facing phase override (dev/PM tooling). Persisted so the pinned state survives
// reload. When `pinned` is null the engine falls back to time-based phase.
//
// ⚠️ PRODUCTION/REMOTE GUARD: in production or any remote runtime any user could call setPinned to skip
// months of ramp and unlock a higher invite multiplier / shorter cooldown.
// The setter no-ops in production and remote development. Real phase decision is server canonical;
// client only mirrors server-issued phase.
const OVERRIDE_STORAGE_KEY = "nexgrid-product-phase-override-v1";

function hydratePinned(): PhaseId | null {
  // 产线/远程读守卫:setPinned 在 production/remote no-op 只拦「写」,不拦手写 localStorage 的
  // 「读」——否则用户手工塞 {pinned:"P5"} 即可绕开上架门/phase 派发(审查 F8)。
  if (IS_PRODUCTION || remoteApiEnabled) return null;
  try {
    const s = uni.getStorageSync(OVERRIDE_STORAGE_KEY) as { pinned?: PhaseId } | "";
    if (s && typeof s === "object" && typeof s.pinned === "string") return s.pinned;
  } catch {
    // first run
  }
  return null;
}

// Mirror Next's process.env.NODE_ENV guard. Vite/uni exposes the build mode via
// import.meta.env.PROD (always defined; avoids a `process is not defined` runtime
// error on App/native targets where the Node `process` global is absent).
const IS_PRODUCTION = import.meta.env.PROD;

export const useProductPhaseOverride = defineStore("productPhaseOverride", () => {
  const pinned = ref<PhaseId | null>(hydratePinned());

  function setPinned(id: PhaseId | null) {
    if (IS_PRODUCTION || remoteApiEnabled) return;
    pinned.value = id;
    try {
      uni.setStorageSync(OVERRIDE_STORAGE_KEY, { pinned: id });
    } catch {
      // storage unavailable
    }
  }

  return { pinned, setPinned };
});

/**
 * 活动 phase 的唯一解析路径:demo pin 优先(useProductPhaseOverride),否则按注册
 * 月龄时间派生。页面报价(use-product-phase)与 store 的 server 侧费用复验
 * (app.submitWithdrawal)都必须走这一条 —— 曾经两侧各自派生,pin 态下页面报价
 * 与提交校验的 nexFeeOffsetRate 走两条路(审查 P2-2)。在 computed 内调用时,
 * override.pinned 的读取照常被依赖追踪,pin 变更会触发重算。
 */
export function resolveActivePhase(joinedAt: number): PhaseParams {
  const override = useProductPhaseOverride();
  if (override.pinned) {
    const p = PHASES.find((x) => x.id === override.pinned);
    if (p) return p;
  }
  return getPhaseForMonth(getMonthsSince(joinedAt));
}

// ───────── FEAT-DEV02b:置换侧抢先购(上架节奏门 × 升级置换融合,2026-07-07 主人拍板) ─────────
// Server-canonical: GET /api/config/release-gates (PRD §9.11c.1)。后台 E1「上架节奏门」配置项。
// 默认关闭 = 上架门对置换路径同样生效(未正式上架的 SKU 不可作置换目标,深链同拦)。
// 开启后,**仅置换路径**可在正式上架前 leadDays 天内购买该 SKU;商城正门(列表 Locked
// 卡/详情/非置换深链)不受影响。与 admin「强制解锁」优先级:强制解锁=全面正式上架
// (released),本开关随之无作用面,不冲突。字面量保持可正则抽取(canon 三端对账预留)。
export const TRADEIN_EARLY_ACCESS = {
  /** 总开关(默认关)。 */
  enabled: false,
  /** 提前天数:正式上架时点前 N 天起置换侧可购(运营档位建议 7/14/30/60/90)。 */
  leadDays: 30,
} as const;

/** 抢先购窗口判定(仅窗口,不含"已正式上架"):开关开 ∧ 距上架月界 ≤ leadDays。
 *  基于真实注册月龄(demo 的 phase pin 覆盖不影响窗口计算,pin 已上架时走 released 分支)。 */
export function tradeInEarlyWindowOk(
  unlocksAtPhase: PhaseId | undefined,
  monthsSinceJoin: number,
): boolean {
  if (!unlocksAtPhase) return true;
  if (!TRADEIN_EARLY_ACCESS.enabled) return false;
  const gate = PHASES.find((p) => p.id === unlocksAtPhase);
  // fail-closed:限售门遇未知 phase(server 配置脏数据)宁少卖不提前卖。
  if (!gate) return false;
  return monthsSinceJoin >= gate.monthsFrom - TRADEIN_EARLY_ACCESS.leadDays / 30;
}

/** 置换目标可用性 = 已正式上架(与正门同源,含 demo pin)∨ 抢先购窗口内。
 *  三个置换目标面(retire 列表 / 设备行 strip / 商城横幅)统一走本判定;
 *  结算深链另需叠加「携置换上下文」条件(见 checkout 上架门拦截)。 */
export function isTradeInTargetAvailable(
  unlocksAtPhase: PhaseId | undefined,
  currentPhase: PhaseParams,
  monthsSinceJoin: number,
): boolean {
  if (!unlocksAtPhase) return true;
  if (isPhaseReached(currentPhase, unlocksAtPhase)) return true;
  return tradeInEarlyWindowOk(unlocksAtPhase, monthsSinceJoin);
}
