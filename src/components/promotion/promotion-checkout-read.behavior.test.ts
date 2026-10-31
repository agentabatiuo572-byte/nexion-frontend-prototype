import * as Vue from 'vue';
import { compileScript,parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach,expect,it,vi } from 'vitest';
import { createPinia,setActivePinia } from 'pinia';
import { useApp as useRealApp } from '@/store/app';
import { prepareProductCatalog,refreshProductCatalog } from '@/store/product-catalog';
import type { CanonicalE3Fleet } from '@/api/device-e3-api';
import type { ProductCatalogSnapshot } from '@/api/product-catalog-api';
import source from './promotion-checkout.vue?raw';
import checkoutSource from '@/pages/store/checkout.vue?raw';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { asApiError,ApiError } from '@/api/errors';
import { PromotionCheckoutSession,selectPromotionCheckoutRecord,type PromotionCheckoutRecord } from '@/lib/promotion-checkout-session';
import { parsePendingKeepCommand } from '@/lib/keep-command-recovery';
import type { PaymentPasswordAuthorization } from '@/api/payment-password-api';
import { selectedPurchasePaymentFixture } from '@/lib/selected-purchase-payment.test-helper';
import { projectServerNow } from '@/lib/server-deadline-clock';
import { displayDeadline,localized,rewardSummary } from '@/lib/promotion-display';
import { formatAmount,formatGroupedAmount } from '@/lib/amount-display';
import { formatCheckoutReviewAmount } from '@/lib/checkout-review-amount';
import { nexGridBrandText } from '@/lib/brand-copy';
import { computeVoucherDiscount,isVoucherValid,voucherAppliesToSku,type VoucherDef } from '@/mock/vouchers';
import { commerceCopy } from '@/lib/commerce-review';
import { orderPaymentRejection } from '@/lib/order-payment-rejection';
import { checkoutFlowCopy } from '@/lib/checkout-flow-copy';
import { fmt } from '@/i18n/format';
import { validatePromotionItems,createPromotionApi,parsePromotedOrder } from '@/api/promotion-api';
import * as entry from '@/lib/promotion-entry';
import type { OrderReceipt,PublicPromotion,Quote } from '@/api/promotion-contracts';
import voucherOnlyFixture from './fixtures/black-friday-voucher-quote.json';

const walletRemote=vi.hoisted(()=>({
  remoteApiEnabled:true,fundsServerEnabled:true,expectedApiEnvironment:'dev',
  apiRuntimeConfig:{environment:'dev',baseUrl:'http://127.0.0.1:8110'},
  apiRuntimeClientOrigin:{environment:'dev',baseUrl:'http://127.0.0.1:8110'},
  sessionVault:{read:vi.fn()},deviceE3Api:{fleet:vi.fn()},taskAssignmentApi:{state:vi.fn()},
  productCatalogApi:{catalog:vi.fn()},withdrawalApi:{list:vi.fn()},
}));
vi.mock('@/api/runtime',()=>walletRemote);

const serverTime='2026-10-08T00:00:00Z',text={zh:'原赠品条件',en:'Original gift terms',vi:'Điều khoản quà tặng'};
function voucherDef(id:string,amountUSD:number,overrides:Partial<VoucherDef>={}):VoucherDef {
  return {id,name:id,type:'fixed',amountUSD,minPurchaseUSD:0,applicableSkus:['sku'],audience:'all',startAt:0,endAt:0,claimSurfaces:['store'],popupEnabled:false,stackWithTrial:false,stackWithOthers:true,splittable:false,status:'active',...overrides};
}
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
function screen(stored?:PromotionCheckoutRecord,input?:{activityId?:string;items?:{productNo:string;quantity:number}[];voucherId?:string;upgradeActivityId?:string},adapters?:{app:ReturnType<typeof useRealApp>;refreshCatalog:typeof refreshProductCatalog}){
  const props=Vue.reactive({activityId:input?.activityId??'a1',items:input?.items??[{productNo:'sku',quantity:1}],orderNo:undefined as string|undefined,voucherId:input?.voucherId,upgradeActivityId:input?.upgradeActivityId});
  const auth=Vue.reactive({isAuthenticated:true}),locale=Vue.reactive({code:'zh'});
  const intent=selectPromotionCheckoutRecord({},props).intent;
  let rows:Record<string,PromotionCheckoutRecord>=stored?{[intent]:structuredClone(stored)}:{};
  let writable=true;
  let keepHistory:unknown;
  const tradein={showKeepRecovery:vi.fn()};
  const save=vi.fn((_table:string,_account:string,value:Record<string,PromotionCheckoutRecord>)=>{if(!writable)return false;rows=structuredClone(value);return true;});
  const api={quote:vi.fn().mockResolvedValue(quote()),get:vi.fn().mockResolvedValue(activity()),create:vi.fn().mockResolvedValue(receipt()),pay:vi.fn().mockResolvedValue({...receipt(),paymentStatus:'PAID',orderStatus:'COMPLETED'}),cancel:vi.fn(),command:vi.fn().mockResolvedValue({status:'PROCESSING',order:null}),paymentCommand:vi.fn().mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true}),findOrder:vi.fn().mockResolvedValue(receipt())};
  const app=Vue.reactive({accountKey:'user:7',accountBindingEpoch:1,remoteFleetHasSnapshot:true,remoteSlotsUsed:null as number|null,slotCap:6,user:{usdtBalance:150},captureRemoteAccountRequest:vi.fn(()=>({accountKey:'user:7',epoch:1})),refreshRemoteFleet:vi.fn().mockResolvedValue(true)});
  const mounted:Array<()=>Promise<void>>=[],unmounted:Array<()=>void>=[],guardDisposal=vi.fn(),guardRegistration=vi.fn(()=>guardDisposal);
  const key=vi.fn(()=> 'original-key'),fleet=vi.fn().mockResolvedValue({serverNow:Date.parse(serverTime)});
  const getProduct=vi.fn().mockReturnValue({name:'Selected device'}),catalog=Vue.reactive({status:'ready'}),presentation=Vue.ref<{products:{id:string;name:string}[]}|null>({products:[{id:'sku',name:'Selected device'}]});
  const refreshCatalog=vi.fn(adapters?.refreshCatalog??(async()=>true));
  vi.stubGlobal('setInterval',vi.fn(()=>0));vi.stubGlobal('clearInterval',vi.fn());
  const confirm=vi.fn().mockResolvedValue(false),clearConfirmsBy=vi.fn();
  const authorization:PaymentPasswordAuthorization={paymentPassword:'583719',credentialVersion:1,attemptNo:'fixture-attempt'};
  const pin=vi.fn(async(_context:any,command:any,current:()=>boolean)=>current()?command(authorization):null);
  const methodSelection=selectedPurchasePaymentFixture(pin);
  const eligibility=vi.fn().mockResolvedValue({eligible:true}),runtime=Vue.reactive({epoch:1}),sessionIdentity=Vue.reactive({revision:1});
  const canonical=vi.fn().mockResolvedValue({id:'o1',status:'activated'}),navTo=vi.fn(),navBack=vi.fn(),navReset=vi.fn();
  const vouchers={remoteStatus:'ready',catalog:[] as {id:string;name:string}[],claimedUnused:[] as VoucherDef[],claimableVouchers:[] as {id:string;name:string;claimSurfaces:string[]}[],refreshRemote:vi.fn().mockResolvedValue(true),claimRemote:vi.fn().mockResolvedValue(true)};
  const modules:Record<string,unknown>={
    '@/lib/amount-display':{formatAmount,formatGroupedAmount},
    '@/lib/checkout-review-amount':{formatCheckoutReviewAmount},
    '@/api/order-api':{captureRuntimeRevision:()=>({epoch:runtime.epoch}),isCurrentRuntimeRevision:(scope:{epoch:number})=>scope.epoch===runtime.epoch},
    '@/lib/authorized-payment':{executePaymentWithPassword:pin},
    '@/lib/selected-purchase-payment':{executeSelectedPurchase:methodSelection.execute},
    '@/lib/order-payment-rejection':{orderPaymentRejection},
    '@/lib/checkout-flow-copy':{checkoutFlowCopy},
    '@/store/orders':{useOrders:()=>({ensureRemoteOrder:canonical})},
    '@/lib/brand-copy':{nexGridBrandText},
    '@/lib/commerce-review':{commerceCopy},
    '@/mock/vouchers':{computeVoucherDiscount,isVoucherValid,voucherAppliesToSku},
    '@/i18n/format':{fmt},
    vue:{...Vue,onMounted:(fn:()=>Promise<void>)=>mounted.push(fn),onBeforeUnmount:(fn:()=>void)=>unmounted.push(fn)},
    'vue-router':{onBeforeRouteLeave:vi.fn()},
    '@/api/runtime':{promotionApi:api,deviceE3Api:{fleet},purchaseEligibilityApi:{get:eligibility},sessionVault:{revision:()=>sessionIdentity.revision,isRefreshContinuation:()=>false}},'@/api/errors':{asApiError,ApiError},
    '@/api/promotion-api':{validatePromotionItems},
    '@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/store/locale':{useLocaleStore:()=>locale},'@/store/app':{useApp:()=>adapters?.app??app},'@/store/auth':{useAuth:()=>auth},
    '@/store/voucher':{useVoucher:()=>vouchers},'@/mock/products':{getProduct},
    '@/store/product-catalog':{productCatalogState:catalog,productCatalogPresentation:presentation,refreshProductCatalog:refreshCatalog},
    '@/lib/route':{navTo,navBack,navReset},'@/store/ui':{confirm,useUI:()=>({clearConfirmsBy})},
    '@/lib/promotion-checkout-session':{PromotionCheckoutSession,selectPromotionCheckoutRecord},
    '@/lib/keep-command-recovery':{readPendingKeepCommand:(account:string,productNo:string)=>parsePendingKeepCommand(keepHistory,account,productNo)},
    '@/store/tradein-sheet':{useTradeinSheet:()=>tradein},
    '@/lib/promotion-entry':entry,
    '@/store/account-scoped-storage':{readAccountRow:()=>rows,writeAccountRow:save,acquireAccountCommandKey:key},
    '@/lib/promotion-leave-guard':{registerCheckoutLeaveGuard:guardRegistration,requestCheckoutLeave:vi.fn().mockResolvedValue(true)},
    '@/lib/server-deadline-clock':{readTrustedMonotonicNowMs:()=>100,projectServerNow},'@/composables/use-dialog-a11y':{useDialogA11y:vi.fn()},'@/lib/promotion-display':{displayDeadline,localized,rewardSummary},
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
  const amount={props:['value','currency','showCurrency'],setup:(props:any)=>()=>Vue.h('text',props.showCurrency===false?formatGroupedAmount(props.value):props.currency==='USD'?'$'+(formatGroupedAmount(props.value)==='-'?'—':formatGroupedAmount(props.value)):formatGroupedAmount(props.value)+' USDT')};
  const result={props:['state','productName','amount'],setup:(props:any,{slots}:Vue.SetupContext)=>()=>Vue.h('view',{'data-result':props.state},[props.productName,' ',formatGroupedAmount(props.amount)+' USDT',slots.default?.()])};
  const html=()=>renderToString(Vue.createSSRApp({components:{PromotionAction:passthrough,PromotionTerms:empty,RewardRows:empty,LiquidGlass:empty,NxSheet:empty,CheckoutPaymentSheet:empty,CheckoutAmount:amount,CheckoutResult:result},render:()=>render(Vue.proxyRefs({$slots:{},...Vue.toRefs(props),...view}),[])}));
  return{view,exposed,navReset,api,save,key,app,fleet,props,auth,locale,vouchers,getProduct,catalog,presentation,refreshCatalog,html,confirm,clearConfirmsBy,pin,methodSelection,eligibility,runtime,sessionIdentity,authorization,canonical,navTo,navBack,tradein,setKeepHistory:(history:unknown)=>{keepHistory=history;},start:()=>Promise.all(mounted.map(fn=>fn())),saved:()=>rows[intent],failStorage:()=>{writable=false;}};
}

const oldKeepIntent='keep|1156|sku|1|1299|1299|6';
const oldKeepHistory=()=>({'user:7':{commands:{[oldKeepIntent]:'old-keep-key'}}});
async function parentItemsRoute(){
  const ast=ts.createSourceFile('parent.ts',parse(checkoutSource).descriptor.scriptSetup!.content,ts.ScriptTarget.Latest,true);
  const node=ast.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='onLoad') as ts.ExpressionStatement;
  const callback=((node.expression as ts.CallExpression).arguments[0]).getText(ast);
  const code=ts.transpileModule(`return (${callback});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const promotionRoute=Vue.ref(null),recoverKeepBeforePurchase=vi.fn(()=>true);
  const deps={promotionRoute,recoverKeepBeforePurchase,takeNavigationQuery:()=>'',URLSearchParams,validatePromotionItems,voucherEntryContext:entry.voucherEntryContext,toast:{warn:vi.fn()},t:Vue.ref(zh),navTo:vi.fn()};
  await new Function('deps',`with(deps){${code}}`)(deps)({items:JSON.stringify([{productNo:'sku',quantity:1}])});
  expect(recoverKeepBeforePurchase).not.toHaveBeenCalled();
  return promotionRoute.value!;
}
it.each(['order','pending'] as const)('items without orderNo recover the original Promotion %s before a same-SKU KEEP',async state=>{
  const q=quote(),pending=state==='pending'?{key:'old-promotion-key',operation:'createOrder' as const,targetId:q.quoteId}:null;
  const route=await parentItemsRoute();
  const page=screen({quote:q,order:state==='order'?receipt(q):null,pending},route);
  page.setKeepHistory(oldKeepHistory());
  await page.start();
  expect(page.api.quote).not.toHaveBeenCalled();expect(page.api.create).not.toHaveBeenCalled();expect(page.key).not.toHaveBeenCalled();
  expect(page.tradein.showKeepRecovery).not.toHaveBeenCalled();
  if(state==='order'){
    expect(page.api.findOrder).toHaveBeenCalledExactlyOnceWith('o1');expect(page.saved().order?.orderNo).toBe('o1');
  }else{
    expect(page.api.command).toHaveBeenCalledExactlyOnceWith('old-promotion-key','createOrder','q1');
    expect(page.saved().pending).toEqual(pending);
    page.api.command.mockResolvedValueOnce({status:'NOT_FOUND',order:null});await page.view.recover();await page.view.createOrder();
    expect(page.api.create).toHaveBeenCalledExactlyOnceWith(q,'old-promotion-key',null);
    expect(page.key).not.toHaveBeenCalled();expect(page.api.quote).not.toHaveBeenCalled();
  }
});
it('fresh items stop before quoting or creating for an old KEEP, then quote after verified recovery clears its key',async()=>{
  const page=screen(undefined,{activityId:''}),history=oldKeepHistory();page.setKeepHistory(history);await page.start();
  expect(page.api.quote).not.toHaveBeenCalled();expect(page.tradein.showKeepRecovery).toHaveBeenCalledExactlyOnceWith('sku');
  expect(page.exposed.footer.value).toBeNull();expect(await page.html()).toContain(zh.tradein.keepRecoveryPending);
  await page.view.createOrder();expect(page.api.create).not.toHaveBeenCalled();expect(page.key).not.toHaveBeenCalled();
  page.setKeepHistory({'user:7':{commands:{}}});await page.view.loadQuote();expect(page.api.quote).toHaveBeenCalledOnce();
  expect(page.view.canCreate.value).toBe(true);
});
it.each(['malformed',[],{[oldKeepIntent]:'first','keep|1157|sku|1|1399|1399|6':'second'}])('fresh Promotion items fail closed for invalid or ambiguous KEEP storage: %s',async commands=>{
  const page=screen(undefined,{activityId:''}),history={'user:7':{commands}},before=JSON.stringify(history);
  page.setKeepHistory(history);await page.start();await page.view.createOrder();
  expect(page.api.quote).not.toHaveBeenCalled();expect(page.api.create).not.toHaveBeenCalled();expect(page.key).not.toHaveBeenCalled();
  expect(await page.html()).toContain(zh.tradein.keepRecoveryReadError);expect(page.exposed.footer.value).toBeNull();
  expect(JSON.stringify(history)).toBe(before);
});
it('a KEEP written after mount closes fresh Promotion create without minting a new command',async()=>{
  const page=screen(undefined,{activityId:''});await page.start();expect(page.view.canCreate.value).toBe(true);
  page.setKeepHistory(oldKeepHistory());await page.view.createOrder();
  expect(page.api.create).not.toHaveBeenCalled();expect(page.key).not.toHaveBeenCalled();expect(page.exposed.footer.value).toBeNull();
  expect(page.tradein.showKeepRecovery).toHaveBeenCalledExactlyOnceWith('sku');
});

it('order creation, recovery and payment use the source receipt name without rewriting its snapshot',async()=>{
  const page=screen(),originalName='NexGridBox S1',order={...receipt(),items:[{lineId:'9001',productNo:'sku',productName:originalName,quantity:1}]};
  page.getProduct.mockReturnValue({name:'UVELBox S1'});
  page.api.create.mockResolvedValue(order);page.api.findOrder.mockResolvedValue(order);page.api.pay.mockResolvedValue({...order,paymentStatus:'PAID',orderStatus:'COMPLETED'});
  await page.start();expect(await page.html()).toContain('UVELBox S1');
  for(const action of [()=>page.view.createOrder(),()=>page.view.recover(),()=>{page.confirm.mockResolvedValueOnce(true);return page.view.pay();}]){
    await action();const html=await page.html();expect(html).toContain(originalName);expect(html).not.toContain('UVELBox S1');
    expect(page.saved().order?.items?.[0]?.productName).toBe(originalName);
  }
});

it('new checkout quantities respect authoritative remaining slots and remain removable when over capacity',async()=>{
  const page=screen();await page.start();page.app.remoteSlotsUsed=5;
  expect(page.view.canChangeQuantity('sku',1)).toBe(false);
  page.app.remoteSlotsUsed=4;expect(page.view.canChangeQuantity('sku',1)).toBe(true);
  await page.view.changeQuantity('sku',1);page.app.remoteSlotsUsed=6;
  expect(page.view.canChangeQuantity('sku',-1)).toBe(true);
  expect(page.view.canChangeQuantity('sku',1)).toBe(false);
});

it('refreshes wallet and quote automatically while visible without manual refresh controls',async()=>{
  const page=screen();await page.start();
  const automatic=vi.mocked(setInterval).mock.calls.find(([,delay])=>delay===30000)![0] as ()=>void;
  const html=await page.html();
  expect(html).not.toContain(commerceCopy('zh').walletRefresh);
  expect(html).not.toContain(zh.promotion.quote);
  expect(html).toContain('checkout-wallet-topup');
  const reads=page.app.refreshRemoteFleet.mock.calls.length,quotes=page.api.quote.mock.calls.length;
  page.app.refreshRemoteFleet.mockImplementation(async()=>{page.app.user.usdtBalance=200;return true;});
  automatic();await flush();
  expect(page.app.refreshRemoteFleet).toHaveBeenCalledTimes(reads+1);
  expect(page.api.quote).toHaveBeenCalledTimes(quotes+1);
  expect(await page.html()).toContain('200.00');
  expect(await page.html()).not.toContain('200.00 USDT');
  page.exposed.hide();automatic();await flush();
  expect(page.app.refreshRemoteFleet).toHaveBeenCalledTimes(reads+1);
  expect(page.api.quote).toHaveBeenCalledTimes(quotes+1);
  page.exposed.show();await flush();
  expect(page.app.refreshRemoteFleet).toHaveBeenCalledTimes(reads+2);
  expect(page.api.quote).toHaveBeenCalledTimes(quotes+2);
});

it('automatic refresh recovers failed wallet reads and preserves open checkout dialogs',async()=>{
  const page=screen();page.app.refreshRemoteFleet.mockResolvedValueOnce(false);await page.start();
  const automatic=vi.mocked(setInterval).mock.calls.find(([,delay])=>delay===30000)![0] as ()=>void;
  expect(page.view.walletState.value).toBe('error');
  page.view.termsOpen.value=true;const reads=page.app.refreshRemoteFleet.mock.calls.length;
  automatic();await flush();expect(page.app.refreshRemoteFleet).toHaveBeenCalledTimes(reads);
  page.view.termsOpen.value=false;automatic();await flush();
  expect(page.view.walletState.value).toBe('ready');
  expect(await page.html()).not.toContain('checkout-wallet-recovery');
});

it('retains wallet text silently during a read without making old balance payment authority',async()=>{
  const page=screen();await page.start();await page.view.createOrder();
  const pending=deferred<boolean>();page.app.refreshRemoteFleet.mockReturnValueOnce(pending.promise);
  const reading=page.view.refreshWallet();await flush();
  expect(await page.html()).toContain('150.00');
  expect(await page.html()).not.toContain(commerceCopy('zh').walletLoading);
  expect(await page.html()).not.toContain(commerceCopy('zh').walletRefresh);
  expect(page.view.walletState.value).toBe('loading');expect(page.view.canPay.value).toBe(false);
  await page.view.pay();expect(page.api.pay).not.toHaveBeenCalled();
  pending.resolve(false);await reading;
  expect(await page.html()).toContain(commerceCopy('zh').walletError);expect(page.view.canPay.value).toBe(false);
});

it('does not replace the quote while the selected voucher list is still loading',async()=>{
  const page=screen();await page.start();const pending=deferred<boolean>();
  page.vouchers.refreshRemote.mockReturnValueOnce(pending.promise);
  const opening=page.view.chooseVoucher();await flush();
  expect(page.view.voucherLoading.value).toBe(true);
  const automatic=vi.mocked(setInterval).mock.calls.find(([,delay])=>delay===30000)![0] as ()=>void;
  const quotes=page.api.quote.mock.calls.length;automatic();await flush();
  expect(page.api.quote).toHaveBeenCalledTimes(quotes);
  pending.resolve(true);await opening;
  expect(page.view.voucherLoading.value).toBe(false);
  expect(page.view.voucherOpen.value).toBe(true);
});

it('summarizes one eligible buyer device gift and retains its published rules entry',async()=>{
  const q=quote(),reward=q.expectedRewards[0];
  reward.reward={rewardRuleId:'gift',beneficiaryRole:'BUYER',type:'DEVICE',giftProductNo:'share',quantity:1,deviceRightsProfile:{policyId:'policy',version:1,contentHash:'hash'}};
  reward.disclosure.deviceName='Cloud Share';
  const page=screen();page.api.quote.mockResolvedValue(q);await page.start();
  const html=await page.html();expect(page.view.compactGift.value).toBeTruthy();
  expect(html).toContain('data-testid="checkout-gift-summary"');expect(html).toContain('Cloud Share × 1');
  expect(html).toContain(zh.promotion.checkoutGiftSettlement);expect(html).toContain(zh.promotion.rulesLink);
  expect(html).not.toContain('checkout-rewards-heading');expect(page.view.canCreate.value).toBe(true);
});
it.each(['inviter','message','ineligible','multiple','receipt'] as const)('does not compact a %s reward into an unconditional gift',async scenario=>{
  const q=quote(),reward=q.expectedRewards[0];
  reward.reward={rewardRuleId:'gift',beneficiaryRole:'BUYER',type:'DEVICE',giftProductNo:'share',quantity:1,deviceRightsProfile:{policyId:'policy',version:1,contentHash:'hash'}};
  reward.disclosure.deviceName='Cloud Share';
  if(scenario==='inviter'){reward.beneficiaryRole='DIRECT_INVITER';reward.reward.beneficiaryRole='DIRECT_INVITER';}
  if(scenario==='message')reward.message=text;
  if(scenario==='ineligible')reward.eligibility='INELIGIBLE';
  if(scenario==='multiple')q.expectedRewards.push({...reward,rewardRuleId:'gift-2'});
  const page=screen(scenario==='receipt'?{quote:q,order:receipt(q),pending:null}:undefined);page.api.quote.mockResolvedValue(q);await page.start();
  expect(page.view.compactGift.value).toBeNull();expect(await page.html()).not.toContain('data-testid="checkout-gift-summary"');
});

it('an order discount keeps the quoted amount through create, recovery and payment without subtracting it twice',async()=>{
  const q=quote();q.subtotalUsdt='1299.000000';q.discountUsdt='500.000000';q.promotionDiscountUsdt='500.000000';q.amountUsdt='799.000000';
  q.items=[{...q.items[0],unitPriceUsdt:q.subtotalUsdt,subtotalUsdt:q.subtotalUsdt,discountUsdt:q.discountUsdt,promotionDiscountUsdt:q.promotionDiscountUsdt,payableUsdt:q.amountUsdt}];
  q.expectedRewards=[{...q.expectedRewards[0],reward:{rewardRuleId:'gift',beneficiaryRole:'BUYER',type:'DISCOUNT_USDT',calculation:'FIXED',amount:'500.000000'}}];
  const order={...receipt(q),amountUsdt:q.amountUsdt},page=screen();
  page.api.quote.mockResolvedValue(q);page.api.create.mockResolvedValue(order);page.api.findOrder.mockResolvedValue(order);page.api.pay.mockResolvedValue({...order,paymentStatus:'PAID',orderStatus:'COMPLETED'});
  await page.start();expect(page.exposed.footer.value.amount).toBe('$799.00');
  await page.view.createOrder();expect(page.saved().order?.amountUsdt).toBe('799.000000');expect(page.saved().order?.rewards?.[0].reward.type).toBe('DISCOUNT_USDT');
  await page.view.recover();expect(page.exposed.footer.value.amount).toBe('$799.00');
  await page.view.pay();await page.methodSelection.wallet();
  expect(page.pin).toHaveBeenCalledWith(expect.objectContaining({amount:'799.000000',currency:'USDT'}),expect.any(Function),expect.any(Function));
  expect(page.api.pay).toHaveBeenCalledOnce();expect(page.saved().order?.paymentStatus).toBe('PAID');
});

it('closing method selection preserves the order; confirming it requests PIN and pays the same order once',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  await page.view.pay();expect(page.api.pay).not.toHaveBeenCalled();expect(page.saved().order?.paymentStatus).toBe('PENDING');
  expect(page.methodSelection.state.open).toBe(true);expect(page.pin).not.toHaveBeenCalled();
  await page.methodSelection.cancel();expect(page.api.cancel).not.toHaveBeenCalled();
  await page.view.pay();const pending=page.methodSelection.wallet();await page.methodSelection.wallet();await pending;
  expect(page.pin).toHaveBeenCalledOnce();expect(page.confirm).not.toHaveBeenCalled();
  expect(page.api.pay).toHaveBeenCalledWith('o1','original-key',page.authorization);expect(page.saved().order?.paymentStatus).toBe('PAID');
});
it('pending-order amounts read in dollars one to one and stay put while the wallet sheet is open',async()=>{
  const q={...quote(),discountUsdt:'20',amountUsdt:'100'};
  const original={...receipt(q),subtotalUsdt:'120',discountUsdt:'20',amountUsdt:'100'};
  const page=screen({quote:q,order:original,pending:null});page.api.findOrder.mockResolvedValue(original);await page.start();
  expect(page.exposed.footer.value).toMatchObject({amount:'$100.00',amountValue:'100',currency:'USD',disabled:false});
  let html=await page.html();expect(html).toContain('$120.00');expect(html).toContain('−20.00');expect(html).not.toContain('−20.00 USDT');expect(html).not.toContain('$—');
  await page.view.pay();expect(page.exposed.footer.value).toMatchObject({amount:'$100.00',currency:'USD'});
  html=await page.html();expect(html).toContain('$100.00');
  expect(page.saved().order).toMatchObject({amountUsdt:'100',paymentStatus:'PENDING'});expect(page.pin).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();expect(page.api.cancel).not.toHaveBeenCalled();
});
it('an unreadable eligibility before method selection offers a retry, never the method sheet or PIN',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();page.eligibility.mockRejectedValueOnce(new Error('read failed'));
  await page.view.pay();
  expect(page.view.paymentSheetOpen.value).toBe(false);expect(page.view.error.value).toBe(checkoutFlowCopy('zh').queryFailed);expect(page.confirm).not.toHaveBeenCalled();
  expect(page.pin).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();expect(page.saved().order?.paymentStatus).toBe('PENDING');
});
it('an overall rejected qualification on a later line blocks the whole original order',async()=>{
  const q=quote();q.quantity=2;q.itemCount=2;q.items.push({...q.items[0],lineId:'share',productNo:'share'});
  const original={...receipt(q),quantity:2,items:[...receipt(q).items!,{lineId:'second',productNo:'share',productName:'Share',quantity:1}]};
  const page=screen({quote:q,order:original,pending:null});page.api.findOrder.mockResolvedValue(original);await page.start();
  page.eligibility.mockImplementation(async productNo=>({eligible:productNo!=='share',policies:[{mode:'EITHER',conditions:[{met:true}]}]}));await page.view.pay();
  expect(page.eligibility.mock.calls).toEqual([['sku'],['share']]);expect(page.view.error.value).toBe(zh.store.gateBlockedToast);
  expect(page.confirm).toHaveBeenCalledWith(expect.objectContaining({title:checkoutFlowCopy('zh').cannotPay,message:zh.store.gateBlockedToast,confirmLabel:zh.promotion.cancelOrder}));
  expect(page.view.paymentSheetOpen.value).toBe(false);expect(page.pin).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});
it('an entry rejection can cancel the exact original pending order after explicit confirmation',async()=>{
  const original=receipt(),closed={...original,paymentStatus:'CANCELLED' as const,orderStatus:'CANCELLED' as const};
  const page=screen({quote:quote(),order:original,pending:null});await page.start();
  page.eligibility.mockResolvedValueOnce({eligible:false});page.confirm.mockResolvedValueOnce(true);page.api.cancel.mockResolvedValueOnce(closed);
  page.api.findOrder.mockResolvedValueOnce(original).mockResolvedValueOnce(closed);await page.view.pay();
  expect(page.api.cancel).toHaveBeenCalledExactlyOnceWith('o1','original-key');expect(page.saved().order?.paymentStatus).toBe('CANCELLED');
  expect(page.view.paymentSheetOpen.value).toBe(false);expect(page.pin).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});
it.each(['account','hide','runtime','session','order','amount','items','expired'] as const)('a %s change while entry qualification is pending cannot open a payment method',async change=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  const read=deferred<{eligible:boolean}>();page.eligibility.mockReturnValueOnce(read.promise);const pending=page.view.pay();await flush();
  if(change==='account')page.app.accountBindingEpoch++;
  if(change==='hide')page.exposed.hide();
  if(change==='runtime')page.runtime.epoch++;
  if(change==='session')page.sessionIdentity.revision++;
  if(change==='order')page.view.order.value.orderNo='another';
  if(change==='amount')page.view.order.value.amountUsdt='121';
  if(change==='items')page.view.order.value.items[0].quantity=2;
  if(change==='expired')page.view.order.value.payBy='2026-10-07T00:00:00Z';
  read.resolve({eligible:true});await pending;expect(page.view.paymentSheetOpen.value).toBe(false);expect(page.pin).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});
it('an explicit buy-again action restores checkout for the same paid cart without clearing it automatically',async()=>{
  const paid={...receipt(),paymentStatus:'PAID' as const,orderStatus:'COMPLETED' as const};
  const page=screen({quote:quote(),order:paid,pending:null});page.api.findOrder.mockResolvedValue(paid);await page.start();
  expect(await page.html()).toContain('data-testid="checkout-buy-again"');expect(page.saved().order?.paymentStatus).toBe('PAID');expect(page.api.quote).not.toHaveBeenCalled();
  await page.view.startNewPurchase();expect(page.api.quote).toHaveBeenCalledWith([{productNo:'sku',quantity:1}],'a1',null);
  expect(page.saved().order).toBeNull();expect(page.view.canCreate.value).toBe(true);expect(page.exposed.footer.value.amount).toBe('$120.00');
});
it('a directly opened paid order offers no new purchase action',async()=>{
  const paid={...receipt(),paymentStatus:'PAID' as const,orderStatus:'COMPLETED' as const};
  const page=screen({quote:quote(),order:paid,pending:null});page.props.orderNo='o1';page.api.findOrder.mockResolvedValue(paid);await page.start();
  expect(await page.html()).not.toContain('data-testid="checkout-buy-again"');await page.view.startNewPurchase();expect(page.saved().order?.paymentStatus).toBe('PAID');expect(page.api.quote).not.toHaveBeenCalled();
});
it.each(['hide','account','expired'] as const)('a delayed PIN after %s cannot submit payment',async change=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  const decision=deferred<boolean>();page.pin.mockImplementationOnce(async(_context,command,current)=>{await decision.promise;page.view.updateClock();return current()?command(page.authorization):null;});await page.view.pay();const pending=page.methodSelection.wallet();
  if(change==='hide'){page.exposed.hide();expect(page.clearConfirmsBy).toHaveBeenCalledWith(expect.stringContaining('promotion-payment:'));}
  if(change==='account')page.app.accountBindingEpoch++;
  if(change==='expired')page.view.order.value.payBy='2026-10-07T00:00:00Z';
  decision.resolve(true);await pending;expect(page.api.pay).not.toHaveBeenCalled();
});

it('new items checkout opens the method sheet after one create action without submitting payment',async()=>{
  const page=screen();await page.start();await page.exposed.footer.value.action();
  expect(page.api.create).toHaveBeenCalledOnce();expect(page.methodSelection.state.open).toBe(true);
  expect(page.pin).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});
it('PIN cancellation retains the original pending order and never cancels or creates another',async()=>{
  const page=screen();await page.start();await page.view.createOrder();page.pin.mockResolvedValueOnce(null);
  await page.methodSelection.wallet();expect(page.saved().order?.orderNo).toBe('o1');
  expect(page.saved().order?.paymentStatus).toBe('PENDING');expect(page.api.create).toHaveBeenCalledOnce();
  expect(page.api.pay).not.toHaveBeenCalled();expect(page.api.cancel).not.toHaveBeenCalled();
});
it('pays the original multi-quantity and Cloud Share lines without requoting or a client stock read',async()=>{
  const q=quote();q.quantity=3;q.itemCount=2;q.items=[{...q.items[0],quantity:2},{...q.items[0],lineId:'share',productNo:'cloud-share',quantity:1}];
  const original={...receipt(q),quantity:3,items:[{lineId:'9001',productNo:'sku',productName:'Device',quantity:2},{lineId:'9002',productNo:'cloud-share',productName:'Cloud Share',quantity:1}]};
  const page=screen({quote:q,order:original,pending:null});page.api.findOrder.mockResolvedValue(original);page.api.pay.mockResolvedValue({...original,paymentStatus:'PAID',orderStatus:'COMPLETED'});
  await page.start();await page.view.pay();
  expect(page.eligibility.mock.calls).toEqual([['sku'],['cloud-share']]);
  await page.methodSelection.wallet();expect(page.api.pay).toHaveBeenCalledOnce();
  expect(page.api.quote).not.toHaveBeenCalled();expect(page.api.create).not.toHaveBeenCalled();expect(page.saved().order?.amountUsdt).toBe(original.amountUsdt);
});
it.each(['CAPACITY_REPLACEMENT_REQUIRED','ORDER_PRODUCT_NOT_PAYABLE'])('a definitive %s refusal names the reason and offers original-order cancellation',async code=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();await page.view.pay();
  const failure=new ApiError({kind:'business',message:code,status:409,code:409});
  page.api.pay.mockRejectedValueOnce(failure);page.confirm.mockResolvedValueOnce(true);
  const cancelled={...receipt(),paymentStatus:'CANCELLED',orderStatus:'CANCELLED'};
  page.api.cancel.mockResolvedValue(cancelled);page.api.paymentCommand.mockResolvedValue({status:'REJECTED',canResumeSameKey:false});
  page.api.findOrder.mockResolvedValueOnce(receipt()).mockResolvedValueOnce(cancelled);
  await expect(page.methodSelection.wallet()).rejects.toBe(failure);
  expect(page.confirm).toHaveBeenCalledWith(expect.objectContaining({title:checkoutFlowCopy('zh').cannotPay,message:orderPaymentRejection(failure,'zh'),confirmLabel:zh.promotion.cancelOrder}));
});
it.each(['account','hide','order','amount','expired'] as const)('a %s change during PIN prevents the payment command',async change=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();await page.view.pay();
  page.pin.mockImplementationOnce(async(_context:any,command:any,current:()=>boolean)=>{
    if(change==='account')page.app.accountBindingEpoch++;
    if(change==='hide')page.exposed.hide();
    if(change==='order')page.view.order.value.orderNo='other-order';
    if(change==='amount')page.view.order.value.amountUsdt='121';
    if(change==='expired')page.view.order.value.payBy='2026-10-07T00:00:00Z';
    return command(page.authorization);
  });
  await page.methodSelection.wallet();expect(page.api.pay).not.toHaveBeenCalled();expect(page.saved().pending).toBeNull();
});
it('an already sent unknown payment is read only and cannot send another payment',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();await page.view.pay();
  const failure=new ApiError({kind:'network',message:'timeout'});page.api.pay.mockRejectedValueOnce(failure);await expect(page.methodSelection.wallet()).rejects.toBe(failure);
  page.api.paymentCommand.mockResolvedValue({status:'PROCESSING',canResumeSameKey:false});await page.view.recover();await page.view.pay();await page.methodSelection.wallet();
  expect(page.api.paymentCommand).toHaveBeenCalled();expect(page.view.unknown.value).toBe(true);expect(page.api.pay).toHaveBeenCalledOnce();
});
it('top-up closes the method sheet while preserving the original pending order',async()=>{
  const page=screen();await page.start();await page.view.createOrder();await page.methodSelection.cancel();page.view.openWalletTopup();
  expect(page.view.paymentSheetOpen.value).toBe(false);expect(page.navTo).toHaveBeenCalledWith('/pages/me/wallet-topup');
  expect(page.saved().order?.paymentStatus).toBe('PENDING');expect(page.api.cancel).not.toHaveBeenCalled();
  await expect(page.view.allowAuxiliaryNavigation()).resolves.toBe(true);
});
it('top return cancels the original order and waits for its canonical cancelled readback',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  const closed={...receipt(),paymentStatus:'CANCELLED' as const,orderStatus:'CANCELLED' as const};
  const read=deferred<OrderReceipt>();page.api.cancel.mockResolvedValue(closed);
  page.api.findOrder.mockResolvedValueOnce(receipt()).mockReturnValueOnce(read.promise);
  const exit=page.view.requestLeave();await flush();expect(page.api.cancel).toHaveBeenCalledWith('o1','original-key');
  expect(page.view.leaving.value).toBe(true);expect(page.navBack).not.toHaveBeenCalled();
  read.resolve(closed);await expect(exit).resolves.toBe(true);expect(page.saved().order?.paymentStatus).toBe('CANCELLED');
});
it('a failed cancellation readback stays on the original order and exposes a retry',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  page.api.cancel.mockRejectedValue(new ApiError({kind:'network',message:'OFFLINE'}));
  await expect(page.view.requestLeave()).resolves.toBe(false);expect(page.navBack).not.toHaveBeenCalled();
  expect(page.saved().pending).toMatchObject({operation:'cancelOrder',targetId:'o1',key:'original-key'});
  expect(page.view.error.value).toBe(checkoutFlowCopy('zh').cancelFailed);expect(page.api.create).not.toHaveBeenCalled();
  const closed={...receipt(),paymentStatus:'CANCELLED' as const,orderStatus:'CANCELLED' as const};
  page.api.command.mockResolvedValue({status:'SUCCEEDED',order:closed});
  await expect(page.view.requestLeave()).resolves.toBe(true);expect(page.api.cancel).toHaveBeenCalledOnce();
});
it('a cancellation acknowledgement without its required readback never permits leaving',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  const closed={...receipt(),paymentStatus:'CANCELLED' as const,orderStatus:'CANCELLED' as const};
  page.api.cancel.mockResolvedValue(closed);page.api.findOrder.mockResolvedValueOnce(receipt()).mockRejectedValue(new Error('readback offline'));
  await expect(page.view.requestLeave()).resolves.toBe(false);expect(page.saved().order?.paymentStatus).toBe('CANCELLED');
  await expect(page.view.requestLeave()).resolves.toBe(false);expect(page.navBack).not.toHaveBeenCalled();
  page.api.findOrder.mockResolvedValue(closed);await expect(page.view.requestLeave()).resolves.toBe(true);
  expect(page.api.cancel).toHaveBeenCalledOnce();
});
it('an original-order read failure cannot open payment from an earlier pending receipt',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});await page.start();
  page.api.findOrder.mockRejectedValue(new Error('offline'));await page.view.pay();
  expect(page.view.paymentSheetOpen.value).toBe(false);expect(page.pin).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});
it('an unknown payment command cannot be raced by a top-return cancellation',async()=>{
  const page=screen({quote:quote(),order:receipt(),pending:{operation:'payOrder',targetId:'o1',key:'original-pay'}});
  page.api.paymentCommand.mockResolvedValue({status:'PROCESSING',canResumeSameKey:false});await page.start();
  await expect(page.view.requestLeave()).resolves.toBe(false);expect(page.api.cancel).not.toHaveBeenCalled();
  expect(page.saved().pending?.key).toBe('original-pay');
});
it('missing trusted order time disables top return without discarding the original order',async()=>{
  const original={...receipt(),payBy:undefined};
  const page=screen({quote:null,order:original,pending:null});page.api.findOrder.mockResolvedValue(original);await page.start();
  expect(page.exposed.backDisabled.value).toBe(true);await expect(page.view.requestLeave()).resolves.toBe(false);
  expect(page.api.cancel).not.toHaveBeenCalled();expect(page.saved().order?.orderNo).toBe('o1');
});
it.each(['activated','inventory','provisioning'] as const)('PAID waits for canonical %s plus a fresh fleet and never repays',async status=>{
  const paid={...receipt(),paymentStatus:'PAID' as const,orderStatus:'COMPLETED' as const};
  const page=screen({quote:quote(),order:paid,pending:null}),read=deferred<{id:string;status:string}>();
  page.api.findOrder.mockResolvedValue(paid);page.canonical.mockReturnValueOnce(read.promise);
  const start=page.start();await flush();expect(page.view.resultState.value).toBe('processing');
  read.resolve({id:'o1',status});await start;
  expect(page.view.resultState.value).toBe(status==='provisioning'?'processing':status);
  expect(page.api.pay).not.toHaveBeenCalled();expect(page.app.refreshRemoteFleet).toHaveBeenCalled();
  page.view.viewDevices();expect(page.navReset).toHaveBeenCalledWith('/pages/me/devices');expect(page.navTo).not.toHaveBeenCalledWith('/pages/me/devices');
});
it('a failed or stale activation read cannot celebrate a paid receipt',async()=>{
  const paid={...receipt(),paymentStatus:'PAID' as const,orderStatus:'COMPLETED' as const};
  const page=screen({quote:quote(),order:paid,pending:null});page.api.findOrder.mockResolvedValue(paid);
  page.canonical.mockRejectedValueOnce(new Error('unavailable'));await page.start();
  expect(page.view.resultState.value).toBe('error');expect(page.api.pay).not.toHaveBeenCalled();
  page.view.viewDevices();expect(page.navReset).toHaveBeenCalledWith('/pages/me/devices');expect(page.navTo).not.toHaveBeenCalledWith('/pages/me/devices');
  const read=deferred<{id:string;status:string}>();page.canonical.mockReturnValueOnce(read.promise);
  const retry=page.view.readActivation();await flush();page.exposed.hide();read.resolve({id:'o1',status:'activated'});await retry;
  expect(page.view.resultState.value).not.toBe('activated');expect(page.api.pay).not.toHaveBeenCalled();
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
  const html=await page.html();expect(html).not.toContain(zh.promotion.expected);expect(html).not.toContain('旧活动标题');expect(html).not.toContain(zh.promotion.rulesLink);expect(html).toContain(zh.empty.errorCta);
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
  page.exposed.show();await flush();
  if(operation==='payOrder')expect(page.api.paymentCommand).toHaveBeenLastCalledWith('original-key');
  else expect(page.api.command).toHaveBeenLastCalledWith('original-key',operation,pending.targetId);
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
  const page=screen();await page.start();page.view.session.selectVoucher('voucher-7');page.view.voucherId.value='voucher-7';
  const next=deferred<Quote>();page.api.quote.mockReturnValueOnce(next.promise);
  const edit=page.view.changeQuantity('sku',1);
  expect(page.api.quote).toHaveBeenLastCalledWith([{productNo:'sku',quantity:2}],'a1','voucher-7');
  expect(page.props.items).toEqual([{productNo:'sku',quantity:1}]);
  expect(page.view.items.value).toEqual([{productNo:'sku',quantity:2}]);
  expect(page.saved().quote).toBeNull();expect(page.view.quote.value).toBeNull();expect(page.view.rewards.value).toEqual([]);
  expect(page.exposed.footer.value).toMatchObject({amount:'$—',disabled:true});
  await page.view.changeQuantity('sku',1);await page.exposed.footer.value.action();
  expect(page.api.quote).toHaveBeenCalledTimes(2);expect(page.api.create).not.toHaveBeenCalled();
  next.resolve(selectedQuote([{productNo:'sku',quantity:2}]));await edit;
  expect(page.exposed.footer.value).toMatchObject({amount:'$2,580.87',disabled:false});
  const html=await page.html();expect(html).toContain('$2,598.00');expect(html).toContain('−17.13');expect(html).toContain('$2,580.87');
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
  if(outcome!=='ineligible'){expect(page.view.quote.value).toBeNull();expect(page.exposed.footer.value.amount).toBe('$—');}
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
  const page=screen();await page.start();page.vouchers.claimedUnused=[voucherDef('voucher-old',10)];
  await page.view.chooseVoucher();
  page.api.quote.mockResolvedValueOnce(selectedQuote([{productNo:'sku',quantity:2}]));await page.view.changeQuantity('sku',1);
  expect(page.view.voucherOpen.value).toBe(false);
  const reads=page.api.quote.mock.calls.length;
  await page.view.selectVoucher('voucher-old');await flush();
  expect(page.view.voucherId.value).toBeNull();expect(page.api.quote).toHaveBeenCalledTimes(reads);
});

it('automatically selects the best eligible server quote, not the largest advertised coupon',async()=>{
  const page=screen();
  page.vouchers.claimedUnused=[voucherDef('large',50),voucherDef('best',20),voucherDef('wrong-sku',100,{applicableSkus:['other']}),voucherDef('expired',100,{endAt:1}),voucherDef('threshold',100,{minPurchaseUSD:200})];
  page.api.quote.mockImplementation(async(_items,_activity,id)=>({...quote(String(id)),amountUsdt:id==='best'?'100':id==='large'?'115':'120'}));
  await page.start();
  expect(page.api.quote.mock.calls.map(call=>call[2])).toEqual([null,'large','best']);
  expect(page.view.voucherId.value).toBe('best');expect(page.saved().voucherMode).toBe('auto');
  expect(page.exposed.footer.value.amount).toBe('$100.00');expect(page.api.create).not.toHaveBeenCalled();
});
it('manual opt-out survives requote, hide/show and reload without silently choosing another voucher',async()=>{
  const page=screen();page.vouchers.claimedUnused=[voucherDef('best',20)];
  page.api.quote.mockImplementation(async(_items,_activity,id)=>({...quote(),amountUsdt:id?'100':'120'}));
  await page.start();await page.view.chooseVoucher();await page.view.selectVoucher(null);
  expect(page.saved()).toMatchObject({voucherId:null,voucherMode:'manual'});
  page.exposed.hide();page.exposed.show();await flush();
  expect(page.api.quote).toHaveBeenLastCalledWith([{productNo:'sku',quantity:1}],'a1',null);
  const reloaded=screen(page.saved());reloaded.vouchers.claimedUnused=[voucherDef('best',20)];await reloaded.start();
  expect(reloaded.api.quote).toHaveBeenCalledOnce();expect(reloaded.view.voucherId.value).toBeNull();
});
it('a server-rejected auto coupon is skipped but a transport failure invalidates the entire quote',async()=>{
  const page=screen();page.vouchers.claimedUnused=[voucherDef('rejected',50),voucherDef('valid',20)];
  page.api.quote.mockImplementation(async(_items,_activity,id)=>{
    if(id==='rejected')throw new ApiError({kind:'business',message:'VOUCHER_NOT_APPLICABLE'});
    return {...quote(),amountUsdt:id?'100':'120'};
  });await page.start();expect(page.view.voucherId.value).toBe('valid');
  page.api.quote.mockImplementation(async(_items,_activity,id)=>{if(id)throw new Error('offline');return quote();});
  await page.view.loadQuote();await page.view.createOrder();
  expect(page.view.quote.value).toBeNull();expect(page.view.canCreate.value).toBe(false);expect(page.api.create).not.toHaveBeenCalled();
});
it('manual voucher choice cannot change after creating the original order or while its command is unresolved',async()=>{
  const page=screen();await page.start();await page.view.chooseVoucher();
  await page.view.createOrder();await page.view.selectVoucher(null);
  expect(page.saved().order?.orderNo).toBe('o1');expect(page.saved().voucherMode).toBe('auto');
  expect(page.api.quote).toHaveBeenCalledOnce();
});

const eventEntry={activityId:'',voucherId:'BF20',upgradeActivityId:'pro-upgrade'};
const bf20=voucherDef('BF20',20,{name:'Black Friday 20%'});
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
it.each([true,false])('an idempotent claim result %s cannot authorize an already-used voucher',async claimed=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimableVouchers=[bf20];await page.start();
  page.vouchers.claimRemote.mockImplementation(async()=>{page.vouchers.claimableVouchers=[];return claimed;});await page.view.claimEventVoucher();
  expect(page.view.eventVoucherStatus.value).toBe('unavailable');expect(page.api.quote).not.toHaveBeenCalled();expect(page.exposed.footer.value.disabled).toBe(true);
  expect(await page.html()).toContain(zh.promotion.eventVoucherUnavailable);
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
  await page.methodSelection.wallet();expect(page.api.pay).toHaveBeenCalledWith('o1','original-key',page.authorization);
  expect(page.saved().order).toMatchObject({amountUsdt:'80.000000',paymentStatus:'PAID',rewards:[]});
});
it.each(['INELIGIBLE','UNKNOWN'] as const)('BF20 must never override a selected promotion whose quote is %s',async eligibility=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimedUnused=[bf20];page.api.quote.mockResolvedValue({...quote(),eligibility});await page.start();
  expect(page.exposed.footer.value.disabled).toBe(true);await page.view.createOrder();expect(page.api.create).not.toHaveBeenCalled();
  await expect(page.view.session.create()).rejects.toThrow('QUOTE_NOT_CONFIRMABLE');
});

it('loads the authoritative balance on entry and hides stale money until a failed refresh is retried',async()=>{
  const page=screen(),read=deferred<boolean>();page.app.user.usdtBalance=999;
  page.app.refreshRemoteFleet.mockReturnValueOnce(read.promise);
  const initial=page.start();await flush();expect(page.view.walletState.value).toBe('loading');
  read.resolve(false);await initial;
  expect(page.view.walletState.value).toBe('error');expect(await page.html()).not.toContain('999.00');
  expect(await page.html()).toContain(zh.empty.errorCta);
  expect(await page.html()).not.toContain(commerceCopy('zh').walletRefresh);
  await page.view.createOrder();expect(page.view.canPay.value).toBe(false);
  page.app.refreshRemoteFleet.mockImplementation(async()=>{page.app.user.usdtBalance=150;return true;});
  await page.view.refreshWallet();await page.methodSelection.cancel();expect(page.view.canPay.value).toBe(true);expect(await page.html()).toContain('150.00');
});
it('returning from top-up restores the rendered quote, wallet and create action after the hidden page rendered',async()=>{
  const page=screen(undefined,{activityId:''});await page.start();
  expect(page.exposed.footer.value).toMatchObject({amount:'$120.00',disabled:false});
  expect(await page.html()).toContain('data-testid="checkout-payment"');
  page.exposed.hide();await flush();
  expect(page.view.displayQuote.value).toBeNull();expect(page.view.canCreate.value).toBe(false);
  expect(await page.html()).not.toContain('data-testid="checkout-payment"');
  page.api.quote.mockResolvedValue({...quote('returned'),amountUsdt:'119',subtotalUsdt:'119'});
  page.app.refreshRemoteFleet.mockImplementation(async()=>{page.app.user.usdtBalance=20;return true;});
  page.exposed.show();await flush();
  expect(page.view.displayQuote.value?.quoteId).toBe('returned');
  expect(page.exposed.footer.value).toMatchObject({amount:'$119.00',disabled:false});
  const html=await page.html();expect(html).toContain('data-testid="checkout-payment"');expect(html).toContain('20.00');expect(html).not.toContain('20.00 USDT');expect(html).toContain('data-testid="checkout-fees"');
  expect(page.api.quote).toHaveBeenCalledTimes(2);expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();expect(page.key).not.toHaveBeenCalled();
});
it.each(['hidden','returned'] as const)('top-up return recovers after an old quote finishes while %s',async boundary=>{
  const page=screen(undefined,{activityId:''});await page.start();
  const late=deferred<Quote>();page.api.quote.mockReturnValueOnce(late.promise);
  const read=page.view.loadQuote();await flush();page.exposed.hide();await flush();
  expect(page.view.displayQuote.value).toBeNull();expect(page.view.canCreate.value).toBe(false);await page.html();
  page.api.quote.mockResolvedValue({...quote('returned'),amountUsdt:'119'});
  if(boundary==='returned')page.exposed.show();
  late.resolve(quote('hidden-read'));await read;await flush();
  if(boundary==='hidden')page.exposed.show();await flush();
  expect(page.view.loading.value).toBe(false);expect(page.view.busy.value).toBe(false);
  expect(page.view.displayQuote.value?.quoteId).toBe('returned');
  expect(page.exposed.footer.value).toMatchObject({amount:'$119.00',disabled:false});
  expect(page.api.quote).toHaveBeenCalledTimes(3);expect(page.api.create).not.toHaveBeenCalled();expect(page.key).not.toHaveBeenCalled();
});
it('a failed top-up return offers retry and restores only the newly read quote',async()=>{
  const page=screen(undefined,{activityId:''});await page.start();page.exposed.hide();await page.html();
  page.api.quote.mockRejectedValueOnce(new ApiError({kind:'network',message:'offline'}));
  page.exposed.show();await flush();
  expect(page.view.displayQuote.value).toBeNull();expect(page.view.canCreate.value).toBe(false);
  expect(await page.html()).toContain(zh.empty.errorCta);
  page.api.quote.mockResolvedValue(quote('retry'));await page.view.loadQuote();
  expect(page.view.displayQuote.value?.quoteId).toBe('retry');expect(page.exposed.footer.value.disabled).toBe(false);
  expect(page.api.create).not.toHaveBeenCalled();expect(page.key).not.toHaveBeenCalled();
});
it('returning after an account change cannot revive the hidden account checkout',async()=>{
  const page=screen(undefined,{activityId:''});await page.start();
  const late=deferred<Quote>();page.api.quote.mockReturnValueOnce(late.promise);
  const read=page.view.loadQuote();page.exposed.hide();await page.html();
  page.app.accountKey='user:8';page.app.accountBindingEpoch++;
  late.resolve(quote('old-account'));await read;page.exposed.show();await flush();
  expect(page.view.displayQuote.value).toBeNull();expect(page.view.canCreate.value).toBe(false);
  await page.view.createOrder();expect(page.api.create).not.toHaveBeenCalled();expect(page.key).not.toHaveBeenCalled();
  expect(page.api.quote).toHaveBeenCalledTimes(2);expect(page.app.refreshRemoteFleet).toHaveBeenCalledOnce();
  expect(await page.html()).not.toContain('data-testid="checkout-payment"');
});
it('refreshes the post-payment balance and keeps a wallet read failure separate from the paid receipt',async()=>{
  const page=screen();await page.start();await page.view.createOrder();
  page.app.refreshRemoteFleet.mockResolvedValueOnce(false);await page.methodSelection.wallet();
  expect(page.saved().order?.paymentStatus).toBe('PAID');expect(page.view.walletState.value).toBe('error');
  expect(page.api.pay).toHaveBeenCalledOnce();expect(await page.html()).not.toContain('150.00 USDT');
  page.api.findOrder.mockResolvedValue({...receipt(),paymentStatus:'PAID',orderStatus:'COMPLETED'});
  page.app.refreshRemoteFleet.mockImplementation(async()=>{page.app.user.usdtBalance=30;return true;});
  await page.view.recover();expect(page.app.user.usdtBalance).toBe(30);expect(page.view.resultState.value).toBe('activated');expect(page.api.pay).toHaveBeenCalledOnce();
});
it.each(['hide','account'])('a late wallet read after %s cannot mark the balance ready or unlock payment',async boundary=>{
  const page=screen();await page.start();await page.view.createOrder();const read=deferred<boolean>();
  page.app.refreshRemoteFleet.mockReturnValueOnce(read.promise);const pending=page.view.refreshWallet();
  if(boundary==='hide')page.exposed.hide();else page.app.accountBindingEpoch++;
  read.resolve(true);await pending;expect(page.view.walletState.value).not.toBe('ready');expect(page.view.canPay.value).toBe(false);
});
it.each(['CANCELLED','EXPIRED','REFUNDED'] as const)('%s retains frozen rules without promising unissued rewards',async paymentStatus=>{
  const page=screen({quote:quote(),order:receipt(),pending:null});page.api.findOrder.mockResolvedValue({...receipt(),paymentStatus});await page.start();
  const html=await page.html();expect(html).toContain(commerceCopy('zh').releasedRewards);expect(html).not.toContain(zh.promotion.rewardNote);
  expect(page.view.disclosures.value.length).toBe(1);expect(page.api.pay).not.toHaveBeenCalled();
});

it('a server-confirmed zero-pay voucher order remains executable without inventing a wallet balance',async()=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimedUnused=[bf20];
  const base=voucherOnlyQuote('sku');
  const q={...base,amountUsdt:'0.000000',discountUsdt:base.subtotalUsdt,items:base.items.map(line=>({...line,discountUsdt:line.subtotalUsdt,payableUsdt:'0.000000'}))};
  const order={...receipt(q),amountUsdt:q.amountUsdt,payBy:q.expiresAt,rewards:[]};
  page.api.quote.mockResolvedValue(q);page.api.create.mockResolvedValue(order);
  page.api.pay.mockResolvedValue({...order,paymentStatus:'PAID',orderStatus:'COMPLETED'});
  const pinDecision=deferred<boolean>();page.pin.mockImplementationOnce(async(_context,command,current)=>{await pinDecision.promise;return current()?command(page.authorization):null;});
  page.app.refreshRemoteFleet.mockResolvedValue(false);await page.start();await page.view.createOrder();
  expect(page.methodSelection.request).not.toHaveBeenCalled();expect(page.pin).toHaveBeenCalledOnce();expect(page.api.pay).not.toHaveBeenCalled();pinDecision.resolve(true);await page.methodSelection.finished();
  expect(page.pin).toHaveBeenCalledOnce();expect(page.api.pay).toHaveBeenCalledWith('o1','original-key',page.authorization);expect(page.saved().order?.paymentStatus).toBe('PAID');
  expect(page.view.walletState.value).toBe('error');
});

// Run the real catalog and App stores as well as the complete checkout setup.
// Only HTTP responses are deferred: catalog completion really advances the
// runtime epoch, and App really rejects superseded fleet projections.
const catalogSnapshot:ProductCatalogSnapshot={products:[],source:'server',serverCanonical:true,revision:'r1',sourceEnvironment:'PRODUCTION',runId:''};
function walletFleet(walletUsdt:number):CanonicalE3Fleet {
  return {walletUsdt,walletNex:0,dailyUsdt:0,dailyNex:0,realizedTodayUsdt:0,realizedTodayNex:0,
    userJoinedAt:1,serverNow:Date.parse(serverTime),timezone:'UTC',slotCap:10,devices:[],
    source:'nx_user_device + nx_compute_receipt + nx_compute_e3_config',sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true,
    capacitySchedule:{stageEarlyEnd:'3',stageMidEnd:'8',capacityFloorPct:'22',capacitySubsidyDays:'30',
      capacityBand1DeltaPct:'-4',capacityBand2DeltaPct:'-6',capacityBand3DeltaPct:'-23.7',
      capacityApplyToPhone:'false',capacityApplyToCloudShare:'false',capacityApplyToPcGpu:'false',
      capacityApplyToS1:'true',capacityApplyToPro:'true',capacityApplyToProV2:'true',capacityApplyToRackP1:'true',capacityApplyToRackP2:'true'}};
}
function walletRace(stored?:PromotionCheckoutRecord,input?:Parameters<typeof screen>[1]) {
  setActivePinia(createPinia());
  const catalogRead=deferred<ProductCatalogSnapshot>(),walletRead=deferred<CanonicalE3Fleet>();
  walletRemote.sessionVault.read.mockReturnValue({user:{userId:7}});
  walletRemote.withdrawalApi.list.mockResolvedValue([]);
  walletRemote.taskAssignmentApi.state.mockResolvedValue({serverNow:Date.parse(serverTime),devices:[],source:'server',sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true});
  walletRemote.productCatalogApi.catalog.mockReset().mockReturnValueOnce(catalogRead.promise);
  walletRemote.deviceE3Api.fleet.mockReset().mockReturnValueOnce(walletRead.promise);
  prepareProductCatalog();
  const app=useRealApp();app.bindAccount('user:7');
  const page=screen(stored,input,{app,refreshCatalog:refreshProductCatalog});
  return {page,app,catalogRead,walletRead};
}
it.each([
  {name:'same SKU twice',activityId:'',items:[{productNo:'sku',quantity:2}]},
  {name:'ordinary two-SKU bundle',activityId:'',items:[{productNo:'sku',quantity:1},{productNo:'pro',quantity:1}]},
  {name:'three-SKU activity',activityId:'multi',items:[{productNo:'sku',quantity:1},{productNo:'pro',quantity:1},{productNo:'p1',quantity:1}]},
])('$name automatically reads its wallet after catalog completion without a manual retry',async({activityId,items})=>{
  const {page,app,catalogRead,walletRead}=walletRace(undefined,{activityId,items});
  const quantity=items.reduce((sum,item)=>sum+item.quantity,0),amount=String(120*quantity);
  const q={...quote(),items:items.map(item=>({...quote().items[0],...item,lineId:item.productNo,subtotalUsdt:String(120*item.quantity),payableUsdt:String(120*item.quantity)})),itemCount:items.length,quantity,subtotalUsdt:amount,amountUsdt:amount,expectedRewards:[]};
  page.api.quote.mockResolvedValue(q);page.api.create.mockResolvedValue({...receipt(q),quantity,amountUsdt:amount,items:q.items});
  const initial=page.start();await flush();
  expect(page.view.walletState.value).toBe('loading');expect(walletRemote.deviceE3Api.fleet).not.toHaveBeenCalled();
  expect(app.remoteFleetHasSnapshot).toBe(false);
  catalogRead.resolve(catalogSnapshot);await flush();expect(walletRemote.deviceE3Api.fleet).toHaveBeenCalledOnce();
  walletRead.resolve(walletFleet(10000));await initial;
  expect(page.view.walletState.value).toBe('ready');expect(app.user.usdtBalance).toBe(10000);
  await page.view.createOrder();expect(page.methodSelection.state.open).toBe(true);walletRemote.deviceE3Api.fleet.mockResolvedValueOnce(walletFleet(10000));await page.methodSelection.cancel();expect(page.view.canPay.value).toBe(true);
  expect(await page.html()).toContain('10,000.00');expect(await page.html()).not.toContain(commerceCopy('zh').walletError);
});
it('does not join a pre-catalog fleet read even when that old read finishes after the current wallet',async()=>{
  const {page,app,catalogRead,walletRead:stale}=walletRace(),fresh=deferred<CanonicalE3Fleet>();
  const old=app.refreshRemoteFleet();walletRemote.deviceE3Api.fleet.mockReturnValueOnce(fresh.promise);
  const initial=page.start();catalogRead.resolve(catalogSnapshot);await flush();
  expect(walletRemote.deviceE3Api.fleet).toHaveBeenCalledTimes(2);
  fresh.resolve(walletFleet(150));await initial;stale.resolve(walletFleet(999));await expect(old).resolves.toBe(false);
  expect(page.view.walletState.value).toBe('ready');expect(app.user.usdtBalance).toBe(150);
});
it('joins an in-flight current-scope lifecycle read but forces a fresh balance after payment',async()=>{
  const {page,app,catalogRead,walletRead}=walletRace();
  const initial=page.start();catalogRead.resolve(catalogSnapshot);walletRead.resolve(walletFleet(150));await initial;await page.view.createOrder();
  const beforePay=deferred<CanonicalE3Fleet>(),afterPay=deferred<CanonicalE3Fleet>();
  walletRemote.deviceE3Api.fleet.mockReturnValueOnce(beforePay.promise).mockReturnValueOnce(afterPay.promise);
  const background=app.refreshRemoteFleet(),joined=page.view.refreshWallet(true);
  await flush();expect(walletRemote.deviceE3Api.fleet).toHaveBeenCalledTimes(2);
  beforePay.resolve(walletFleet(150));await Promise.all([background,joined]);expect(page.view.walletState.value).toBe('ready');expect(page.methodSelection.state.open).toBe(true);expect(page.pin).not.toHaveBeenCalled();
  // A new background read was captured before payment; the mutation readback
  // must supersede it, rather than reusing its pre-payment balance.
  const stale=deferred<CanonicalE3Fleet>();walletRemote.deviceE3Api.fleet.mockReset().mockReturnValueOnce(stale.promise).mockReturnValueOnce(afterPay.promise);
  const old=app.refreshRemoteFleet();const paid=page.methodSelection.wallet();
  await vi.waitFor(()=>{expect(walletRemote.deviceE3Api.fleet).toHaveBeenCalledTimes(2);expect(page.view.walletState.value).toBe('loading');});
  afterPay.resolve(walletFleet(30));await paid;stale.resolve(walletFleet(150));await expect(old).resolves.toBe(false);
  expect(page.saved().order?.paymentStatus).toBe('PAID');expect(page.api.pay).toHaveBeenCalledOnce();
  expect(app.user.usdtBalance).toBe(30);expect(page.view.walletState.value).toBe('ready');
});
it('a real fleet failure remains locked until a successful explicit retry',async()=>{
  const {page,app,catalogRead,walletRead}=walletRace();
  const initial=page.start();catalogRead.resolve(catalogSnapshot);await flush();walletRead.reject(new Error('network unavailable'));await initial;
  await page.view.createOrder();expect(app.remoteFleetHasSnapshot).toBe(false);expect(page.view.walletState.value).toBe('error');expect(page.view.canPay.value).toBe(false);
  await page.view.pay();expect(page.api.pay).not.toHaveBeenCalled();
  walletRemote.deviceE3Api.fleet.mockResolvedValueOnce(walletFleet(150));await page.view.refreshWallet();
  expect(page.view.walletState.value).toBe('ready');await page.methodSelection.cancel();expect(page.view.canPay.value).toBe(true);
});
it('original-order recovery starts before a slow catalog and survives its failure',async()=>{
  const {page,catalogRead,walletRead}=walletRace({quote:quote(),order:receipt(),pending:null});
  const initial=page.start();await flush();expect(page.api.findOrder).toHaveBeenCalledWith('o1');
  expect(page.saved().order?.orderNo).toBe('o1');expect(page.api.quote).not.toHaveBeenCalled();
  expect(walletRemote.deviceE3Api.fleet).not.toHaveBeenCalled();
  catalogRead.reject(new Error('catalog unavailable'));await flush();walletRead.resolve(walletFleet(150));await initial;
  expect(page.view.canPay.value).toBe(true);expect(page.api.create).not.toHaveBeenCalled();
});
it.each(['hide','account'] as const)('catalog completion after %s cannot launch a wallet read for the obsolete page',async boundary=>{
  const {page,app,catalogRead}=walletRace();const initial=page.start();await flush();
  if(boundary==='hide')page.exposed.hide();else app.bindAccount('user:8');
  catalogRead.resolve(catalogSnapshot);await initial;
  expect(walletRemote.deviceE3Api.fleet).not.toHaveBeenCalled();expect(page.view.walletState.value).not.toBe('ready');expect(page.view.canPay.value).toBe(false);
});

it.each([
  ['0.000000','0.00'],['0.000001','0.00'],['0.004000','0.00'],
  ['0.009000','0.01'],['0.010000','0.01'],['1.234567','1.23'],
])('two-decimal presentation of %s USDT preserves the original quote, PIN amount and receipt',async(amount,display)=>{
  const q={...quote(),amountUsdt:amount,subtotalUsdt:amount,discountUsdt:'0.000000',expectedRewards:[],items:quote().items.map(item=>({...item,unitPriceUsdt:amount,subtotalUsdt:amount,discountUsdt:'0.000000',payableUsdt:amount}))};
  const original={...receipt(q),amountUsdt:amount,subtotalUsdt:amount,discountUsdt:'0.000000',rewards:[]};
  expect((await createPromotionApi({request:vi.fn().mockResolvedValue(q)} as any).quote([{productNo:'sku',quantity:1}],'a1')).amountUsdt).toBe(amount);
  expect(parsePromotedOrder(original).amountUsdt).toBe(amount);
  const page=screen();page.api.quote.mockResolvedValue(q);page.api.create.mockResolvedValue(original);page.api.findOrder.mockResolvedValue(original);
  page.api.pay.mockResolvedValue({...original,paymentStatus:'PAID',orderStatus:'COMPLETED'});
  await page.start();expect(page.exposed.footer.value.amount).toBe('$'+display);
  if(Number(amount)===0)page.pin.mockResolvedValueOnce(null);
  await page.view.createOrder();if(Number(amount)===0)await page.methodSelection.finished();await page.view.recover();
  expect(page.exposed.footer.value.amount).toBe('$'+display);
  expect(await page.html()).toMatch(new RegExp('class="promotion-summary total"[^]*?\\$'+display.replace('.', '\\.')));
  const pinDecision=deferred<boolean>();if(Number(amount)===0)page.pin.mockImplementationOnce(async(_context,command,current)=>{await pinDecision.promise;return current()?command(page.authorization):null;});
  await page.view.pay();expect(page.api.pay).not.toHaveBeenCalled();
  if(Number(amount)===0){expect(page.methodSelection.request).not.toHaveBeenCalled();expect(page.pin).toHaveBeenCalledTimes(2);pinDecision.resolve(true);await page.methodSelection.finished();}
  else{expect(page.pin).not.toHaveBeenCalled();await page.methodSelection.wallet();}
  expect(page.pin).toHaveBeenCalledWith(expect.objectContaining({amount,currency:'USDT'}),expect.any(Function),expect.any(Function));
  expect(page.api.pay).toHaveBeenCalledWith(original.orderNo,'original-key',page.authorization);
  expect(page.api.create.mock.calls[0][0].amountUsdt).toBe(amount);
  expect(page.saved().order).toMatchObject({amountUsdt:amount,paymentStatus:'PAID'});expect(page.view.unknown.value).toBe(false);
});

it.each([[undefined,'-'],[null,'-'],['invalid','-'],['9007199254740993.123456','9,007,199,254,740,993.12'],[1e-7,'0.00']])('checkout display preserves unknown and rounds presentation of %s to two decimals',async(value,display)=>{
  const page=screen();await page.start();expect(page.view.formatAmount(value)).toBe(display);
});

it.each(['0.000000','10.000000',undefined])('voucher row attributes only explicitly voucher-only discounts (promotion %s)',async promotionDiscountUsdt=>{
  const page=screen(undefined,eventEntry);page.vouchers.claimedUnused=[bf20];page.vouchers.catalog=[bf20];
  const q={...voucherOnlyQuote('sku'),discountUsdt:'20.000000',promotionDiscountUsdt};page.api.quote.mockResolvedValue(q);await page.start();
  const html=await page.html(),coupon=html.split('data-testid="checkout-event-voucher"')[1].split('data-testid="checkout-payment"')[0];
  if(promotionDiscountUsdt==='0.000000'){
    expect(page.view.voucherOnlyDiscount.value).toBe('20.000000');expect(coupon).toContain('−20.00');expect(coupon).not.toContain('USDT');expect(html).not.toContain('data-testid="checkout-total-discount"');
  }else{
    expect(page.view.voucherOnlyDiscount.value).toBeUndefined();expect(coupon).not.toContain('- USDT');expect(html).toContain('data-testid="checkout-total-discount"');
  }
  expect(page.saved().quote?.discountUsdt).toBe('20.000000');
});

it('regular selected voucher shows only its confirmed deduction, while no voucher stays unclaimed',async()=>{
  const page=screen();page.vouchers.catalog=[bf20];page.vouchers.claimedUnused=[bf20];
  page.api.quote.mockImplementation(async(_items,_activity,voucherId)=>voucherId?{...voucherOnlyQuote('sku'),discountUsdt:'20.000000'}:{...quote(),expectedRewards:[]});
  await page.start();const html=await page.html();
  expect(html).toMatch(/class="checkout-discount-row promotion-link checkout-voucher-row"[^]*?−20\.00/);
  expect(page.view.voucherOnlyDiscount.value).toBe('20.000000');
  expect(page.saved().voucherId).toBe('BF20');
  await page.view.chooseVoucher();await page.view.selectVoucher(null);
  expect(await page.html()).toContain(zh.promotion.noVoucher);expect(page.view.voucherOnlyDiscount.value).toBeUndefined();
  expect(await page.html()).not.toContain('−20.00');
});

it('an unresolved event-voucher order keeps its total deduction when the editable voucher row is hidden',async()=>{
  const q=voucherOnlyQuote('sku'),pending={operation:'createOrder' as const,targetId:q.quoteId,key:'original-event-order'};
  const page=screen({quote:q,order:null,pending,voucherId:'BF20'},eventEntry);
  page.api.command.mockResolvedValue({status:'OUTCOME_UNKNOWN',order:null});await page.start();
  expect(page.view.unknown.value).toBe(true);expect(page.exposed.footer.value).toBeNull();
  const html=await page.html();expect(html).not.toContain('data-testid="checkout-event-voucher"');
  expect(html).toContain('data-testid="checkout-total-discount"');expect(html).toContain('−20.00');expect(page.view.summary.value.discountUsdt).toBe('20.000000');
  expect(page.saved().pending).toEqual(pending);expect(page.api.pay).not.toHaveBeenCalled();
});

it('discount signs do not turn zero, rounded zero or unknown into a positive deduction',async()=>{
  const page=screen();await page.start();
  for(const [value,display] of [['0','0.00'],['0.000001','0.00'],['50','−50.00'],[undefined,'—']] as const)expect(page.view.formatDiscount(value)).toBe(display);
  const original={...receipt(),promotionQuoteId:'other-quote',discountUsdt:undefined};
  const recovered=screen({quote:quote(),order:original,pending:null});recovered.api.findOrder.mockResolvedValue(original);await recovered.start();
  expect(recovered.view.summary.value.discountUsdt).toBeUndefined();
});

const policySetup=ts.transpileModule(checkoutSource.slice(checkoutSource.indexOf('const purchasePolicyOpen ='),checkoutSource.indexOf('const reviewCopy =')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const policyTemplate=checkoutSource.slice(checkoutSource.indexOf('<NxSheet :open="purchasePolicyOpen"'),checkoutSource.indexOf('</NxSheet>')+'</NxSheet>'.length);
const policyRender=new Function('Vue',compile(policyTemplate,{mode:'function',prefixIdentifiers:true,isCustomElement:tag=>['view','text'].includes(tag)}).code)(Vue);
it.each(['zh','en','vi'])('R1-F2: %s policy points only to reward terms actually exposed by checkout',async code=>{
  const page=screen(undefined,{activityId:'',items:[{productNo:'sku',quantity:2}]});
  page.api.quote.mockResolvedValue({...quote(),quantity:2,items:quote().items.map(item=>({...item,quantity:2})),expectedRewards:[]});
  await page.start();
  const state=new Function('computed','ref','locale',policySetup+';return {purchasePolicyOpen,policyCopy};')(Vue.computed,Vue.ref,{code});state.purchasePolicyOpen.value=true;
  const messages=code==='zh'?zh:code==='vi'?vietnamese:en;
  const ctx=Vue.proxyRefs({...state,policyHasDevice:true,t:messages,auditCopy:{terms:'Agreement'},promotionRoute:page.props,promotionCheckout:Vue.proxyRefs(page.exposed),navTo:vi.fn()});
  const NxSheet={props:['open'],setup:(props:any,{slots}:any)=>()=>props.open?Vue.h('view',slots.default?.()):null};
  let sheet:Vue.VNode;
  const html=()=>renderToString(Vue.createSSRApp({components:{NxSheet},render:()=>{sheet=policyRender(ctx,[]);return sheet;}}));
  expect(page.exposed.hasRewardTerms.value).toBe(false);expect(await page.html()).not.toContain(zh.promotion.rulesLink);
  expect(await html()).not.toContain(state.policyCopy.value.rewards);expect(await html()).toContain(messages.store.faq.refund.a);
  page.api.quote.mockResolvedValue(quote());await page.view.loadQuote();
  // Quantity must still match the requested basket for a quote to be accepted.
  expect(page.exposed.hasRewardTerms.value).toBe(false);
  page.api.quote.mockResolvedValue({...quote(),quantity:2,items:quote().items.map(item=>({...item,quantity:2}))});await page.view.loadQuote();
  expect(page.exposed.hasRewardTerms.value).toBe(true);expect(await page.html()).toContain(zh.promotion.rulesLink);
  expect(await html()).toContain(state.policyCopy.value.rewards);
  const before=JSON.stringify(page.saved());sheet!.props!.onClose();expect(state.purchasePolicyOpen.value).toBe(false);expect(JSON.stringify(page.saved())).toBe(before);
});

it.each(['PENDING','PAID','CANCELLED','EXPIRED','REFUNDED'] as const)('only PAID %s enters the canonical activation readback result',async paymentStatus=>{
  const original={...receipt(),paymentStatus},page=screen({quote:quote(),order:original,pending:null});page.api.findOrder.mockResolvedValue(original);await page.start();
  const html=await page.html();expect(html.includes('data-result=')).toBe(paymentStatus==='PAID');
  expect(page.canonical).toHaveBeenCalledTimes(paymentStatus==='PAID'?1:0);
});


function ordinaryQuote(quantity=2,amount=quantity===2?'31.84':'15.92'):Quote {
  const subtotalUsdt=(quantity*19.9).toFixed(2),discountUsdt=(Number(subtotalUsdt)-Number(amount)).toFixed(2);
  return selectedQuote([{productNo:'sku',quantity}],{activityId:null,activityVersion:null,subtotalUsdt,discountUsdt,amountUsdt:amount,promotionDiscountUsdt:'0',expectedRewards:[],items:[{lineId:'line',productNo:'sku',quantity,unitPriceUsdt:'19.90',subtotalUsdt,discountUsdt,payableUsdt:amount}]});
}
async function ordinaryCheckout(quantity=2){const page=screen(undefined,{activityId:'',items:[{productNo:'sku',quantity}]});page.api.quote.mockResolvedValueOnce(ordinaryQuote(quantity));await page.start();return page;}
it.each([1,2])('same-selection quantity %s refresh retains all read-only fees while authoritative quote is invalid',async quantity=>{
  const page=await ordinaryCheckout(quantity),old=await page.html(),response=deferred<Quote>(),oldAmount=quantity===2?'31.84':'15.92',newAmount=quantity===2?'30.00':'15.00';page.api.quote.mockReturnValueOnce(response.promise);
  const read=page.view.loadQuote();await flush();const pending=await page.html();
  for(const section of ['checkout-discounts','checkout-payment','checkout-fees']){expect(old).toContain('data-testid="'+section+'"');expect(pending).toContain('data-testid="'+section+'"');}
  expect(pending).toContain('$'+oldAmount);expect(page.view.displayQuote.value.amountUsdt).toBe(oldAmount);expect(page.saved().quote).toBeNull();expect(page.view.quote.value).toBeNull();expect(page.exposed.footer.value).toMatchObject({amount:'$'+oldAmount,disabled:true});
  await page.view.createOrder();await page.view.pay();expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
  response.resolve(ordinaryQuote(quantity,newAmount));await read;expect(page.exposed.footer.value).toMatchObject({amount:'$'+newAmount,disabled:false});expect(page.view.displayQuote.value.amountUsdt).toBe(newAmount);expect(await page.html()).not.toContain(oldAmount+' USDT');expect(page.api.create).not.toHaveBeenCalled();
});
it('same-input network failure keeps fees visible with retry but never restores create/payment authority',async()=>{
  const page=await ordinaryCheckout();page.api.quote.mockRejectedValueOnce(new ApiError({kind:'network',message:'REQUEST_TIMEOUT'}));await page.view.loadQuote();
  const html=await page.html();expect(html).toContain('data-testid="checkout-fees"');expect(html).toContain('$31.84');expect(page.view.displayQuote.value.amountUsdt).toBe('31.84');expect(html).toContain(zh.promotion.errorNote);expect(html).toContain(zh.empty.errorCta);
  expect(page.saved().quote).toBeNull();expect(page.view.canCreate.value).toBe(false);expect(page.exposed.footer.value.disabled).toBe(true);await page.view.createOrder();await page.view.pay();expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});
it.each([new ApiError({kind:'business',message:'PROMOTION_NOT_ELIGIBLE_OR_UNAVAILABLE'}),new ApiError({kind:'auth',message:'AUTH_REQUIRED'}),new ApiError({kind:'protocol',message:'INVALID_QUOTE'}),new Error('QUOTE_INPUT_CHANGED')])('strict refresh rejection removes prior fee snapshot: %s',async failure=>{
  const page=await ordinaryCheckout();page.api.quote.mockRejectedValueOnce(failure);await page.view.loadQuote();expect(await page.html()).not.toContain('$31.84');expect(page.exposed.footer.value).toMatchObject({amount:'$—',disabled:true});expect(page.view.canCreate.value).toBe(false);
});
it('new quantity never inherits the prior displayed subtotal or payable while pending or failed',async()=>{
  const page=await ordinaryCheckout(),response=deferred<Quote>();page.api.quote.mockReturnValueOnce(response.promise);const read=page.view.changeQuantity('sku',-1);await flush();expect(await page.html()).not.toContain('$31.84');expect(page.exposed.footer.value).toMatchObject({amount:'$—',disabled:true});response.reject(new ApiError({kind:'network',message:'OFFLINE'}));await read;expect(await page.html()).not.toContain('$31.84');
});
it('new manual voucher never inherits prior payable while its current selection is unread',async()=>{
  const page=await ordinaryCheckout(),response=deferred<Quote>();page.view.voucherOpen.value=true;page.api.quote.mockReturnValueOnce(response.promise);const read=page.view.selectVoucher(null);await flush();expect(await page.html()).not.toContain('$31.84');response.reject(new ApiError({kind:'network',message:'OFFLINE'}));await read;expect(await page.html()).not.toContain('$31.84');expect(page.exposed.footer.value.disabled).toBe(true);
});
it.each(['hide','account'] as const)('late same-scope refresh after %s cannot restore presentation or eligibility',async change=>{
  const page=await ordinaryCheckout(),response=deferred<Quote>();page.api.quote.mockReturnValueOnce(response.promise);const read=page.view.loadQuote();await flush();if(change==='hide')page.exposed.hide();else page.app.accountBindingEpoch++;
  expect(await page.html()).not.toContain('$31.84');response.resolve(ordinaryQuote(2,'1.00'));await read;expect(await page.html()).not.toContain('$1.00');expect(page.view.quote.value).toBeNull();expect(page.view.canCreate.value).toBe(false);expect(page.api.create).not.toHaveBeenCalled();expect(page.api.pay).not.toHaveBeenCalled();
});

it.each(['locale','auth','activity'] as const)('presentation scope %s A-B-A clears memory and rejects an old read',async key=>{
  const page=await ordinaryCheckout(),response=deferred<Quote>();page.api.quote.mockReturnValueOnce(response.promise);const read=page.view.loadQuote();await flush();
  if(key==='locale'){page.locale.code='en';page.locale.code='zh';}else if(key==='auth'){page.auth.isAuthenticated=false;page.auth.isAuthenticated=true;}else{page.props.activityId='other';page.props.activityId='';}
  expect(await page.html()).not.toContain('$31.84');response.resolve(ordinaryQuote(2,'30.00'));await read;expect(page.view.quote.value).toBeNull();expect(page.exposed.footer.value.disabled).toBe(true);expect(await page.html()).not.toContain('$30.00');expect(page.api.create).not.toHaveBeenCalled();
});
it('same campaign refresh preserves its existing deadline while busy rather than shortening the fee section',async()=>{
  const page=screen();await page.start();const response=deferred<Quote>();page.api.quote.mockReturnValueOnce(response.promise);page.api.get.mockReturnValueOnce(new Promise(()=>{}));const read=page.view.loadQuote();await flush();expect(await page.html()).toContain(zh.promotion.deadline);expect(page.view.canCreate.value).toBe(false);response.resolve(quote('q2'));await read;
});

it('fresh event-voucher unavailability clears the prior displayed quote rather than presenting old savings',async()=>{
  const page=screen(undefined,{activityId:'',items:[{productNo:'sku',quantity:1}],voucherId:'EVENT'});page.vouchers.claimedUnused=[voucherDef('EVENT',3.98)];page.api.quote.mockResolvedValueOnce(ordinaryQuote(1));await page.start();expect(page.exposed.footer.value.disabled).toBe(false);page.vouchers.claimedUnused=[];await page.view.loadQuote();expect(page.view.eventVoucherStatus.value).toBe('unavailable');expect(page.view.displayQuote.value).toBeNull();expect(page.exposed.footer.value).toMatchObject({amount:'$—',disabled:true});expect(page.api.create).not.toHaveBeenCalled();
});
