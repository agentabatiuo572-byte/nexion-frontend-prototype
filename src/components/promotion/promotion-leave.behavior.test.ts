import { expect, it, vi } from 'vitest';
import * as Vue from 'vue';
import { computed, ref } from 'vue';
import { compile } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import source from './promotion-checkout.vue?raw';
import { projectServerNow } from '@/lib/server-deadline-clock';
import { promotionZH } from '@/i18n/messages/promotion';
import { formatAmount } from '@/lib/amount-display';
import { commerceCopy } from '@/lib/commerce-review';
import { fmt } from '@/i18n/format';
import { zh } from '@/i18n/messages/zh';
import { PromotionCheckoutSession,type PromotionCheckoutRecord } from '@/lib/promotion-checkout-session';
import type { Quote } from '@/api/promotion-contracts';

const serverTime='2026-10-08T00:00:00Z';
const ast=ts.createSourceFile('checkout.ts',source.split('<script setup lang="ts">')[1].split('</script>')[0],ts.ScriptTarget.Latest,true);
const names=['requestLeave','finishLeave','updateClock','startNewPurchase'];
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text));
expect(functions).toHaveLength(names.length);
const code=ts.transpileModule(functions.map(node=>node.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function harness({status='PENDING',payBy='2026-10-08T00:00:10Z',clock=true,quoteClock=false,eligibility='ELIGIBLE',built=true,rewards=true,busy=false,unknown=false,current=true,checkoutSession}:Record<string,unknown>={}){
  let now:number|null=clock?100:null;
  const record={leavePromptShown:false};
  const session=(checkoutSession as PromotionCheckoutSession|undefined)??{record,rememberLeavePrompt:vi.fn(()=>{record.leavePromptShown=true;}),startNewPurchase:vi.fn(()=>{record.leavePromptShown=false;})};
  const deps={current:()=>current,busy:ref(busy),unknown:ref(unknown),rewards:ref(rewards?[{}]:[]),
    order:ref(built?{orderNo:'ORD-1',paymentStatus:status,payBy}:null),
    quote:ref({quoteId:'Q1',serverTime,expiresAt:'2026-10-08T00:00:05Z',eligibility}),quoteFresh:ref(false),payWindow:ref<boolean|null>(null),
    promotion:ref({serverTime}),leaveOpen:ref(false),projectServerNow,readTrustedMonotonicNowMs:()=>now,
    initialReceivedAt:quoteClock?100:null,initialPromotionReceivedAt:clock?100:null,
    canStartNew:ref(true),props:{orderNo:null},openedOriginal:false,session,
    voucherId:ref<string|null>('voucher'),revision:ref(0),loadQuote:vi.fn(async()=>{})};
  const guard=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;let asked='',leaveResolver=null,receivedAt=initialReceivedAt,promotionReceivedAt=initialPromotionReceivedAt,orderClock=null;${code};return {requestLeave,finishLeave,startNewPurchase};`)(deps) as {requestLeave():Promise<boolean>;finishLeave(allowed:boolean):void;startNewPurchase():Promise<void>};
  return {...guard,...deps,setNow:(value:number|null)=>{now=value;}};
}
it.each([
  {payBy:'2026-10-07T23:59:59Z'}, {payBy:serverTime}, {payBy:null}, {clock:false},
  {status:'EXPIRED'}, {status:'PAID'}, {rewards:false}, {busy:true}, {unknown:true}, {current:false},
  {built:false,quoteClock:true,eligibility:'INELIGIBLE'}, {built:false,quoteClock:false},
])('leaves without urgency when a valid benefit is unconfirmed: %j',async options=>{
  const guard=harness(options);expect(await guard.requestLeave()).toBe(true);expect(guard.leaveOpen.value).toBe(false);
});
it.each([true,false])('valid reservation uses the original stay/exit decision: %s',async exit=>{
  const guard=harness();const answer=guard.requestLeave();expect(guard.leaveOpen.value).toBe(true);
  guard.finishLeave(exit);expect(await answer).toBe(exit);expect(guard.leaveOpen.value).toBe(false);
  expect(await guard.requestLeave()).toBe(true);
});
it('an eligible fresh quote opens the compact reminder, but an elapsed quote does not',async()=>{
  const guard=harness({built:false,quoteClock:true});const answer=guard.requestLeave();expect(guard.leaveOpen.value).toBe(true);guard.finishLeave(false);expect(await answer).toBe(false);
  const expired=harness({built:false,quoteClock:true});expired.setNow(5100);expect(await expired.requestLeave()).toBe(true);expect(expired.leaveOpen.value).toBe(false);
});
it.each(['new quote','original order'])('does not repeat a reminder in the same purchase after %s',async transition=>{
  const guard=harness({built:false,quoteClock:true});const first=guard.requestLeave();guard.finishLeave(false);expect(await first).toBe(false);
  if(transition==='new quote')guard.quote.value.quoteId='Q2';
  else guard.order.value={orderNo:'ORD-1',paymentStatus:'PENDING',payBy:'2026-10-08T00:00:10Z'};
  const again=guard.requestLeave();expect(guard.leaveOpen.value).toBe(false);expect(await again).toBe(true);
});
it('allows one new reminder only after explicitly starting a new purchase',async()=>{
  const guard=harness({built:false,quoteClock:true});const first=guard.requestLeave();guard.finishLeave(false);expect(await first).toBe(false);
  guard.canStartNew.value=false;await guard.startNewPurchase();expect(guard.session.startNewPurchase).not.toHaveBeenCalled();
  expect(await guard.requestLeave()).toBe(true);
  guard.canStartNew.value=true;await guard.startNewPurchase();expect(guard.session.startNewPurchase).toHaveBeenCalledOnce();
  guard.quote.value.quoteId='Q2';const next=guard.requestLeave();expect(guard.leaveOpen.value).toBe(true);guard.finishLeave(false);expect(await next).toBe(false);
  expect(await guard.requestLeave()).toBe(true);
});
it('projects server time again when leaving an order that was open across its deadline',async()=>{
  const guard=harness();guard.setNow(10100);expect(await guard.requestLeave()).toBe(true);expect(guard.leaveOpen.value).toBe(false);
});
it('the real leave action persists before display and a recreated page restores its once-only decision',async()=>{
  let saved:PromotionCheckoutRecord={quote:null,order:null,pending:null};
  const ports={api:{create:vi.fn(),pay:vi.fn(),cancel:vi.fn(),command:vi.fn(),findOrder:vi.fn()},save:vi.fn(record=>{saved=JSON.parse(JSON.stringify(record));}),key:()=>'',current:()=>true};
  const guard=harness({built:false,quoteClock:true,checkoutSession:new PromotionCheckoutSession(ports,saved)});
  const first=guard.requestLeave();expect(saved.leavePromptShown).toBe(true);expect(ports.save).toHaveBeenCalledOnce();expect(guard.leaveOpen.value).toBe(true);
  guard.finishLeave(true);expect(await first).toBe(true);
  const restored=harness({built:false,quoteClock:true,checkoutSession:new PromotionCheckoutSession(ports,saved)});
  restored.quote.value.quoteId='Q2';expect(await restored.requestLeave()).toBe(true);expect(restored.leaveOpen.value).toBe(false);
  restored.order.value={orderNo:'ORD-1',paymentStatus:'PENDING',payBy:'2026-10-08T00:00:10Z'};
  expect(await restored.requestLeave()).toBe(true);expect(ports.save).toHaveBeenCalledOnce();
  for(const command of Object.values(ports.api))expect(command).not.toHaveBeenCalled();
});
it('a failed reminder save permits navigation while preserving the existing financial storage guard',async()=>{
  const quote={quoteId:'Q1',eligibility:'ELIGIBLE',items:[{productNo:'sku-a',quantity:1}]} as Quote;
  const ports={api:{create:vi.fn(),pay:vi.fn(),cancel:vi.fn(),command:vi.fn(),findOrder:vi.fn()},save:vi.fn(()=>{throw new Error('storage unavailable');}),key:()=>'',current:()=>true};
  const session=new PromotionCheckoutSession(ports,{quote,order:null,pending:null});
  const guard=harness({built:false,quoteClock:true,checkoutSession:session});
  expect(await guard.requestLeave()).toBe(true);expect(guard.leaveOpen.value).toBe(false);expect(session.record.leavePromptShown).toBeUndefined();
  expect(await guard.requestLeave()).toBe(true);expect(ports.save).toHaveBeenCalledOnce();
  await expect(session.create()).rejects.toThrow('storage unavailable');
  for(const command of Object.values(ports.api))expect(command).not.toHaveBeenCalled();
});

const purchaseVariables=['rewards','disclosures','completeTerms','canCreate','canPay','paymentDialogOwner','paymentConfirming'];
const purchaseFunctions=['disclosure','run','createOrder','pay','updateClock','loadOrderClock','recover','requestLeave','finishLeave'];
const purchaseStatements=ast.statements.filter(node=>
  ts.isFunctionDeclaration(node)&&!!node.name&&purchaseFunctions.includes(node.name.text)
  ||ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>
    ts.isIdentifier(declaration.name)&&purchaseVariables.includes(declaration.name.text)));
expect(purchaseStatements).toHaveLength(purchaseVariables.length+purchaseFunctions.length);
const purchaseCode=ts.transpileModule(purchaseStatements.map(node=>node.getText(ast)).join('\n'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
}).outputText;
const fields=['title','terms','refundTerms','benefitDescription'] as const;
const languages=['zh','en','vi'] as const;
function completeReward(){
  return {disclosure:Object.fromEntries(fields.map(field=>[field,{zh:'有效条款',en:'Valid terms',vi:'Điều khoản hợp lệ'}]))};
}
function purchaseHarness({rewardRows=[] as unknown[],built=false,busy=false,unknown=false,fresh=true,
  eligibility='ELIGIBLE',confirmed=true,executable=true,retryOriginal=false,status='PENDING',bundle=false,current=true,
  payBy:paymentDeadline='2026-10-08T00:00:10Z' as string|null,clock=true,quoteClock=true,promotionClock=false,promotionState='ACTIVE'}={}){
  let now:number|null=clock?100:null;
  const canExecute=vi.fn(()=>executable),create=vi.fn(async()=>{}),pay=vi.fn(async()=>{}),recover=vi.fn(async()=>{});
  const fleet=vi.fn(async()=>({serverNow:Date.parse(serverTime),devices:[]}));
  const walletState=ref('ready'),refreshWallet=vi.fn(async()=>{walletState.value='ready';});
  const deps={walletState,refreshWallet,computed,current:()=>current,visible:true,readGeneration:0,readCurrent:()=>current,
    confirm:vi.fn().mockResolvedValue(true),fmt,formatAmount,t:ref(zh),busy:ref(busy),unknown:ref(unknown),error:ref(''),
    props:{items:[]},quote:ref({expectedRewards:rewardRows,eligibility,items:bundle?[{},{}]:[{}],serverTime,expiresAt:fresh?'2026-10-08T00:00:05Z':serverTime}),
    order:ref(built?{orderNo:'ORD-1',amountUsdt:'50.00',rewards:rewardRows,paymentStatus:status,payBy:paymentDeadline}:null),quoteFresh:ref(fresh),payWindow:ref<boolean|null>(null),
    promotion:ref({serverTime,state:promotionState,endsAt:serverTime}),projectServerNow,readTrustedMonotonicNowMs:()=>now,
    leaveOpen:ref(false),
    initialReceivedAt:quoteClock?100:null,initialPromotionReceivedAt:promotionClock?100:null,
    revision:ref(0),session:{canExecute,create,pay,recover,confirmed,retryOriginal,record:{},rememberLeavePrompt:vi.fn()},deviceE3Api:{fleet},
    asApiError:(cause:unknown)=>({message:String(cause)}),p:ref({errorNote:'Error'})};
  const gates=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;let receivedAt=initialReceivedAt,promotionReceivedAt=initialPromotionReceivedAt,orderClock=null,clockGeneration=0,asked='',leaveResolver=null;${purchaseCode};return {completeTerms,canCreate,canPay,createOrder,pay,updateClock,loadOrderClock,recover,requestLeave,finishLeave};`)(deps) as {
    completeTerms:{value:boolean};canCreate:{value:boolean};canPay:{value:boolean};
    createOrder():Promise<void>;pay():Promise<void>;updateClock():void;loadOrderClock():Promise<void>;recover():Promise<void>;
    requestLeave():Promise<boolean>;finishLeave(allowed:boolean):void;
  };
  gates.updateClock();
  return {...gates,deps,createCommand:create,payCommand:pay,recoverCommand:recover,fleet,canExecute,
    setNow:(value:number|null)=>{now=value;},setCurrent:(value:boolean)=>{current=value;}};
}
it.each([false,true])('the real component permits a valid zero-reward %s bundle quote',async bundle=>{
  const page=purchaseHarness({bundle});
  expect(page.completeTerms.value).toBe(true);expect(page.canCreate.value).toBe(true);
  expect(page.canExecute).toHaveBeenCalledWith(bundle?'createBundle':'createOrder');
  await page.createOrder();expect(page.createCommand).toHaveBeenCalledOnce();expect(page.payCommand).not.toHaveBeenCalled();
});
it('the real component pays the confirmed original pending order with zero rewards',async()=>{
  const page=purchaseHarness({built:true});
  expect(page.completeTerms.value).toBe(true);expect(page.canPay.value).toBe(true);
  expect(page.canExecute).toHaveBeenCalledWith('payOrder');
  await page.pay();expect(page.payCommand).toHaveBeenCalledOnce();expect(page.createCommand).not.toHaveBeenCalled();
});
it.each([false,true])('the real component keeps complete reward disclosures executable for order=%s',async built=>{
  const page=purchaseHarness({built,rewardRows:[completeReward(),completeReward()]});
  expect(page.completeTerms.value).toBe(true);
  if(built){expect(page.canPay.value).toBe(true);await page.pay();expect(page.payCommand).toHaveBeenCalledOnce();}
  else{expect(page.canCreate.value).toBe(true);await page.createOrder();expect(page.createCommand).toHaveBeenCalledOnce();}
});
const missingDisclosures: Array<readonly [string,()=>unknown]>=[
  ['disclosure',()=>({})],
  ...fields.map(field=>[field,()=>{const reward=completeReward();delete reward.disclosure[field];return reward;}] as const),
  ...fields.flatMap(field=>languages.map(language=>[`${field}.${language}`,()=>{
    const reward=completeReward();delete reward.disclosure[field][language];return reward;
  }] as const)),
];
it.each(missingDisclosures)('the real component rejects incomplete %s even beside a complete reward',async(_name,makeReward)=>{
  for(const built of [false,true]){
    const page=purchaseHarness({built,rewardRows:[completeReward(),makeReward()]});
    expect(page.completeTerms.value).toBe(false);expect(page.canCreate.value).toBe(false);expect(page.canPay.value).toBe(false);
    await page.createOrder();await page.pay();expect(page.createCommand).not.toHaveBeenCalled();expect(page.payCommand).not.toHaveBeenCalled();
  }
});
it.each([null,42,'   '])('the real component rejects malformed localized terms %j',async value=>{
  const reward: {disclosure:Record<string,Record<string,unknown>>}=completeReward();reward.disclosure.terms.vi=value;
  const page=purchaseHarness({built:true,rewardRows:[reward]});
  expect(page.completeTerms.value).toBe(false);await page.pay();expect(page.payCommand).not.toHaveBeenCalled();
});
it.each([{busy:true},{unknown:true},{executable:false}])('zero rewards preserve shared money guards: %j',async guard=>{
  for(const built of [false,true]){
    const page=purchaseHarness({...guard,built});
    expect(page.completeTerms.value).toBe(true);
    expect(built?page.canPay.value:page.canCreate.value).toBe(false);
    await page.createOrder();await page.pay();expect(page.createCommand).not.toHaveBeenCalled();expect(page.payCommand).not.toHaveBeenCalled();
  }
});
it.each([{fresh:false},{eligibility:'INELIGIBLE'},{eligibility:'UNKNOWN'}])('zero rewards preserve quote guards: %j',async guard=>{
  const page=purchaseHarness(guard);expect(page.canCreate.value).toBe(false);
  await page.createOrder();expect(page.createCommand).not.toHaveBeenCalled();
});
it('an original-command retry retains the existing quote-freshness exception',async()=>{
  const page=purchaseHarness({fresh:false,retryOriginal:true});expect(page.canCreate.value).toBe(true);
  await page.createOrder();expect(page.createCommand).toHaveBeenCalledOnce();
});
it.each([{confirmed:false},{status:'PAID'},{status:'CANCELLED'},{status:'EXPIRED'},{status:'REFUNDED'}])('zero rewards preserve original-order payment guards: %j',async guard=>{
  const page=purchaseHarness({...guard,built:true});expect(page.canPay.value).toBe(false);
  await page.pay();expect(page.payCommand).not.toHaveBeenCalled();
});
it.each([false,true])('a departed account cannot execute a component command for order=%s',async built=>{
  const page=purchaseHarness({built,current:false,rewardRows:[completeReward()]});
  expect(built?page.canPay.value:page.canCreate.value).toBe(true);
  await (built?page.pay():page.createOrder());expect(page.createCommand).not.toHaveBeenCalled();expect(page.payCommand).not.toHaveBeenCalled();
});

it.each(['2026-10-07T23:59:59Z',serverTime,null,'invalid'])('the real component blocks payment at or beyond an invalid original deadline: %j',async payBy=>{
  const page=purchaseHarness({built:true,payBy});expect(page.canPay.value).toBe(false);
  await page.pay();expect(page.payCommand).not.toHaveBeenCalled();
});
it('the real component rechecks payBy on click between clock ticks',async()=>{
  const page=purchaseHarness({built:true});expect(page.canPay.value).toBe(true);
  page.setNow(10100);await page.pay();expect(page.canPay.value).toBe(false);expect(page.payCommand).not.toHaveBeenCalled();
});
it.each([{clock:false},{quoteClock:false}])('a confirmed order without a live server clock cannot pay: %j',async clock=>{
  const page=purchaseHarness({...clock,built:true});expect(page.canPay.value).toBe(false);expect(page.deps.payWindow.value).toBeNull();
  await page.pay();expect(page.payCommand).not.toHaveBeenCalled();
});
it.each(['ENDED','PAUSED','ARCHIVED'])('the original order remains payable after quote expiry and campaign state %s',async promotionState=>{
  const page=purchaseHarness({built:true,eligibility:'INELIGIBLE',promotionState});page.setNow(5100);page.updateClock();
  expect(page.deps.quoteFresh.value).toBe(false);expect(page.canPay.value).toBe(true);
  await page.pay();expect(page.payCommand).toHaveBeenCalledOnce();expect(page.createCommand).not.toHaveBeenCalled();
});
it('an original payment retry cannot bypass its original payBy deadline',async()=>{
  const page=purchaseHarness({built:true,retryOriginal:true,payBy:serverTime});expect(page.canPay.value).toBe(false);
  await page.pay();expect(page.payCommand).not.toHaveBeenCalled();
});
it('cold resume gets a trusted clock from an empty fleet and does not alter the original selection',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false}),originalOrder=page.deps.order.value,originalQuote=page.deps.quote.value;
  expect(page.canPay.value).toBe(false);await page.recover();
  expect(page.recoverCommand).toHaveBeenCalledOnce();expect(page.fleet).toHaveBeenCalledOnce();expect(page.canPay.value).toBe(true);
  expect(page.deps.order.value).toBe(originalOrder);expect(page.deps.quote.value).toBe(originalQuote);
  expect(page.createCommand).not.toHaveBeenCalled();expect(page.payCommand).not.toHaveBeenCalled();
});
it('a failed cold clock read stays unknown and the existing query retries it',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false});page.fleet.mockRejectedValueOnce(new Error('clock unavailable'));
  await page.recover();expect(page.deps.payWindow.value).toBeNull();expect(page.canPay.value).toBe(false);expect(page.deps.error.value).toBe('Error');
  await page.pay();expect(page.payCommand).not.toHaveBeenCalled();await page.recover();
  expect(page.fleet).toHaveBeenCalledTimes(2);expect(page.canPay.value).toBe(true);expect(page.deps.error.value).toBe('');
});
it('missing monotonic time cannot become an expired order or initiate any write',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false,clock:false});await page.recover();
  expect(page.fleet).not.toHaveBeenCalled();expect(page.deps.payWindow.value).toBeNull();expect(page.canPay.value).toBe(false);
  await page.pay();expect(page.payCommand).not.toHaveBeenCalled();expect(page.createCommand).not.toHaveBeenCalled();
});
it.each([{built:false},{status:'PAID'},{status:'CANCELLED'},{status:'EXPIRED'},{status:'REFUNDED'},{quoteClock:true},{promotionClock:true}])('clock recovery avoids unnecessary fleet reads: %j',async existing=>{
  const page=purchaseHarness({built:true,quoteClock:false,...existing});await page.recover();expect(page.fleet).not.toHaveBeenCalled();
});
it('a slow cold clock read conservatively includes the request duration',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false});let finish!:(value:{serverNow:number;devices:never[]})=>void;
  page.fleet.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const query=page.recover();await Promise.resolve();
  page.setNow(10100);finish({serverNow:Date.parse(serverTime),devices:[]});await query;
  expect(page.deps.payWindow.value).toBe(false);expect(page.canPay.value).toBe(false);await page.pay();expect(page.payCommand).not.toHaveBeenCalled();
});
it('a clock response from a departed account cannot enable payment or execute any write',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false});let finish!:(value:{serverNow:number;devices:never[]})=>void;
  page.fleet.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const query=page.recover();await Promise.resolve();
  page.setCurrent(false);finish({serverNow:Date.parse(serverTime),devices:[]});await query;
  expect(page.deps.payWindow.value).toBeNull();expect(page.canPay.value).toBe(false);await page.pay();expect(page.payCommand).not.toHaveBeenCalled();expect(page.createCommand).not.toHaveBeenCalled();
});
it('an older concurrent clock response cannot replace a newer sample',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false});let finish!:(value:{serverNow:number;devices:never[]})=>void;
  page.fleet.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const first=page.loadOrderClock();
  page.fleet.mockResolvedValueOnce({serverNow:Date.parse('2026-10-08T00:00:10Z'),devices:[]});await page.loadOrderClock();
  expect(page.deps.payWindow.value).toBe(false);finish({serverNow:Date.parse(serverTime),devices:[]});await first;
  expect(page.deps.payWindow.value).toBe(false);expect(page.canPay.value).toBe(false);
});
it('clock recovery preserves unknown-command guards and the original retry choice',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false,unknown:true,retryOriginal:true});await page.recover();
  expect(page.deps.payWindow.value).toBe(true);expect(page.deps.unknown.value).toBe(true);expect(page.deps.session.retryOriginal).toBe(true);expect(page.canPay.value).toBe(false);
  await page.pay();expect(page.payCommand).not.toHaveBeenCalled();expect(page.createCommand).not.toHaveBeenCalled();
});
it.each([false,true])('the completed create command immediately projects its original deadline, elapsed=%s',async elapsed=>{
  const page=purchaseHarness();page.createCommand.mockImplementationOnce(async()=>{
    page.deps.order.value={orderNo:'ORD-1',amountUsdt:'50.00',rewards:[],paymentStatus:'PENDING',payBy:'2026-10-08T00:00:10Z'};
    if(elapsed)page.setNow(10100);
  });
  await page.createOrder();expect(page.createCommand).toHaveBeenCalledOnce();expect(page.canPay.value).toBe(!elapsed);
  expect(page.deps.payWindow.value).toBe(!elapsed);
});
it('a cold original benefit uses the recovered payment clock for the compact leave decision',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false,rewardRows:[completeReward()]});
  Object.assign(page.deps.order.value!,{orderNo:'ORD-cold'});
  expect(await page.requestLeave()).toBe(true);expect(page.deps.leaveOpen.value).toBe(false);
  await page.recover();const answer=page.requestLeave();expect(page.deps.leaveOpen.value).toBe(true);
  page.finishLeave(false);expect(await answer).toBe(false);
  page.setNow(10100);expect(await page.requestLeave()).toBe(true);expect(page.deps.leaveOpen.value).toBe(false);
});
it('the existing query retries after a missing monotonic clock becomes available',async()=>{
  const page=purchaseHarness({built:true,quoteClock:false,clock:false});await page.recover();expect(page.deps.payWindow.value).toBeNull();
  page.setNow(100);await page.recover();expect(page.fleet).toHaveBeenCalledOnce();expect(page.canPay.value).toBe(true);
});
const checkoutRenderCode=compile(parse(source).descriptor.template!.content,{mode:'function',prefixIdentifiers:true,isTS:true,expressionPlugins:['typescript'],isCustomElement:tag=>['view','text','image'].includes(tag)}).code;
const checkoutRender=new Function('Vue',ts.transpileModule(checkoutRenderCode,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(Vue);
it.each([null,false] as const)('the real template explains an unavailable payment without inventing expiry: %j',async payWindow=>{
  const action={setup:(_props:unknown,{slots}:Vue.SetupContext)=>()=>Vue.h('view',slots.default?.())};
  const html=await renderToString(Vue.createSSRApp({components:{LiquidGlass:{render:()=>null},PromotionAction:action,PromotionTerms:{render:()=>null},RewardRows:{render:()=>null},NxSheet:{render:()=>null}},render:checkoutRender,setup:()=>({
    formatAmount,
    auth:{isAuthenticated:true},p:promotionZH,t:{orders:{statusExpired:'支付已过期'},wallet:{usdtBalance:'余额'}},
    loading:false,unknown:false,error:'',openedOriginal:false,order:{orderNo:'cold-original',paymentStatus:'PENDING',payBy:'2026-10-08T00:00:10Z',amountUsdt:'10'},quote:null,
    reviewCopy:commerceCopy('zh'),walletState:'error',rewardsReleased:false,items:[],rewards:[],payWindow,app:{remoteFleetHasSnapshot:false},props:{items:[]},promotion:null,locale:{code:'zh'},
    busy:false,canPay:false,canCancel:false,canStartNew:false,session:{record:{}},termsOpen:false,leaveOpen:false,disclosures:[],
    displayDeadline:()=>'',localized:()=>'',pay:()=>{},recover:()=>{},viewOrder:()=>{},navTo:()=>{},
  })}));
  expect(html).toContain(promotionZH.query);
  const page=purchaseHarness({built:true,quoteClock:false,clock:false});
  page.deps.payWindow.value=payWindow;expect(page.canPay.value).toBe(false);
  expect(html).toContain('class="promotion-notice">'+(payWindow===false?'支付已过期':promotionZH.unknown));
  if(payWindow===null)expect(html).not.toContain('支付已过期');
});
