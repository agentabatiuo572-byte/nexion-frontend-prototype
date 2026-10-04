import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { VoucherAudience, VoucherDef, VoucherSurface, VoucherType } from "@/mock/vouchers";

export type VoucherGrantStatus = "UNCLAIMED" | "AVAILABLE" | "USED" | "EXPIRED" | "REVOKED";

export interface CanonicalVoucher extends VoucherDef {
  definitionDeleted: boolean;
  grantId: string | null;
  grantStatus: VoucherGrantStatus;
  usedOrderNo: string | null;
  claimable: boolean;
  audienceEligible: boolean;
  popupCadence: VoucherPopupCadence;
}

export interface VoucherPopupCadence {
  enabled: boolean;
  delayMs: number;
  cooldownHours: number;
  maxPerSession: number;
  nextEligibleAt: number;
  popupEligible: boolean;
  source: string;
  sourceEnvironment: "PRODUCTION";
  runId: string;
}

export function parseVoucherCadence(value: unknown, fence?: { environment?: "dev" | "prod"; runId?: string }): VoucherPopupCadence {
  const row = record(value);
  const enabled = bool(row?.enabled);
  const delayMs = integer(row?.delayMs, 0);
  const cooldownHours = integer(row?.cooldownHours, 0);
  const maxPerSession = integer(row?.maxPerSession, 1);
  const nextEligibleAt = integer(row?.nextEligibleAt, 0);
  const source = text(row?.source);
  const sourceEnvironment = text(row?.sourceEnvironment)?.toUpperCase();
  const runId = typeof row?.runId === "string" ? row.runId.trim() : null;
  const popupEligible = bool(row?.popupEligible);
  if (enabled === null || delayMs === null || delayMs > 60000 || cooldownHours === null || cooldownHours > 720
      || maxPerSession === null || maxPerSession > 10 || nextEligibleAt === null || !source
      || sourceEnvironment !== "PRODUCTION" || runId === null || popupEligible === null) invalid("VOUCHER_CADENCE_INVALID");
  // dev/prod are Java deployment profiles. The formal App never selects a
  // sandbox rail; both consume the production-shaped canonical projection.
  if (fence?.environment && (sourceEnvironment !== "PRODUCTION" || runId !== "")) invalid("VOUCHER_CADENCE_SCOPE_MISMATCH");
  return { enabled, delayMs, cooldownHours, maxPerSession, nextEligibleAt, popupEligible, source, sourceEnvironment: "PRODUCTION", runId };
}

export interface VoucherSnapshot {
  vouchers: CanonicalVoucher[];
  source: string;
  serverCanonical: true;
  provenance: { source: string; sourceEnvironment: "PRODUCTION"; runId: string };
}

export interface VoucherClaimResult {
  voucherId: string;
  grantId: string;
  status: "AVAILABLE";
  replay: boolean;
  serverCanonical: true;
  source: string;
  sourceEnvironment: "PRODUCTION";
  runId: "";
}

export interface VoucherApi {
  state(): Promise<VoucherSnapshot>;
  claim(voucherId: string, surface: VoucherSurface, idempotencyKey: string): Promise<VoucherClaimResult>;
  popupSeen(voucherId: string): Promise<VoucherSnapshot>;
}

function invalid(message = "VOUCHER_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value) ?? invalid();
}

function number(value: unknown, min = 0, max = Number.POSITIVE_INFINITY): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function integer(value: unknown, min = 0): number | null {
  const parsed = number(value, min, Number.MAX_SAFE_INTEGER);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function stringList(value: unknown): string[] | null {
  let candidate = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(candidate)) return null;
  const normalized = candidate.map(text);
  if (normalized.some((entry) => entry === null)) return null;
  return normalized as string[];
}

function required(value: string, error: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ApiError({ kind: "protocol", message: error });
  return normalized;
}

function parseVoucher(value: unknown, provenance?: { source: string; sourceEnvironment: "PRODUCTION"; runId: string }): CanonicalVoucher {
  const row = record(value);
  const id = text(row?.voucherId ?? row?.id);
  const name = text(row?.voucherName ?? row?.name);
  const type = text(row?.voucherType ?? row?.type)?.toLowerCase() as VoucherType;
  const amountUSD = number(row?.amountUsd ?? row?.amountUSD, 0, 10_000_000);
  const percent = number(row?.percentValue ?? row?.percent, 0, 100);
  const minPurchaseUSD = number(row?.minPurchaseUsd ?? row?.minPurchaseUSD, 0, 10_000_000);
  const maxDiscountUSD = number(row?.maxDiscountUsd ?? row?.maxDiscountUSD, 0, 10_000_000);
  const applicableSkus = stringList(row?.applicableSkus);
  const audience = text(row?.audience)?.toLowerCase() as VoucherAudience;
  const startAt = integer(row?.startAt);
  const endAt = integer(row?.endAt);
  const claimSurfaces = stringList(row?.claimSurfaces) as VoucherSurface[] | null;
  const popupEnabled = bool(row?.popupEnabled);
  const stackWithTrial = bool(row?.stackWithTrial);
  const stackWithOthers = bool(row?.stackWithOthers);
  const splittable = bool(row?.splittable);
  const status = text(row?.definitionStatus ?? row?.status)?.toLowerCase() as VoucherDef["status"];
  const definitionDeleted = bool(row?.definitionDeleted);
  const grantStatus = text(row?.grantStatus)?.toUpperCase() as VoucherGrantStatus;
  const claimable = bool(row?.claimable);
  const audienceEligible = bool(row?.audienceEligible);
  const popupCadence = parseVoucherCadence({
    enabled: row?.popupCadenceEnabled,
    delayMs: row?.popupDelayMs,
    cooldownHours: row?.popupCooldownHours,
    maxPerSession: row?.popupMaxPerSession,
    nextEligibleAt: row?.nextEligibleAt,
    popupEligible: row?.popupEligible,
    source: provenance?.source,
    sourceEnvironment: provenance?.sourceEnvironment,
    runId: provenance?.runId,
  });
  if (!row || !id || !name || !["fixed", "percent"].includes(type)
      || amountUSD === null || percent === null || minPurchaseUSD === null || maxDiscountUSD === null
      || !applicableSkus || !["new", "all"].includes(audience)
      || startAt === null || endAt === null || (endAt > 0 && startAt > 0 && endAt < startAt)
      || !claimSurfaces || claimSurfaces.some((surface) => !["home", "store", "me", "earn"].includes(surface))
      || popupEnabled === null || stackWithTrial === null || stackWithOthers === null || splittable === null
      || !["active", "paused"].includes(status) || definitionDeleted === null
      || !["UNCLAIMED", "AVAILABLE", "USED", "EXPIRED", "REVOKED"].includes(grantStatus)
    || claimable === null || audienceEligible === null
      || popupCadence === null
      || (claimable && grantStatus !== "UNCLAIMED")
      || (type === "fixed" && amountUSD <= 0)
      || (type === "percent" && (percent <= 0 || percent > 100))) {
    return invalid();
  }
  return {
    id,
    name,
    type,
    amountUSD,
    percent,
    minPurchaseUSD,
    maxDiscountUSD,
    applicableSkus,
    audience,
    startAt,
    endAt,
    claimSurfaces,
    popupEnabled,
    stackWithTrial,
    stackWithOthers,
    splittable,
    status,
    definitionDeleted,
    grantId: nullableText(row.grantId),
    grantStatus,
    usedOrderNo: nullableText(row.usedOrderNo),
    claimable,
    audienceEligible,
    popupCadence,
  };
}

function parseSnapshot(value: unknown, fence?: { environment?: "dev" | "prod"; runId?: string }): VoucherSnapshot {
  const row = record(value);
  const source = text(row?.source);
  const serverCanonical = bool(row?.serverCanonical);
  if (!row || !Array.isArray(row.vouchers) || source !== "nx_growth_voucher + nx_growth_voucher_grant") return invalid();
  if (serverCanonical !== true) return invalid("VOUCHER_CANONICAL_INVALID");
  const provenanceRow = record(row.provenance);
  if (!provenanceRow) return invalid("VOUCHER_PROVENANCE_INVALID");
  const provenance = (() => {
      const pSource = text(provenanceRow.source);
      const env = text(provenanceRow.sourceEnvironment)?.toUpperCase();
      const runId = typeof provenanceRow.runId === "string" ? provenanceRow.runId.trim() : null;
      if (pSource !== "nx_growth_voucher" || runId === null || env !== "PRODUCTION" || runId !== "") return invalid("VOUCHER_PROVENANCE_INVALID");
      return { source: pSource, sourceEnvironment: "PRODUCTION" as const, runId };
    })();
  const vouchers = row.vouchers.map((item) => parseVoucher(item, provenance));
  parseVoucherCadence({ enabled: true, delayMs: 0, cooldownHours: 0, maxPerSession: 1,
    nextEligibleAt: 0, popupEligible: true, ...provenance }, fence);
  const ids = new Set(vouchers.map((voucher) => voucher.id));
  if (ids.size !== vouchers.length) return invalid("VOUCHER_ID_DUPLICATED");
  return { vouchers, source, serverCanonical: true, provenance };
}

function parseClaim(value: unknown): VoucherClaimResult {
  const row = record(value);
  const voucherId = text(row?.voucherId);
  const grantId = text(row?.grantId);
  const replay = bool(row?.replay);
  const serverCanonical = bool(row?.serverCanonical);
  const source = text(row?.source);
  const sourceEnvironment = text(row?.sourceEnvironment)?.toUpperCase();
  const runId = typeof row?.runId === "string" ? row.runId.trim() : null;
  if (!row || !voucherId || !grantId || row.status !== "AVAILABLE" || replay === null
      || serverCanonical !== true || !source || sourceEnvironment !== "PRODUCTION" || runId !== "") {
    return invalid("VOUCHER_CLAIM_RESPONSE_INVALID");
  }
  return { voucherId, grantId, status: "AVAILABLE", replay, serverCanonical, source,
    sourceEnvironment: "PRODUCTION", runId: "" };
}

export function createVoucherApi(client: ApiClient, environment: "dev" | "prod" = "prod"): VoucherApi {
  const fence = () => ({ environment });
  return {
    state: async () => parseSnapshot(await client.request({
      method: "GET",
      path: "/api/vouchers",
    }), fence()),
    claim: async (voucherId, surface, idempotencyKey) => parseClaim(await client.request({
      method: "POST",
      path: `/api/vouchers/${encodeURIComponent(required(voucherId, "VOUCHER_ID_REQUIRED"))}/claim`,
      idempotencyKey: required(idempotencyKey, "VOUCHER_IDEMPOTENCY_KEY_REQUIRED"),
      body: { surface },
    })),
    popupSeen: async (voucherId) => parseSnapshot(await client.request({
      method: "POST",
      path: `/api/vouchers/${encodeURIComponent(required(voucherId, "VOUCHER_ID_REQUIRED"))}/popup-seen`,
    }), fence()),
  };
}
