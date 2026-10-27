// Loopback-only lifecycle fixture. Never imported by src or an App build.
import { fixture } from './design-review-fixture.mjs';
const day=86400000,proof={sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true};
const refuse=message=>{const error=new Error(message);error.status=409;throw error;};
export function trialDemo(url,locale,state,request){
  if(!url.pathname.startsWith('/api/trial/'))return undefined;
  const now=Date.now(),mode=state.trialState||'follow';
  const data=structuredClone(fixture(new URL('/api/trial/state',url.origin),locale,{offers:true},request));
  if(mode==='read-error')refuse('TRIAL_STATE_UNAVAILABLE');
  const cfg=data.config,duration=Number(cfg.trialDays)*day,grace=Number(cfg.graceDays)*day;
  // FEAT-TRIAL05 mirror of the Java quote: inside the original term the full claimed term is
  // settled and a fixed discount comes off what is left to pay; 0 switches the rule off.
  cfg.earlyPurchaseDiscountUSD??=String(state.trialEarlyDiscount??'10');
  const round=value=>Number(Number(value).toFixed(2));
  const scenario=mode==='follow'?(state.benefitState==='finished'?'converted':state.benefitState==='grace'?'grace':state.benefitState==='claimed'?'active':'available'):mode;
  if(!state.trialRow){
    const startedAt=now-(scenario==='final-day'?duration-day/2:scenario==='grace'?duration+day:scenario==='ended'?duration+grace+day:day);
    state.trialRow={state:['active','final-day'].includes(scenario)?'ACTIVE':scenario==='grace'?'GRACE':['ended','eligible-again'].includes(scenario)?'FAILED':scenario==='converted'?'REDEEMED':'ELIGIBLE',startedAt};
  }
  const row=state.trialRow;
  const snapshot=()=>{
    if(row.state==='ACTIVE'&&now>=row.startedAt+duration)row.state='GRACE';
    if(row.state==='GRACE'&&now>=row.startedAt+duration+grace)row.state='FAILED';
    const claimed=row.state!=='ELIGIBLE',live=['ACTIVE','GRACE'].includes(row.state);
    const elapsed=Math.min(duration,Math.max(0,now-row.startedAt))/day;
    const shadow=claimed?Number((elapsed*Number(cfg.shadowDailyUSD)).toFixed(2)):0,offset=live?Math.min(shadow,Number(cfg.trialOffsetCapUSD)):0;
    const canStart=!claimed||(mode==='eligible-again'&&row.state==='FAILED');
    const quote=live?(()=>{
      const nex=claimed?Number((elapsed*Number(cfg.shadowDailyNEX)).toFixed(2)):0,discount=Number(cfg.earlyPurchaseDiscountUSD);
      const early=row.state==='ACTIVE'&&now<row.startedAt+duration&&discount>0,price=Number(cfg.trialPriceUSD);
      const settledUsdt=early?round(Number(cfg.trialDays)*Number(cfg.shadowDailyUSD)):shadow,rewardNex=early?round(Number(cfg.trialDays)*Number(cfg.shadowDailyNEX)):nex;
      const offsetUsdt=Math.min(settledUsdt,Number(cfg.trialOffsetCapUSD)),promo=round(Math.min(price*Number(cfg.discountRate),Number(cfg.discountCapUSD)));
      const base=round(Math.max(0,price-Math.min(price,promo+offsetUsdt))),earlyDiscountUsdt=early?Math.min(discount,base):0;
      return {settlementPolicy:early?'FULL_TERM_ON_CONVERSION':'ACCRUED_ON_CONVERSION',quoteVersion:early?'FULL_TERM_ON_CONVERSION:demo'+row.startedAt:'ACCRUED_ON_CONVERSION',
        earlyPurchase:early,priceUsdt:price,accruedUsdt:shadow,accruedNex:nex,settledUsdt,rewardNex,earlyRewardUsdt:round(settledUsdt-shadow),earlyRewardNex:round(rewardNex-nex),
        offsetUsdt,remainderUsdt:round(settledUsdt-offsetUsdt),promoDiscountUsdt:promo,earlyDiscountConfiguredUsdt:discount,earlyDiscountUsdt,
        discountUsdt:round(price-base+earlyDiscountUsdt),amountUsdt:round(base-earlyDiscountUsdt),earlyEndsAtEpochMs:early?row.startedAt+duration:null};
    })():undefined;
    return {...data,state:row.state,canStart,eligibilityReason:!canStart?(row.state==='REDEEMED'?'converted':live?'in-progress':'used'):undefined,
      claimNo:claimed?'DEMO-TRIAL':null,version:row.version||1,serverNowEpochMs:now,
      claimedAtEpochMs:claimed?row.startedAt:null,expiresAtEpochMs:claimed?row.startedAt+duration:null,graceEndsAtEpochMs:claimed?row.startedAt+duration+grace:null,
      finishedAtEpochMs:['FAILED','CANCELLED','REDEEMED'].includes(row.state)?row.finishedAt||row.startedAt+duration+grace:null,
      shadowUsdt:shadow,shadowNex:claimed?Number((elapsed*Number(cfg.shadowDailyNEX)).toFixed(2)):0,
      offsetUsdt:offset,remainderUsdt:live?Number((shadow-offset).toFixed(2)):0,priceUsdt:Number(cfg.trialPriceUSD),...(quote?{quote}:{})};
  };
  const key=request.headers?.()['idempotency-key']||request.headers?.()['Idempotency-Key'];
  if(request.method()==='POST'&&key&&state.trialCommands?.[key])return structuredClone(state.trialCommands[key]);
  const remember=value=>{if(key){state.trialCommands??={};state.trialCommands[key]=structuredClone(value);}return value;};
  if(url.pathname==='/api/trial/start'){
    if(mode==='claim-error'&&!state.trialStartFailed){state.trialStartFailed=true;refuse('TRIAL_SERVICE_UNAVAILABLE');}
    if(mode==='capacity-full')refuse('TRIAL_CAPACITY_FULL');
    if(snapshot().canStart)Object.assign(row,{state:'ACTIVE',startedAt:now,version:(row.version||1)+1});
    return remember(snapshot());
  }
  if(url.pathname==='/api/trial/cancel'){
    if(row.state!=='ACTIVE')refuse('TRIAL_NOT_CANCELLABLE');
    Object.assign(row,{state:'CANCELLED',finishedAt:now,version:(row.version||1)+1});return remember(snapshot());
  }
  if(url.pathname==='/api/trial/convert'){
    const current=snapshot(),body=request.postDataJSON();
    if(!['ACTIVE','GRACE'].includes(row.state))refuse('TRIAL_NOT_CONVERTIBLE');
    const quote=current.quote,amount=quote.amountUsdt;
    if(body.productNo!==cfg.trialProductId)refuse('TRIAL_PRODUCT_NOT_ELIGIBLE');
    if(body.expectedAmountUsdt!==null&&body.expectedAmountUsdt<amount)refuse('TRIAL_AMOUNT_MISMATCH');
    if(body.quoteVersion&&body.quoteVersion!==quote.quoteVersion)refuse('TRIAL_QUOTE_CHANGED');
    if((state.walletBalance??52800.64)<amount)refuse('TRIAL_WALLET_INSUFFICIENT');
    const orderNo='TRC-DEMO'+now;
    state.walletBalance=(state.walletBalance??52800.64)-amount+quote.remainderUsdt;
    state.createdOrders??=[];state.createdOrders.unshift({orderNo,productId:1,productNo:cfg.trialProductId,productName:cfg.trialProductName,quantity:1,unitPriceUsdt:current.priceUsdt,subtotalUsdt:current.priceUsdt,discountUsdt:current.priceUsdt-amount,amountUsdt:amount,paymentStatus:'PAID',orderStatus:'COMPLETED',activationStatus:'ACTIVATED',canonicalStatus:'activated',paymentMethod:'WALLET',placedAt:now,paidAt:now,activatedAt:now,orderType:'SINGLE',itemCount:1,lineItems:[{sku:cfg.trialProductId,name:cfg.trialProductName,quantity:1,unitPriceUsdt:current.priceUsdt,lineAmountUsdt:current.priceUsdt}]});
    Object.assign(row,{state:'REDEEMED',finishedAt:now,version:(row.version||1)+1});
    const source='nx_trial_claim + nx_order + nx_order_item';
    return remember({...proof,orderNo,productNo:cfg.trialProductId,amountUsdt:amount,discountUsdt:current.priceUsdt-amount,paymentStatus:'PAID',orderStatus:'PAID',
      settlementPolicy:quote.settlementPolicy,earlyPurchase:quote.earlyPurchase,remainderUsdt:quote.remainderUsdt,rewardNex:quote.rewardNex,
      earlyRewardUsdt:quote.earlyRewardUsdt,earlyRewardNex:quote.earlyRewardNex,earlyDiscountUsdt:quote.earlyDiscountUsdt,source,provenance:{...proof,source}});
  }
  if(['/api/trial/state','/api/trial/eligibility'].includes(url.pathname)){
    const result=snapshot();if(mode==='capacity-full'&&row.state==='ELIGIBLE')Object.assign(result,{canStart:false,eligibilityReason:'capacity-full'});return result;
  }
}
