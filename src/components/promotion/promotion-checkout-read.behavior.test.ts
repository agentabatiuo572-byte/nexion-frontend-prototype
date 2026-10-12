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
import type { OrderReceipt,PublicPromotion,Quote } from '@/api/promotion-contracts';

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
function screen(stored?:PromotionCheckoutRecord){
  const props=Vue.reactive({activityId:'a1',items:[{productNo:'sku',quantity:1}],orderNo:undefined as string|undefined});
  const intent=JSON.stringify([props.activityId,props.items]);
  let rows:Record<string,PromotionCheckoutRecord>=stored?{[intent]:structuredClone(stored)}:{};
  let writable=true;
  const save=vi.fn((_table:string,_account:string,value:Record<string,PromotionCheckoutRecord>)=>{if(!writable)return false;rows=structuredClone(value);return true;});
  const api={quote:vi.fn().mockResolvedValue(quote()),get:vi.fn().mockResolvedValue(activity()),create:vi.fn().mockResolvedValue(receipt()),pay:vi.fn().mockResolvedValue({...receipt(),paymentStatus:'PAID',orderStatus:'COMPLETED'}),cancel:vi.fn(),command:vi.fn().mockResolvedValue({status:'PROCESSING',order:null}),findOrder:vi.fn().mockResolvedValue(receipt())};
  const app=Vue.reactive({accountKey:'user:7',accountBindingEpoch:1,remoteFleetHasSnapshot:true,user:{usdtBalance:150}});
  const mounted:Array<()=>Promise<void>>=[],unmounted:Array<()=>void>=[],guardDisposal=vi.fn(),guardRegistration=vi.fn(()=>guardDisposal);
  const key=vi.fn(()=> 'original-key'),fleet=vi.fn().mockResolvedValue({serverNow:Date.parse(serverTime)});
  const getProduct=vi.fn().mockReturnValue({name:'Selected device'}),catalog=Vue.reactive({status:'ready'}),presentation=Vue.ref<{products:{id:string;name:string}[]}|null>({products:[{id:'sku',name:'Selected device'}]});
  vi.stubGlobal('setInterval',vi.fn(()=>0));vi.stubGlobal('clearInterval',vi.fn());
  const modules:Record<string,unknown>={
    vue:{...Vue,onMounted:(fn:()=>Promise<void>)=>mounted.push(fn),onBeforeUnmount:(fn:()=>void)=>unmounted.push(fn)},
    'vue-router':{onBeforeRouteLeave:vi.fn()},
    '@/api/runtime':{promotionApi:api,deviceE3Api:{fleet}},'@/api/errors':{asApiError},
    '@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/store/locale':{useLocaleStore:()=>({code:'zh'})},'@/store/app':{useApp:()=>app},'@/store/auth':{useAuth:()=>({isAuthenticated:true})},
    '@/store/voucher':{useVoucher:()=>({catalog:[],claimedUnused:[],refreshRemote:vi.fn()})},'@/mock/products':{getProduct},
    '@/store/product-catalog':{productCatalogState:catalog,productCatalogPresentation:presentation,refreshProductCatalog:vi.fn().mockResolvedValue(true)},
    '@/lib/route':{navTo:vi.fn(),navBack:vi.fn()},'@/store/ui':{confirm:vi.fn().mockResolvedValue(false)},
    '@/lib/promotion-checkout-session':{PromotionCheckoutSession,selectPromotionCheckoutRecord},
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
  const html=()=>renderToString(Vue.createSSRApp({components:{PromotionAction:passthrough,PromotionTerms:empty,RewardRows:empty,LiquidGlass:empty},render:()=>render(Vue.proxyRefs({...Vue.toRefs(props),...view}),[])}));
  return{view,exposed,api,save,key,app,fleet,props,getProduct,catalog,presentation,html,start:()=>Promise.all(mounted.map(fn=>fn())),saved:()=>rows[intent],failStorage:()=>{writable=false;}};
}

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
