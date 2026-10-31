import { formatGroupedAmount } from './amount-display';

export type CheckoutReviewCurrency = 'USD' | 'USDT';
type Amount = Parameters<typeof formatGroupedAmount>[0];

/** The review uses dollar notation for the existing business amount. Method
 * selection changes its displayed unit; it does not recalculate the payment. */
export function checkoutReviewAmount(amount: Amount, _currency: CheckoutReviewCurrency): Amount {
  return amount;
}

export function formatCheckoutReviewAmount(amountUsdt: Amount, currency: CheckoutReviewCurrency, discount = false): string {
  const formatted = formatGroupedAmount(checkoutReviewAmount(amountUsdt, currency));
  const amount = formatted === '-' ? '—' : formatted;
  const sign = discount && formatted !== '-' && !formatted.startsWith('-') && /[1-9]/.test(formatted) ? '−' : '';
  return sign + (currency === 'USD' ? '$' + amount : amount + ' USDT');
}
