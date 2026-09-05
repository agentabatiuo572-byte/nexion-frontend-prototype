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
}

export interface VoucherSnapshot {
  vouchers: CanonicalVoucher[];
  source: string;
}

export interface VoucherClaimResult {
  voucherId: string;
  grantId: string;
  status: "AVAILABLE";
  replay: boolean;
}

export interface VoucherApi {
  state(): Promise<VoucherSnapshot>;
  claim(voucherId: string, surface: VoucherSurface, idempotencyKey: string): Promise<VoucherClaimResult>;
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

function parseVoucher(value: unknown): CanonicalVoucher {
  const row = record(value);
  const id = text(row?.voucherId);
  const name = text(row?.voucherName);
  const type = text(row?.voucherType)?.toLowerCase() as VoucherType;
  const amountUSD = number(row?.amountUsd, 0, 10_000_000);
  const percent = number(row?.percentValue, 0, 100);
  const minPurchaseUSD = number(row?.minPurchaseUsd, 0, 10_000_000);
  const maxDiscountUSD = number(row?.maxDiscountUsd, 0, 10_000_000);
  const applicableSkus = stringList(row?.applicableSkus);
  const audience = text(row?.audience)?.toLowerCase() as VoucherAudience;
  const startAt = integer(row?.startAt);
  const endAt = integer(row?.endAt);
  const claimSurfaces = stringList(row?.claimSurfaces) as VoucherSurface[] | null;
  const popupEnabled = bool(row?.popupEnabled);
  const stackWithTrial = bool(row?.stackWithTrial);
  const stackWithOthers = bool(row?.stackWithOthers);
  const splittable = bool(row?.splittable);
  const status = text(row?.definitionStatus)?.toLowerCase() as VoucherDef["status"];
  const definitionDeleted = bool(row?.definitionDeleted);
  const grantStatus = text(row?.grantStatus)?.toUpperCase() as VoucherGrantStatus;
  const claimable = bool(row?.claimable);
  const audienceEligible = bool(row?.audienceEligible);
  if (!row || !id || !name || !["fixed", "percent"].includes(type)
      || amountUSD === null || percent === null || minPurchaseUSD === null || maxDiscountUSD === null
      || !applicableSkus || !["new", "all"].includes(audience)
      || startAt === null || endAt === null || (endAt > 0 && startAt > 0 && endAt < startAt)
      || !claimSurfaces || claimSurfaces.some((surface) => !["home", "store", "me", "earn"].includes(surface))
      || popupEnabled === null || stackWithTrial === null || stackWithOthers === null || splittable === null
      || !["active", "paused"].includes(status) || definitionDeleted === null
      || !["UNCLAIMED", "AVAILABLE", "USED", "EXPIRED", "REVOKED"].includes(grantStatus)
      || claimable === null || audienceEligible === null
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
  };
}

function parseSnapshot(value: unknown): VoucherSnapshot {
  const row = record(value);
  const source = text(row?.source);
  if (!row || !Array.isArray(row.vouchers) || !source) return invalid();
  const vouchers = row.vouchers.map(parseVoucher);
  const ids = new Set(vouchers.map((voucher) => voucher.id));
  if (ids.size !== vouchers.length) return invalid("VOUCHER_ID_DUPLICATED");
  return { vouchers, source };
}

function parseClaim(value: unknown): VoucherClaimResult {
  const row = record(value);
  const voucherId = text(row?.voucherId);
  const grantId = text(row?.grantId);
  const replay = bool(row?.replay);
  if (!row || !voucherId || !grantId || row.status !== "AVAILABLE" || replay === null) {
    return invalid("VOUCHER_CLAIM_RESPONSE_INVALID");
  }
  return { voucherId, grantId, status: "AVAILABLE", replay };
}

export function createVoucherApi(client: ApiClient): VoucherApi {
  return {
    state: async () => parseSnapshot(await client.request({
      method: "GET",
      path: "/api/vouchers",
    })),
    claim: async (voucherId, surface, idempotencyKey) => parseClaim(await client.request({
      method: "POST",
      path: `/api/vouchers/${encodeURIComponent(required(voucherId, "VOUCHER_ID_REQUIRED"))}/claim`,
      idempotencyKey: required(idempotencyKey, "VOUCHER_IDEMPOTENCY_KEY_REQUIRED"),
      body: { surface },
    })),
  };
}
