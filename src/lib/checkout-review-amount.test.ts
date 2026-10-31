import { describe,expect,it } from 'vitest';
import { checkoutReviewAmount,formatCheckoutReviewAmount } from './checkout-review-amount';

describe('checkout display units',()=>{
  it.each([['120.123456','$120.12'],['0','$0.00'],[1299,'$1,299.00']] as const)('keeps the existing amount %s visible in dollars', (amount,display)=>{
    expect(checkoutReviewAmount(amount,'USD')).toBe(amount);
    expect(formatCheckoutReviewAmount(amount,'USD')).toBe(display);
  });
  it('shows the real wallet quote without changing command precision',()=>{
    const quote='1299.123456';
    expect(formatCheckoutReviewAmount(quote,'USD')).toBe('$1,299.12');
    expect(formatCheckoutReviewAmount(quote,'USD',true)).toBe('−$1,299.12');
    expect(checkoutReviewAmount(quote,'USDT')).toBe(quote);
    expect(formatCheckoutReviewAmount(quote,'USDT')).toBe('1,299.12 USDT');
    expect(formatCheckoutReviewAmount(quote,'USDT',true)).toBe('−1,299.12 USDT');
    expect(formatCheckoutReviewAmount(undefined,'USD')).toBe('$—');
    expect(formatCheckoutReviewAmount(undefined,'USDT')).toBe('— USDT');
  });
});
