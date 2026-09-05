import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type DailyMilestoneStatus = "LOCKED" | "CLAIMABLE" | "CLAIMED";

export interface DailyStreakState {
  currentStreak: number;
  longestStreak: number;
  streakSavers: number;
  lastCheckInDate: string | null;
  checkedInToday: boolean;
}

export interface CanonicalDailyMilestone {
  milestoneId: number;
  milestoneDay: number;
  rewardType: string;
  rewardAmount: number;
  badgeCode: string | null;
  status: DailyMilestoneStatus;
}

export type DailyPowerUpStatus = "LOCKED" | "AVAILABLE" | "ACTIVATED";

export interface CanonicalDailyPowerUp {
  powerUpId: number;
  powerUpCode: string;
  name: string;
  unlockStreakDays: number;
  targetPath: string;
  effectType: string;
  effectValue: string;
  status: DailyPowerUpStatus;
}

export interface CanonicalTopStreaker {
  name: string;
  countryCode: string;
  streak: number;
}

export type EarningMilestoneStatus = "LOCKED" | "CLAIMABLE" | "FIRED";

export interface CanonicalEarningMilestone {
  milestoneId: string;
  thresholdUsdt: number;
  rewardNex: number;
  lifetimeEarningsUsdt: number;
  status: EarningMilestoneStatus;
  achievedAt: string | null;
}

export interface DailySnapshot {
  rewardAsset: "NEX";
  serverDate: string;
  nextResetAtUtc: string;
  streak: DailyStreakState;
  dailyMilestones: CanonicalDailyMilestone[];
  earningMilestones: CanonicalEarningMilestone[];
  powerUps: CanonicalDailyPowerUp[];
  rules: Array<{ key: string; value: string }>;
  topStreakers: CanonicalTopStreaker[];
  source: string;
}

export interface DailyCheckInResult {
  checkInDate: string;
  baseNex: number;
  rewardNex: number;
  streakBonusNex: number;
  multiplier: number;
  streakDays: number;
}

export interface DailyMilestoneClaimResult {
  milestoneId: number;
  milestoneDay: number;
  rewardType: string;
  rewardAmount: number;
  badgeCode: string | null;
  spinTickets: number;
}

export interface StreakSaverResult {
  restoredStreak: number;
  streakSavers: number;
  effectiveLastCheckInDate: string;
}

export interface DailyPowerUpActivationResult {
  powerUpId: number;
  powerUpCode: string;
  badgeCode: string | null;
  status: "ACTIVATED";
}

export interface EarningMilestoneEvaluationResult {
  fired: Array<{ milestoneId: string; thresholdUsd: number; rewardNex: number; lifetimeEarningsUsd: number }>;
  count: number;
}

export interface PointsApi {
  state(): Promise<DailySnapshot>;
  checkIn(idempotencyKey: string): Promise<DailyCheckInResult>;
  claimMilestone(milestoneId: number, idempotencyKey: string): Promise<DailyMilestoneClaimResult>;
  useSaver(idempotencyKey: string): Promise<StreakSaverResult>;
  activatePowerUp(powerUpId: number, idempotencyKey: string): Promise<DailyPowerUpActivationResult>;
  evaluateEarningMilestones(idempotencyKey: string): Promise<EarningMilestoneEvaluationResult>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : text(value);
}

function number(value: unknown, min = 0): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
}

function invalid(message = "DAILY_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function requiredKey(value: string): string {
  const key = value.trim();
  if (!key) throw new ApiError({ kind: "protocol", message: "DAILY_IDEMPOTENCY_KEY_REQUIRED" });
  return key;
}

function whole(value: unknown, min = 0): number | null {
  const parsed = number(value, min);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function parseMilestone(value: unknown): CanonicalDailyMilestone {
  const row = record(value);
  const milestoneId = whole(row?.milestoneId, 1);
  const milestoneDay = whole(row?.milestoneDay, 1);
  const rewardType = text(row?.rewardType)?.toUpperCase();
  const rewardAmount = number(row?.rewardAmount);
  const status = text(row?.status)?.toUpperCase() as DailyMilestoneStatus;
  if (!row || milestoneId === null || milestoneDay === null || !rewardType
      || rewardAmount === null || !["LOCKED", "CLAIMABLE", "CLAIMED"].includes(status)) {
    return invalid();
  }
  return {
    milestoneId,
    milestoneDay,
    rewardType,
    rewardAmount,
    badgeCode: optionalText(row.badgeCode),
    status,
  };
}

function parsePowerUp(value: unknown): CanonicalDailyPowerUp {
  const row = record(value);
  const powerUpId = whole(row?.powerUpId, 1);
  const powerUpCode = text(row?.powerUpCode);
  const name = text(row?.name);
  const unlockStreakDays = whole(row?.unlockStreakDays, 1);
  const targetPath = text(row?.targetPath);
  const effectType = text(row?.effectType);
  const effectValue = typeof row?.effectValue === "string" ? row.effectValue : null;
  const status = text(row?.status)?.toUpperCase() as DailyPowerUpStatus;
  if (!row || powerUpId === null || !powerUpCode || !name || unlockStreakDays === null
      || !targetPath || !effectType || effectValue === null
      || !["LOCKED", "AVAILABLE", "ACTIVATED"].includes(status)) {
    return invalid("DAILY_POWER_UP_RESPONSE_INVALID");
  }
  return {
    powerUpId,
    powerUpCode,
    name,
    unlockStreakDays,
    targetPath,
    effectType,
    effectValue,
    status,
  };
}

function parseTopStreaker(value: unknown): CanonicalTopStreaker {
  const row = record(value);
  const name = text(row?.name);
  const countryCode = text(row?.countryCode);
  const streak = whole(row?.streak, 1);
  if (!row || !name || !countryCode || streak === null) {
    return invalid("DAILY_LEADERBOARD_RESPONSE_INVALID");
  }
  return { name, countryCode, streak };
}

function parseEarningMilestone(value: unknown): CanonicalEarningMilestone {
  const row = record(value);
  const milestoneId = text(row?.milestoneId);
  const thresholdUsdt = number(row?.thresholdUsdt);
  const rewardNex = number(row?.rewardNex);
  const lifetimeEarningsUsdt = number(row?.lifetimeEarningsUsdt);
  const status = text(row?.status)?.toUpperCase() as EarningMilestoneStatus;
  const achievedAt = optionalText(row?.achievedAt);
  if (!row || !milestoneId || thresholdUsdt === null || rewardNex === null
      || lifetimeEarningsUsdt === null || !["LOCKED", "CLAIMABLE", "FIRED"].includes(status)
      || (achievedAt !== null && Number.isNaN(Date.parse(achievedAt)))) {
    return invalid("EARNING_MILESTONE_RESPONSE_INVALID");
  }
  return { milestoneId, thresholdUsdt, rewardNex, lifetimeEarningsUsdt, status, achievedAt };
}

function parseSnapshot(value: unknown): DailySnapshot {
  const row = record(value);
  const streak = record(row?.streak);
  const currentStreak = whole(streak?.currentStreak);
  const longestStreak = whole(streak?.longestStreak);
  const streakSavers = whole(streak?.streakSavers);
  const checkedInToday = bool(streak?.checkedInToday);
  const serverDate = text(row?.serverDate);
  const nextResetAtUtc = text(row?.nextResetAtUtc);
  const source = text(row?.source);
  if (!row || row.rewardAsset !== "NEX" || !streak || currentStreak === null
      || longestStreak === null || streakSavers === null || checkedInToday === null
      || !serverDate || Number.isNaN(Date.parse(`${serverDate}T00:00:00Z`))
      || !nextResetAtUtc || Number.isNaN(Date.parse(nextResetAtUtc))
      || !Array.isArray(row.dailyMilestones) || !Array.isArray(row.earningMilestones) || !Array.isArray(row.powerUps)
      || !Array.isArray(row.topStreakers) || !source) {
    return invalid();
  }
  const dailyMilestones = row.dailyMilestones.map(parseMilestone);
  const ids = new Set(dailyMilestones.map((item) => item.milestoneId));
  const days = new Set(dailyMilestones.map((item) => item.milestoneDay));
  if (ids.size !== dailyMilestones.length || days.size !== dailyMilestones.length) {
    return invalid("DAILY_MILESTONE_DUPLICATED");
  }
  const powerUps = row.powerUps.map(parsePowerUp);
  const rules = Array.isArray(row.rules) ? row.rules.map((item) => {
    const rule = record(item);
    const key = text(rule?.key);
    const value = typeof rule?.value === "string" ? rule.value : rule?.value == null ? null : String(rule.value);
    if (!key || value === null) return invalid("DAILY_RULE_RESPONSE_INVALID");
    return { key, value };
  }) : invalid("DAILY_RULE_RESPONSE_INVALID");
  if (new Set(powerUps.map((item) => item.powerUpId)).size !== powerUps.length
      || new Set(powerUps.map((item) => item.powerUpCode)).size !== powerUps.length) {
    return invalid("DAILY_POWER_UP_DUPLICATED");
  }
  const topStreakers = row.topStreakers.map(parseTopStreaker);
  const earningMilestones = row.earningMilestones.map(parseEarningMilestone);
  if (new Set(earningMilestones.map((item) => item.milestoneId)).size !== earningMilestones.length) {
    return invalid("EARNING_MILESTONE_DUPLICATED");
  }
  return {
    rewardAsset: "NEX",
    serverDate,
    nextResetAtUtc,
    streak: {
      currentStreak,
      longestStreak,
      streakSavers,
      lastCheckInDate: optionalText(streak.lastCheckInDate),
      checkedInToday,
    },
    dailyMilestones,
    earningMilestones,
    powerUps,
    rules,
    topStreakers,
    source,
  };
}

function parseCheckIn(value: unknown): DailyCheckInResult {
  const row = record(value);
  const checkInDate = text(row?.checkInDate);
  const baseNex = number(row?.baseNex);
  const rewardNex = number(row?.rewardNex);
  const streakBonusNex = number(row?.streakBonusNex);
  const multiplier = number(row?.multiplier, 1);
  const streakDays = whole(row?.streakDays, 1);
  if (!row || !checkInDate || baseNex === null || rewardNex === null
      || streakBonusNex === null || multiplier === null || streakDays === null) {
    return invalid("DAILY_CHECK_IN_RESPONSE_INVALID");
  }
  return { checkInDate, baseNex, rewardNex, streakBonusNex, multiplier, streakDays };
}

function parseClaim(value: unknown): DailyMilestoneClaimResult {
  const row = record(value);
  const milestoneId = whole(row?.milestoneId, 1);
  const milestoneDay = whole(row?.milestoneDay, 1);
  const rewardType = text(row?.rewardType)?.toUpperCase();
  const rewardAmount = number(row?.rewardAmount);
  const spinTickets = whole(row?.spinTickets);
  if (!row || milestoneId === null || milestoneDay === null || !rewardType
      || rewardAmount === null || spinTickets === null) {
    return invalid("DAILY_MILESTONE_CLAIM_RESPONSE_INVALID");
  }
  return {
    milestoneId,
    milestoneDay,
    rewardType,
    rewardAmount,
    badgeCode: optionalText(row.badgeCode),
    spinTickets,
  };
}

function parseSaver(value: unknown): StreakSaverResult {
  const row = record(value);
  const restoredStreak = whole(row?.restoredStreak, 1);
  const streakSavers = whole(row?.streakSavers);
  const effectiveLastCheckInDate = text(row?.effectiveLastCheckInDate);
  if (!row || restoredStreak === null || streakSavers === null || !effectiveLastCheckInDate) {
    return invalid("DAILY_STREAK_SAVER_RESPONSE_INVALID");
  }
  return { restoredStreak, streakSavers, effectiveLastCheckInDate };
}

function parsePowerUpActivation(value: unknown): DailyPowerUpActivationResult {
  const row = record(value);
  const powerUpId = whole(row?.powerUpId, 1);
  const powerUpCode = text(row?.powerUpCode);
  if (!row || powerUpId === null || !powerUpCode || row.status !== "ACTIVATED") {
    return invalid("DAILY_POWER_UP_ACTIVATION_RESPONSE_INVALID");
  }
  return {
    powerUpId,
    powerUpCode,
    badgeCode: optionalText(row.badgeCode),
    status: "ACTIVATED",
  };
}

function parseEarningEvaluation(value: unknown): EarningMilestoneEvaluationResult {
  const row = record(value);
  const count = whole(row?.count);
  if (!row || count === null || !Array.isArray(row.fired) || count !== row.fired.length) {
    return invalid("EARNING_MILESTONE_EVALUATION_RESPONSE_INVALID");
  }
  const fired = row.fired.map((value) => {
    const item = record(value);
    const milestoneId = text(item?.milestoneId);
    const thresholdUsd = number(item?.thresholdUsd);
    const rewardNex = number(item?.rewardNex);
    const lifetimeEarningsUsd = number(item?.lifetimeEarningsUsd);
    if (!item || !milestoneId || thresholdUsd === null || rewardNex === null || lifetimeEarningsUsd === null) {
      return invalid("EARNING_MILESTONE_EVALUATION_RESPONSE_INVALID");
    }
    return { milestoneId, thresholdUsd, rewardNex, lifetimeEarningsUsd };
  });
  return { fired, count };
}

export function createPointsApi(client: ApiClient): PointsApi {
  return {
    state: async () => parseSnapshot(await client.request({ method: "GET", path: "/api/points/state" })),
    checkIn: async (idempotencyKey) => parseCheckIn(await client.request({
      method: "POST",
      path: "/api/points/sign-in",
      idempotencyKey: requiredKey(idempotencyKey),
    })),
    claimMilestone: async (milestoneId, idempotencyKey) => {
      if (!Number.isSafeInteger(milestoneId) || milestoneId <= 0) {
        throw new ApiError({ kind: "protocol", message: "DAILY_MILESTONE_ID_REQUIRED" });
      }
      return parseClaim(await client.request({
        method: "POST",
        path: `/api/points/milestones/${milestoneId}/claim`,
        idempotencyKey: requiredKey(idempotencyKey),
      }));
    },
    useSaver: async (idempotencyKey) => parseSaver(await client.request({
      method: "POST",
      path: "/api/points/streak-saver/use",
      idempotencyKey: requiredKey(idempotencyKey),
    })),
    activatePowerUp: async (powerUpId, idempotencyKey) => {
      if (!Number.isSafeInteger(powerUpId) || powerUpId <= 0) {
        throw new ApiError({ kind: "protocol", message: "DAILY_POWER_UP_ID_REQUIRED" });
      }
      return parsePowerUpActivation(await client.request({
        method: "POST",
        path: `/api/points/power-ups/${powerUpId}/activate`,
        idempotencyKey: requiredKey(idempotencyKey),
      }));
    },
    evaluateEarningMilestones: async (idempotencyKey) => parseEarningEvaluation(await client.request({
      method: "POST",
      path: "/api/earnings/milestones/evaluate",
      idempotencyKey: requiredKey(idempotencyKey),
    })),
  };
}
