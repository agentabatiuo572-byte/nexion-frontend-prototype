import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiResponseEnvironment } from "./runtime-config";

export const ORDER_STATUSES = [
  "placed",
  "paid",
  "provisioning",
  "activated",
  "payment_failed",
  "expired",
  "provisioning_failed",
  "refunded",
  "chargeback",
  "cancelled",
] as const;

export type CanonicalOrderStatus = typeof ORDER_STATUSES[number];

export interface CanonicalOrder {
  orderNo: string;
  productId: number;
  productNo: string;
  productName: string;
  quantity: number;
  unitPriceUsdt: number;
  discountUsdt: number;
  amountUsdt: number;
  paymentMethod: string | null;
  paymentStatus: string;
  orderStatus: string;
  activationStatus: string;
  canonicalStatus: CanonicalOrderStatus;
  orderType: string;
  placedAt: number;
  paidAt: number | null;
  activatedAt: number | null;
  dataCenter: string | null;
  tradeinNo: string | null;
  sourceDeviceId: number | null;
  targetDeviceId: number | null;
  targetDeviceInstanceNo: string | null;
  paymentNo?: string | null;
  /** Bundle composition count; a bundle order's quantity is still one order. */
  itemCount: number | null;
}

export interface CanonicalOrderList {
  source: "server" | "mock";
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string | null;
  serverCanonical?: true;
  orders: CanonicalOrder[];
}

export interface CreatedOrder {
  orderNo: string;
  subtotalUsdt: number;
  discountUsdt: number;
  amountUsdt: number;
  voucherId: string | null;
  voucherRedemption: { voucherId: string; grantId: string; status: "REDEEMED"; discountUsdt: number } | null;
  paymentStatus: string;
  orderStatus: string;
  idSource: "server" | "sandbox-server";
  source?: "mock";
  sourceEnvironment?: "SANDBOX";
  runId?: string;
}

export interface CancelledOrder {
  orderNo: string;
  orderStatus: "CANCELLED";
  paymentStatus: "CANCELLED";
  serverCanonical: true;
  source: "server" | "mock";
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
  idempotent: boolean;
}

export interface CreateOrderRequest {
  productNo: string;
  quantity: number;
  voucherId?: string | null;
  idempotencyKey: string;
}

export interface OrderApi {
  list(): Promise<CanonicalOrderList>;
  create(request: CreateOrderRequest): Promise<CreatedOrder>;
  cancel(orderNo: string, idempotencyKey: string): Promise<CancelledOrder>;
}

const STATUS_SET = new Set<string>(ORDER_STATUSES);
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/;
let currentSandboxRunId: string | null = null;
let currentSandboxRunEpoch = 0;
const sandboxRunListeners = new Set<(scope: CommerceSandboxRunScope) => void>();

export interface CommerceSandboxRunScope {
  runId: string | null;
  epoch: number;
}

/** The catalogue is the current run-scoped commerce proof for checkout. */
export function setCurrentCommerceSandboxRun(runId: string | null): void {
  const nextRunId = runId !== null && RUN_ID.test(runId) ? runId : null;
  if (nextRunId !== currentSandboxRunId) {
    currentSandboxRunEpoch += 1;
    currentSandboxRunId = nextRunId;
    const scope = captureCommerceSandboxRun();
    sandboxRunListeners.forEach((listener) => listener(scope));
    return;
  }
  currentSandboxRunId = nextRunId;
}

/** Notify account-scoped stores when the product catalogue selects a new run. */
export function subscribeCurrentCommerceSandboxRun(
  listener: (scope: CommerceSandboxRunScope) => void,
): () => void {
  sandboxRunListeners.add(listener);
  return () => sandboxRunListeners.delete(listener);
}

export function isCurrentCommerceSandboxRun(runId: unknown): runId is string {
  return typeof runId === "string" && RUN_ID.test(runId) && runId === currentSandboxRunId;
}

/** Capture both the selected sandbox RunID and its generation before a request. */
export function captureCommerceSandboxRun(): CommerceSandboxRunScope {
  return { runId: currentSandboxRunId, epoch: currentSandboxRunEpoch };
}

/** Reject a response after the catalog/runtime moved to another environment or RunID. */
export function isCurrentCommerceSandboxScope(scope: CommerceSandboxRunScope): boolean {
  return scope.epoch === currentSandboxRunEpoch && scope.runId === currentSandboxRunId;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "ORDER_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return nonEmptyString(value);
}

function finiteNumber(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) return invalid();
  return value;
}

function integer(value: unknown, minimum = 0): number {
  const parsed = finiteNumber(value, minimum);
  if (!Number.isSafeInteger(parsed)) return invalid();
  return parsed;
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return integer(value, 1);
}

function nullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return integer(value, 0);
}

function canonicalOrder(value: unknown): CanonicalOrder {
  const source = record(value);
  const status = nonEmptyString(source.canonicalStatus);
  if (!STATUS_SET.has(status)) return invalid();
  const parsed: CanonicalOrder = {
    orderNo: nonEmptyString(source.orderNo),
    productId: integer(source.productId, 1),
    productNo: nonEmptyString(source.productNo),
    productName: nonEmptyString(source.productName),
    quantity: integer(source.quantity, 1),
    unitPriceUsdt: finiteNumber(source.unitPriceUsdt),
    discountUsdt: finiteNumber(source.discountUsdt),
    amountUsdt: finiteNumber(source.amountUsdt),
    paymentMethod: nullableString(source.paymentMethod),
    paymentStatus: nonEmptyString(source.paymentStatus),
    orderStatus: nonEmptyString(source.orderStatus),
    activationStatus: nonEmptyString(source.activationStatus),
    canonicalStatus: status as CanonicalOrderStatus,
    orderType: nonEmptyString(source.orderType),
    placedAt: integer(source.placedAt, 0),
    paidAt: nullableTimestamp(source.paidAt),
    activatedAt: nullableTimestamp(source.activatedAt),
    dataCenter: nullableString(source.dataCenter),
    tradeinNo: nullableString(source.tradeinNo),
    sourceDeviceId: nullableInteger(source.sourceDeviceId),
    targetDeviceId: nullableInteger(source.targetDeviceId),
    targetDeviceInstanceNo: nullableString(source.targetDeviceInstanceNo),
    itemCount: nullableInteger(source.itemCount),
    ...(source.paymentNo === null || source.paymentNo === undefined
      ? {} : { paymentNo: nonEmptyString(source.paymentNo) }),
  };
  const paymentStatus = parsed.paymentStatus.toUpperCase();
  const orderStatus = parsed.orderStatus.toUpperCase();
  const activationStatus = parsed.activationStatus.toUpperCase();
  const coherentStatus = (() => {
    switch (parsed.canonicalStatus) {
      case "placed":
        return paymentStatus === "PENDING" && orderStatus === "PENDING_PAYMENT"
          && activationStatus === "WAITING_PAYMENT" && parsed.paidAt === null
          && parsed.activatedAt === null;
      case "paid":
        return paymentStatus === "PAID" && orderStatus === "PAID"
          && activationStatus === "WAITING_PROVISIONING" && parsed.paidAt !== null
          && parsed.activatedAt === null;
      case "provisioning":
        return paymentStatus === "PAID" && (orderStatus === "PROCESSING" || orderStatus === "PROVISIONING")
          && activationStatus === "PROVISIONING" && parsed.paidAt !== null
          && parsed.activatedAt === null;
      case "activated":
        return paymentStatus === "PAID" && orderStatus === "COMPLETED"
          && activationStatus === "ACTIVATED" && parsed.paidAt !== null && parsed.activatedAt !== null;
      case "payment_failed":
        return paymentStatus === "FAILED" && orderStatus === "PAYMENT_FAILED"
          && activationStatus === "WAITING_PAYMENT";
      case "expired":
        return paymentStatus === "EXPIRED" && orderStatus === "EXPIRED"
          && activationStatus === "WAITING_PAYMENT";
      case "provisioning_failed":
        return paymentStatus === "PAID" && orderStatus === "PROVISIONING_FAILED"
          && activationStatus === "PROVISIONING_FAILED";
      case "refunded":
        return paymentStatus === "REFUNDED" && orderStatus === "REFUNDED"
          && activationStatus === "REFUNDED";
      case "chargeback":
        return paymentStatus === "CHARGEBACK" && orderStatus === "CHARGEBACK"
          && activationStatus === "DEACTIVATED";
      case "cancelled":
        return paymentStatus === "CANCELLED" && orderStatus === "CANCELLED"
          && activationStatus === "WAITING_PAYMENT";
    }
  })();
  if (!coherentStatus) return invalid();
  return parsed;
}

function createdOrder(value: unknown): CreatedOrder {
  const source = record(value);
  const sandboxRunId = typeof source.runId === "string" ? source.runId : "";
  const sandboxResponse = source.idSource === "sandbox-server";
  if (source.idSource !== "server" && !sandboxResponse) return invalid();
  if (sandboxResponse && (source.source !== "mock" || source.sourceEnvironment !== "SANDBOX"
      || !RUN_ID.test(sandboxRunId) || sandboxRunId !== currentSandboxRunId)) return invalid();
  if (!sandboxResponse && (source.source !== undefined || source.sourceEnvironment !== undefined || source.runId !== undefined)) return invalid();
  const rawRedemption = source.voucherRedemption;
  const redemption = rawRedemption === null || rawRedemption === undefined ? null : record(rawRedemption);
  const voucherRedemption = redemption === null ? null : {
    voucherId: nonEmptyString(redemption.voucherId),
    grantId: nonEmptyString(redemption.grantId),
    status: redemption.status === "REDEEMED" ? "REDEEMED" as const : invalid(),
    discountUsdt: finiteNumber(redemption.discountUsdt),
  };
  const parsed: CreatedOrder = {
    orderNo: nonEmptyString(source.orderNo),
    subtotalUsdt: finiteNumber(source.subtotalUsdt),
    discountUsdt: finiteNumber(source.discountUsdt),
    amountUsdt: finiteNumber(source.amountUsdt),
    voucherId: nullableString(source.voucherId),
    voucherRedemption,
    paymentStatus: nonEmptyString(source.paymentStatus),
    orderStatus: nonEmptyString(source.orderStatus),
    idSource: source.idSource as "server" | "sandbox-server",
    ...(sandboxResponse ? { source: "mock" as const, sourceEnvironment: "SANDBOX" as const, runId: sandboxRunId } : {}),
  };
  if (parsed.paymentStatus.toUpperCase() !== "PENDING"
      || parsed.orderStatus.toUpperCase() !== "PENDING_PAYMENT") {
    return invalid();
  }
  return parsed;
}

function cancelledOrder(value: unknown, mode: ApiResponseEnvironment): CancelledOrder {
  const source = record(value);
  if (typeof source.orderNo !== "string" || !source.orderNo.trim()
      || source.orderStatus !== "CANCELLED" || source.paymentStatus !== "CANCELLED"
      || typeof source.serverCanonical !== "boolean" || source.serverCanonical !== true
      || (source.source !== "server" && source.source !== "mock")
      || (source.sourceEnvironment !== "PRODUCTION" && source.sourceEnvironment !== "SANDBOX")
      || typeof source.runId !== "string"
      || typeof source.idempotent !== "boolean") return invalid();
  const production = mode === "prod"
    && source.source === "server"
    && source.sourceEnvironment === "PRODUCTION"
    && source.runId === "";
  const sandbox = mode === "dev"
    && source.source === "mock"
    && source.sourceEnvironment === "SANDBOX"
    && RUN_ID.test(source.runId)
    && isCurrentCommerceSandboxRun(source.runId);
  if (!production && !sandbox) return invalid();
  return { orderNo: source.orderNo.trim(), orderStatus: "CANCELLED", paymentStatus: "CANCELLED",
    serverCanonical: true, source: production ? "server" : "mock",
    sourceEnvironment: production ? "PRODUCTION" : "SANDBOX", runId: production ? "" : source.runId,
    idempotent: source.idempotent };
}

export function createOrderApi(client: ApiClient, mode: ApiResponseEnvironment = "prod"): OrderApi {
  return {
    async list(): Promise<CanonicalOrderList> {
      const payload = record(await client.request<unknown>({
        method: "GET",
        path: "/api/orders",
      }));
      if (!Array.isArray(payload.orders)) return invalid();
      const source = nonEmptyString(payload.source);
      const sourceEnvironment = nonEmptyString(payload.sourceEnvironment);
      const rawRunId = payload.runId;
      if (payload.serverCanonical !== true) return invalid();
      const sandbox = mode === "dev"
        && source === "mock" && sourceEnvironment === "SANDBOX"
        && typeof rawRunId === "string" && RUN_ID.test(rawRunId) && rawRunId === currentSandboxRunId;
      const production = mode === "prod"
        && source === "server" && sourceEnvironment === "PRODUCTION"
        && (rawRunId === null || rawRunId === undefined);
      if (!sandbox && !production) return invalid();
      return {
        source: source as "server" | "mock",
        sourceEnvironment: sourceEnvironment as "PRODUCTION" | "SANDBOX",
        runId: sandbox ? rawRunId : null,
        serverCanonical: true,
        orders: payload.orders.map(canonicalOrder),
      };
    },

    async create(request): Promise<CreatedOrder> {
      const productNo = request.productNo.trim();
      if (!productNo || !Number.isSafeInteger(request.quantity) || request.quantity < 1
          || !request.idempotencyKey.trim()) {
        return invalid();
      }
      return createdOrder(await client.request<unknown>({
        method: "POST",
        path: "/api/orders",
        idempotencyKey: request.idempotencyKey,
        body: {
          productNo,
          quantity: request.quantity,
          voucherId: request.voucherId ?? null,
        },
      }));
    },

    async cancel(orderNo, idempotencyKey): Promise<CancelledOrder> {
      const normalized = orderNo.trim();
      if (!normalized || !idempotencyKey.trim()) return invalid();
      return cancelledOrder(await client.request<unknown>({
        method: "POST",
        path: `/api/orders/${encodeURIComponent(normalized)}/cancel`,
        idempotencyKey,
      }), mode);
    },
  };
}
