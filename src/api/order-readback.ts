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
  if (!order || order.orderNo !== expectedOrderNo
      || !["paid", "activated"].includes(order.canonicalStatus)) return false;
  if (order.paymentStatus.toUpperCase() !== "PAID"
      || !["PAID", "COMPLETED"].includes(order.orderStatus.toUpperCase())) return false;
  if (order.canonicalStatus === "activated" && order.activationStatus.toUpperCase() !== "ACTIVATED") return false;
  return expectedItemCount === undefined || order.itemCount === expectedItemCount;
}
