import type { CommissionEvent, CommissionStatus } from '@/store/commission';
/** Source SEVEN_V2 fixture: L1's existing 10% budget is split 60% USDT / 40% NEX. */
export const DIRECT_PURCHASE_USDT_SHARE = 0.6;
export function directPurchaseUsdt(basis:number,layerOneBudgetRate=0.1):number { return basis*layerOneBudgetRate*DIRECT_PURCHASE_USDT_SHARE; }
export type TeamRewardCategory = 'direct' | 'extended' | 'device_earning';
export type TeamRewardPeriod = 'today' | 'week' | 'month' | 'all';
export function teamRewardCategory(event: CommissionEvent): TeamRewardCategory | null {
  if (event.rewardKind === 'direct_device_earning') return 'device_earning';
  if (event.kind !== 'unilevel') return null;
  return event.layer === 1 ? 'direct' : event.layer && event.layer >= 2 && event.layer <= 7 ? 'extended' : null;
}
export function commissionAssetStatus(event: CommissionEvent, symbol: 'USDT' | 'NEX'): CommissionStatus {
  return (symbol === 'USDT' ? event.statusUSDT : event.statusNEX) ?? event.status;
}
export function commissionNetAmount(event: CommissionEvent, symbol: 'USDT' | 'NEX'): number {
  const status = commissionAssetStatus(event, symbol);
  return ['reversed','rejected','recovery_pending','waiting_calculation'].includes(status) ? 0 : symbol === 'USDT' ? event.amountUSDT : event.amountNEX;
}
export function teamRewardStart(period: TeamRewardPeriod, now: number): number {
  const day = new Date(now); day.setUTCHours(0,0,0,0);
  if (period === 'today') return day.getTime();
  if (period === 'week') return day.getTime() - ((day.getUTCDay()+6)%7)*86400000;
  if (period === 'month') { day.setUTCDate(1); return day.getTime(); }
  return 0;
}
export function teamRewardPage(events: CommissionEvent[], category: TeamRewardCategory, period: TeamRewardPeriod, page = 1, now = Date.now()) {
  const start = teamRewardStart(period, now);
  const rows = events.filter(e=>teamRewardCategory(e)===category&&e.ts>=start&&e.ts<=now).sort((a,b)=>b.ts-a.ts);
  return { events: rows.slice(0,Math.max(1,page)*20), count: rows.length, amountUSDT: rows.reduce((n,e)=>n+commissionNetAmount(e,'USDT'),0), amountNEX: rows.reduce((n,e)=>n+commissionNetAmount(e,'NEX'),0) };
}
