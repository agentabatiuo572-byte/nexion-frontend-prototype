import {describe,it,expect} from 'vitest';
import {voucherBenefitSummary} from './voucher-benefit-summary';
describe('advertised voucher benefit',()=>{
 it('quotes the largest individual ceiling, never sums nonstackable vouchers',()=>expect(voucherBenefitSummary([{type:'fixed',amountUSD:50},{type:'fixed',amountUSD:200},{type:'percent',percent:15,maxDiscountUSD:100}])).toEqual({amount:200,percent:null}));
 it.each([undefined,0])('does not mislabel a finite amount as the maximum alongside an uncapped percentage (%s)',cap=>expect(voucherBenefitSummary([{type:'fixed',amountUSD:50},{type:'percent',percent:15,maxDiscountUSD:cap}])).toEqual({amount:null,percent:15}));
 it('does not manufacture an amount for missing or invalid definitions',()=>expect(voucherBenefitSummary([{type:'fixed',amountUSD:NaN},{type:'percent',percent:NaN}])).toEqual({amount:null,percent:null}));
 it('preserves a capped percent offer ceiling',()=>expect(voucherBenefitSummary([{type:'percent',percent:8,maxDiscountUSD:20}])).toEqual({amount:20,percent:null}));
});
