import { formatGroupedAmount } from './amount-display';

export type CheckoutReviewCurrency = 'USD' | 'USDT';
type Amount = Parameters<typeof formatGroupedAmount>[0];

/** Prices read as dollars at 1 USD = 1 USDT. Only subtotal/total rows carry the
 * unit; item and discount rows show the bare number. */
export function formatCheckoutReviewAmount(amount: Amount, currency: CheckoutReviewCurrency, { discount = false, unit = false } = {}): string {
  const formatted = formatGroupedAmount(amount);
  const value = formatted === '-' ? '—' : formatted;
  const sign = discount && value !== '—' && !value.startsWith('-') && /[1-9]/.test(value) ? '−' : '';
  if (!unit) return sign + value;
  return sign + (currency === 'USD' ? '$' + value : value + ' USDT');
}
