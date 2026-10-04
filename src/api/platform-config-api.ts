import type {
  GpuTier,
  OnlineBonus,
  PlatformVerifiedAggregate,
  PlatformVerifiedStats,
  PublicStatsConfig,
  RewardsConfig,
  ShareChannelDef,
  ShareChannelKey,
  ShareConfig,
  ShareIntentType,
} from "@/store/config-types";
import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";

export interface PlatformComputeConfigSnapshot {
  featureFlags: {
    computeShareEnabled: boolean;
    homeNewcomerTasksEnabled: boolean;
    homeWeeklyPromoEnabled: boolean;
  };
  publicStats: PublicStatsConfig;
  publicStatsAuthority: PlatformPublicStatsAuthority;
  /**
   * 服务端可核验聚合。对外「在线设备 / 账号数」这类事实必须读它,不得再由
   * 运营配置值派生(zentao #59)。沙箱为 null。
   */
  verifiedStats: PlatformVerifiedStats | null;
  onlineBonus: OnlineBonus;
  computeShare: {
    downloadUrl: string;
    content: {
      zhTitle: string;
      zhGuide: string;
      enTitle: string;
      enGuide: string;
    };
    gpuTiers: GpuTier[];
  };
  rewards: RewardsConfig;
  share: ShareConfig;
  updatedAt: string;
  sources: string[];
}

export interface PlatformPublicStatsAuthority {
  source: "mock" | "server:nx_config_item,nx_user";
  sourceEnvironment: "SANDBOX" | "PRODUCTION";
  runId: string;
  version: number;
}


export interface PlatformConfigApi {
  platformConfig(): Promise<PlatformComputeConfigSnapshot>;
}

const GPU_TIER_IDS = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
const COEFFICIENT_KEYS = new Set(["h5BaseFactor", "continuityFullHours"]);
const FLAG_KEYS = new Set(["computeShareEnabled"]);
const YIELD_KEYS = new Set(["topsBaseline", "dailyUsdtPerBaseline", "nexPerUsdt"]);
const KEYWORD_SLOTS = new Set(["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"]);
const SHARE_CHANNEL_KEYS = new Set<ShareChannelKey>([
  "zalo", "telegram", "whatsapp", "messenger", "sms", "x", "copy", "poster", "system",
]);
const SHARE_INTENTS = new Set<ShareIntentType>(["web", "scheme", "copy", "poster", "system"]);
const DOWNLOAD_SOURCES = new Set(["official", "unavailable"]);

function invalid(message = "E6_PLATFORM_CONFIG_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : invalid();
}

function nonEmptyString(value: unknown): string {
  const normalized = string(value).trim();
  return normalized ? normalized : invalid();
}

function optionalString(value: unknown): string {
  return value === undefined || value === null ? "" : string(value).trim();
}

function httpUrlParts(value: string): { protocol: string; hostname: string; username: string; password: string } | null {
  if (typeof URL === "function") {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }
  // App Plus service JS has no browser URL constructor. Validate the same
  // absolute HTTP(S) boundary before accepting server-owned outbound URLs.
  const match = /^(https?):\/\/([^/?#]+)(?:[/?][^#]*)?$/i.exec(value);
  const authority = match?.[2] ?? "";
  const host = /^(\[[\da-f:.]+\]|[a-z\d.-]+)(?::(\d{1,5}))?$/i.exec(authority);
  const hostname = host?.[1] ?? "";
  const validHost = hostname.startsWith("[")
    ? hostname.slice(1, -1).includes(":") && !hostname.includes(":::")
    : hostname.split(".").every((label) => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label));
  if (!host || !validHost
      || (host[2] && Number(host[2]) > 65535)) return null;
  return { protocol: `${match![1].toLowerCase()}:`, hostname, username: "", password: "" };
}

function safeUrl(value: unknown, required: boolean, allowHttp: boolean): string {
  const url = optionalString(value);
  if (!url && !required) return "";
  if (!url || /[\s#@]/.test(url)) return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  const parsed = httpUrlParts(url);
  if (!parsed || (!allowHttp && parsed.protocol !== "https:")
      || (allowHttp && !["https:", "http:"].includes(parsed.protocol))
      || !parsed.hostname || parsed.username || parsed.password) {
    return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  }
  return url;
}

function safeShareUrlTemplate(key: ShareChannelKey, intentType: ShareIntentType, value: unknown): string {
  const template = optionalString(value);
  if (!template) {
    if (intentType === "web") return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    return "";
  }
  if (intentType !== "web" || (!template.includes("{link}") && !template.includes("{text}")) || /[\s#]/.test(template)) {
    return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  }
  const resolved = template
    .replace(/\{link\}/g, "https%3A%2F%2Fnexgrid.invalid%2Fref%2Fcode")
    .replace(/\{text\}/g, "share-text");
  if (key === "sms") {
    if (!/^sms:\?body=[^#]*$/i.test(resolved)) return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  } else {
    const parsed = httpUrlParts(resolved);
    if (!parsed || parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    }
  }
  return template;
}

function parsePlatformShareConfig(value: unknown): ShareConfig {
  const root = record(value);
  const baseUrl = safeUrl(root.baseUrl, false, false);
  const channelsRaw = root.channels;
  if (!Array.isArray(channelsRaw)) return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  const keys = new Set<string>();
  const channels: ShareChannelDef[] = channelsRaw.map((raw) => {
    const row = record(raw);
    const key = nonEmptyString(row.key);
    const intentType = nonEmptyString(row.intentType);
    if (!SHARE_CHANNEL_KEYS.has(key as ShareChannelKey) || !SHARE_INTENTS.has(intentType as ShareIntentType) || keys.has(key)) {
      return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    }
    keys.add(key);
    const enabled = row.enabled;
    if (typeof enabled !== "boolean") return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    const urlTemplate = safeShareUrlTemplate(key as ShareChannelKey, intentType as ShareIntentType, row.urlTemplate);
    const textTemplate = optionalString(row.textTemplate);
    if (enabled && intentType !== "copy" && intentType !== "poster" && intentType !== "system" && !textTemplate) {
      return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    }
    return {
      key: key as ShareChannelKey,
      intentType: intentType as ShareIntentType,
      ...(urlTemplate ? { urlTemplate } : {}),
      ...(textTemplate ? { textTemplate } : {}),
      ...(row.androidPackage ? { androidPackage: nonEmptyString(row.androidPackage) } : {}),
      ...(row.iosScheme ? { iosScheme: nonEmptyString(row.iosScheme) } : {}),
      enabled,
    };
  });
  const appDownload = record(root.appDownload);
  const source = nonEmptyString(appDownload.source);
  if (!DOWNLOAD_SOURCES.has(source)) return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  const officialUrl = safeUrl(appDownload.officialUrl, source !== "unavailable", false);
  const version = optionalString(appDownload.version);
  const notes = record(appDownload.releaseNotes);
  const releaseNotes = { zh: optionalString(notes.zh), en: optionalString(notes.en) };
  if (source !== "unavailable" && (!version || !releaseNotes.zh || !releaseNotes.en)) {
    return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  }
  if (source === "unavailable" && (officialUrl || optionalString(appDownload.iosUrl)
      || optionalString(appDownload.androidUrl) || optionalString(appDownload.apkUrl)
      || version || releaseNotes.zh || releaseNotes.en)) {
    return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  }
  return {
    baseUrl,
    channels,
    appDownload: {
      officialUrl,
      iosUrl: safeUrl(appDownload.iosUrl, false, false),
      androidUrl: safeUrl(appDownload.androidUrl, false, false),
      apkUrl: safeUrl(appDownload.apkUrl, false, false),
      version,
      releaseNotes,
      source: source as ShareConfig["appDownload"]["source"],
    },
  };
}

export function parsePlatformExperienceConfig(value: unknown): {
  featureFlags: PlatformComputeConfigSnapshot["featureFlags"];
  share: ShareConfig;
} {
  const root = record(value);
  const featureFlags = record(root.featureFlags);
  if (typeof featureFlags.homeNewcomerTasksEnabled !== "boolean"
      || typeof featureFlags.homeWeeklyPromoEnabled !== "boolean") {
    return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  }
  return {
    featureFlags: {
      computeShareEnabled: typeof featureFlags.computeShareEnabled === "boolean" ? featureFlags.computeShareEnabled : false,
      homeNewcomerTasksEnabled: featureFlags.homeNewcomerTasksEnabled,
      homeWeeklyPromoEnabled: featureFlags.homeWeeklyPromoEnabled,
    },
    share: parsePlatformShareConfig(root.share),
  };
}

function isoInstant(value: unknown): string {
  const normalized = nonEmptyString(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
    || Number.isNaN(Date.parse(normalized))
  ) {
    return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
  }
  return normalized;
}

function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : invalid();
}

function positiveNumber(value: unknown): number {
  const parsed = finiteNumber(value);
  return parsed > 0 ? parsed : invalid();
}

function nonNegativeNumber(value: unknown): number {
  const parsed = finiteNumber(value);
  return parsed >= 0 ? parsed : invalid();
}

function rewardAmount(value: unknown): number {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(text)) {
    return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999_999_999) {
    return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
  }
  return parsed;
}

function exactKeySet(rows: Record<string, unknown>[], expected: Set<string>): void {
  const keys = rows.map((row) => nonEmptyString(row.key));
  if (keys.length !== expected.size || new Set(keys).size !== expected.size || keys.some((key) => !expected.has(key))) {
    invalid();
  }
}

function parseGpuTiers(value: unknown): GpuTier[] {
  if (!Array.isArray(value) || value.length !== GPU_TIER_IDS.length) return invalid();
  const rows = value.map(record);
  const byId = new Map(rows.map((row) => [nonEmptyString(row.id), row]));
  if (byId.size !== GPU_TIER_IDS.length || GPU_TIER_IDS.some((id) => !byId.has(id))) return invalid();

  let previousTops = 0;
  return GPU_TIER_IDS.map((id) => {
    const row = byId.get(id)!;
    const tops = positiveNumber(row.tops);
    if (tops <= previousTops) return invalid();
    previousTops = tops;

    if (!Array.isArray(row.keywords)) return invalid();
    const keywordRows = row.keywords.map(record);
    const slots = keywordRows.map((keyword) => nonEmptyString(keyword.slot));
    if (
      slots.length > KEYWORD_SLOTS.size
      || new Set(slots).size !== slots.length
      || slots.some((slot) => !KEYWORD_SLOTS.has(slot))
    ) {
      return invalid();
    }
    return {
      id,
      label: nonEmptyString(row.label),
      tops,
      keywords: keywordRows.map((keyword) => nonEmptyString(keyword.value)),
    };
  });
}

/**
 * 解析服务端可核验聚合。整段缺席(null)是**合法**状态(沙箱 / 旧后端),不是协议错误 ——
 * 消费方据此走「不可用」占位,而不是退回配置值。
 */
function parseVerifiedStats(value: unknown): PlatformVerifiedStats | null {
  if (value === null || value === undefined) return null;
  const row = record(value);
  const aggregate = (key: string, integral = true): PlatformVerifiedAggregate => {
    const item = record(row[key]);
    const v = finiteNumber(item.value);
    if (v < 0 || (integral && !Number.isInteger(v))) return invalid("H9_VERIFIED_AGGREGATE_INVALID");
    return { value: v, definition: nonEmptyString(item.definition), kind: nonEmptyString(item.kind) };
  };
  const capturedAt = nonEmptyString(row.capturedAt);
  if (Number.isNaN(Date.parse(capturedAt))) return invalid("H9_VERIFIED_AGGREGATE_INVALID");
  return {
    activeAccounts: aggregate("activeAccounts"),
    registeredAccounts: aggregate("registeredAccounts"),
    installedDevices: aggregate("installedDevices"),
    onlineDevices: aggregate("onlineDevices"),
    // 金额聚合不是整数,单独放行小数(USDT 精度)。
    completedPayoutUsdt: aggregate("completedPayoutUsdt", false),
    capturedAt,
  };
}

function parsePublicStats(value: unknown): PublicStatsConfig {
  const projection = record(value);
  const realUserCount = finiteNumber(projection.realUserCount);
  if (!Number.isInteger(realUserCount) || realUserCount < 0 || realUserCount > 100_000_000) {
    return invalid("H9_PUBLIC_STATS_RESPONSE_INVALID");
  }
  // Legacy servers may still send operator-configured values. Never install them
  // into the public store: old surfaces could render them as measured facts.
  // Invalid sentinels keep every H9-derived public display unavailable.
  return {
    fleetDevices: 0,
    onlineRatePct: 0,
    onlineJitter: -1,
    registeredUsersBase: 0,
    registeredUsersMonthlyGrowthPct: -1,
    registeredUsersAnchorAt: 0,
    realUserCount,
    virtualUserCount: -1,
    hashratePercentileTable: [],
  };
}

export function parsePlatformPublicStats(value: unknown, mode: ApiEnvironment = "prod"): {
  config: PublicStatsConfig;
  authority: PlatformPublicStatsAuthority;
} {
  const projection = record(value);
  const version = finiteNumber(projection.version);
  const source = optionalString(projection.source);
  const sourceEnvironment = optionalString(projection.sourceEnvironment);
  const runId = typeof projection.runId === "string" ? projection.runId.trim() : "";
  const production = sourceEnvironment === "PRODUCTION"
    && source === "server:nx_config_item,nx_user" && runId === "";
  const expectedAuthority = mode === "prod" || mode === "dev" ? production : false;
  if (projection.serverCanonical !== true || !Number.isInteger(version) || version < 0
      || !expectedAuthority) {
    return invalid("H9_PUBLIC_STATS_RESPONSE_INVALID");
  }
  return {
    config: parsePublicStats(projection),
    authority: {
      source: source as PlatformPublicStatsAuthority["source"],
      sourceEnvironment: sourceEnvironment as PlatformPublicStatsAuthority["sourceEnvironment"],
      runId,
      version,
    },
  };
}

export function parsePlatformComputeConfig(value: unknown, mode: ApiEnvironment = "prod"): PlatformComputeConfigSnapshot {
  const root = record(value);
  const featureFlags = record(root.featureFlags);
  const publicStatsProjection = parsePlatformPublicStats(root.publicStats, mode);
  const onlineBonus = record(root.onlineBonus);
  const compute = record(root.computerCompute);
  const download = record(compute.download);

  if (typeof featureFlags.computeShareEnabled !== "boolean"
      || typeof featureFlags.homeNewcomerTasksEnabled !== "boolean"
      || typeof featureFlags.homeWeeklyPromoEnabled !== "boolean"
      || compute.domain !== "E6") return invalid("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  const experience = parsePlatformExperienceConfig(value);
  const h5BaseFactor = nonNegativeNumber(onlineBonus.h5BaseFactor);
  const continuityFullHours = positiveNumber(onlineBonus.continuityFullHours);
  if (h5BaseFactor > 1) return invalid();

  if (!Array.isArray(compute.flags) || !Array.isArray(compute.coefficients) || !Array.isArray(compute.yieldEstimate)) {
    return invalid();
  }
  const flags = compute.flags.map(record);
  const coefficients = compute.coefficients.map(record);
  const yields = compute.yieldEstimate.map(record);
  exactKeySet(flags, FLAG_KEYS);
  exactKeySet(coefficients, COEFFICIENT_KEYS);
  exactKeySet(yields, YIELD_KEYS);

  const flag = flags[0];
  if (typeof flag.enabled !== "boolean" || flag.enabled !== featureFlags.computeShareEnabled) return invalid();
  const coefficientValues = Object.fromEntries(
    coefficients.map((row) => {
      const key = nonEmptyString(row.key);
      return [key, key === "h5BaseFactor" ? nonNegativeNumber(row.value) : positiveNumber(row.value)];
    }),
  ) as Record<string, number>;
  if (
    coefficientValues.h5BaseFactor !== h5BaseFactor
    || coefficientValues.continuityFullHours !== continuityFullHours
  ) {
    return invalid();
  }
  yields.forEach((row) => positiveNumber(row.value));

  const downloadUrl = string(download.url).trim();
  if (downloadUrl && !/^https:\/\/[^\s]+$/.test(downloadUrl)) return invalid();
  const sources = Array.isArray(compute.sources) ? compute.sources.map(nonEmptyString) : invalid();

  return {
    featureFlags: experience.featureFlags,
    publicStats: publicStatsProjection.config,
    publicStatsAuthority: publicStatsProjection.authority,
    verifiedStats: parseVerifiedStats(root.publicStats && typeof root.publicStats === "object"
      ? (root.publicStats as Record<string, unknown>).verified : null),
    onlineBonus: { h5BaseFactor, continuityFullHours },
    computeShare: {
      downloadUrl,
      content: {
        zhTitle: string(download.zhTitle),
        zhGuide: string(download.zhGuide),
        enTitle: string(download.enTitle),
        enGuide: string(download.enGuide),
      },
      gpuTiers: parseGpuTiers(compute.gpuTiers),
    },
    // H8 is fetched from its own bounded context and merged by createPlatformConfigApi.
    rewards: {
      enabled: false,
      effectiveAt: null,
      welcomeGift: { lockMode: "risk_bucket", usdtAmount: 0, nexAmount: 0 },
      inviterReward: { nexAmount: 0 },
    },
    share: experience.share,
    updatedAt: nonEmptyString(root.updatedAt),
    sources,
  };
}

export interface ReferralRewardConfigSnapshot {
  rewards: RewardsConfig;
  rhythmMonth: number;
  newcomerMultiplier: number;
  inviterMultiplier: number;
  effectiveAt: string;
  sources: string[];
}

export function parseReferralRewardConfig(value: unknown): ReferralRewardConfigSnapshot {
  try {
    const root = record(value);
    const welcomeGift = record(root.welcomeGift);
    const inviterReward = record(root.inviterReward);
    if (typeof root.enabled !== "boolean") {
      return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
    }
    const lockMode = string(welcomeGift.lockMode);
    if (lockMode !== "risk_bucket" && lockMode !== "direct") {
      return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
    }
    const rhythmMonth = finiteNumber(root.rhythmMonth);
    const newcomerMultiplier = positiveNumber(root.newcomerMultiplier);
    const inviterMultiplier = positiveNumber(root.inviterMultiplier);
    if (!Number.isInteger(rhythmMonth) || rhythmMonth < 1 || rhythmMonth > 120) {
      return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
    }
    const sources = Array.isArray(root.sources)
      ? root.sources.map(nonEmptyString)
      : invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
    if (!sources.includes("nx_user.sponsor_user_id")) {
      return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
    }
    const welcomeUsdt = rewardAmount(welcomeGift.usdtAmount);
    const welcomeNex = rewardAmount(welcomeGift.nexAmount);
    const inviterNex = rewardAmount(inviterReward.nexAmount);
    if (!root.enabled && (welcomeUsdt !== 0 || welcomeNex !== 0 || inviterNex !== 0)) {
      return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
    }
    return {
      rewards: {
        enabled: root.enabled,
        effectiveAt: isoInstant(root.effectiveAt),
        welcomeGift: {
          lockMode,
          usdtAmount: welcomeUsdt,
          nexAmount: welcomeNex,
        },
        inviterReward: {
          nexAmount: inviterNex,
        },
      },
      rhythmMonth,
      newcomerMultiplier,
      inviterMultiplier,
      effectiveAt: isoInstant(root.effectiveAt),
      sources,
    };
  } catch {
    return invalid("H8_REFERRAL_REWARD_CONFIG_RESPONSE_INVALID");
  }
}

export function createPlatformConfigApi(client: ApiClient, mode: ApiEnvironment = "prod"): PlatformConfigApi {
  return {
    platformConfig: async () => {
      const [computeRaw, referralRaw] = await Promise.all([
        client.request({
          method: "GET",
          path: "/api/config/platform",
          authenticated: false,
        }),
        client.request({
          method: "GET",
          path: "/api/config/referral-rewards",
          authenticated: false,
        }),
      ]);
      const compute = parsePlatformComputeConfig(computeRaw, mode);
      const referral = parseReferralRewardConfig(referralRaw);
      return {
        ...compute,
        rewards: referral.rewards,
        sources: [...compute.sources, ...referral.sources],
      };
    },
  };
}
