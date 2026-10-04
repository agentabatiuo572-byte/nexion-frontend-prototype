import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { normalizeQuestActionRoute } from "@/lib/quest-presentation";

export type QuestLayer = "DAY_ONE" | "WEEKLY_T1" | "WEEKLY_T2";
export type QuestStatus = "PENDING" | "COMPLETED" | "CLAIMABLE" | "CLAIMED" | "EXPIRED";
export type QuestTaskCategory = "wallet" | "explore" | "recommend" | "identity" | "social";
export type DayOneSnapshotStatus = "SNAPSHOT" | "EMPTY" | "LEGACY_UNVERIFIED";

export interface CanonicalQuest {
  questCode: string;
  name: string;
  layer: QuestLayer;
  rewardNex: number;
  status: QuestStatus;
  category: QuestTaskCategory;
  actionRoute: string;
  instanceKey: string;
  eligibleFrom: string;
  eligibleUntil: string;
  eligible: boolean;
}

export interface CanonicalPromoBanner {
  bannerCode: string;
  baseReward: number;
  multiplier: number;
  countdownDays: number;
  countdownHours: number;
  targetDevice: string;
  targetDaily: number | null;
  status: "active" | "paused";
}

export interface QuestSnapshot {
  quests: CanonicalQuest[];
  dayOneRewardNex: number;
  /** Null means an older server state has no immutable Day-One snapshot. */
  dayOneRequiredTaskCount: number | null;
  dayOneSnapshotStatus: DayOneSnapshotStatus;
  promoBanner: CanonicalPromoBanner | null;
  questBonusMultiplier: number;
  rhythmMonth: number;
  source: string;
  serverCanonical: true;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface QuestClaimResult {
  questId: string;
  rewardNex: number;
  status: "CLAIMED";
  instanceKey: string;
  serverCanonical: true;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface QuestApi {
  state(locale?: string): Promise<QuestSnapshot>;
  claim(questCode: string, idempotencyKey: string, instanceKey: string): Promise<QuestClaimResult>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown, min = 0, max = Number.POSITIVE_INFINITY): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function invalid(message = "QUEST_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function validAuthority(row: Record<string, unknown>, mode: ApiEnvironment): boolean {
  if (row.serverCanonical !== true) return false;
  return (mode === "dev" || mode === "prod")
    && row.sourceEnvironment === "PRODUCTION" && row.runId === "";
}

function parseQuest(value: unknown): CanonicalQuest {
  const row = record(value);
  const questCode = text(row?.questCode);
  const name = text(row?.name);
  const layer = text(row?.layer)?.toUpperCase() as QuestLayer;
  const rewardNex = number(row?.rewardNex);
  const status = text(row?.status)?.toUpperCase() as QuestStatus;
  const category = text(row?.category)?.toLowerCase() as QuestTaskCategory;
  const rawActionRoute = text(row?.actionRoute);
  const instanceKey = text(row?.instanceKey);
  const eligibleFrom = instant(row?.eligibleFrom);
  const eligibleUntil = instant(row?.eligibleUntil);
  const eligible = boolean(row?.eligible);
  if (!row || !questCode || !name
      || !["DAY_ONE", "WEEKLY_T1", "WEEKLY_T2"].includes(layer)
      || rewardNex === null
      || !["PENDING", "COMPLETED", "CLAIMABLE", "CLAIMED", "EXPIRED"].includes(status)
      || !["wallet", "explore", "recommend", "identity", "social"].includes(category)
      || !rawActionRoute || !instanceKey || !eligibleFrom || !eligibleUntil || eligible === null
      || Date.parse(eligibleUntil) <= Date.parse(eligibleFrom)
      || (layer === "DAY_ONE" ? !instanceKey.startsWith("DAY_ONE:") : !instanceKey.startsWith("WEEK:"))
      || (status === "EXPIRED" && eligible)
      || (!eligible && !["EXPIRED", "CLAIMED"].includes(status))) {
    return invalid();
  }
  let actionRoute: string;
  try {
    actionRoute = normalizeQuestActionRoute(rawActionRoute);
  } catch {
    return invalid();
  }
  return { questCode, name, layer, rewardNex, status, category, actionRoute,
    instanceKey, eligibleFrom, eligibleUntil, eligible };
}

function boolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
}

function instant(value: unknown): string | null {
  const parsed = text(value);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

function parsePromo(value: unknown): CanonicalPromoBanner | null {
  const row = record(value);
  if (!row || Object.keys(row).length === 0) return null;
  const bannerCode = text(row.bannerCode);
  const baseReward = number(row.baseReward, 0, 100_000);
  const multiplier = number(row.multiplier, 0.1, 5);
  const countdownDays = number(row.countdownDays, 0, 365);
  const countdownHours = number(row.countdownHours, 0, 23);
  const targetDevice = text(row.targetDevice);
  const productType = text(row.productType)?.toUpperCase();
  const shareTarget = productType === "SHARE"
    || (productType == null && /cloud[\s_-]*share|\u4e91\u5171\u4eab|\u96f2\u5171\u4eab/i.test(targetDevice ?? ""));
  const targetDaily = shareTarget ? null : number(row.targetDaily, 0, 1_000_000);
  const status = text(row.status)?.toLowerCase() as "active" | "paused";
  if (!bannerCode || baseReward === null || multiplier === null
      || countdownDays === null || !Number.isInteger(countdownDays)
      || countdownHours === null || !Number.isInteger(countdownHours) || countdownHours > 23
      || !targetDevice || (!shareTarget && targetDaily === null) || !["active", "paused"].includes(status)) {
    return invalid("QUEST_PROMO_RESPONSE_INVALID");
  }
  return {
    bannerCode,
    baseReward,
    multiplier,
    countdownDays,
    countdownHours,
    targetDevice,
    targetDaily,
    status,
  };
}

function parseDayOneSnapshotMetadata(row: Record<string, unknown>, quests: readonly CanonicalQuest[]) {
  const legacy = { dayOneRequiredTaskCount: null, dayOneSnapshotStatus: "LEGACY_UNVERIFIED" as const };
  const hasCount = Object.prototype.hasOwnProperty.call(row, "dayOneRequiredTaskCount");
  const hasStatus = Object.prototype.hasOwnProperty.call(row, "dayOneSnapshotStatus");
  // Older running servers did not expose metadata. Preserve all rows (including
  // weekly history), but never reconstruct a Day-One group from live missions.
  if (!hasCount && !hasStatus) {
    return legacy;
  }
  if (!hasCount || !hasStatus) return legacy;
  const status = text(row.dayOneSnapshotStatus) as DayOneSnapshotStatus;
  const requiredTaskCount = number(row.dayOneRequiredTaskCount, 0);
  if (!status || !["SNAPSHOT", "EMPTY", "LEGACY_UNVERIFIED"].includes(status)) return legacy;
  const dayOne = quests.filter((quest) => quest.layer === "DAY_ONE");
  if (status === "SNAPSHOT") {
    const singleInstance = new Set(dayOne.map((quest) => quest.instanceKey)).size === 1;
    if (requiredTaskCount === null || !Number.isSafeInteger(requiredTaskCount) || requiredTaskCount < 1
        || dayOne.length !== requiredTaskCount || !singleInstance) return legacy;
    return { dayOneRequiredTaskCount: requiredTaskCount, dayOneSnapshotStatus: status };
  }
  if (status === "EMPTY" && requiredTaskCount === 0 && dayOne.length === 0) {
    return { dayOneRequiredTaskCount: 0, dayOneSnapshotStatus: status };
  }
  if (status === "LEGACY_UNVERIFIED" && row.dayOneRequiredTaskCount === null) {
    return { dayOneRequiredTaskCount: null, dayOneSnapshotStatus: status };
  }
  return legacy;
}

export function parseQuestSnapshot(value: unknown, mode: ApiEnvironment = "prod"): QuestSnapshot {
  const row = record(value);
  const multiplier = number(row?.questBonusMultiplier, 0.1);
  const dayOneRewardNex = number(row?.dayOneRewardNex, 0);
  const rhythmMonth = number(row?.rhythmMonth, 1);
  const source = text(row?.source);
  if (!row || !validAuthority(row, mode) || !Array.isArray(row.quests) || multiplier === null
      || dayOneRewardNex === null
      || rhythmMonth === null || !Number.isInteger(rhythmMonth) || !source
      || !source.includes("nx_mission") || !source.includes("nx_user_mission")
      || source.toLowerCase().includes("mock")) {
    return invalid();
  }
  const quests = row.quests.map(parseQuest);
  const codes = new Set(quests.map((quest) => quest.questCode));
  if (codes.size !== quests.length) return invalid("QUEST_CODE_DUPLICATED");
  const dayOneMetadata = parseDayOneSnapshotMetadata(row, quests);
  return {
    quests,
    dayOneRewardNex,
    ...dayOneMetadata,
    promoBanner: parsePromo(row.promoBanner),
    questBonusMultiplier: multiplier,
    rhythmMonth,
    source,
    serverCanonical: true,
    sourceEnvironment: row.sourceEnvironment as "PRODUCTION" | "SANDBOX",
    runId: row.runId as string,
  };
}

export function parseQuestClaim(value: unknown, mode: ApiEnvironment = "prod"): QuestClaimResult {
  const row = record(value);
  const questId = text(row?.questId);
  const rewardNex = number(row?.rewardNex);
  const instanceKey = text(row?.instanceKey);
  if (!row || !validAuthority(row, mode) || !questId || rewardNex === null || row.status !== "CLAIMED"
      || !instanceKey || (!instanceKey.startsWith("DAY_ONE:") && !instanceKey.startsWith("WEEK:"))) {
    return invalid("QUEST_CLAIM_RESPONSE_INVALID");
  }
  return {
    questId,
    rewardNex,
    status: "CLAIMED",
    instanceKey,
    serverCanonical: true,
    sourceEnvironment: row.sourceEnvironment as "PRODUCTION" | "SANDBOX",
    runId: row.runId as string,
  };
}

function required(value: string, error: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ApiError({ kind: "protocol", message: error });
  return normalized;
}

export function createQuestApi(client: ApiClient, mode: ApiEnvironment = "prod"): QuestApi {
  return {
    state: async (locale = "en") => parseQuestSnapshot(await client.request({
      method: "GET",
      path: `/api/quests/state?locale=${encodeURIComponent(["en", "zh", "vi"].includes(locale) ? locale : "en")}`,
    }), mode),
    claim: async (questCode, idempotencyKey, instanceKey) => parseQuestClaim(await client.request({
      method: "POST",
      path: `/api/quests/${encodeURIComponent(required(questCode, "QUEST_CODE_REQUIRED"))}/claim`,
      idempotencyKey: required(idempotencyKey, "QUEST_IDEMPOTENCY_KEY_REQUIRED"),
      body: { instanceKey: required(instanceKey, "QUEST_INSTANCE_KEY_REQUIRED") },
    }), mode),
  };
}
