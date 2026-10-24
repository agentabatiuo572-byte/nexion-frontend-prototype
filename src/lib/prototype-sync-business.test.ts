import { describe,expect,it } from 'vitest';
import { buildPromotionQuote } from './prototype-promotion-core';
import { promotionSeeds } from '@/mock/promotion';
import { teamRewardPage,commissionNetAmount,teamRewardCategory,teamRewardStart,directPurchaseUsdt } from './prototype-team-rewards';
import treeSource from '@/pages/team/tree.vue?raw';
import rosterSource from '@/components/team/team-roster-section.vue?raw';
import type { CommissionEvent } from '@/store/commission';
const now=Date.parse('2026-10-24T12:00:00Z');
const base={activity:promotionSeeds(now)[0],prices:{'cloud-share':19.9},firstPurchase:true,invited:false,usedGroups:{},now,id:'quote'};
describe('prototype-sync promotion quote validation',()=>{
  it.each([0,-1,1.5,101,NaN,Infinity])('rejects invalid purchase quantities %s',quantity=>expect(()=>buildPromotionQuote({...base,items:[{productNo:'cloud-share',quantity}]})).toThrow('selection'));
  it('uses source fixture buy-two-get-one, preserves remaining paid units, and rejects below minimum',()=>{
    expect(()=>buildPromotionQuote({...base,items:[{productNo:'cloud-share',quantity:1}]})).toThrow('ineligible');
    const q=buildPromotionQuote({...base,items:[{productNo:'cloud-share',quantity:5}]});expect(q.expectedRewards[0].groups).toBe(2);expect(q.amountUsdt).toBe('99.500000');
  });
  it('rejects malformed prices, discount, duplicate products, ended promotions and missing inviter',()=>{
    const items=[{productNo:'cloud-share',quantity:2}];
    expect(()=>buildPromotionQuote({...base,items,prices:{'cloud-share':NaN}})).toThrow('unavailable');
    expect(()=>buildPromotionQuote({...base,items,discount:NaN})).toThrow('voucher');
    expect(()=>buildPromotionQuote({...base,items:[...items,...items]})).toThrow('selection');
    expect(()=>buildPromotionQuote({...base,items,activity:{...base.activity,state:'ENDED'}})).toThrow('unavailable');
    expect(()=>buildPromotionQuote({...base,items,activity:promotionSeeds(now)[2]})).toThrow('inviteRequired');
  });
});
const event=(extra:Partial<CommissionEvent>={}):CommissionEvent=>({id:'a',kind:'unilevel',layer:1,sourceUserName:'Test',amountUSDT:60,amountNEX:4000,ts:now,unlockAt:now,status:'unlocked',...extra});
describe('prototype-sync seven-layer reward projection',()=>{
  it('shares the source L1 split across both current network estimates without recalculating historical events',()=>{
    expect(directPurchaseUsdt(1000)).toBe(60);expect(directPurchaseUsdt(299)).toBeCloseTo(17.94);
    expect(treeSource).toContain('directPurchaseUsdt(directVol.value');expect(rosterSource).toContain('directPurchaseUsdt(m.monthVolumeUSD');
    expect(commissionNetAmount(event({amountUSDT:100}),'USDT')).toBe(100);
  });
  it('preserves L1, L2–7 and device earnings as distinct sources',()=>{
    const rows=[event(),...Array.from({length:6},(_,i)=>event({id:`l${i+2}`,layer:i+2})),event({id:'device',rewardKind:'direct_device_earning'})];
    expect(teamRewardPage(rows,'direct','all',1,now).count).toBe(1);expect(teamRewardPage(rows,'extended','all',1,now).count).toBe(6);expect(teamRewardPage(rows,'device_earning','all',1,now).count).toBe(1);
    expect(teamRewardCategory(event({layer:8}))).toBe(null);
  });
  it('totals each currency using its own settlement state and retains recovery gross amounts',()=>{
    const mixed=event({statusUSDT:'reversed',statusNEX:'unlocked'});expect(commissionNetAmount(mixed,'USDT')).toBe(0);expect(commissionNetAmount(mixed,'NEX')).toBe(4000);
    for(const status of ['reversed','rejected','recovery_pending','waiting_calculation'] as const){expect(commissionNetAmount(event({status}),'NEX')).toBe(0);}
    const result=teamRewardPage([mixed,event({id:'pending',status:'recovery_pending',recoveryPendingUSDT:3})],'direct','all',1,now);
    expect(result.amountUSDT).toBe(0);expect(result.amountNEX).toBe(4000);expect(result.events[1].amountUSDT).toBe(60);
  });
  it('filters calendar periods, excludes future records and paginates without changing aggregate totals',()=>{
    const rows=Array.from({length:21},(_,i)=>event({id:String(i),ts:now-i*1000}));rows.push(event({id:'old',ts:now-50*86400000}),event({id:'future',ts:now+1}));
    const first=teamRewardPage(rows,'direct','today',1,now),second=teamRewardPage(rows,'direct','today',2,now);
    expect(first.events).toHaveLength(20);expect(second.events).toHaveLength(21);expect(first.amountNEX).toBe(second.amountNEX);expect(first.count).toBe(21);
    expect(teamRewardStart('week',now)).toBe(Date.parse('2026-10-19T00:00:00Z'));expect(teamRewardStart('month',now)).toBe(Date.parse('2026-10-01T00:00:00Z'));
  });
});
