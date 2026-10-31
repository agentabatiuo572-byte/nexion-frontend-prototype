import type { PurchasePaymentIntent } from '@/api/purchase-payment-api';

/** The confirmation window never grants additional time to send a payment. */
export function purchasePaymentTiming(intent: PurchasePaymentIntent | null, now: number, orderDeadline: number | null = null) {
  const ends = [intent?.expiresAt, intent?.deadlineAt, intent?.expirationTime].filter((value): value is string => !!value).map(Date.parse);
  if (orderDeadline !== null) ends.push(orderDeadline);
  const cutoff = ends.length ? Math.min(...ends) : null;
  const pending = !!intent && ['CREATING', 'SUBMIT_UNKNOWN', 'AWAITING_PAYMENT'].includes(intent.status);
  const pastDeadline = cutoff !== null && now >= cutoff;
  return { cutoff, left: cutoff === null ? null : Math.max(0, cutoff - now),
    canPay: !!intent && intent.status === 'AWAITING_PAYMENT' && intent.paymentAllowed !== false && !pastDeadline,
    confirming: pending && (pastDeadline || intent?.status === 'AWAITING_PAYMENT' && intent.paymentAllowed === false) };
}
