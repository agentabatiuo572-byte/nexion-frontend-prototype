import { asApiError } from '@/api/errors';
import type { LocaleCode } from '@/i18n';
import { checkoutFlowCopy } from './checkout-flow-copy';

// Definitive /pay refusals: nothing was charged and the order is unchanged.
const REASONS = {
  CAPACITY_REPLACEMENT_REQUIRED: 'rejectCapacity',
  ORDER_PRODUCT_NOT_PAYABLE: 'rejectUnavailable',
  ORDER_MONTHLY_QUOTA_PAUSED: 'rejectQuota',
  ORDER_MONTHLY_QUOTA_EXHAUSTED: 'rejectQuota',
  ORDER_MONTHLY_QUOTA_REQUIREMENTS_NOT_MET: 'rejectRequirements',
  COMMERCE_PAYMENT_EMERGENCY_STOPPED: 'rejectPaused',
  ORDER_NOT_PAYABLE: 'closed',
  ORDER_PAYMENT_EXPIRED: 'closed',
} as const;

/** The user-facing reason for a definitive payment refusal, or null when the outcome is not a known refusal. */
export function orderPaymentRejection(error: unknown, locale: LocaleCode): string | null {
  const key = REASONS[asApiError(error).message as keyof typeof REASONS];
  return key ? checkoutFlowCopy(locale)[key] : null;
}
