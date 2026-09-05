import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import { isCurrentCommerceSandboxRun } from "./order-api";

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
  idSource: "server" | "sandbox-server";
  source?: "mock";
  sourceEnvironment?: "SANDBOX";
  runId?: string;
}

export interface BundleOrderApi {
  create(productNos: string[], idempotencyKey: string): Promise<CreatedBundleOrder>;
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
  const sandbox = row.idSource === "sandbox-server";
  const runId = row.runId;
  if (typeof row.orderNo !== "string" || !row.orderNo.trim() || row.orderType !== "BUNDLE"
      || !Number.isSafeInteger(row.itemCount) || (row.itemCount as number) < 2
      || !Array.isArray(row.productNos) || row.productNos.length !== row.itemCount
      || !row.productNos.every((item) => typeof item === "string" && !!item.trim())
      || new Set(row.productNos).size !== row.productNos.length || row.paymentStatus !== "PENDING"
      || row.orderStatus !== "PENDING_PAYMENT"
      || (row.idSource !== "server" && !sandbox)
      || sandbox && (row.source !== "mock" || row.sourceEnvironment !== "SANDBOX"
        || !isCurrentCommerceSandboxRun(runId))
      || !sandbox && (row.source !== undefined || row.sourceEnvironment !== undefined || runId !== undefined)) return invalid();
  const subtotalUsdt = finite(row.subtotalUsdt);
  const discountRate = finite(row.discountRate);
  const discountUsdt = finite(row.discountUsdt);
  const amountUsdt = finite(row.amountUsdt);
  if (![0.05, 0.08, 0.12].includes(discountRate)
      || Math.abs((subtotalUsdt * discountRate) - discountUsdt) > 0.00001
      || Math.abs((subtotalUsdt - discountUsdt) - amountUsdt) > 0.00001) return invalid();
  return {
    orderNo: row.orderNo.trim(), orderType: "BUNDLE", itemCount: row.itemCount as number,
    productNos: (row.productNos as string[]).map((item) => item.trim()), subtotalUsdt, discountRate,
    discountUsdt, amountUsdt, paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", idSource: sandbox ? "sandbox-server" : "server",
    ...(sandbox ? { source: "mock" as const, sourceEnvironment: "SANDBOX" as const, runId: runId as string } : {}),
  };
}

export function createBundleOrderApi(client: ApiClient): BundleOrderApi {
  return {
    async create(productNos, idempotencyKey) {
      const normalized = productNos.map((value) => value.trim());
      if (normalized.length < 2 || normalized.length > 8 || normalized.some((value) => !value)
          || new Set(normalized).size !== normalized.length || !idempotencyKey.trim()) return invalid();
      return parse(await client.request<unknown>({
        method: "POST",
        path: "/api/orders/bundle",
        idempotencyKey,
        body: { productNos: normalized },
      }));
    },
  };
}
