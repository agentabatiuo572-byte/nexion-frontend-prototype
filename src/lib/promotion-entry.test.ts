import { describe,expect,it } from 'vitest';
import type { PublicPromotion,PublicRewardSpec } from '@/api/promotion-contracts';
import { canPreviewPromotion,createPromotionReadFence,isEntryQuoteFresh,parseEntryItems,productRewardSpecs,promotionBundleHref,promotionCheckoutHref,promotionDetailHref,promotionDisclosures,promotionStoreHref,restoreEntrySelection,validEntryItems } from './promotion-entry';

function promotion(extra:Partial<PublicPromotion>={}):PublicPromotion {
  return { activityId:'activity A',version:3,template:'SKU_GIFT',state:'ACTIVE',startsAt:'2026-10-07T00:00:00Z',endsAt:'2026-10-30T00:00:00Z',serverTime:'2026-10-08T00:00:00Z',title:{zh:'活动',en:'Offer',vi:'Ưu đãi'},terms:{zh:'条件',en:'Terms',vi:'Điều khoản'},placement:null,target:'STORE',productNos:['A','D'],minimumClientCapabilities:['PROMOTION_QUOTE_V1'],eligibility:'ESTIMATE_ELIGIBLE',eligibilityMessage:null,rewardRules:[],...extra };
}
const disclosure={title:{zh:'权益',en:'Rights',vi:'Quyền lợi'},terms:{zh:'条款',en:'Terms',vi:'Điều khoản'},refundTerms:{zh:'退款',en:'Refund',vi:'Hoàn tiền'},benefitDescription:{zh:'说明',en:'Benefits',vi:'Lợi ích'},deviceRights:null,deviceName:null};
const device:PublicRewardSpec={rewardRuleId:'gift',beneficiaryRole:'BUYER',type:'DEVICE',giftProductNo:'B',quantity:1,disclosure};
const usdt:PublicRewardSpec={rewardRuleId:'usdt',beneficiaryRole:'BUYER',type:'USDT',calculation:'FIXED',amount:'0.123456',disclosure};
const nex:PublicRewardSpec={rewardRuleId:'nex',beneficiaryRole:'DIRECT_INVITER',type:'NEX',calculation:'FIXED',amount:'123456789012345678.123456',disclosure};

describe('promotion entry server truth',()=>{
  it('accepts public sign-in estimates without pretending to know personal eligibility',()=>{
    expect(canPreviewPromotion(promotion({eligibility:'SIGN_IN_REQUIRED'}))).toBe(true);
    expect(canPreviewPromotion(promotion({eligibility:'INELIGIBLE'}))).toBe(false);
    expect(canPreviewPromotion(promotion({eligibility:'UNKNOWN'}))).toBe(false);
    expect(canPreviewPromotion(null)).toBe(false);
  });
  it.each(['DRAFT','SCHEDULED','PAUSED','ENDED','ARCHIVED'] as const)('keeps explicit %s unavailable, regardless of future endsAt',state=>{
    expect(canPreviewPromotion(promotion({state}))).toBe(false);
  });
  it('does not infer expiry from the device clock or invent unsupported capabilities',()=>{
    expect(canPreviewPromotion(promotion({endsAt:'2000-01-01T00:00:00Z'}))).toBe(true);
    expect(canPreviewPromotion(promotion({minimumClientCapabilities:['FUTURE' as never]}))).toBe(false);
  });
  it('retains each SKU, beneficiary, asset and precise source amount without recomputing rewards',()=>{
    const activity=promotion({rewardRules:[
      {ruleId:'A-rule',productNo:'A',minBuyQty:2,repeatMode:'PER_GROUP',maxGroups:{mode:'UNLIMITED'},maxGroupsPerPerson:{mode:'UNLIMITED'},buyerReward:device,inviterReward:nex},
      {ruleId:'D-rule',productNo:'D',minBuyQty:1,repeatMode:'ONCE_PER_ORDER',maxGroups:{mode:'UNLIMITED'},maxGroupsPerPerson:{mode:'UNLIMITED'},buyerReward:usdt,inviterReward:null},
    ]});
    expect(productRewardSpecs(activity,'A')).toEqual([device,nex]);
    expect(productRewardSpecs(activity,'D')).toEqual([usdt]);
    expect(productRewardSpecs(activity,'B')).toEqual([]);
    expect(promotionDisclosures(activity,'A')).toEqual([disclosure,disclosure]);
  });
});
describe('selection and original checkout routing',()=>{
  it('preserves edited and emptied drafts on the same deep-link reload',()=>{
    const initial=[{productNo:'A',quantity:1}];
    expect(restoreEntrySelection(initial,{entryItems:initial,items:[{productNo:'A',quantity:2}]})).toEqual([{productNo:'A',quantity:2}]);
    expect(restoreEntrySelection(initial,{entryItems:initial,items:[]})).toEqual([]);
  });
  it('honors a new explicit selection and cannot inherit an invalid or other-account draft',()=>{
    const initial=[{productNo:'D',quantity:3}];
    expect(restoreEntrySelection(initial,{entryItems:[{productNo:'A',quantity:1}],items:[{productNo:'A',quantity:2}]})).toEqual(initial);
    expect(restoreEntrySelection(initial,null)).toEqual(initial);
    expect(restoreEntrySelection(initial,{entryItems:initial,items:[{productNo:'D',quantity:101}]})).toEqual(initial);
    expect(restoreEntrySelection(initial,{entryItems:initial,items:[null]} as never)).toEqual(initial);
  });
  it('allows 8 distinct models and 100 units while keeping the bundle minimum separate',()=>{
    const items=Array.from({length:8},(_,index)=>({productNo:String(index),quantity:index===0?93:1}));
    expect(validEntryItems(items,2)).toBe(true);
    expect(validEntryItems([...items,{productNo:'9',quantity:1}])).toBe(false);
    expect(validEntryItems([{productNo:'A',quantity:100}])).toBe(true);
    expect(validEntryItems([{productNo:'A',quantity:100}],2)).toBe(false);
  });
  it.each([0,-1,1.5,101,NaN,Infinity])('rejects invalid quantity %s',quantity=>{
    expect(validEntryItems([{productNo:'A',quantity}])).toBe(false);
  });
  it('rejects duplicate SKUs and total overflow rather than silently dropping items',()=>{
    expect(validEntryItems([{productNo:'A',quantity:1},{productNo:'A',quantity:1}])).toBe(false);
    expect(validEntryItems([{productNo:'A',quantity:100},{productNo:'B',quantity:1}])).toBe(false);
    expect(parseEntryItems('[{"productNo":"A","quantity":"2"}]')).toBe(null);
    expect(parseEntryItems('[null]')).toBe(null);
    expect(parseEntryItems('bad')).toBe(null);
  });
  it('preserves quantities and activity through percent-encoded original routes',()=>{
    const items=[{productNo:'A & B',quantity:3},{productNo:'D/?',quantity:2}];
    const checkout=promotionCheckoutHref(items,'promo?&=#');
    expect(checkout.startsWith('/pages/store/checkout?')).toBe(true);
    const query=new URLSearchParams(checkout.split('?')[1]);
    expect(query.get('activityId')).toBe('promo?&=#');
    expect(parseEntryItems(query.get('items'))).toEqual(items);
    expect(promotionDetailHref('A/B','promo &1')).toBe('/pages/store/detail?id=A%2FB&activityId=promo%20%261');
    expect(promotionStoreHref()).toBe('/pages/store/store?scope=all');
    expect(promotionBundleHref('P',items)).toContain('activityId=P&items=');
  });
});
describe('late reads',()=>{
  it('expires estimates at the server TTL independent of the browser date',()=>{
    expect(isEntryQuoteFresh('2000-01-01T00:01:00Z','2000-01-01T00:00:00Z',59999)).toBe(true);
    expect(isEntryQuoteFresh('2000-01-01T00:01:00Z','2000-01-01T00:00:00Z',60000)).toBe(false);
    expect(isEntryQuoteFresh('invalid','2000-01-01T00:00:00Z',0)).toBe(false);
  });
  it('rejects pre-switch, hidden and older refresh responses',()=>{
    const fence=createPromotionReadFence();
    const first=fence.next();
    const refreshed=fence.next();
    expect(fence.current(first)).toBe(false);
    expect(fence.current(refreshed)).toBe(true);
    fence.invalidate();
    expect(fence.current(refreshed)).toBe(false);
    expect(fence.current(fence.next())).toBe(true);
  });
});
