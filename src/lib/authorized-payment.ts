import { asApiError } from '@/api/errors';
import { watch } from 'vue';
import type { PaymentPasswordAuthorization } from '@/api/payment-password-api';
import { requestPaymentPassword, reportPaymentPasswordError, cancelPaymentPassword, type PaymentPasswordContext } from '@/store/payment-password';
import { toast } from '@/store/ui';
import { useLocaleStore } from '@/store/locale';
import { purchaseRecoveryCopy } from './purchase-recovery-copy';

/** Keeps a rejected PIN in the original checkout; business errors retain their owning recovery path. */
export async function executePaymentWithPassword<T>(
  context: PaymentPasswordContext,
  command: (authorization: PaymentPasswordAuthorization) => Promise<T>,
  current: () => boolean,
): Promise<T | null> {
  while (current()) {
    const stop = watch(current, valid => {
      if (!valid) {
        cancelPaymentPassword();
        toast.warn(purchaseRecoveryCopy(useLocaleStore().code).changed);
      }
    }, { flush: 'sync' });
    let authorization: PaymentPasswordAuthorization | null;
    try { authorization = await requestPaymentPassword(context); }
    finally { stop(); }
    if (!authorization) return null;
    try {
      if (!current()) return null;
      return await command(authorization);
    } catch (error) {
      if (!/^PAYMENT_PASSWORD_(INCORRECT|LOCKED|VERSION_CONFLICT|NOT_CONFIGURED|REQUIRED)$/.test(asApiError(error).message)) throw error;
      reportPaymentPasswordError(error);
    } finally {
      authorization.paymentPassword = '';
    }
  }
  return null;
}
