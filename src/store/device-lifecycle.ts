/**
 * ⚠️ MOCK-ONLY TASK-CAPACITY schedule — server-authoritative business config.
 * Production: GET /api/config/task-capacity (TBD; candidate name, PRD §6.8).
 * Admin mutates via the ops console「任务产能节奏」panel (E domain); the values
 * here are the client seed/UI cache. FEAT-DEV01 (Aligned 2026-07-06).
 *
 * Model: the platform's AI task pool keeps upgrading — newer models demand more
 * VRAM, so high-tier tasks grow while low-tier task volume shrinks. A device
 * with fixed VRAM therefore books fewer tasks month over month. This module
 * quantifies that as a capacity multiplier in [CAPACITY_FLOOR, 1.0] applied to
 * baseRate. (Successor of the retired "hardware degradation" framing — SAME
 * math by product decision 等效换皮: the band table must reproduce the legacy
 * curve exactly, enforced by scripts/check-capacity-curve-parity.mjs at
 * 0.25-month steps. An INTENTIONAL retune updates that golden + canon together.)
 *
 * The schedule is kept as a REGEX-EXTRACTABLE literal: the admin repo's
 * canon-sentinel.mjs text-parses these numbers against canon-numbers.json and
 * the E-domain defaults — keep plain number literals, one band per line.
 *
 * Derived display values (capacity %, tasks/day) are computed on demand from
 * getEfficiency()/getLifecycleSummary() and are NEVER persisted (single-source
 * derivation gate). The consumer API below (getMonthsOwned / getEfficiency /
 * isDegradable / getLifecycleSummary / getNetworkMonthlyLoss) is shape-frozen.
 */

import type { Device, DeviceKind } from "./types";
import { ONE_MONTH_MS, mockServerNow } from "./server-time";

/** Task-mix capacity schedule. Row i covers months (prevRow.throughMonth,
 *  throughMonth]; the `throughMonth: null` row is open-ended. monthlyDeltaPct
 *  compounds per whole month, with linear interpolation inside the current
 *  month so the UI renders a smooth curve. */
export let TASK_CAPACITY_BANDS: ReadonlyArray<{ throughMonth: number | null; monthlyDeltaPct: number }> = [
  { throughMonth: 3, monthlyDeltaPct: -4 },       // months 1-3
  { throughMonth: 8, monthlyDeltaPct: -6 },       // months 4-8
  { throughMonth: null, monthlyDeltaPct: -23.7 }, // months 9+ — calibrated so capacity(month 12) ≈ floor: 0.96³·0.94⁵·0.763⁴ ≈ 0.22
];

/** Capacity never drops below this share of the published daily rate. */
export let CAPACITY_FLOOR = 0.22;

/** New-device task-subsidy window, in days. DISPLAY-ONLY (FEAT-DEV01B): within
 *  the window the device card shows the subsidy badge instead of the capacity
 *  percentage. It must NEVER enter the accrual math below — the capacity curve
 *  is continuous from day 0 (等效换皮 P0). */
export let SUBSIDY_DAYS = 30;

/** Kinds exempt from the task-mix decline (constant 100% capacity): phone
 *  yield is engagement-tier, cloud-share is platform-refreshed rented compute,
 *  pc-gpu is the user's own shared computer. Admin exposes this as per-SKU
 *  「参与任务递减」switches. */
export let CAPACITY_EXEMPT_KINDS: readonly DeviceKind[] = ["phone", "cloud-share", "pc-gpu"];

const APPLY_KEY_BY_KIND: Record<DeviceKind, string> = {
  phone: "capacityApplyToPhone",
  "cloud-share": "capacityApplyToCloudShare",
  "pc-gpu": "capacityApplyToPcGpu",
  "stellarbox-s1": "capacityApplyToS1",
  "stellarbox-pro": "capacityApplyToPro",
  "stellarbox-pro-v2": "capacityApplyToProV2",
  "stellarrack-p1": "capacityApplyToRackP1",
  "stellarrack-p2": "capacityApplyToRackP2",
};

function requiredNumber(config: Record<string, string>, key: string): number {
  const value = Number(config[key]);
  if (!Number.isFinite(value)) throw new Error("E3_LIFECYCLE_CONFIG_INVALID");
  return value;
}

/** Installs the exact server schedule returned with /api/devices/earnings. */
export function installCanonicalLifecycleConfig(config: Record<string, string>): void {
  const early = requiredNumber(config, "stageEarlyEnd");
  const mid = requiredNumber(config, "stageMidEnd");
  const floorPct = requiredNumber(config, "capacityFloorPct");
  const subsidyDays = requiredNumber(config, "capacitySubsidyDays");
  if (!Number.isSafeInteger(early) || !Number.isSafeInteger(mid) || early <= 0 || mid <= early
      || floorPct < 0 || floorPct > 100 || !Number.isSafeInteger(subsidyDays) || subsidyDays < 0) {
    throw new Error("E3_LIFECYCLE_CONFIG_INVALID");
  }
  const bands = [
    { throughMonth: early, monthlyDeltaPct: requiredNumber(config, "capacityBand1DeltaPct") },
    { throughMonth: mid, monthlyDeltaPct: requiredNumber(config, "capacityBand2DeltaPct") },
    { throughMonth: null, monthlyDeltaPct: requiredNumber(config, "capacityBand3DeltaPct") },
  ];
  const exempt = (Object.keys(APPLY_KEY_BY_KIND) as DeviceKind[]).filter((kind) => {
    const raw = config[APPLY_KEY_BY_KIND[kind]];
    if (raw !== "true" && raw !== "false") throw new Error("E3_LIFECYCLE_CONFIG_INVALID");
    return raw === "false";
  });
  TASK_CAPACITY_BANDS = bands;
  CAPACITY_FLOOR = floorPct / 100;
  SUBSIDY_DAYS = subsidyDays;
  CAPACITY_EXEMPT_KINDS = exempt;
}

/** Frozen consumer API — true when the kind follows the capacity schedule. */
export function isDegradable(kind: DeviceKind): boolean {
  return !CAPACITY_EXEMPT_KINDS.includes(kind);
}

/**
 * 1-based month index since purchase (1 = first month of ownership, 12+ = deep
 * schedule). Returns a fractional month so the UI can render a smooth curve.
 */
export function getMonthsOwned(purchasedAt: number, now: number = mockServerNow()): number {
  return Math.max(0, (now - purchasedAt) / ONE_MONTH_MS);
}

function monthlyRateAt(month: number): number {
  for (const band of TASK_CAPACITY_BANDS) {
    if (band.throughMonth === null || month <= band.throughMonth) {
      return band.monthlyDeltaPct / 100;
    }
  }
  return TASK_CAPACITY_BANDS[TASK_CAPACITY_BANDS.length - 1].monthlyDeltaPct / 100;
}

/**
 * Capacity multiplier in [CAPACITY_FLOOR, 1.0]. Smooth across band boundaries
 * by integrating the monthly rate up to the current fractional month.
 *
 *   cap(t) = product over k in 1..floor(t) of (1 + rate(k))  ×  (1 + rate(floor(t)+1))^(t - floor(t))
 */
export function getEfficiency(monthsOwned: number): number {
  if (monthsOwned <= 0) return 1;

  const whole = Math.floor(monthsOwned);
  const frac = monthsOwned - whole;

  let eff = 1;
  for (let m = 1; m <= whole; m++) {
    eff *= 1 + monthlyRateAt(m);
  }
  if (frac > 0) {
    eff *= 1 + monthlyRateAt(whole + 1) * frac;
  }
  return Math.max(CAPACITY_FLOOR, eff);
}

/**
 * Convenience: full task-capacity summary for a single device.
 * (Field names retained from the degradation era — frozen consumer shape.)
 */
export interface DeviceLifecycleSummary {
  isDegradable: boolean;
  monthsOwned: number;
  efficiency: number;       // 0..1 capacity multiplier, applied to baseRate
  dailyRateAtFull: number;  // baseRate (USD/day at 100% capacity)
  dailyRateNow: number;     // baseRate × capacity
  dailyLossUSD: number;     // dailyRateAtFull − dailyRateNow
  monthlyLossUSD: number;   // dailyLossUSD × 30
}

export function hasServerLifecycleProjection(device: Device): boolean {
  return device.capacitySource === "server"
    && typeof device.capacityPct === "number"
    && Number.isFinite(device.capacityPct)
    && device.capacityPct >= 0
    && device.capacityPct <= 100
    && Number.isInteger(device.capacityAgeMonths)
    && (device.capacityAgeMonths ?? -1) >= 0
    && typeof device.capacitySubsidized === "boolean"
    && Number.isInteger(device.capacitySubsidyDays)
    && (device.capacitySubsidyDays ?? -1) >= 0
    && Number.isInteger(device.capacitySubsidyRemainingDays)
    && (device.capacitySubsidyRemainingDays ?? -1) >= 0
    && (device.capacitySubsidyRemainingDays ?? 0) <= (device.capacitySubsidyDays ?? -1)
    && (device.capacitySubsidyEndsAt === null
      || (typeof device.capacitySubsidyEndsAt === "number"
        && Number.isFinite(device.capacitySubsidyEndsAt)
        && device.capacitySubsidyEndsAt >= 0))
    && (device.capacitySubsidized === true
      ? (device.capacitySubsidyRemainingDays ?? 0) > 0
        && typeof device.capacitySubsidyEndsAt === "number"
        && device.capacitySubsidyEndsAt > (device.serverNow ?? Number.POSITIVE_INFINITY)
      : (device.capacitySubsidyRemainingDays ?? -1) === 0)
    && typeof device.serverNow === "number"
    && Number.isFinite(device.serverNow)
    && device.serverNow >= 0;
}

function serverLifecycleSummary(device: Device): DeviceLifecycleSummary | null {
  if (!hasServerLifecycleProjection(device)) return null;
  const efficiency = (device.capacityPct as number) / 100;
  const dailyRateAtFull = device.baseRate;
  const dailyRateNow = dailyRateAtFull * efficiency;
  const dailyLossUSD = dailyRateAtFull - dailyRateNow;
  return {
    isDegradable: isDegradable(device.kind),
    monthsOwned: device.capacityAgeMonths as number,
    efficiency,
    dailyRateAtFull,
    dailyRateNow,
    dailyLossUSD,
    monthlyLossUSD: dailyLossUSD * 30,
  };
}

export function getLifecycleSummary(
  device: Device,
  now: number = mockServerNow(),
): DeviceLifecycleSummary {
  // A remote row is never allowed to fall back to purchasedAt + Date.now().
  // Missing/null server facts are unavailable and must be rendered as such.
  if (device.capacitySource === "server") {
    return serverLifecycleSummary(device) ?? {
      isDegradable: false,
      monthsOwned: 0,
      efficiency: 0,
      dailyRateAtFull: 0,
      dailyRateNow: 0,
      dailyLossUSD: 0,
      monthlyLossUSD: 0,
    };
  }
  const degradable = isDegradable(device.kind);
  if (!degradable) {
    return {
      isDegradable: false,
      monthsOwned: 0,
      efficiency: 1,
      dailyRateAtFull: device.baseRate,
      dailyRateNow: device.baseRate,
      dailyLossUSD: 0,
      monthlyLossUSD: 0,
    };
  }
  const monthsOwned = getMonthsOwned(device.purchasedAt, now);
  const efficiency = getEfficiency(monthsOwned);
  const dailyRateAtFull = device.baseRate;
  const dailyRateNow = dailyRateAtFull * efficiency;
  const dailyLossUSD = dailyRateAtFull - dailyRateNow;
  return {
    isDegradable: true,
    monthsOwned,
    efficiency,
    dailyRateAtFull,
    dailyRateNow,
    dailyLossUSD,
    monthlyLossUSD: dailyLossUSD * 30,
  };
}

/**
 * Aggregate monthly shortfall across all schedule-following devices (used by
 * the /earn banner).
 */
export function getNetworkMonthlyLoss(
  devices: Device[],
  now: number = mockServerNow(),
): { totalMonthlyLossUSD: number; degradableCount: number } {
  let totalMonthlyLossUSD = 0;
  let degradableCount = 0;
  for (const d of devices) {
    if (!isDegradable(d.kind)) continue;
    degradableCount += 1;
    if (d.capacitySource === "server" && !hasServerLifecycleProjection(d)) continue;
    const summary = getLifecycleSummary(d, now);
    totalMonthlyLossUSD += summary.monthlyLossUSD;
  }
  return { totalMonthlyLossUSD, degradableCount };
}
