import type { PurchaseKind } from '@/api/purchase-payment-api';
import { paidOrderReceipt } from '@/api/order-api';
import { parsePromotedOrder } from '@/api/promotion-api';
import { parseTrialConvertReceipt } from '@/api/trial-api';
import { parseCanonicalCapacityKeepResult, parseCanonicalTradeinResult, purchasePrincipalUsdt } from '@/api/device-e3-api';
import { formatAmount } from './amount-display';

/** Validate the original business receipt before releasing its durable external recovery pointer. */
export function validatePurchasePaymentReceipt(kind: PurchaseKind, payload: Record<string, unknown>, raw: unknown,
  expected?: { subtotalUsdt: string; paymentMethod: string }): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('PURCHASE_PAYMENT_RECEIPT_INVALID');
  const row = raw as Record<string, unknown>;
  if (row.paymentMethod !== 'HDPAY_BANK' && row.paymentMethod !== 'CREGIS_USDT_BSC') throw new Error('PURCHASE_PAYMENT_RECEIPT_INVALID');
  if (typeof row.paymentSubtotalUsdt !== 'string' || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(row.paymentSubtotalUsdt)
      || formatAmount(row.amountUsdt as string | number) !== formatAmount(row.paymentSubtotalUsdt)
      || expected && (row.paymentMethod !== expected.paymentMethod || formatAmount(row.paymentSubtotalUsdt) !== formatAmount(expected.subtotalUsdt))) throw new Error('PURCHASE_PAYMENT_RECEIPT_MISMATCH');
  if (kind === 'ORDER_PAY') {
    const receipt = row.promotionQuoteId ? parsePromotedOrder(raw) : paidOrderReceipt(raw);
    if (receipt.orderNo !== payload.orderNo || receipt.paymentStatus !== 'PAID') throw new Error('PURCHASE_PAYMENT_RECEIPT_MISMATCH');
    return receipt.orderNo;
  }
  if (kind === 'TRIAL_CONVERT') {
    const receipt = parseTrialConvertReceipt(raw);
    if (receipt.productNo !== payload.productNo || formatAmount(row.paymentSubtotalUsdt) !== formatAmount(payload.expectedAmountUsdt as string | number)) throw new Error('PURCHASE_PAYMENT_RECEIPT_MISMATCH');
    return receipt.orderNo;
  }
  const receipt = kind === 'CAPACITY_KEEP' ? parseCanonicalCapacityKeepResult(raw) : parseCanonicalTradeinResult(raw);
  if (!receipt.paymentMethod || formatAmount(purchasePrincipalUsdt(receipt), 6) !== formatAmount(payload.expectedPayableUsdt as string | number, 6)
      || kind !== 'CAPACITY_KEEP' && (receipt as ReturnType<typeof parseCanonicalTradeinResult>).sourceDeviceId !== payload.sourceDeviceId) throw new Error('PURCHASE_PAYMENT_RECEIPT_MISMATCH');
  return receipt.orderNo;
}
