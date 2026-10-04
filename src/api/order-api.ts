import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { parseOrderLineItems, type OrderLineItem } from "@/lib/order-line-items";

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
  subtotalUsdt: number;
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
  expiresAt: number | null;
  paidAt: number | null;
  activatedAt: number | null;
  refundedAt: number | null;
  refundAmountUsdt: number | null;
  refundChannel: string | null;
  refundBillNo: string | null;
  dataCenter: string | null;
  tradeinNo: string | null;
  sourceDeviceId: number | null;
  targetDeviceId: number | null;
  targetDeviceInstanceNo: string | null;
  paymentNo?: string | null;
  /** Bundle composition count; a bundle order's quantity is still one order. */
  itemCount: number | null;
  /** Server-authoritative composition, required for every bundle detail. */
  lineItems?: OrderLineItem[] | null;
}

export interface CanonicalOrderList {
  source: "server";
  sourceEnvironment: "PRODUCTION";
  runId: string | null;
  serverCanonical?: true;
  orders: CanonicalOrder[];
  nextCursor?: string | null;
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
  idSource: "server";
}

export interface CancelledOrder {
  orderNo: string;
  orderStatus: "CANCELLED";
  paymentStatus: "CANCELLED";
  serverCanonical: true;
  source: "server";
  sourceEnvironment: "PRODUCTION";
  runId: string;
  idempotent: boolean;
}

export interface PaidOrderReceipt {
  orderNo: string;
  paymentNo: string;
  paymentStatus: "PAID";
  orderStatus: "COMPLETED";
  activationStatus: "ACTIVATED";
  canonicalStatus: "activated";
  amountUsdt: number;
  paymentMethod: "WALLET" | "VOUCHER";
  walletBalanceAfterUsdt: number | null;
  idempotent: boolean;
  serverCanonical: true;
  source: "server";
  sourceEnvironment: "PRODUCTION";
  runId: "";
}

export interface CreateOrderRequest {
  productNo: string;
  quantity: number;
  voucherId?: string | null;
  idempotencyKey: string;
}

export interface OrderApi {
  list(beforeOrderNo?: string | null, pageSize?: number): Promise<CanonicalOrderList>;
  create(request: CreateOrderRequest): Promise<CreatedOrder>;
  cancel(orderNo: string, idempotencyKey: string): Promise<CancelledOrder>;
  pay(orderNo: string, idempotencyKey: string): Promise<PaidOrderReceipt>;
}

const STATUS_SET = new Set<string>(ORDER_STATUSES);
let currentRuntimeRevision = 0;
const runtimeRevisionListeners = new Set<(scope: RuntimeRevisionScope) => void>();

export interface RuntimeRevisionScope {
  runId: null;
  epoch: number;
}

/** Invalidate responses captured before a catalogue or account refresh. */
export function advanceRuntimeRevision(_reason?: unknown): void {
  currentRuntimeRevision += 1;
  const scope = captureRuntimeRevision();
  runtimeRevisionListeners.forEach((listener) => listener(scope));
}

/** Notify account-scoped stores after a canonical runtime revision changes. */
export function subscribeRuntimeRevision(
  listener: (scope: RuntimeRevisionScope) => void,
): () => void {
  runtimeRevisionListeners.add(listener);
  return () => runtimeRevisionListeners.delete(listener);
}

/** Capture the current canonical runtime revision before a request. */
export function captureRuntimeRevision(): RuntimeRevisionScope {
  return { runId: null, epoch: currentRuntimeRevision };
}

/** Reject a response after the catalogue or account runtime moved on. */
export function isCurrentRuntimeRevision(scope: RuntimeRevisionScope): boolean {
  return scope.epoch === currentRuntimeRevision;
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
  const orderType = nonEmptyString(source.orderType);
  let lineItems: OrderLineItem[] | null = null;
  if (orderType.toUpperCase() === "BUNDLE") {
    try {
      lineItems = parseOrderLineItems(source.lineItems);
    } catch {
      return invalid();
    }
  }
  const parsed: CanonicalOrder = {
    orderNo: nonEmptyString(source.orderNo),
    productId: integer(source.productId, 1),
    productNo: nonEmptyString(source.productNo),
    productName: nonEmptyString(source.productName),
    quantity: integer(source.quantity, 1),
    subtotalUsdt: finiteNumber(source.subtotalUsdt),
    unitPriceUsdt: finiteNumber(source.unitPriceUsdt),
    discountUsdt: finiteNumber(source.discountUsdt),
    amountUsdt: finiteNumber(source.amountUsdt),
    paymentMethod: nullableString(source.paymentMethod),
    paymentStatus: nonEmptyString(source.paymentStatus),
    orderStatus: nonEmptyString(source.orderStatus),
    activationStatus: nonEmptyString(source.activationStatus),
    canonicalStatus: status as CanonicalOrderStatus,
    orderType,
    placedAt: integer(source.placedAt, 0),
    expiresAt: nullableTimestamp(source.expiresAt),
    paidAt: nullableTimestamp(source.paidAt),
    activatedAt: nullableTimestamp(source.activatedAt),
    refundedAt: nullableTimestamp(source.refundedAt),
    refundAmountUsdt: source.refundAmountUsdt === null || source.refundAmountUsdt === undefined
      ? null : finiteNumber(source.refundAmountUsdt),
    refundChannel: nullableString(source.refundChannel),
    refundBillNo: nullableString(source.refundBillNo),
    dataCenter: nullableString(source.dataCenter),
    tradeinNo: nullableString(source.tradeinNo),
    sourceDeviceId: nullableInteger(source.sourceDeviceId),
    targetDeviceId: nullableInteger(source.targetDeviceId),
    targetDeviceInstanceNo: nullableString(source.targetDeviceInstanceNo),
    itemCount: nullableInteger(source.itemCount),
    lineItems,
    ...(source.paymentNo === null || source.paymentNo === undefined
      ? {} : { paymentNo: nonEmptyString(source.paymentNo) }),
  };
  const paymentStatus = parsed.paymentStatus.toUpperCase();
  const orderStatus = parsed.orderStatus.toUpperCase();
  const activationStatus = parsed.activationStatus.toUpperCase();
  const refundFacts = [parsed.refundedAt, parsed.refundAmountUsdt, parsed.refundChannel, parsed.refundBillNo];
  const hasAnyRefundFact = refundFacts.some((value) => value !== null);
  const hasCompleteRefundFacts = parsed.refundedAt !== null
    && parsed.refundAmountUsdt !== null && parsed.refundAmountUsdt > 0
    && parsed.refundChannel !== null && parsed.refundBillNo !== null;
  const coherentStatus = (() => {
    switch (parsed.canonicalStatus) {
      case "placed":
        return paymentStatus === "PENDING" && orderStatus === "PENDING_PAYMENT"
          && activationStatus === "WAITING_PAYMENT" && parsed.paidAt === null
          && parsed.activatedAt === null && parsed.expiresAt !== null
          && parsed.expiresAt > parsed.placedAt;
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
          && activationStatus === "REFUNDED" && (!hasAnyRefundFact || hasCompleteRefundFacts);
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
  if (source.idSource !== "server"
      || source.source !== undefined
      || source.sourceEnvironment !== undefined
      || source.runId !== undefined) return invalid();
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
    idSource: "server",
  };
  if (parsed.paymentStatus.toUpperCase() !== "PENDING"
      || parsed.orderStatus.toUpperCase() !== "PENDING_PAYMENT") {
    return invalid();
  }
  return parsed;
}

function cancelledOrder(value: unknown): CancelledOrder {
  const source = record(value);
  if (typeof source.orderNo !== "string" || !source.orderNo.trim()
      || source.orderStatus !== "CANCELLED" || source.paymentStatus !== "CANCELLED"
      || typeof source.serverCanonical !== "boolean" || source.serverCanonical !== true
      || source.source !== "server"
      || source.sourceEnvironment !== "PRODUCTION"
      || source.runId !== ""
      || typeof source.idempotent !== "boolean") return invalid();
  return { orderNo: source.orderNo.trim(), orderStatus: "CANCELLED", paymentStatus: "CANCELLED",
    serverCanonical: true, source: "server",
    sourceEnvironment: "PRODUCTION", runId: "",
    idempotent: source.idempotent };
}

function paidOrderReceipt(value: unknown): PaidOrderReceipt {
  const source = record(value);
  if (source.paymentStatus !== "PAID" || source.orderStatus !== "COMPLETED"
      || source.activationStatus !== "ACTIVATED" || source.canonicalStatus !== "activated"
      || source.serverCanonical !== true || source.source !== "server"
      || source.sourceEnvironment !== "PRODUCTION" || source.runId !== "") return invalid();
  const amountUsdt = finiteNumber(source.amountUsdt);
  if (amountUsdt < 0) return invalid();
  const paymentMethod = source.paymentMethod === "NEXGRID_WALLET" || source.paymentMethod === "WALLET"
    ? "WALLET" : source.paymentMethod === "VOUCHER" ? "VOUCHER" : invalid();
  if ((paymentMethod === "VOUCHER") !== (amountUsdt === 0)) return invalid();
  const walletBalanceAfterUsdt = paymentMethod === "WALLET"
    ? finiteNumber(source.walletBalanceAfterUsdt)
    : source.walletBalanceAfterUsdt === null ? null : invalid();
  return {
    orderNo: nonEmptyString(source.orderNo),
    paymentNo: nonEmptyString(source.paymentNo),
    paymentStatus: "PAID",
    orderStatus: "COMPLETED",
    activationStatus: "ACTIVATED",
    canonicalStatus: "activated",
    amountUsdt,
    paymentMethod,
    walletBalanceAfterUsdt,
    idempotent: typeof source.idempotent === "boolean" ? source.idempotent : invalid(),
    serverCanonical: true,
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: "",
  };
}

export function createOrderApi(client: ApiClient, mode: ApiEnvironment = "prod"): OrderApi {
  return {
    async list(beforeOrderNo = null, pageSize = 50): Promise<CanonicalOrderList> {
      const cursor = beforeOrderNo?.trim() || null;
      if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return invalid();
      const query = cursor
        ? `beforeOrderNo=${encodeURIComponent(cursor)}&pageSize=${pageSize}`
        : `pageSize=${pageSize}`;
      const payload = record(await client.request<unknown>({
        method: "GET",
        path: `/api/orders?${query}`,
      }));
      if (!Array.isArray(payload.orders)) return invalid();
      const source = nonEmptyString(payload.source);
      const sourceEnvironment = nonEmptyString(payload.sourceEnvironment);
      const rawRunId = payload.runId;
      if (payload.serverCanonical !== true) return invalid();
      const production = (mode === "dev" || mode === "prod")
        && source === "server" && sourceEnvironment === "PRODUCTION"
        && (rawRunId === null || rawRunId === undefined);
      if (!production) return invalid();
      return {
        source: "server",
        sourceEnvironment: "PRODUCTION",
        runId: null,
        serverCanonical: true,
        nextCursor: nullableString(payload.nextCursor),
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
      }));
    },

    async pay(orderNo, idempotencyKey): Promise<PaidOrderReceipt> {
      const normalized = orderNo.trim();
      if (!normalized || !idempotencyKey.trim()) return invalid();
      const parsed = paidOrderReceipt(await client.request<unknown>({
        method: "POST",
        path: `/api/orders/${encodeURIComponent(normalized)}/pay`,
        idempotencyKey,
      }));
      if (parsed.orderNo !== normalized) return invalid();
      return parsed;
    },
  };
}
