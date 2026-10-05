import type { ApiClient } from "./api-client";
import type { ApiEnvironment } from "./runtime-config";
import { ApiError } from "./errors";
import { matchesRuntimeProvenance } from "./runtime-provenance";
import type { CommissionEvent } from "@/store/commission";

export type DirectReferralKind = "direct_purchase" | "direct_device_earning";
export type DirectReferralPeriod = "today" | "week" | "month" | "all";
export interface DirectReferralEvent extends CommissionEvent {
  kind: DirectReferralKind;
  sourceRef: string;
  sourceDeviceId: string | null;
  policyVersion: number;
  basisUsdt: number;
  nexUsdtPrice: number | null;
  recoveryPendingUSDT: number;
  recoveryPendingNEX: number;
}
export interface DirectReferralSplit { amountUSDT: number; amountNEX: number; count: number }
export interface DirectReferralSnapshot {
  period: DirectReferralPeriod;
  events: DirectReferralEvent[];
  split: { purchase: DirectReferralSplit; deviceEarning: DirectReferralSplit };
  page: number; pageSize: number; totalRows: number;
  generatedAt: string; snapshotAt: string | null;
}

export interface DirectReferralRule {
  enabled: boolean;
  totalRatePct: number;
  usdtSharePct: number;
  coolingDays: number;
}
export interface DirectReferralPolicy {
  configured: boolean;
  policyVersion: number;
  effectiveAt: string | null;
  nexUsdtPrice: number | null;
  purchase: DirectReferralRule;
  deviceEarning: DirectReferralRule;
}
function invalid(): never { throw new ApiError({ kind: "protocol", message: "DIRECT_REFERRAL_POLICY_INVALID" }); }
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return invalid();
  return value;
}
function integer(value: unknown, min = 0): number {
  const parsed = number(value, min);
  return Number.isSafeInteger(parsed) ? parsed : invalid();
}
function text(value: unknown): string { return typeof value === "string" && value.trim() ? value.trim() : invalid(); }
function date(value: unknown): string { const parsed = text(value); return Number.isFinite(Date.parse(parsed)) ? parsed : invalid(); }
export function parseDirectReferralEvent(value: unknown): DirectReferralEvent {
  const source = row(value);
  if (Object.prototype.hasOwnProperty.call(source, "sourceUserId")
    || !["direct_purchase", "direct_device_earning"].includes(String(source.kind))
    || !["cooling", "unlocked", "frozen", "reversed", "rejected", "recovery_pending"].includes(String(source.status))) return invalid();
  const ts = integer(source.ts), unlockAt = integer(source.unlockAt);
  const rejected = source.status === "rejected";
  if (rejected && [source.amountUSDT, source.amountNEX, source.recoveryPendingUSDT, source.recoveryPendingNEX].some(value => value !== 0)) return invalid();
  const sourceDeviceId = source.sourceDeviceId === null ? null : text(source.sourceDeviceId);
  if (!rejected && source.kind === "direct_device_earning" && sourceDeviceId === null) return invalid();
  return { id: text(source.id), kind: source.kind as DirectReferralKind, sourceUserName: text(source.sourceUserName),
    sourceRef: text(source.sourceRef), sourceDeviceId, policyVersion: integer(source.policyVersion, rejected ? 0 : 1),
    basisUsdt: number(source.basisUsdt, rejected ? 0 : Number.MIN_VALUE), nexUsdtPrice: rejected && source.nexUsdtPrice === null ? null : number(source.nexUsdtPrice, Number.MIN_VALUE),
    amountUSDT: number(source.amountUSDT), amountNEX: number(source.amountNEX),
    status: source.status as DirectReferralEvent["status"], ts, unlockAt,
    recoveryPendingUSDT: number(source.recoveryPendingUSDT), recoveryPendingNEX: number(source.recoveryPendingNEX),
  };
}
function split(value: unknown): DirectReferralSplit {
  const source = row(value);
  return { amountUSDT: number(source.amountUSDT), amountNEX: number(source.amountNEX), count: integer(source.count) };
}
function rule(value: unknown): DirectReferralRule {
  const source = row(value);
  if (typeof source.enabled !== "boolean") return invalid();
  const totalRatePct = number(source.totalRatePct, 0, 100);
  const usdtSharePct = number(source.usdtSharePct, 0, 100);
  const coolingDays = number(source.coolingDays, 0, 365);
  if (!Number.isInteger(coolingDays) || (source.enabled && (totalRatePct <= 0 || usdtSharePct <= 0 || usdtSharePct >= 100))) return invalid();
  return { enabled: source.enabled, totalRatePct, usdtSharePct, coolingDays };
}
export function createDirectReferralApi(client: ApiClient, mode: ApiEnvironment = "prod") {
  return {
    async snapshot(period: DirectReferralPeriod, page = 1, pageSize = 20, snapshotAt: string | null = null): Promise<DirectReferralSnapshot> {
      if (!["today", "week", "month", "all"].includes(period) || integer(page, 1) !== page || integer(pageSize, 1) > 100) return invalid();
      const continuation = snapshotAt === null ? "" : `&snapshotAt=${encodeURIComponent(date(snapshotAt))}`;
      const source = row(await client.request<unknown>({ path: `/api/app/team/insights/direct-referral?period=${period}&page=${page}&pageSize=${pageSize}${continuation}` }));
      if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "server")
        || source.period !== period || source.page !== page || source.pageSize !== pageSize || !Array.isArray(source.events)) return invalid();
      const totalRows = integer(source.totalRows), events = source.events.map(parseDirectReferralEvent);
      if (events.length !== Math.min(pageSize, Math.max(0, totalRows - (page - 1) * pageSize))
        || new Set(events.map(event => event.id)).size !== events.length) return invalid();
      const totals = row(source.split);
      return { period, page, pageSize, totalRows, events, split: { purchase: split(totals.purchase), deviceEarning: split(totals.deviceEarning) },
        generatedAt: date(source.generatedAt), snapshotAt: source.snapshotAt === null ? null : date(source.snapshotAt) };
    },
    async policy(): Promise<DirectReferralPolicy> {
      const source = row(await client.request<unknown>({ method: "GET", path: "/api/config/commission/direct-referral", authenticated: false }));
      if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "server")
        || typeof source.configured !== "boolean") return invalid();
      const policyVersion = number(source.policyVersion);
      const effectiveAt = source.effectiveAt;
      if (!Number.isSafeInteger(policyVersion) || (effectiveAt !== null && (typeof effectiveAt !== "string" || !Number.isFinite(Date.parse(effectiveAt))))) return invalid();
      const purchase = rule(source.purchase), deviceEarning = rule(source.deviceEarning);
      const nexUsdtPrice = source.nexUsdtPrice === null ? null : number(source.nexUsdtPrice, Number.MIN_VALUE);
      if (source.configured ? policyVersion === 0 || effectiveAt === null : policyVersion !== 0 || effectiveAt !== null || purchase.enabled || deviceEarning.enabled) return invalid();
      return { configured: source.configured, policyVersion, effectiveAt: effectiveAt as string | null, nexUsdtPrice, purchase, deviceEarning };
    },
  };
}
