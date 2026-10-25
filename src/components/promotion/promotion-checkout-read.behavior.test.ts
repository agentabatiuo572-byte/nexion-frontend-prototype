import * as Vue from 'vue';
import { compileScript,parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach,expect,it,vi } from 'vitest';
import source from './promotion-checkout.vue?raw';
import { zh } from '@/i18n/messages/zh';
import { asApiError,ApiError } from '@/api/errors';
import { PromotionCheckoutSession,selectPromotionCheckoutRecord,type PromotionCheckoutRecord } from '@/lib/promotion-checkout-session';
import { projectServerNow } from '@/lib/server-deadline-clock';
import { displayDeadline,localized } from '@/lib/promotion-display';
import { formatAmount } from '@/lib/amount-display';
import { fmt } from '@/i18n/format';
import { validatePromotionItems } from '@/api/promotion-api';
import * as entry from '@/lib/promotion-entry';
import type { OrderReceipt,PublicPromotion,Quote } from '@/api/promotion-contracts';
import voucherOnlyFixture from './fixtures/black-friday-voucher-quote.json';

const serverTime='2026-10-08T00:00:00Z',text={zh:'原赠品条件',en:'Original gift terms',vi:'Điều khoản quà tặng'};
const quote=(quoteId='q1'):Quote=>({quoteId,quoteHash:'hash',serverTime,expiresAt:'2026-10-08T00:05:00Z',itemCount:1,quantity:1,items:[{lineId:'sku',productNo:'sku',quantity:1,unitPriceUsdt:'120',subtotalUsdt:'120',discountUsdt:'0',payableUsdt:'120'}],subtotalUsdt:'120',discountUsdt:'0',amountUsdt:'120',bundlePolicyVersion:1,activityId:'a1',activityVersion:1,eligibility:'ELIGIBLE',expectedRewards:[{lineId:'sku',activityId:'a1',version:1,ruleId:'rule',rewardRuleId:'gift',beneficiaryRole:'BUYER',groups:1,reward:{rewardRuleId:'gift',beneficiaryRole:'BUYER',type:'USDT',calculation:'FIXED',amount:'1',assetPolicy:{policyId:'policy',version:1,contentHash:'hash'}},eligibility:'ELIGIBLE',message:null,disclosure:{title:text,terms:text,refundTerms:text,benefitDescription:text,deviceName:null,deviceRights:null}}],warnings:[],reserved:false});
const receipt=(q=quote()):OrderReceipt=>({orderNo:'o1',promotionQuoteId:q.quoteId,quantity:1,amountUsdt:'120',paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',payBy:'2026-10-08T00:10:00Z',items:[{lineId:'9001',productNo:'sku',productName:'Original device',quantity:1}],rewards:q.expectedRewards.map(reward=>({...reward,lineId:'9001'}))});
const activity=(state:PublicPromotion['state']='ACTIVE'):PublicPromotion=>({activityId:'a1',version:1,template:'SKU_GIFT',state,startsAt:serverTime,endsAt:'2026-10-30T00:00:00Z',serverTime,title:{zh:'旧活动标题',en:'Old campaign',vi:'Ưu đãi cũ'},terms:text,placement:null,target:'STORE',productNos:['sku'],minimumClientCapabilities:[],eligibility:'ESTIMATE_ELIGIBLE',eligibilityMessage:null,rewardRules:[]});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const flush=async()=>{for(let i=0;i<4;i++){await Promise.resolve();await Vue.nextTick();}};
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).forEach(fn=>fn());vi.unstubAllGlobals();});
const descriptor=parse(source).descriptor;
const setupCode=ts.transpileModule(compileScript(descriptor,{id:'checkout-read'}).content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const renderCode=compile(descriptor.template!.content,{mode:'function',prefixIdentifiers:true,isTS:true,expressionPlugins:['typescript'],isCustomElement:tag=>['view','text','image'].includes(tag)}).code;
const render=new Function('Vue',ts.transpileModule(renderCode,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(Vue);

// Execute the entire production setup and session. Only external transports,
// storage and native notifications are adapters; no copy of the read lifecycle.
function screen(stored?:PromotionCheckoutRecord,input?:{activityId?:string;items?:{productNo:string;quantity:number}[];voucherId?:string;upgradeActivityId?:string}){
  const props=Vue.reactive({activityId:input?.activityId??'a1',items:input?.items??[{productNo:'sku',quantity:1}],orderNo:undefined as string|undefined,voucherId:input?.voucherId,upgradeActivityId:input?.upgradeActivityId});
  const intent=selectPromotionCheckoutRecord({},props).intent;
  let rows:Record<string,PromotionCheckoutRecord>=stored?{[intent]:structuredClone(stored)}:{};
  let writable=true;
  const save=vi.fn((_table:string,_account:string,value:Record<string,PromotionCheckoutRecord>)=>{if(!writable)return false;rows=structuredClone(value);return true;});
  const api={quote:vi.fn().mockResolvedValue(quote()),get:vi.fn().mockResolvedValue(activity()),create:vi.fn().mockResolvedValue(receipt()),pay:vi.fn().mockResolvedValue({...receipt(),paymentStatus:'PAID',orderStatus:'COMPLETED'}),cancel:vi.fn(),command:vi.fn().mockResolvedValue({status:'PROCESSING',order:null}),findOrder:vi.fn().mockResolvedValue(receipt())};
  const app=Vue.reactive({accountKey:'user:7',accountBindingEpoch:1,remoteFleetHasSnapshot:true,user:{usdtBalance:150}});
  const mounted:Array<()=>Promise<void>>=[],unmounted:Array<()=>void>=[],guardDisposal=vi.fn(),guardRegistration=vi.fn(()=>guardDisposal);
  const key=vi.fn(()=> 'original-key'),fleet=vi.fn().mockResolvedValue({serverNow:Date.parse(serverTime)});
  const getProduct=vi.fn().mockReturnValue({name:'Selected device'}),catalog=Vue.reactive({status:'ready'}),presentation=Vue.ref<{products:{id:string;name:string}[]}|null>({products:[{id:'sku',name:'Selected device'}]});
  vi.stubGlobal('setInterval',vi.fn(()=>0));vi.stubGlobal('clearInterval',vi.fn());
  const confirm=vi.fn().mockResolvedValue(false),clearConfirmsBy=vi.fn();
  const vouchers={catalog:[] as {id:string;name:string}[],claimedUnused:[] as {id:string;name:string}[],claimableVouchers:[] as {id:string;name:string;claimSurfaces:string[]}[],refreshRemote:vi.fn().mockResolvedValue(true),claimRemote:vi.fn().mockResolvedValue(true)};
  const modules:Record<string,unknown>={
    '@/lib/amount-display':{formatAmount},
    '@/i18n/format':{fmt},
    vue:{...Vue,onMounted:(fn:()=>Promise<void>)=>mounted.push(fn),onBeforeUnmount:(fn:()=>void)=>unmounted.push(fn)},
    'vue-router':{onBeforeRouteLeave:vi.fn()},
    '@/api/runtime':{promotionApi:api,deviceE3Api:{fleet}},'@/api/errors':{asApiError},
    '@/api/promotion-api':{validatePromotionItems},
    '@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/store/locale':{useLocaleStore:()=>({code:'zh'})},'@/store/app':{useApp:()=>app},'@/store/auth':{useAuth:()=>({isAuthenticated:true})},
    '@/store/voucher':{useVoucher:()=>vouchers},'@/mock/products':{getProduct},
    '@/store/product-catalog':{productCatalogState:catalog,productCatalogPresentation:presentation,refreshProductCatalog:vi.fn().mockResolvedValue(true)},
    '@/lib/route':{navTo:vi.fn(),navBack:vi.fn()},'@/store/ui':{confirm,useUI:()=>({clearConfirmsBy})},
    '@/lib/promotion-checkout-session':{PromotionCheckoutSession,selectPromotionCheckoutRecord},
    '@/lib/promotion-entry':entry,
    '@/store/account-scoped-storage':{readAccountRow:()=>rows,writeAccountRow:save,acquireAccountCommandKey:key},
    '@/lib/promotion-leave-guard':{registerCheckoutLeaveGuard:guardRegistration,requestCheckoutLeave:vi.fn().mockResolvedValue(true)},
    '@/lib/server-deadline-clock':{readTrustedMonotonicNowMs:()=>100,projectServerNow},'@/composables/use-dialog-a11y':{useDialogA11y:vi.fn()},'@/lib/promotion-display':{displayDeadline,localized},
  };
  const empty={render:()=>null},componentExports={default:{} as {setup:(input:typeof props,context:{expose:(value:Record<string,any>)=>void})=>Record<string,any>}};
  new Function('require','exports',setupCode)((id:string)=>{
    if(id in modules)return modules[id];
    if(id.endsWith('.vue'))return{default:empty};
    throw new Error('Unexpected checkout dependency '+id);
  },componentExports);
  let exposed!:Record<string,any>;
  const scope=Vue.effectScope(),view=scope.run(()=>componentExports.default.setup(props,{expose:value=>{exposed=value;}}))!;
  cleanup.push(()=>{unmounted.forEach(fn=>fn());scope.stop();});
  const passthrough={setup:(_props:unknown,{slots}:Vue.SetupContext)=>()=>Vue.h('view',slots.default?.())};
  const html=()=>renderToString(Vue.createSSRApp({components:{PromotionAction:passthrough,PromotionTerms:empty,RewardRows:empty,LiquidGlass:empty},render:()=>render(Vue.proxyRefs({$slots:{},...Vue.toRefs(props),...view}),[])}));
  return{view,exposed,api,save,key,app,fleet,props,vouchers,getProduct,catalog,presentation,html,confirm,clearConfirmsBy,start:()=>Promise.all(mounted.map(fn=>fn())),saved:()=>rows[intent],failStorage:()=>{writable=false;}};
}

it('an order discount keeps the quoted amount through create, recovery and payment without subtracting it twice',async()=>{
  const q=quote();q.subtotalUsdt='1299.000000';q.discountUsdt='500.000000';q.promotionDiscountUsdt='500.000000';q.amountUsdt='799.000000';
  q.items=[{...q.items[0],unitPriceUsdt:q.subtotalUsdt,subtotalUsdt:q.subtotalUsdt,discountUsdt:q.discountUsdt,promotionDiscountUsdt:q.promotionDiscountUsdt,payableUsdt:q.amountUsdt}];
  q.expectedRewards=[{...q.expectedRewards[0],reward:{rewardRuleId:'gift',beneficiaryRole:'BUYER',type:'DISCOUNT_USDT',calculation:'FIXED',amount:'500.000000'}}];
  const order={...receipt(q),amountUsdt:q.amountUsdt},page=screen();
  page.api.quote.mockResolvedValue(q);page.api.create.mockResolvedValue(order);page.api.findOrder.mockResolvedValue(order);page.api.pay.mockResolvedValue({...order,paymentStatus:'PAID',orderStatus:'COMPLETED'});
  await page.start();expect(page.exposed.footer.value.amount).toBe('$799.00');
  await page.view.createOrder();expect(page.saved().order?.amountUsdt).toBe('799.000000');expect(page.saved().order?.rewards?.[0].reward.type).toBe('DISCOUNT_USDT');
  await page.view.recover();expect(page.exposed.footer.value.amount).toBe('$799.00');
  page.confirm.mockResolvedValueOnce(true);await page.view.pay();
  expect(page.confirm).toHaveBeenCalledWith(expect.objectContaining({message:'确认支付 799.00 USDT 购买所选商品？'}));
  expect(page.api.pay).toHaveBeenCalledOnce();expect(page.saved().order?.paymentStatus).toBe('PAID');
});

it('payment confirmation cancels without a command, then an explicit acceptance pays the same order once',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  await page.view.pay();expect(page.api.pay).not.toHaveBeenCalled();expect(page.saved().order?.paymentStatus).toBe('PENDING');
  expect(page.confirm).toHaveBeenCalledWith(expect.objectContaining({message:'确认支付 120.00 USDT 购买所选商品？'}));
  const decision=deferred<boolean>();page.confirm.mockReturnValueOnce(decision.promise);
  const pending=page.view.pay();await page.view.pay();expect(page.confirm).toHaveBeenCalledTimes(2);
  decision.resolve(true);await pending;expect(page.api.pay).toHaveBeenCalledOnce();
  expect(page.api.pay).toHaveBeenCalledWith('o1','original-key');expect(page.saved().order?.paymentStatus).toBe('PAID');
});
it.each(['hide','account','expired'] as const)('a delayed payment confirmation after %s does not pay',async change=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  const decision=deferred<boolean>();page.confirm.mockReturnValueOnce(decision.promise);const pending=page.view.pay();
  if(change==='hide'){page.exposed.hide();expect(page.clearConfirmsBy).toHaveBeenCalledWith(expect.stringContaining('promotion-payment:'));}
  if(change==='account')page.app.accountBindingEpoch++;
  if(change==='expired')page.view.order.value.payBy='2026-10-07T00:00:00Z';
  decision.resolve(true);await pending;expect(page.api.pay).not.toHaveBeenCalled();
});

it('fresh hide invalidates and persists the unlocked quote, closes terms, then show obtains a new quote',async()=>{
  const page=screen();await page.start();page.view.termsOpen.value=true;
  expect(page.view.rewards.value).toHaveLength(1);expect(page.view.promotion.value?.title.zh).toBe('旧活动标题');
  page.exposed.hide();
  expect(page.view.quote.value).toBeNull();expect(page.saved().quote).toBeNull();expect(page.view.rewards.value).toEqual([]);
  expect(page.view.termsOpen.value).toBe(false);expect(page.view.promotion.value).toBeNull();expect(page.view.current()).toBe(true);
  page.api.quote.mockResolvedValueOnce(quote('q2'));page.exposed.show();await flush();
  expect(page.api.quote).toHaveBeenCalledTimes(2);expect(page.view.quote.value?.quoteId).toBe('q2');
  expect(page.api.create).not.toHaveBeenCalled();expect(page.api.command).not.toHaveBeenCalled();
});
it('a closed campaign quote failure after returning never restores previous gifts or campaign metadata',async()=>{
  const page=screen();await page.start();page.exposed.hide();
  page.api.get.mockResolvedValueOnce(activity('PAUSED'));page.api.quote.mockRejectedValueOnce(new ApiError({kind:'business',message:'PROMOTION_NOT_ELIGIBLE_OR_UNAVAILABLE'}));
  page.exposed.show();await flush();
  expect(page.view.quote.value).toBeNull();expect(page.view.rewards.value).toEqual([]);expect(page.view.promotion.value).toBeNull();
  expect(page.view.error.value).toBe(zh.promotion.disabledNote);expect(page.view.canCreate.value).toBe(false);
  const html=await page.html();expect(html).not.toContain(zh.promotion.expected);expect(html).not.toContain('旧活动标题');expect(html).not.toContain(zh.promotion.rulesLink);expect(html).toContain(zh.promotion.quote);
});
it.each([true,false])('a failed catalog read keeps only a confirmed selected name when its presentation contains the SKU=%s',async known=>{
  const page=screen();await page.start();expect(await page.html()).toContain('Selected device');page.exposed.hide();
  page.getProduct.mockReturnValue(undefined);page.catalog.status='error';
  if(!known)page.presentation.value={products:[]};
  page.api.get.mockResolvedValueOnce(activity('PAUSED'));page.api.quote.mockRejectedValueOnce(new ApiError({kind:'business',message:'PROMOTION_NOT_ELIGIBLE_OR_UNAVAILABLE'}));
  page.exposed.show();await flush();
  const html=await page.html();expect(html).toContain(known?'Selected device':zh.promotion.unknown);expect(html).toContain(zh.promotion.quantity+' · 1');
  expect(html).not.toContain(zh.promotion.expected);expect(html).not.toContain('旧活动标题');expect(html).not.toContain('promotion-price');expect(html).not.toContain(zh.promotion.confirmOrder);
  expect(page.view.canCreate.value).toBe(false);await page.view.createOrder();expect(page.api.create).not.toHaveBeenCalled();
});
it('quote and campaign reads started before hiding cannot restore marketing when they finish late',async()=>{
  const page=screen(),q=deferred<Quote>(),campaign=deferred<PublicPromotion>();
  page.api.quote.mockReturnValueOnce(q.promise);page.api.get.mockReturnValueOnce(campaign.promise);
  const read=page.start();expect(page.view.busy.value).toBe(true);page.exposed.hide();
  q.resolve(quote());campaign.resolve(activity());await read;await flush();
  expect(page.view.quote.value).toBeNull();expect(page.saved().quote).toBeNull();expect(page.view.rewards.value).toEqual([]);expect(page.view.promotion.value).toBeNull();expect(page.view.error.value).toBe('');
});
it.each(['success','failure'] as const)('hide/show during a busy old %s read really starts a fresh quote once it settles',async outcome=>{
  const page=screen(),old=deferred<Quote>(),next=deferred<Quote>();
  page.api.quote.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const read=page.start();page.exposed.hide();page.exposed.show();expect(page.api.quote).toHaveBeenCalledOnce();
  if(outcome==='success')old.resolve(quote('old'));else old.reject(new ApiError({kind:'business',message:'PROMOTION_ACCOUNT_UNAVAILABLE'}));
  await read;await flush();expect(page.api.quote).toHaveBeenCalledTimes(2);expect(page.view.quote.value).toBeNull();expect(page.view.error.value).toBe('');
  next.resolve(quote('fresh'));await flush();expect(page.view.quote.value?.quoteId).toBe('fresh');expect(page.view.busy.value).toBe(false);
});
it('a fresh quote invalidation storage failure exposes an error and cannot re-display stale gifts',async()=>{
  const page=screen();await page.start();page.failStorage();page.exposed.hide();
  expect(page.view.quote.value).toBeNull();expect(page.view.rewards.value).toEqual([]);expect(page.view.error.value).toBe(zh.promotion.errorNote);
  page.exposed.show();await flush();expect(page.api.quote).toHaveBeenCalledOnce();expect(page.view.quote.value).toBeNull();expect(page.view.canCreate.value).toBe(false);
  expect(await page.html()).not.toContain(zh.promotion.expected);
});
it('a confirmed original order remains intact on hide and show reads the same receipt without a new quote',async()=>{
  const original={quote:quote(),order:receipt(),pending:null};
  const page=screen(original);await page.start();const before=structuredClone(page.view.session.record);
  const html=await page.html();expect(html).toContain('Original device');expect(html).not.toContain('Selected device');
  page.exposed.hide();expect(page.view.session.record).toEqual(before);expect(page.view.rewards.value).toHaveLength(1);
  page.exposed.show();await flush();expect(page.api.findOrder).toHaveBeenLastCalledWith('o1');expect(page.view.session.confirmed).toBe(true);expect(page.view.canPay.value).toBe(true);
  expect(page.api.quote).not.toHaveBeenCalled();expect(page.api.get).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});
it.each(['createOrder','payOrder','cancelOrder'] as const)('hide/show preserves the original %s body/key and NOT_FOUND recovery path',async operation=>{
  const q=quote(),order=operation==='createOrder'?null:receipt(q),pending={operation,key:'original-key',targetId:order?.orderNo??q.quoteId};
  const page=screen({quote:q,order,pending});page.api.command.mockResolvedValue({status:'NOT_FOUND',order:null});await page.start();
  expect(page.view.session.retryOriginal).toBe(true);const before=structuredClone(page.view.session.record);page.exposed.hide();
  expect(page.view.session.record).toEqual(before);expect(page.saved()).toEqual(before);
  page.exposed.show();await flush();expect(page.api.command).toHaveBeenLastCalledWith('original-key',operation,pending.targetId);
  expect(page.view.session.record.pending).toEqual(pending);expect(page.view.session.record.quote).toEqual(q);expect(page.view.session.retryOriginal).toBe(true);
  expect(page.api.quote).not.toHaveBeenCalled();expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();expect(page.api.cancel).not.toHaveBeenCalled();
  if(operation==='createOrder'){await page.view.createOrder();expect(page.api.create).toHaveBeenCalledWith(q,'original-key',null);expect(page.key).not.toHaveBeenCalled();}
});
it('a create reply while hidden still persists the original order and returning recovers it instead of quoting again',async()=>{
  const page=screen();await page.start();const response=deferred<OrderReceipt>();page.api.create.mockReturnValueOnce(response.promise);
  const write=page.view.createOrder();expect(page.view.session.record.pending?.key).toBe('original-key');page.exposed.hide();page.exposed.show();
  response.resolve(receipt());await write;await flush();
  expect(page.saved().order?.orderNo).toBe('o1');expect(page.saved().pending).toBeNull();expect(page.api.findOrder).toHaveBeenCalledWith('o1');
  expect(page.api.quote).toHaveBeenCalledOnce();expect(page.api.create).toHaveBeenCalledOnce();expect(page.view.session.confirmed).toBe(true);
});
it('an original command failure while hidden keeps its pending key, quote and unknown result with the error',async()=>{
  const page=screen();await page.start();const response=deferred<OrderReceipt>();page.api.create.mockReturnValueOnce(response.promise);
  const write=page.view.createOrder();page.exposed.hide();response.reject(new Error('offline'));await write;
  expect(page.saved().pending?.key).toBe('original-key');expect(page.saved().quote?.quoteId).toBe('q1');expect(page.view.unknown.value).toBe(true);expect(page.view.error.value).toBe(zh.promotion.errorNote);
  page.exposed.show();await flush();expect(page.api.command).toHaveBeenCalledWith('original-key','createOrder','q1');expect(page.saved().pending?.key).toBe('original-key');expect(page.api.quote).toHaveBeenCalledOnce();
});

function selectedQuote(items:{productNo:string;quantity:number}[],overrides:Partial<Quote>={}):Quote {
  return {...quote('changed'),itemCount:items.length,quantity:items.reduce((sum,item)=>sum+item.quantity,0),
    items:items.map((item,index)=>({...item,lineId:'line-'+index,unitPriceUsdt:'1299',subtotalUsdt:'2598',discountUsdt:'17.13',payableUsdt:'2580.87'})),
    subtotalUsdt:'2598',discountUsdt:'17.13',amountUsdt:'2580.87',expectedRewards:[],...overrides};
}

it('an activity-free multi-item entry only reads a quote until the explicit footer action',async()=>{
  const page=screen(undefined,{activityId:'',items:[{productNo:'sku',quantity:2}]});
  page.api.quote.mockResolvedValueOnce(selectedQuote(page.props.items,{activityId:null,activityVersion:null}));await page.start();
  expect(page.api.quote).toHaveBeenCalledWith([{productNo:'sku',quantity:2}],null,null);
  expect(page.api.get).not.toHaveBeenCalled();expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
  expect(page.view.canChangeQuantity('sku',-1)).toBe(true);expect(page.exposed.footer.value.disabled).toBe(false);
});

it('quantity edits discard the old quote and rewards before awaiting canonical eligibility, discounts and payable',async()=>{
  const page=screen();await page.start();page.view.voucherId.value='voucher-7';
  const next=deferred<Quote>();page.api.quote.mockReturnValueOnce(next.promise);
  const edit=page.view.changeQuantity('sku',1);
  expect(page.api.quote).toHaveBeenLastCalledWith([{productNo:'sku',quantity:2}],'a1','voucher-7');
  expect(page.props.items).toEqual([{productNo:'sku',quantity:1}]);
  expect(page.view.items.value).toEqual([{productNo:'sku',quantity:2}]);
  expect(page.saved().quote).toBeNull();expect(page.view.quote.value).toBeNull();expect(page.view.rewards.value).toEqual([]);
  expect(page.exposed.footer.value).toMatchObject({amount:'-',disabled:true});
  await page.view.changeQuantity('sku',1);await page.exposed.footer.value.action();
  expect(page.api.quote).toHaveBeenCalledTimes(2);expect(page.api.create).not.toHaveBeenCalled();
  next.resolve(selectedQuote([{productNo:'sku',quantity:2}]));await edit;
  expect(page.exposed.footer.value).toMatchObject({amount:'$2,580.87',disabled:false});
  const html=await page.html();expect(html).toContain('2,598.00 USDT');expect(html).toContain('17.13 USDT');
  expect(page.view.quote.value.amountUsdt).toBe('2580.87');expect(page.api.pay).not.toHaveBeenCalled();
  expect(html).toContain('data-testid="checkout-item-decrease"');expect(html).toContain('data-testid="checkout-item-increase"');
  page.api.quote.mockResolvedValueOnce(quote('single-again'));await page.view.changeQuantity('sku',-1);
  expect(page.api.quote).toHaveBeenLastCalledWith([{productNo:'sku',quantity:1}],'a1','voucher-7');
  expect(page.view.canChangeQuantity('sku',-1)).toBe(false);
});

it.each(['ineligible','error','mismatched quantity'] as const)('a new %s quote cannot reuse the previous payable or create an order',async outcome=>{
  const page=screen();await page.start();
  if(outcome==='error')page.api.quote.mockRejectedValueOnce(new Error('offline'));
  else page.api.quote.mockResolvedValueOnce(selectedQuote([{productNo:'sku',quantity:outcome==='mismatched quantity'?1:2}],{eligibility:outcome==='ineligible'?'INELIGIBLE':'ELIGIBLE'}));
  await page.view.changeQuantity('sku',1);await page.view.createOrder();
  expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();expect(page.view.canCreate.value).toBe(false);
  expect(page.view.rewards.value).toEqual([]);
  if(outcome!=='ineligible'){expect(page.view.quote.value).toBeNull();expect(page.exposed.footer.value.amount).toBe('-');}
  expect(page.view.canChangeQuantity('sku',-1)).toBe(true);
});

it.each(['hide','account'] as const)('late quantity quote after %s cannot restore a payable or issue a command',async change=>{
  const page=screen();await page.start();const next=deferred<Quote>();page.api.quote.mockReturnValueOnce(next.promise);
  const edit=page.view.changeQuantity('sku',1);
  if(change==='hide')page.exposed.hide();else page.app.accountBindingEpoch++;
  next.resolve(selectedQuote([{productNo:'sku',quantity:2}]));await edit;
  expect(page.view.quote.value).toBeNull();expect(page.view.rewards.value).toEqual([]);
  expect(page.view.canChangeQuantity('sku',1)).toBe(false);expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});

it('bundle edits preserve the other SKU, enforce total 100 and require explicit creation and payment',async()=>{
  const page=screen(undefined,{items:[{productNo:'sku',quantity:1},{productNo:'sku-2',quantity:1}]});
  page.api.quote.mockResolvedValueOnce(selectedQuote(page.props.items));await page.start();
  const updated=selectedQuote([{productNo:'sku',quantity:2},{productNo:'sku-2',quantity:1}]);page.api.quote.mockResolvedValueOnce(updated);
  await page.view.changeQuantity('sku',1);
  expect(page.api.quote).toHaveBeenLastCalledWith([{productNo:'sku',quantity:2},{productNo:'sku-2',quantity:1}],'a1',null);
  expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
  page.api.create.mockResolvedValueOnce({...receipt(updated),quantity:3,amountUsdt:updated.amountUsdt,items:updated.items.map(item=>({...item,productName:item.productNo})),rewards:[]});
  await page.exposed.footer.value.action();
  expect(page.api.create).toHaveBeenCalledWith(updated,'original-key',null);expect(page.api.pay).not.toHaveBeenCalled();
  expect(page.view.canChangeQuantity('sku',-1)).toBe(false);await page.view.changeQuantity('sku',-1);expect(page.api.quote).toHaveBeenCalledTimes(2);
});

it('quantity boundaries and repeated keydown do not read or mutate',async()=>{
  const page=screen();await page.start();
  await page.view.changeQuantity('sku',-1);await page.view.changeQuantity('missing',1);
  await page.view.changeQuantity('sku',1,{repeat:true});
  expect(page.api.quote).toHaveBeenCalledOnce();expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
  const full=screen(undefined,{items:[{productNo:'sku',quantity:99},{productNo:'sku-2',quantity:1}]});
  full.api.quote.mockResolvedValueOnce(selectedQuote(full.props.items));await full.start();
  await full.view.changeQuantity('sku',1);await full.view.changeQuantity('sku-2',1);
  expect(full.api.quote).toHaveBeenCalledOnce();expect(full.api.create).not.toHaveBeenCalled();expect(full.api.pay).not.toHaveBeenCalled();
});

it('an unresolved original command locks quantity even after a NOT_FOUND read allows retry',async()=>{
  const q=quote(),page=screen({quote:q,order:null,pending:{key:'original-key',operation:'createOrder',targetId:q.quoteId}});
  page.api.command.mockResolvedValueOnce({status:'NOT_FOUND',order:null});await page.start();
  expect(page.view.session.retryOriginal).toBe(true);expect(page.view.canChangeQuantity('sku',1)).toBe(false);
  await page.view.changeQuantity('sku',1);expect(page.saved().quote?.quoteId).toBe(q.quoteId);expect(page.saved().pending?.key).toBe('original-key');
  expect(page.api.quote).not.toHaveBeenCalled();expect(page.api.create).not.toHaveBeenCalled();
});

it('a voucher picker opened for the old quantity cannot apply after the quantity changes',async()=>{
  const page=screen();await page.start();page.vouchers.claimedUnused=[{id:'voucher-old',name:'Old voucher'}];
  let choose!:(value:{tapIndex:number})=>void;
  vi.stubGlobal('uni',{showActionSheet:vi.fn(options=>{choose=options.success;})});
  await page.view.chooseVoucher();
  page.api.quote.mockResolvedValueOnce(selectedQuote([{productNo:'sku',quantity:2}]));await page.view.changeQuantity('sku',1);
  choose({tapIndex:1});await flush();
  expect(page.view.voucherId.value).toBeNull();expect(page.api.quote).toHaveBeenCalledTimes(2);
});

const eventEntry={activityId:'',voucherId:'BF20',upgradeActivityId:'pro-upgrade'};
const bf20={id:'BF20',name:'Black Friday 20%',claimSurfaces:['store']};
// Captured from the backend quote method with mocked catalog/account facts, not a TEST transaction.
function voucherOnlyQuote(productNo:string):Quote{return {...voucherOnlyFixture,items:voucherOnlyFixture.items.map(line=>({...line,lineId:productNo,productNo}))} as Quote;}
it('BF20 requires an explicit claim then rereads availability and quotes the selected coupon, with no client price arithmetic',async()=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimableVouchers=[bf20];page.vouchers.catalog=[bf20];
  await page.start();expect(page.api.quote).not.toHaveBeenCalled();expect(page.vouchers.claimRemote).not.toHaveBeenCalled();
  expect(await page.html()).toContain(zh.promotion.claimEventVoucher);expect(page.exposed.footer.value.disabled).toBe(true);
  page.vouchers.claimRemote.mockImplementation(async()=>{page.vouchers.claimableVouchers=[];page.vouchers.claimedUnused=[bf20];return true;});
  page.api.get.mockResolvedValue({...activity(),productNos:['pro']});
  page.api.quote.mockResolvedValue(voucherOnlyQuote('sku'));
  await page.view.claimEventVoucher();
  expect(page.vouchers.claimRemote).toHaveBeenCalledWith('BF20','store');expect(page.vouchers.refreshRemote).toHaveBeenCalledTimes(2);
  expect(page.api.quote).toHaveBeenCalledWith([{productNo:'sku',quantity:1}],null,'BF20',false);
  expect(page.exposed.footer.value.amount).toBe('$80.00');expect(page.saved().voucherId).toBe('BF20');
  await page.view.chooseVoucher();expect(page.vouchers.refreshRemote).toHaveBeenCalledTimes(2);
  await page.view.createOrder();expect(page.api.create).toHaveBeenCalledWith(expect.objectContaining({amountUsdt:'80.000000',activityId:null,expectedRewards:[]}),'original-key','BF20');
});
it.each(['ordinary','eligible-pro','ineligible-pro','closed-pro'] as const)('BF20 %s only adds the optional upgrade for a matching eligible Pro product',async scenario=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimedUnused=[bf20];
  const candidate={...activity(),activityId:'pro-upgrade',productNos:scenario==='ordinary'?['pro']:['sku'],eligibility:scenario==='ineligible-pro'?'INELIGIBLE':'ESTIMATE_ELIGIBLE',state:scenario==='closed-pro'?'PAUSED':'ACTIVE'} as PublicPromotion;
  page.api.get.mockResolvedValue(candidate);await page.start();
  expect(page.api.quote).toHaveBeenCalledWith(page.props.items,scenario==='eligible-pro'?'pro-upgrade':null,'BF20',false);
  expect(page.vouchers.claimRemote).not.toHaveBeenCalled();
});
it('an idempotent claim receipt cannot authorize an already-used voucher',async()=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimableVouchers=[bf20];await page.start();
  page.vouchers.claimRemote.mockImplementation(async()=>{page.vouchers.claimableVouchers=[];return true;});await page.view.claimEventVoucher();
  expect(page.view.eventVoucherStatus.value).toBe('unavailable');expect(page.api.quote).not.toHaveBeenCalled();expect(page.exposed.footer.value.disabled).toBe(true);
});
it.each(['unavailable','state-failure','multi-sku'] as const)('BF20 %s cannot silently become an undiscounted or multi-SKU checkout',async scenario=>{
  const page=screen(undefined,{...eventEntry,...(scenario==='multi-sku'?{items:[{productNo:'sku',quantity:1},{productNo:'second',quantity:1}]}:{})});
  if(scenario!=='unavailable')page.vouchers.claimedUnused=[bf20];
  if(scenario==='state-failure')page.vouchers.refreshRemote.mockResolvedValue(false);
  await page.start();await page.view.createOrder();expect(page.api.quote).not.toHaveBeenCalled();expect(page.api.create).not.toHaveBeenCalled();
});
it.each(['hide','account'] as const)('a BF20 availability response after %s cannot start a quote or claim',async boundary=>{
  const page=screen(undefined,eventEntry),state=deferred<boolean>();page.vouchers.claimedUnused=[bf20];page.vouchers.refreshRemote.mockReturnValueOnce(state.promise);
  const loading=page.start();if(boundary==='hide')page.exposed.hide();else page.app.accountBindingEpoch++;
  state.resolve(true);await loading;expect(page.api.quote).not.toHaveBeenCalled();expect(page.vouchers.claimRemote).not.toHaveBeenCalled();
});
it('an original BF20 order is recovered without reclaiming or rechecking the voucher',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null,voucherId:'BF20'},eventEntry);await page.start();
  expect(page.api.findOrder).toHaveBeenCalledWith('o1');expect(page.vouchers.refreshRemote).not.toHaveBeenCalled();expect(page.vouchers.claimRemote).not.toHaveBeenCalled();expect(page.api.quote).not.toHaveBeenCalled();
});

it('BF20 with unrestricted claim surfaces can be explicitly claimed from checkout',async()=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimableVouchers=[{...bf20,claimSurfaces:[]}];await page.start();
  expect(page.view.eventVoucherStatus.value).toBe('claimable');expect(await page.html()).toContain(zh.promotion.claimEventVoucher);
  page.vouchers.claimRemote.mockImplementation(async()=>{page.vouchers.claimableVouchers=[];page.vouchers.claimedUnused=[bf20];return true;});
  await page.view.claimEventVoucher();expect(page.vouchers.claimRemote).toHaveBeenCalledWith('BF20','store');expect(page.api.quote).toHaveBeenCalledOnce();
});

it('a canonical BF20-only S1 quote creates and pays 80 USDT without any promotion reward',async()=>{
  const page=screen(undefined,{...eventEntry,items:[{productNo:'S1',quantity:1}]});page.vouchers.claimedUnused=[bf20];page.api.get.mockResolvedValue({...activity(),productNos:['PRO']});
  const q=voucherOnlyQuote('S1');
  const order={...receipt(q),payBy:q.expiresAt,amountUsdt:'80.000000',items:[{lineId:'9001',productNo:'S1',productName:'S1',quantity:1}],rewards:[]};
  page.api.quote.mockResolvedValue(q);page.api.create.mockResolvedValue(order);page.api.pay.mockResolvedValue({...order,paymentStatus:'PAID',orderStatus:'COMPLETED'});
  await page.start();expect(page.exposed.footer.value).toMatchObject({amount:'$80.00',disabled:false});
  await page.view.createOrder();expect(page.api.create).toHaveBeenCalledWith(q,'original-key','BF20');
  page.confirm.mockResolvedValue(true);await page.view.pay();expect(page.api.pay).toHaveBeenCalledWith('o1','original-key');
  expect(page.saved().order).toMatchObject({amountUsdt:'80.000000',paymentStatus:'PAID',rewards:[]});
});
it.each(['INELIGIBLE','UNKNOWN'] as const)('BF20 must never override a selected promotion whose quote is %s',async eligibility=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimedUnused=[bf20];page.api.quote.mockResolvedValue({...quote(),eligibility});await page.start();
  expect(page.exposed.footer.value.disabled).toBe(true);await page.view.createOrder();expect(page.api.create).not.toHaveBeenCalled();
  await expect(page.view.session.create()).rejects.toThrow('QUOTE_NOT_CONFIRMABLE');
});
