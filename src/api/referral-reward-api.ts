import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";

export interface ReferralRewardLedgerItem {
  settlementNo: string;
  amountNex: number;
  ledgerStatus: "SUCCESS";
  balanceAfter: number;
  releaseBucket: "withdrawable" | "pending_review" | "bonus_locked";
  sourceEnvironment: "PRODUCTION";
  settledAt: string;
}

export interface ReferralRewardSnapshot {
  referralCode: string;
  rewardEnabled: boolean;
  inviterRewardNex: number;
  invitedCount: number;
  pendingCount: number;
  settledCount: number;
  lifetimeInviterNex: number;
  walletNexAvailable: number;
  recentRewards: ReferralRewardLedgerItem[];
  limit: number;
  source: "ledger";
  sourceEnvironment: "PRODUCTION";
  runId: string | null;
  factSources: string[];
  refreshedAt: string;
}

const PRODUCTION_FACTS = ["nx_referral_reward_settlement", "nx_wallet_ledger", "nx_earnings_release_entry", "nx_user_wallet"];

function invalid(message = "REFERRAL_REWARD_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function num(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}
function count(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  const parsed = num(value, max);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function matchesRuntimeProvenance(row: Record<string, unknown>, mode: ApiEnvironment): boolean {
  if (mode === "prod" || mode === "dev") {
    return row.source === "ledger" && row.sourceEnvironment === "PRODUCTION" && row.runId === null;
  }
  return false;
}

export function parseReferralRewardSnapshot(value: unknown, mode: ApiEnvironment = "prod"): ReferralRewardSnapshot {
  const row = record(value);
  const referralCode = text(row?.referralCode);
  const rewardEnabled = row?.rewardEnabled;
  const inviterRewardNex = num(row?.inviterRewardNex);
  const invitedCount = count(row?.invitedCount);
  const pendingCount = count(row?.pendingCount);
  const settledCount = count(row?.settledCount);
  const lifetimeInviterNex = num(row?.lifetimeInviterNex);
  const walletNexAvailable = num(row?.walletNexAvailable);
  const limit = count(row?.limit, 20);
  const source = text(row?.source) as ReferralRewardSnapshot["source"];
  const sourceEnvironment = text(row?.sourceEnvironment)?.toUpperCase() as ReferralRewardSnapshot["sourceEnvironment"];
  const runId = text(row?.runId);
  const refreshedAt = text(row?.refreshedAt);
  const factValues = row?.factSources;
  const rewardValues = row?.recentRewards;
  const facts = Array.isArray(factValues) ? factValues.map(text) : [];
  const rawRecentRewards = Array.isArray(rewardValues) ? rewardValues : null;
  if (!row || !referralCode || typeof rewardEnabled !== "boolean" || inviterRewardNex === null || invitedCount === null || pendingCount === null
      || settledCount === null || lifetimeInviterNex === null || walletNexAvailable === null
      || limit === null || limit < 1 || !refreshedAt || Number.isNaN(Date.parse(refreshedAt))
      || facts.some((fact) => !fact)
      || !matchesRuntimeProvenance(row, mode)
      || !rawRecentRewards || (!rewardEnabled && inviterRewardNex !== 0)) return invalid();
  if (!PRODUCTION_FACTS.every((fact) => facts.includes(fact))) return invalid();
  const recentRewards = rawRecentRewards.map((item) => {
    const entry = record(item);
    const settlementNo = text(entry?.settlementNo);
    const amountNex = num(entry?.amountNex);
    const balanceAfter = num(entry?.balanceAfter);
    const ledgerStatus = text(entry?.ledgerStatus)?.toUpperCase() as ReferralRewardLedgerItem["ledgerStatus"];
    const releaseBucket = text(entry?.releaseBucket) as ReferralRewardLedgerItem["releaseBucket"];
    const environment = text(entry?.sourceEnvironment)?.toUpperCase() as ReferralRewardLedgerItem["sourceEnvironment"];
    const settledAt = text(entry?.settledAt);
    if (!entry || !settlementNo || amountNex === null || amountNex <= 0 || balanceAfter === null
        || ledgerStatus !== "SUCCESS" || !["withdrawable", "pending_review", "bonus_locked"].includes(releaseBucket)
        || environment !== sourceEnvironment || !settledAt || Number.isNaN(Date.parse(settledAt))) return invalid();
    return { settlementNo, amountNex, ledgerStatus, balanceAfter, releaseBucket, sourceEnvironment: environment, settledAt };
  });
  if (recentRewards.length > limit || settledCount > invitedCount || pendingCount + settledCount > invitedCount) return invalid();
  return { referralCode, rewardEnabled, inviterRewardNex, invitedCount, pendingCount, settledCount, lifetimeInviterNex,
    walletNexAvailable, recentRewards, limit, source, sourceEnvironment, runId, factSources: facts as string[], refreshedAt };
}

export function createReferralRewardApi(client: ApiClient, mode: ApiEnvironment = "prod") {
  return {
    snapshot: async (limit = 10): Promise<ReferralRewardSnapshot> => parseReferralRewardSnapshot(await client.request({
      method: "GET",
      path: `/api/app/referral-rewards?limit=${Math.max(1, Math.min(Math.trunc(limit), 20))}`,
    }), mode),
  };
}
