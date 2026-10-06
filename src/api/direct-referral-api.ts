import type { ApiClient } from "./api-client";
import type { ApiEnvironment } from "./runtime-config";
import { ApiError } from "./errors";
import { matchesRuntimeProvenance } from "./runtime-provenance";
import type { CommissionEvent } from "@/store/commission";

export type DirectReferralKind = "direct_purchase" | "direct_device_earning";
export type DirectReferralPeriod = "today" | "week" | "month" | "all";
export type TeamSettlementMode = "LEGACY_7" | "DIRECT_ONLY_V1" | "SEVEN_V2";
export type DirectReferralFilter = "all" | "purchase" | "device_earning";
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
  summary?: { amountUSDT: number; amountNEX: number; count: number; creditedUSDT: number; creditedNEX: number; pendingUSDT: number; pendingNEX: number };
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
  schemaVersion?: 2;
  policySchemaVersion?: 1 | 2;
  purchaseSplitConfigured?: boolean;
  settlementMode?: TeamSettlementMode;
  purchaseSplit?: { enabled: boolean; usdtSharePct: number };
  sevenLayerReference?: { revision: number; baseRatePct: number | null; coolingDays: number | null; legacyNexPerUsd: number | null };
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
    || !["waiting_calculation", "cooling", "unlocked", "frozen", "reversed", "rejected", "recovery_pending"].includes(String(source.status))) return invalid();
  const ts = integer(source.ts), unlockAt = integer(source.unlockAt);
  const rejected = source.status === "rejected";
  const waiting = source.status === "waiting_calculation";
  if (waiting && (source.amountUSDT !== 0 || source.amountNEX !== 0 || source.nexUsdtPrice !== null)) return invalid();
  if (rejected && [source.amountUSDT, source.amountNEX, source.recoveryPendingUSDT, source.recoveryPendingNEX].some(value => value !== 0)) return invalid();
  const sourceDeviceId = source.sourceDeviceId === null ? null : text(source.sourceDeviceId);
  if (!rejected && source.kind === "direct_device_earning" && sourceDeviceId === null) return invalid();
  return { id: text(source.id), kind: source.kind as DirectReferralKind, sourceUserName: text(source.sourceUserName),
    sourceRef: text(source.sourceRef), sourceDeviceId, policyVersion: integer(source.policyVersion, rejected ? 0 : 1),
    basisUsdt: number(source.basisUsdt, rejected || waiting ? 0 : Number.MIN_VALUE), nexUsdtPrice: (rejected || waiting) && source.nexUsdtPrice === null ? null : number(source.nexUsdtPrice, Number.MIN_VALUE),
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
    async snapshot(period: DirectReferralPeriod, page = 1, pageSize = 20, snapshotAt: string | null = null, kind: DirectReferralFilter = "all"): Promise<DirectReferralSnapshot> {
      if (!["today", "week", "month", "all"].includes(period) || integer(page, 1) !== page || integer(pageSize, 1) > 100) return invalid();
      const continuation = snapshotAt === null ? "" : `&snapshotAt=${encodeURIComponent(date(snapshotAt))}`;
      if (!["all", "purchase", "device_earning"].includes(kind)) return invalid();
      const source = row(await client.request<unknown>({ path: `/api/app/team/insights/direct-referral?period=${period}&page=${page}&pageSize=${pageSize}${continuation}&schemaVersion=2&kind=${kind}` }));
      if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "server")
        || source.period !== period || source.page !== page || source.pageSize !== pageSize || !Array.isArray(source.events)) return invalid();
      const totalRows = integer(source.totalRows), events = source.events.map(parseDirectReferralEvent);
      if (kind !== "all" && events.some(event => event.kind !== `direct_${kind}`)) return invalid();
      if (events.length !== Math.min(pageSize, Math.max(0, totalRows - (page - 1) * pageSize))
        || new Set(events.map(event => event.id)).size !== events.length) return invalid();
      const totals = row(source.split);
      const purchase = split(totals.purchase), deviceEarning = split(totals.deviceEarning);
      const responseSnapshotAt = source.snapshotAt === null ? null : date(source.snapshotAt);
      const count = kind === "all" ? purchase.count + deviceEarning.count : kind === "purchase" ? purchase.count : deviceEarning.count;
      if (count !== totalRows || (snapshotAt !== null && responseSnapshotAt !== snapshotAt)) return invalid();
      // Server split is NET across every group and page. Terminal rows retain
      // gross amounts, so reconcile counts without reconstructing money here.
      let summary: DirectReferralSnapshot["summary"];
      if (source.summary !== undefined) {
        const raw = row(source.summary);
        summary = { ...split(raw), creditedUSDT: number(raw.creditedUSDT), creditedNEX: number(raw.creditedNEX), pendingUSDT: number(raw.pendingUSDT), pendingNEX: number(raw.pendingNEX) };
        if (summary.count !== totalRows) return invalid();
      }
      return { period, page, pageSize, totalRows, events, split: { purchase, deviceEarning }, summary,
        generatedAt: date(source.generatedAt), snapshotAt: responseSnapshotAt };
    },
    async policy(): Promise<DirectReferralPolicy> {
      const source = row(await client.request<unknown>({ method: "GET", path: "/api/config/commission/direct-referral?schemaVersion=2", authenticated: false }));
      if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "server")
        || typeof source.configured !== "boolean") return invalid();
      const policyVersion = number(source.policyVersion);
      const effectiveAt = source.effectiveAt;
      if (!Number.isSafeInteger(policyVersion) || (effectiveAt !== null && (typeof effectiveAt !== "string" || !Number.isFinite(Date.parse(effectiveAt))))) return invalid();
      const deviceEarning = rule(source.deviceEarning);
      // v2 does not reinterpret the legacy independent purchase rate as an L1 budget.
      const v2 = source.schemaVersion === 2;
      if (source.schemaVersion !== undefined && !v2) return invalid();
      const settlementMode = source.settlementMode;
      if (v2 && !["LEGACY_7", "DIRECT_ONLY_V1", "SEVEN_V2"].includes(String(settlementMode))) return invalid();
      let purchase = v2 && settlementMode === "SEVEN_V2" ? undefined : rule(source.purchase);
      let purchaseSplit: DirectReferralPolicy["purchaseSplit"];
      let sevenLayerReference: DirectReferralPolicy["sevenLayerReference"];
      const policySchemaVersion = source.policySchemaVersion;
      const purchaseSplitConfigured = source.purchaseSplitConfigured;
      if (policySchemaVersion !== undefined && policySchemaVersion !== 1 && policySchemaVersion !== 2) return invalid();
      if (purchaseSplitConfigured !== undefined && typeof purchaseSplitConfigured !== "boolean") return invalid();
      if (policySchemaVersion !== undefined && purchaseSplitConfigured !== undefined && purchaseSplitConfigured !== (policySchemaVersion === 2)) return invalid();
      if (v2) {
        const rawSplit = row(source.purchaseSplit), reference = row(source.sevenLayerReference);
        if (typeof rawSplit.enabled !== "boolean") return invalid();
        const usdtSharePct = number(rawSplit.usdtSharePct, 0, 100);
        if (rawSplit.enabled && (usdtSharePct <= 0 || usdtSharePct >= 100)) return invalid();
        purchaseSplit = { enabled: rawSplit.enabled, usdtSharePct };
        sevenLayerReference = { revision: integer(reference.revision), baseRatePct: reference.baseRatePct === null ? null : number(reference.baseRatePct, 0, 100),
          coolingDays: reference.coolingDays === null ? null : integer(reference.coolingDays), legacyNexPerUsd: reference.legacyNexPerUsd === null ? null : number(reference.legacyNexPerUsd) };
        if ((sevenLayerReference.baseRatePct !== null && sevenLayerReference.baseRatePct !== 10)
          || (sevenLayerReference.coolingDays !== null && sevenLayerReference.coolingDays > 365)) return invalid();
        const ready = purchaseSplitConfigured !== false && sevenLayerReference.baseRatePct !== null && sevenLayerReference.coolingDays !== null;
        purchase ??= { ...purchaseSplit, enabled: purchaseSplit.enabled && ready, totalRatePct: sevenLayerReference.baseRatePct ?? 0, coolingDays: sevenLayerReference.coolingDays ?? 0 };
      }
      const nexUsdtPrice = source.nexUsdtPrice === null ? null : number(source.nexUsdtPrice, Number.MIN_VALUE);
      if (!purchase || (source.configured ? policyVersion === 0 || effectiveAt === null : policyVersion !== 0 || effectiveAt !== null || purchase.enabled || deviceEarning.enabled)) return invalid();
      return { configured: source.configured, policyVersion, effectiveAt: effectiveAt as string | null, nexUsdtPrice, purchase: purchase!, deviceEarning,
        ...(v2 ? { schemaVersion: 2 as const, settlementMode: settlementMode as TeamSettlementMode, purchaseSplit, sevenLayerReference,
          ...(policySchemaVersion === undefined ? {} : { policySchemaVersion: policySchemaVersion as 1 | 2 }),
          ...(purchaseSplitConfigured === undefined ? {} : { purchaseSplitConfigured: purchaseSplitConfigured as boolean }) } : {}) };
    },
  };
}
