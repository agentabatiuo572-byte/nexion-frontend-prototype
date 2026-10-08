import type { ApiClient } from './api-client';
import { ApiError } from './errors';
import type { PublicPromotion, PublicPromotionPage, Quote, QuoteInput, Reward, RewardPage, ReferralProgress, OrderReceipt, CommandReceipt } from './promotion-contracts';
export type { PublicPromotion, Quote, Reward, ExpectedReward, PublicRewardSpec, RewardSpec, RewardState, OrderReceipt } from './promotion-contracts';
export const PROMOTION_CAPABILITIES: QuoteInput['clientCapabilities']=['PROMOTION_QUOTE_V1','ORDER_ITEM_QUANTITIES_V1','PROMOTION_REWARDS_V1'];
export type PromotionItem = { productNo:string; quantity:number };
export type PromotionOperation='createOrder'|'createBundle'|'payOrder'|'cancelOrder';
let quoteSequence=0;
// IDEMPOTENCY-FRESH-OK: Each explicit quote read is a new estimate without reservation; transport retries retain this request's key.
function quoteRequestKey():string{return 'promotion-quote-'+(globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${++quoteSequence}-${Math.random().toString(36).slice(2)}`);}
function invalid():never {throw new ApiError({kind:'protocol',message:'PROMOTION_RESPONSE_INVALID'});}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return invalid();return value as Record<string,unknown>;}
function string(value:unknown):string{if(typeof value!=='string'||!value.trim())return invalid();return value;}
function time(value:unknown):string{const v=string(value);if(!Number.isFinite(Date.parse(v)))return invalid();return v;}
function array(value:unknown):unknown[]{if(!Array.isArray(value))return invalid();return value;}
function amount(value:unknown):string{if(typeof value!=='string'||!/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(value))return invalid();return value;}
function quantity(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>100)return invalid();return value;}
function localizedText(value:unknown):void{const text=object(value);['zh','en','vi'].forEach(language=>string(text[language]));}
function positiveInteger(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)return invalid();return value;}
function disclosure(value:unknown,device:boolean):void {const d=object(value);if(device)string(d.deviceName);else if(d.deviceName!==null)return invalid();for(const key of ['title','terms','refundTerms','benefitDescription']){const l=object(d[key]);['zh','en','vi'].forEach(language=>string(l[language]));}if(d.deviceRights!==null){const rights=object(d.deviceRights);for(const key of ['taskEnabled','countsAsDeviceHolding','countsForRank','transferable','exchangeable'])if(typeof rights[key]!=='boolean')return invalid();if(!['AUTO','MANUAL'].includes(string(rights.activationMode))||!['ISSUED','ACTIVATED'].includes(string(rights.effectiveOn))||!['REVOKE_IF_UNUSED','MANUAL_IF_USED'].includes(string(rights.revocationMode)))return invalid();if(rights.durationDays!==null&&(typeof rights.durationDays!=='number'||!Number.isSafeInteger(rights.durationDays)||rights.durationDays<1))return invalid();}}
function expected(value:unknown):void{const r=object(value);string(r.lineId);quantity(r.groups);rewardSpec(r.reward);disclosure(r.disclosure,object(r.reward).type==='DEVICE');if(!['ELIGIBLE','INELIGIBLE','UNKNOWN'].includes(string(r.eligibility)))return invalid();}
export function validatePromotionItems(items:readonly PromotionItem[]):void{if(items.length<1||items.length>8||new Set(items.map(i=>i.productNo)).size!==items.length||items.reduce((sum,item)=>sum+quantity(item.quantity),0)>100)return invalid();items.forEach(i=>string(i.productNo));}
function rewardSpec(value:unknown):void{const r=object(value);string(r.rewardRuleId);if(!['BUYER','DIRECT_INVITER'].includes(string(r.beneficiaryRole)))return invalid();if(r.type==='DEVICE'){string(r.giftProductNo);quantity(r.quantity);}else{if(!['USDT','NEX'].includes(string(r.type)))return invalid();amount(r.amount);}}
function promotion(value:unknown):PublicPromotion{const p=object(value);string(p.activityId);if(typeof p.version!=='number'||!Number.isSafeInteger(p.version)||p.version<1)return invalid();if(!['SKU_GIFT','FIRST_PURCHASE','DIRECT_REFERRAL','MULTI_PRODUCT','REPURCHASE'].includes(string(p.template))||!['DRAFT','SCHEDULED','ACTIVE','PAUSED','ENDED','ARCHIVED'].includes(string(p.state))||!['SIGN_IN_REQUIRED','ESTIMATE_ELIGIBLE','INELIGIBLE','UNKNOWN'].includes(string(p.eligibility)))return invalid();array(p.minimumClientCapabilities).forEach(c=>{if(!PROMOTION_CAPABILITIES.includes(c as typeof PROMOTION_CAPABILITIES[number]))return invalid();});time(p.serverTime);time(p.startsAt);time(p.endsAt);for(const key of ['title','terms']){const l=object(p[key]);['zh','en','vi'].forEach(lang=>string(l[lang]));}array(p.productNos).forEach(string);array(p.rewardRules).forEach(v=>{const r=object(v);string(r.ruleId);string(r.productNo);quantity(r.minBuyQty);if(!['PER_GROUP','ONCE_PER_ORDER'].includes(string(r.repeatMode)))return invalid();for(const key of ['maxGroups','maxGroupsPerPerson']){const limit=object(r[key]);if(limit.mode!=='UNLIMITED'&&(limit.mode!=='LIMITED'||typeof limit.value!=='number'||!Number.isSafeInteger(limit.value)||limit.value<1))return invalid();}rewardSpec(r.buyerReward);disclosure(object(r.buyerReward).disclosure,object(r.buyerReward).type==='DEVICE');if(r.inviterReward){rewardSpec(r.inviterReward);disclosure(object(r.inviterReward).disclosure,object(r.inviterReward).type==='DEVICE');}});return p as PublicPromotion;}
function quote(value:unknown):Quote{
  const p=object(value);string(p.quoteId);string(p.quoteHash);time(p.serverTime);time(p.expiresAt);
  ['subtotalUsdt','discountUsdt','amountUsdt'].forEach(k=>amount(p[k]));
  if(p.reserved!==false||!['ELIGIBLE','INELIGIBLE','UNKNOWN'].includes(string(p.eligibility)))return invalid();
  const lines=array(p.items).map(v=>{const r=object(v);string(r.lineId);['unitPriceUsdt','subtotalUsdt','discountUsdt','payableUsdt'].forEach(k=>amount(r[k]));return {lineId:string(r.lineId),productNo:string(r.productNo),quantity:quantity(r.quantity)};});
  validatePromotionItems(lines);
  if(p.itemCount!==lines.length||p.quantity!==lines.reduce((sum,line)=>sum+line.quantity,0)||new Set(lines.map(line=>line.lineId)).size!==lines.length)return invalid();
  positiveInteger(p.bundlePolicyVersion);if(p.activityId!==null)string(p.activityId);if(p.activityVersion!==null)positiveInteger(p.activityVersion);
  array(p.warnings).forEach(localizedText);array(p.expectedRewards).forEach(v=>{expected(v);if(!lines.some(line=>line.lineId===object(v).lineId))return invalid();});return p as Quote;
}
function reward(value:unknown):Reward{
  const r=object(value);string(r.obligationId);string(r.orderNo);string(r.activityId);string(r.orderLineId);time(r.updatedAt);rewardSpec(r.reward);disclosure(r.disclosure,object(r.reward).type==='DEVICE');
  if(typeof r.refundHold!=='boolean'||!['BUYER','DIRECT_INVITER'].includes(string(r.beneficiaryRole))||!['PENDING','READY','PROCESSING','ISSUED','RETRYABLE_FAILED','OUTCOME_UNKNOWN','CANCELLED','REVERSAL_PENDING','REVERSED','MANUAL_REVIEW'].includes(string(r.state)))return invalid();
  array(r.refundRequestIds).forEach(string);
  if(r.assetReceipt!==null){const receipt=object(r.assetReceipt);array(receipt.deviceIds).forEach(positiveInteger);array(receipt.instanceNos).forEach(string);if(!['PROMOTION_GIFT','PROMOTION_REWARD'].includes(string(receipt.source)))return invalid();if(receipt.issuedAt!==null)time(receipt.issuedAt);for(const key of ['ledgerBizNo','earningsEntryNo'])if(receipt[key]!==null)string(receipt[key]);}
  return r as Reward;
}
export function parsePromotedOrder(value:unknown):OrderReceipt{
  const r=object(value);string(r.orderNo);
  // Legacy non-promotion receipts retain their existing transport shape.
  if(r.promotionQuoteId){
    string(r.promotionQuoteId);time(r.payBy);quantity(r.quantity);amount(r.amountUsdt);
    const items=array(r.items).map(value=>{const item=object(value);return {lineId:string(item.lineId),productNo:string(item.productNo),productName:string(item.productName),quantity:quantity(item.quantity)};});
    validatePromotionItems(items);if(new Set(items.map(item=>item.lineId)).size!==items.length||r.quantity!==items.reduce((sum,item)=>sum+item.quantity,0))return invalid();
    array(r.rewards).forEach(value=>{expected(value);if(!items.some(item=>item.lineId===object(value).lineId))return invalid();});
    if(!['PENDING','PAID','CANCELLED','EXPIRED','REFUNDED'].includes(string(r.paymentStatus))||!['PENDING_PAYMENT','COMPLETED','CANCELLED','EXPIRED','REFUNDED'].includes(string(r.orderStatus)))return invalid();
  }
  else {string(r.paymentStatus);string(r.orderStatus);}
  return r as OrderReceipt;
}
function page<T>(value:unknown,parse:(value:unknown)=>T):{items:T[];nextCursor:string|null;hasMore:boolean}{const p=object(value);if(typeof p.hasMore!=='boolean'||(p.nextCursor!==null&&typeof p.nextCursor!=='string'))return invalid();return {items:array(p.items).map(parse),nextCursor:p.nextCursor as string|null,hasMore:p.hasMore};}
function query(fields:Record<string,unknown>):string{return Object.entries(fields).filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');}
export function createPromotionApi(client:ApiClient){return {
  async list(filters:{cursor?:string|null;limit?:number;activityId?:string;placement?:'home.purchase-promotion'}={},authenticated=false):Promise<PublicPromotionPage>{return page(await client.request({path:'/api/promotions?'+query(filters),authenticated}),promotion);},
  async get(activityId:string,authenticated=false):Promise<PublicPromotion>{return promotion(await client.request({path:'/api/promotions/'+encodeURIComponent(activityId),authenticated}));},
  async quote(items:PromotionItem[],activityId:string|null,voucherId:string|null=null):Promise<Quote>{validatePromotionItems(items);return quote(await client.request({method:'POST',path:'/api/orders/quote',idempotencyKey:quoteRequestKey(),body:{items,activityId,voucherId,clientCapabilities:PROMOTION_CAPABILITIES}}));},
  async create(quote:Quote,key:string,voucherId:string|null=null):Promise<OrderReceipt>{const items=quote.items.map(({productNo,quantity})=>({productNo,quantity}));validatePromotionItems(items);const bundle=items.length>1;return parsePromotedOrder(await client.request({method:'POST',path:bundle?'/api/orders/bundle':'/api/orders',idempotencyKey:key,body:bundle?{items,policyVersion:quote.bundlePolicyVersion,expectedAmountUsdt:quote.amountUsdt,promotionQuoteId:quote.quoteId}:{...items[0],voucherId,promotionQuoteId:quote.quoteId}}));},
  async pay(orderNo:string,key:string):Promise<OrderReceipt>{return parsePromotedOrder(await client.request({method:'POST',path:'/api/orders/'+encodeURIComponent(orderNo)+'/pay',idempotencyKey:key}));},
  async cancel(orderNo:string,key:string):Promise<OrderReceipt>{return parsePromotedOrder(await client.request({method:'POST',path:'/api/orders/'+encodeURIComponent(orderNo)+'/cancel',idempotencyKey:key}));},
  async findOrder(orderNo:string):Promise<OrderReceipt|null>{let cursor:string|null=null;const seen=new Set<string>();do{const p=object(await client.request({path:'/api/orders?'+query({beforeOrderNo:cursor,pageSize:100})}));const found=array(p.orders).find(v=>object(v).orderNo===orderNo);if(found)return parsePromotedOrder(found);cursor=typeof p.nextCursor==='string'?p.nextCursor:null;if(cursor&&seen.has(cursor))return invalid();if(cursor)seen.add(cursor);}while(cursor);return null;},
  async command(key:string,operation:PromotionOperation,targetId:string):Promise<CommandReceipt>{const r=object(await client.request({path:'/api/promotion-commands/'+encodeURIComponent(key)+'?'+query({operation,targetId})}));if(r.operation!==operation||r.targetId!==targetId||r.idempotencyKey!==key||!['PROCESSING','SUCCEEDED','FAILED','OUTCOME_UNKNOWN','NOT_FOUND'].includes(string(r.status)))return invalid();if(r.order!==null)parsePromotedOrder(r.order);return r as CommandReceipt;},
  async rewards(filters:{cursor?:string|null;limit?:number;activityId?:string;state?:string;orderNo?:string}={}):Promise<RewardPage>{return page(await client.request({path:'/api/promotion-rewards?'+query(filters)}),reward);},
  async reward(id:string):Promise<Reward>{return reward(await client.request({path:'/api/promotion-rewards/'+encodeURIComponent(id)}));},
  async referral(activityId:string):Promise<ReferralProgress>{const p=object(await client.request({path:'/api/promotions/'+encodeURIComponent(activityId)+'/referral-progress'}));if(p.activityId!==activityId||typeof p.qualifyingOrders!=='number'||!Number.isSafeInteger(p.qualifyingOrders)||p.qualifyingOrders<0)return invalid();time(p.serverTime);array(p.ownRewards).forEach(reward);return p as ReferralProgress;},
};}
export type PromotionApi=ReturnType<typeof createPromotionApi>;
