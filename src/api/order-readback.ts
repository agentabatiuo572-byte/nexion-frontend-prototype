import type { CanonicalOrder } from "./order-api";

/**
 * A payment receipt is only a command acknowledgement.  Checkout may advance
 * after it has read the canonical order projection and proved the same order
 * is paid.  Keep this predicate pure so each checkout surface and its tests
 * use one status contract.
 */
export function isCanonicalPaidOrder(
  order: CanonicalOrder | undefined,
  expectedOrderNo: string,
  expectedItemCount?: number,
): boolean {
  if (!order || order.orderNo !== expectedOrderNo || order.canonicalStatus !== "paid") return false;
  if (order.paymentStatus.toUpperCase() !== "PAID" || order.orderStatus.toUpperCase() !== "PAID") return false;
  return expectedItemCount === undefined || order.itemCount === expectedItemCount;
}
