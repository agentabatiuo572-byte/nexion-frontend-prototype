import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import { isCurrentCommerceSandboxRun } from "./order-api";

export interface CommercePaymentReceipt {
  orderNo: string;
  paymentNo: string;
  paymentStatus: "PAID";
  orderStatus: "PAID";
  canonicalStatus: "paid";
  source: "mock";
  sourceEnvironment: "SANDBOX";
  runId: string;
}

export interface CommercePaymentApi {
  confirm(orderNo: string, idempotencyKey: string): Promise<CommercePaymentReceipt>;
}

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/;

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "COMMERCE_PAYMENT_RESPONSE_INVALID" });
}

function parse(value: unknown): CommercePaymentReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (typeof row.orderNo !== "string" || !row.orderNo.trim()
      || typeof row.paymentNo !== "string" || !/^PAY-SBX-[A-Z0-9]{16,64}$/.test(row.paymentNo)
      || row.paymentStatus !== "PAID" || row.orderStatus !== "PAID" || row.canonicalStatus !== "paid"
      || row.source !== "mock" || row.sourceEnvironment !== "SANDBOX"
      || typeof row.runId !== "string" || !RUN_ID.test(row.runId)
      || !isCurrentCommerceSandboxRun(row.runId)) return invalid();
  return {
    orderNo: row.orderNo.trim(), paymentNo: row.paymentNo,
    paymentStatus: "PAID", orderStatus: "PAID", canonicalStatus: "paid",
    source: "mock", sourceEnvironment: "SANDBOX", runId: row.runId,
  };
}

export function createCommercePaymentApi(client: ApiClient): CommercePaymentApi {
  return {
    async confirm(orderNo, idempotencyKey) {
      const normalizedOrderNo = orderNo.trim();
      if (!normalizedOrderNo || !idempotencyKey.trim()) return invalid();
      return parse(await client.request<unknown>({
        method: "POST", path: `/api/orders/${encodeURIComponent(normalizedOrderNo)}/pay`,
        idempotencyKey,
      }));
    },
  };
}
