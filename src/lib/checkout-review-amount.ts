import { formatGroupedAmount } from './amount-display';

export type CheckoutReviewCurrency = 'USD' | 'USDT';
type Amount = Parameters<typeof formatGroupedAmount>[0];

/** Current checkout contracts bind USDT only. Catalogue prices and USD-looking
 * field names do not establish an order-bound USD price or an exchange rate. */
export function checkoutReviewAmount(amountUsdt: Amount, currency: CheckoutReviewCurrency): Amount {
  return currency === 'USDT' ? amountUsdt : null;
}

export function formatCheckoutReviewAmount(amountUsdt: Amount, currency: CheckoutReviewCurrency, discount = false): string {
  const formatted = formatGroupedAmount(checkoutReviewAmount(amountUsdt, currency));
  const amount = formatted === '-' ? '—' : formatted;
  const sign = discount && formatted !== '-' && !formatted.startsWith('-') && /[1-9]/.test(formatted) ? '−' : '';
  return sign + (currency === 'USD' ? '$' + amount : amount + ' USDT');
}
