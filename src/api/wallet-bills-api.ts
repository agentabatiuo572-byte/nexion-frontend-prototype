import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type WalletBillAsset = "USDT" | "NEX";
export type WalletBillDirection = "IN" | "OUT";
export type WalletBillStatus = "SUCCESS" | "PENDING" | "FAILED";
export type WalletBillCategory = "earn" | "refer" | "bonus" | "topup" | "withdraw" | "purchase" | "swap" | "verification" | "stake" | "unstake" | "achievement" | "other";

export interface WalletBillRow {
  id: string;
  bizNo: string;
  bizType: string;
  asset: WalletBillAsset;
  direction: WalletBillDirection;
  amount: number;
  balanceAfter: number;
  status: WalletBillStatus;
  remark: string;
  createdAt: number;
  /** Controlled App projection. Absent only while reading an older server. */
  category?: WalletBillCategory;
  presentationCode?: string;
  /** A server-approved identifier that is safe to show or route from an App bill. */
  publicReference?: string;
}

export interface WalletBillsSnapshot {
  source: "server";
  sourceEnvironment: "PRODUCTION";
  bills: WalletBillRow[];
  page: number;
  pageSize: number;
  total: number;
  nextPage: number | null;
  nextCursor: string | null;
}

export interface WalletBillFilters {
  asset?: WalletBillAsset;
  direction?: WalletBillDirection;
  category?: "REWARD";
}

export interface WalletBillsSummary {
  source: "server";
  sourceEnvironment: "PRODUCTION";
  timeZone: string;
  asOf: number;
  rewardsUsdt: number;
  rewardsNex: number;
  settledRewardsNex?: number | null;
  withdrawalOffsetNexSpent?: number | null;
  latestRewardAt: number | null;
  todayNexEarn: number;
  pendingNex: number;
  monthBillCount: number;
  recentNexBills: WalletBillRow[];
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "WALLET_BILLS_RESPONSE_INVALID" });
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function money(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || (typeof value === "string" && !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function bill(value: unknown): WalletBillRow {
  const row = object(value);
  const id = text(row?.id);
  const bizNo = text(row?.bizNo);
  const bizType = text(row?.bizType);
  const asset = text(row?.asset)?.toUpperCase();
  const direction = text(row?.direction)?.toUpperCase();
  const amount = money(row?.amount);
  const balanceAfter = money(row?.balanceAfter);
  const status = text(row?.status)?.toUpperCase();
  const createdAtRaw = text(row?.createdAt);
  const createdAt = createdAtRaw ? Date.parse(createdAtRaw) : Number.NaN;
  if (!row || !id || !bizNo || !bizType || (asset !== "USDT" && asset !== "NEX")
      || (direction !== "IN" && direction !== "OUT") || amount === null || balanceAfter === null
      || (status !== "SUCCESS" && status !== "PENDING" && status !== "FAILED")
      || !Number.isFinite(createdAt)) return invalid();
  return {
    id,
    bizNo,
    bizType,
    asset,
    direction,
    amount,
    balanceAfter,
    status,
    remark: typeof row.remark === "string" ? row.remark : "",
    createdAt,
    category: category(row.category),
    presentationCode: optionalText(row.presentationCode),
    publicReference: optionalText(row.publicReference),
  };
}

export function parseWalletBillsSnapshot(value: unknown): WalletBillsSnapshot {
  const row = object(value);
  if (!row || row.source !== "server" || row.sourceEnvironment !== "PRODUCTION" || !Array.isArray(row.bills)) {
    return invalid();
  }
  const { page, pageSize, total, nextPage } = row;
  if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 1
      || typeof pageSize !== "number" || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
      || typeof total !== "number" || !Number.isSafeInteger(total) || total < 0
      || (nextPage !== null && (typeof nextPage !== "number" || !Number.isSafeInteger(nextPage) || nextPage !== page + 1))) return invalid();
  // A cursor is opaque: validate it without changing the bytes to be echoed.
  const nextCursor = row.nextCursor === null ? null : row.nextCursor;
  if ((nextCursor !== null && (typeof nextCursor !== "string" || !nextCursor.trim() || nextCursor.length > 512))
      || row.bills.length > pageSize || total < row.bills.length) return invalid();
  return { source: "server", sourceEnvironment: "PRODUCTION", bills: row.bills.map(bill), page, pageSize, total, nextPage, nextCursor };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function category(value: unknown): WalletBillCategory | undefined {
  const candidate = optionalText(value);
  return candidate && ["earn", "refer", "bonus", "topup", "withdraw", "purchase", "swap", "verification", "stake", "unstake", "achievement", "other"].includes(candidate)
    ? candidate as WalletBillCategory : undefined;
}

export function parseWalletBillsSummary(value: unknown): WalletBillsSummary {
  const row = object(value);
  if (!row || row.source !== "server" || row.sourceEnvironment !== "PRODUCTION"
      || !Array.isArray(row.recentNexBills) || row.recentNexBills.length > 10) return invalid();
  const asOf = Date.parse(text(row.asOf) ?? "");
  const timeZone = text(row.timeZone);
  const latestRewardAt = row.latestRewardAt === null ? null : Date.parse(text(row.latestRewardAt) ?? "");
  const rewardsUsdt = money(row.rewardsUsdt);
  const rewardsNex = money(row.rewardsNex);
  const pendingNex = money(row.pendingNex);
  const settledRewardsNex = row.settledRewardsNex == null ? null : money(row.settledRewardsNex);
  const withdrawalOffsetNexSpent = row.withdrawalOffsetNexSpent == null ? null : money(row.withdrawalOffsetNexSpent);
  if ((row.settledRewardsNex != null && settledRewardsNex === null)
      || (row.withdrawalOffsetNexSpent != null && withdrawalOffsetNexSpent === null)) return invalid();
  const signedEarn = typeof row.todayNexEarn === "number" || (typeof row.todayNexEarn === "string" && row.todayNexEarn.trim())
    ? Number(row.todayNexEarn) : Number.NaN;
  const count = row.monthBillCount;
  if (!Number.isFinite(asOf) || !timeZone || (latestRewardAt !== null && !Number.isFinite(latestRewardAt))
      || rewardsUsdt === null || rewardsNex === null || pendingNex === null || !Number.isFinite(signedEarn)
      || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return invalid();
  return { source: "server", sourceEnvironment: "PRODUCTION", asOf, timeZone, rewardsUsdt, rewardsNex,
    pendingNex, settledRewardsNex, withdrawalOffsetNexSpent, latestRewardAt, todayNexEarn: signedEarn, monthBillCount: count, recentNexBills: row.recentNexBills.map(bill) };
}

export function createWalletBillsApi(client: ApiClient) {
  return {
    list: async (page = 1, pageSize = 50, options: WalletBillFilters & { cursor?: string } = {}): Promise<WalletBillsSnapshot> => parseWalletBillsSnapshot(await client.request({
      method: "GET",
      path: `/api/app/wallet/bills?page=${Math.max(1, Math.trunc(page))}&pageSize=${Math.max(1, Math.min(100, Math.trunc(pageSize)))}`
        + (["asset", "direction", "category", "cursor"] as const).filter(key => options[key] !== undefined)
          .map(key => `&${key}=${encodeURIComponent(options[key]!)}`).join(""),
    })),
    summary: async (): Promise<WalletBillsSummary> => parseWalletBillsSummary(await client.request({
      method: "GET", path: "/api/app/wallet/bills/summary",
    })),
  };
}
