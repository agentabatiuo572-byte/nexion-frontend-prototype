import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface CreatedBundleOrder {
  orderNo: string;
  orderType: "BUNDLE";
  itemCount: number;
  productNos: string[];
  subtotalUsdt: number;
  discountRate: number;
  discountUsdt: number;
  amountUsdt: number;
  paymentStatus: "PENDING";
  orderStatus: "PENDING_PAYMENT";
  idSource: "server";
  policyVersion: number;
}

export interface BundleOrderApi {
  create(productNos: string[], policyVersion: number, expectedAmountUsdt: number, idempotencyKey: string): Promise<CreatedBundleOrder>;
}

/** Canonical six-decimal transport value. The App total is calculated in binary
 * floating point, so validate its distance from the rounded decimal instead of
 * testing `value * 1_000_000` for integer-ness (2.01 is not exact in binary). */
export function normalizeBundleExpectedAmountUsdt(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const canonical = Number(value.toFixed(6));
  return Number.isFinite(canonical) && Math.abs(value - canonical) <= 0.000000001
    ? canonical
    : null;
}

export function matchesBundleQuote(
  created: CreatedBundleOrder,
  productNos: readonly string[],
  expectedAmountUsdt: number,
): boolean {
  const expectedAmount = normalizeBundleExpectedAmountUsdt(expectedAmountUsdt);
  const expectedProducts = productNos.map((value) => value.trim());
  return expectedAmount !== null
    && expectedProducts.length === created.productNos.length
    && expectedProducts.every((value) => !!value)
    && new Set(expectedProducts).size === expectedProducts.length
    && expectedProducts.every((value) => created.productNos.includes(value))
    && normalizeBundleExpectedAmountUsdt(created.amountUsdt) === expectedAmount;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "BUNDLE_ORDER_RESPONSE_INVALID" });
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return invalid();
  return value;
}

function parse(value: unknown): CreatedBundleOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (typeof row.orderNo !== "string" || !row.orderNo.trim() || row.orderType !== "BUNDLE"
      || !Number.isSafeInteger(row.itemCount) || (row.itemCount as number) < 2
      || !Array.isArray(row.productNos) || row.productNos.length !== row.itemCount
      || !row.productNos.every((item) => typeof item === "string" && !!item.trim())
      || new Set(row.productNos).size !== row.productNos.length || row.paymentStatus !== "PENDING"
      || row.orderStatus !== "PENDING_PAYMENT"
      || row.idSource !== "server"
      || !Number.isSafeInteger(row.policyVersion) || (row.policyVersion as number) < 1
      || row.source !== undefined || row.sourceEnvironment !== undefined || row.runId !== undefined) return invalid();
  const subtotalUsdt = finite(row.subtotalUsdt);
  const discountRate = finite(row.discountRate);
  const discountUsdt = finite(row.discountUsdt);
  const amountUsdt = finite(row.amountUsdt);
  if (discountRate <= 0 || discountRate > 0.5
      || Math.abs((subtotalUsdt * discountRate) - discountUsdt) > 0.00001
      || Math.abs((subtotalUsdt - discountUsdt) - amountUsdt) > 0.00001) return invalid();
  return {
    orderNo: row.orderNo.trim(), orderType: "BUNDLE", itemCount: row.itemCount as number,
    productNos: (row.productNos as string[]).map((item) => item.trim()), subtotalUsdt, discountRate,
    discountUsdt, amountUsdt, paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", idSource: "server",
    policyVersion: row.policyVersion as number,
  };
}

export function createBundleOrderApi(client: ApiClient): BundleOrderApi {
  return {
    async create(productNos, policyVersion, expectedAmountUsdt, idempotencyKey) {
      const normalized = productNos.map((value) => value.trim());
      const normalizedExpectedAmount = normalizeBundleExpectedAmountUsdt(expectedAmountUsdt);
      if (normalized.length < 2 || normalized.length > 8 || normalized.some((value) => !value)
          || new Set(normalized).size !== normalized.length || !Number.isSafeInteger(policyVersion)
          || policyVersion < 1 || normalizedExpectedAmount === null || !idempotencyKey.trim()) return invalid();
      const created = parse(await client.request<unknown>({
        method: "POST",
        path: "/api/orders/bundle",
        idempotencyKey,
        body: { productNos: normalized, policyVersion, expectedAmountUsdt: normalizedExpectedAmount },
      }));
      if (created.policyVersion !== policyVersion) return invalid();
      return created;
    },
  };
}
