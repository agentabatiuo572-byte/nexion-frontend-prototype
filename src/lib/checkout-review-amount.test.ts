import { describe,expect,it } from 'vitest';
import { formatCheckoutReviewAmount } from './checkout-review-amount';

describe('checkout amount display',()=>{
  it('reads USDT amounts as dollars one to one',()=>{
    expect(formatCheckoutReviewAmount(1299,'USD',{unit:true})).toBe('$1,299.00');
    expect(formatCheckoutReviewAmount('1299.123456','USD',{unit:true})).toBe('$1,299.12');
  });
  it('labels only subtotal and total rows with a unit',()=>{
    expect(formatCheckoutReviewAmount(1299,'USDT',{unit:true})).toBe('1,299.00 USDT');
    expect(formatCheckoutReviewAmount(1299,'USD')).toBe('1,299.00');
    expect(formatCheckoutReviewAmount(50,'USD',{discount:true})).toBe('−50.00');
    expect(formatCheckoutReviewAmount(0,'USD',{discount:true})).toBe('0.00');
  });
  it('shows a dash for an unreadable amount',()=>{
    expect(formatCheckoutReviewAmount(undefined,'USD',{unit:true})).toBe('$—');
    expect(formatCheckoutReviewAmount(undefined,'USD')).toBe('—');
  });
});
