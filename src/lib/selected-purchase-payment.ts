import { executePaymentWithPassword } from './authorized-payment';
import { requestPurchasePayment, acknowledgePurchasePayment, type PurchasePaymentContext } from '@/store/purchase-payment';
import type { PaymentPasswordContext } from '@/store/payment-password';
import type { PaymentPasswordAuthorization } from '@/api/payment-password-api';
import { remoteApiEnabled } from '@/api/runtime';

export type PurchaseExecution<T> = Omit<PurchasePaymentContext, 'amount' | 'summary' | 'current'> & { parseReceipt: (raw: unknown) => T | Promise<T> };
export async function executeSelectedPurchase<T>(
  context: PaymentPasswordContext,
  wallet: (authorization: PaymentPasswordAuthorization) => Promise<T>,
  current: () => boolean,
  purchase: PurchaseExecution<T>,
): Promise<T | null> {
  if (!current()) return null;
  // Zero-value rights still use the approved wallet confirmation; never create a zero external collection.
  if (!remoteApiEnabled || Number(context.amount) === 0) return executePaymentWithPassword(context, wallet, current);
  const choice = await requestPurchasePayment({ kind: purchase.kind, payload: purchase.payload, amount: context.amount, summary: context.summary, current, commandKey: purchase.commandKey });
  if (!choice) return null;
  if (choice.method === 'EXTERNAL') {
    const receipt = await purchase.parseReceipt(choice.receipt);
    acknowledgePurchasePayment(choice);
    return receipt;
  }
  if (!current()) return null;
  return executePaymentWithPassword(context, wallet, current);
}
