import type { VoucherDef } from '@/mock/vouchers';

/** A published ceiling is safe to quote only when every advertised offer has one. */
export function voucherBenefitSummary(offers: readonly Pick<VoucherDef,'type'|'amountUSD'|'percent'|'maxDiscountUSD'>[]): {amount:number|null;percent:number|null} {
  const positive = (n:unknown):n is number => typeof n==='number'&&Number.isFinite(n)&&n>0;
  const uncapped = offers.filter(row=>row.type==='percent'&&!positive(row.maxDiscountUSD));
  if(uncapped.length) {
    const rates=uncapped.map(row=>row.percent).filter(positive);
    return {amount:null,percent:rates.length?Math.max(...rates):null};
  }
  const amounts=offers.map(row=>row.type==='fixed'?row.amountUSD:row.maxDiscountUSD).filter(positive);
  return {amount:amounts.length?Math.max(...amounts):null,percent:null};
}
