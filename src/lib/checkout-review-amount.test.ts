import { describe,expect,it } from 'vitest';
import { checkoutReviewAmount,formatCheckoutReviewAmount } from './checkout-review-amount';

describe('checkout currency display without a USD quote',()=>{
  it.each(['120.123456','0',1299])('never relabels the USDT quote %s as dollars',amount=>{
    expect(checkoutReviewAmount(amount,'USD')).toBeNull();
    expect(formatCheckoutReviewAmount(amount,'USD')).toBe('$—');
    expect(formatCheckoutReviewAmount(amount,'USD',true)).toBe('$—');
  });
  it('shows the real wallet quote without changing command precision',()=>{
    const quote='1299.123456';
    expect(checkoutReviewAmount(quote,'USDT')).toBe(quote);
    expect(formatCheckoutReviewAmount(quote,'USDT')).toBe('1,299.12 USDT');
    expect(formatCheckoutReviewAmount(quote,'USDT',true)).toBe('−1,299.12 USDT');
    expect(formatCheckoutReviewAmount(undefined,'USD')).toBe('$—');
    expect(formatCheckoutReviewAmount(undefined,'USDT')).toBe('— USDT');
  });
});
