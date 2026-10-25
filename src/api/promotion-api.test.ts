import {describe,expect,it,vi} from 'vitest';
import {createPromotionApi,validatePromotionItems,PROMOTION_CAPABILITIES} from './promotion-api';
import type{ApiClient}from'./api-client';
import type{PublicPromotion,Quote,RewardDisclosure}from'./promotion-contracts';
const text={zh:'活动条款',en:'Promotion terms',vi:'Điều khoản chương trình'};
const disclosure:RewardDisclosure={title:text,terms:text,refundTerms:text,benefitDescription:text,deviceRights:null,deviceName:null};
const spec={rewardRuleId:'r1',beneficiaryRole:'BUYER' as const,type:'USDT' as const,calculation:'FIXED' as const,amount:'0.000001',assetPolicy:{policyId:'p1',version:1,contentHash:'hash'}};
const quote:Quote={quoteId:'quote-1',quoteHash:'hash',expiresAt:'2026-10-09T00:00:00Z',serverTime:'2026-10-08T00:00:00Z',itemCount:1,quantity:3,items:[{lineId:'l1',productNo:'sku-a',quantity:3,unitPriceUsdt:'0.000001',subtotalUsdt:'0.000003',discountUsdt:'0.000000',payableUsdt:'0.000003'}],subtotalUsdt:'0.000003',discountUsdt:'0.000000',amountUsdt:'0.000003',bundlePolicyVersion:1,activityId:'a1',activityVersion:1,eligibility:'ELIGIBLE',expectedRewards:[{lineId:'l1',activityId:'a1',version:1,ruleId:'rule',rewardRuleId:'r1',beneficiaryRole:'BUYER',groups:3,reward:spec,eligibility:'ELIGIBLE',message:null,disclosure}],warnings:[],reserved:false};
const receipt={orderNo:'o1',paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',promotionQuoteId:'quote-1',quantity:3,payBy:'2026-10-09T00:00:00Z',rewards:quote.expectedRewards,amountUsdt:'0.000003',items:[{lineId:'l1',productNo:'sku-a',productName:'Frozen Alpha',quantity:3}]};
function setup(){const request=vi.fn();return{request,api:createPromotionApi({request}as unknown as ApiClient)};}
const activity:PublicPromotion={activityId:'a1',version:2,template:'SKU_GIFT',state:'ACTIVE',startsAt:'2026-10-07T00:00:00Z',endsAt:'2026-10-30T00:00:00Z',serverTime:'2026-10-08T00:00:00Z',title:text,terms:text,placement:'home.purchase-promotion',target:'STORE',productNos:['sku-a'],minimumClientCapabilities:PROMOTION_CAPABILITIES,eligibility:'ESTIMATE_ELIGIBLE',eligibilityMessage:null,rewardRules:[]};
describe('promotion transport',()=>{
  it('accepts buyer order discounts in public terms, exact quotes and immutable order receipts',async()=>{
    const{api,request}=setup();
    const discount={rewardRuleId:'discount',beneficiaryRole:'BUYER' as const,type:'DISCOUNT_USDT' as const,calculation:'FIXED' as const,amount:'500.000000'};
    const expected={...quote.expectedRewards[0],rewardRuleId:'discount',groups:1,reward:discount};
    const discounted={...quote,promotionDiscountUsdt:'500.000000',subtotalUsdt:'1299.000000',discountUsdt:'500.000000',amountUsdt:'799.000000',items:[{...quote.items[0],promotionDiscountUsdt:'500.000000',unitPriceUsdt:'433.000000',subtotalUsdt:'1299.000000',discountUsdt:'500.000000',payableUsdt:'799.000000'}],expectedRewards:[expected]};
    const rule={ruleId:'rule',productNo:'sku-a',minBuyQty:3,repeatMode:'ONCE_PER_ORDER',maxGroups:{mode:'UNLIMITED'},maxGroupsPerPerson:{mode:'UNLIMITED'},buyerReward:{...discount,disclosure},inviterReward:null};
    request.mockResolvedValue({...activity,rewardRules:[rule]});expect((await api.get('a1')).rewardRules[0].buyerReward.type).toBe('DISCOUNT_USDT');
    request.mockResolvedValue({...activity,rewardRules:[{...rule,inviterReward:rule.buyerReward}]});await expect(api.get('a1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
    request.mockResolvedValue(discounted);expect(await api.quote([{productNo:'sku-a',quantity:3}],'a1')).toEqual(discounted);
    request.mockResolvedValue({...receipt,amountUsdt:'799.000000',rewards:[expected]});expect((await api.create(discounted,'discount-order')).rewards?.[0].reward).toEqual(discount);
    for(const reward of [{...discount,beneficiaryRole:'DIRECT_INVITER'},{...discount,calculation:'PERCENT'},{...discount,assetPolicy:spec.assetPolicy},{...discount,amount:'0.000000'}]){
      request.mockResolvedValue({...discounted,expectedRewards:[{...expected,reward}]});await expect(api.quote([{productNo:'sku-a',quantity:3}],'a1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
    }
    request.mockResolvedValue({...discounted,expectedRewards:[{...expected,beneficiaryRole:'DIRECT_INVITER'}]});await expect(api.quote([{productNo:'sku-a',quantity:3}],'a1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
    for(const fields of [{promotionDiscountUsdt:500},{items:[{...discounted.items[0],promotionDiscountUsdt:'-500'}]}]){
      request.mockResolvedValue({...discounted,...fields});await expect(api.quote([{productNo:'sku-a',quantity:3}],'a1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
    }
  });
  it('does not accept an order discount as a wallet reward obligation',async()=>{
    const{api,request}=setup();
    request.mockResolvedValue({items:[{obligationId:'invalid-discount',orderNo:'o1',activityId:'a1',orderLineId:'l1',updatedAt:'2026-10-25T00:00:00Z',reward:{rewardRuleId:'discount',beneficiaryRole:'BUYER',type:'DISCOUNT_USDT',calculation:'FIXED',amount:'500'},disclosure}],nextCursor:null,hasMore:false});
    await expect(api.rewards()).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
  });
  it('accepts only the current activity and version banner path without arbitrary URLs',async()=>{
    const{api,request}=setup();
    for(const bannerImageUrl of [undefined,null,'/api/promotions/a1/banner/2']){
      request.mockResolvedValue({...activity,bannerImageUrl});expect((await api.get('a1')).bannerImageUrl).toBe(bannerImageUrl);
    }
    for(const bannerImageUrl of ['https://foreign.example/api/promotions/a1/banner/2','//foreign.example/api/promotions/a1/banner/2','/api/promotions/other/banner/2','/api/promotions/a1/banner/1','/api/admin/media/image','/api/promotions/a1/banner/2?asset=secret','/api/promotions/a1/banner/2#anchor','/api/promotions/a1/banner/02','/api/promotions/a1/banner/2/../2',5]){
      request.mockResolvedValue({...activity,bannerImageUrl});await expect(api.get('a1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
    }
    request.mockResolvedValue({...activity,state:'PAUSED',bannerImageUrl:'/api/promotions/a1/banner/2'});await expect(api.get('a1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
  });
  it('requires frozen display names on promoted receipt lines and device disclosures',async()=>{
    const{api,request}=setup();request.mockResolvedValue({...receipt,items:[{lineId:'l1',productNo:'sku-a',quantity:3}]});await expect(api.findOrder('o1')).rejects.toThrow();
    request.mockResolvedValue({orders:[{...receipt,items:[{lineId:'l1',productNo:'sku-a',quantity:3}]}],nextCursor:null});await expect(api.findOrder('o1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
    request.mockResolvedValue({...quote,expectedRewards:[{...quote.expectedRewards[0],reward:{rewardRuleId:'r1',type:'DEVICE',giftProductNo:'hidden',quantity:1,beneficiaryRole:'BUYER'},disclosure:{...disclosure,deviceName:null}}]});await expect(api.quote([{productNo:'sku-a',quantity:3}],'a1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');
  });
  it('quote requests carry distinct keys while order mutation keys stay caller-owned',async()=>{const{api,request}=setup();request.mockResolvedValue(quote);await api.quote([{productNo:'sku-a',quantity:3}],'a1');await api.quote([{productNo:'sku-a',quantity:3}],'a1');const keys=request.mock.calls.map(([r])=>r.idempotencyKey);expect(keys.every(k=>typeof k==='string'&&k.startsWith('promotion-quote-'))).toBe(true);expect(new Set(keys).size).toBe(2);});
  it('keeps exact money and quantity items, and declares all three capabilities',async()=>{const{api,request}=setup();request.mockResolvedValue(quote);expect((await api.quote([{productNo:'sku-a',quantity:3}],'a1')).amountUsdt).toBe('0.000003');expect(request.mock.calls[0][0].body).toEqual({items:[{productNo:'sku-a',quantity:3}],activityId:'a1',voucherId:null,clientCapabilities:PROMOTION_CAPABILITIES});});
  it('never expands quantity into repeated SKUs; accepts 8 distinct/100 units and rejects duplicates or overflow',()=>{expect(()=>validatePromotionItems(Array.from({length:8},(_,i)=>({productNo:'sku-'+i,quantity:i===0?93:1})))).not.toThrow();for(const items of [[{productNo:'x',quantity:1},{productNo:'x',quantity:1}],[{productNo:'x',quantity:101}],Array.from({length:9},(_,i)=>({productNo:String(i),quantity:1}))])expect(()=>validatePromotionItems(items)).toThrow();});
  it('bundle submits the exact same quote and string expected price through the original API',async()=>{const{api,request}=setup();request.mockResolvedValue(receipt);const bundle={...quote,items:[...quote.items,{...quote.items[0],lineId:'l2',productNo:'sku-b',quantity:1}]};await api.create(bundle,'original-key');expect(request).toHaveBeenCalledWith(expect.objectContaining({path:'/api/orders/bundle',idempotencyKey:'original-key',body:{items:[{productNo:'sku-a',quantity:3},{productNo:'sku-b',quantity:1}],policyVersion:1,expectedAmountUsdt:'0.000003',promotionQuoteId:'quote-1'}}));});
  it('rejects numerical money and incomplete immutable terms before any confirmation',async()=>{const{api,request}=setup();request.mockResolvedValue({...quote,amountUsdt:0.000003});await expect(api.quote([{productNo:'x',quantity:1}],'a1')).rejects.toThrow('PROMOTION_RESPONSE_INVALID');request.mockResolvedValue({...quote,expectedRewards:[{...quote.expectedRewards[0],disclosure:null}]});await expect(api.quote([{productNo:'x',quantity:1}],'a1')).rejects.toThrow();});
  it('recovery scans canonical order pages and never posts; rejects cursor cycles',async()=>{const{api,request}=setup();request.mockResolvedValueOnce({orders:[],nextCursor:'older'}).mockResolvedValueOnce({orders:[receipt],nextCursor:null});expect((await api.findOrder('o1'))?.orderNo).toBe('o1');expect(request.mock.calls.every(([r])=>!r.method)).toBe(true);request.mockResolvedValue({orders:[],nextCursor:'loop'});await expect(api.findOrder('absent')).rejects.toThrow();});
  it('a mismatched command target cannot supply another checkout receipt',async()=>{const{api,request}=setup();request.mockResolvedValue({idempotencyKey:'k',operation:'payOrder',targetId:'other',status:'SUCCEEDED',order:receipt});await expect(api.command('k','payOrder','o1')).rejects.toThrow();});
});

it('an explicit event voucher disables automatic promotion selection while preserving the server amount',async()=>{
  const {api,request}=setup();request.mockResolvedValue(quote);
  await api.quote([{productNo:'sku-a',quantity:3}],null,'BF20',false);
  expect(request.mock.calls[0][0].body).toEqual({items:[{productNo:'sku-a',quantity:3}],activityId:null,voucherId:'BF20',autoSelectPromotion:false,clientCapabilities:PROMOTION_CAPABILITIES});
});
