import { expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import ts from 'typescript';
import source from './promotion-checkout.vue?raw';
import { projectServerNow } from '@/lib/server-deadline-clock';

const serverTime='2026-10-08T00:00:00Z';
const ast=ts.createSourceFile('checkout.ts',source.split('<script setup lang="ts">')[1].split('</script>')[0],ts.ScriptTarget.Latest,true);
const names=['requestLeave','finishLeave','updateClock'];
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text));
expect(functions).toHaveLength(names.length);
const code=ts.transpileModule(functions.map(node=>node.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function harness({status='PENDING',payBy='2026-10-08T00:00:10Z',clock=true,quoteClock=false,eligibility='ELIGIBLE',built=true,rewards=true,busy=false,unknown=false,current=true}:Record<string,unknown>={}){
  let now:number|null=clock?100:null;
  const deps={current:()=>current,busy:ref(busy),unknown:ref(unknown),rewards:ref(rewards?[{}]:[]),
    order:ref(built?{orderNo:'ORD-1',paymentStatus:status,payBy}:null),
    quote:ref({quoteId:'Q1',serverTime,expiresAt:'2026-10-08T00:00:05Z',eligibility}),quoteFresh:ref(false),
    promotion:ref({serverTime}),leaveOpen:ref(false),projectServerNow,readTrustedMonotonicNowMs:()=>now,
    initialReceivedAt:quoteClock?100:null,initialPromotionReceivedAt:clock?100:null};
  const guard=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;let asked='',leaveResolver=null,receivedAt=initialReceivedAt,promotionReceivedAt=initialPromotionReceivedAt;${code};return {requestLeave,finishLeave};`)(deps) as {requestLeave():Promise<boolean>;finishLeave(allowed:boolean):void};
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
it('projects server time again when leaving an order that was open across its deadline',async()=>{
  const guard=harness();guard.setNow(10100);expect(await guard.requestLeave()).toBe(true);expect(guard.leaveOpen.value).toBe(false);
});

const purchaseVariables=['rewards','disclosures','completeTerms','canCreate','canPay'];
const purchaseFunctions=['disclosure','run','createOrder','pay'];
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
  eligibility='ELIGIBLE',confirmed=true,executable=true,retryOriginal=false,status='PENDING',bundle=false,current=true}={}){
  const canExecute=vi.fn(()=>executable),create=vi.fn(async()=>{}),pay=vi.fn(async()=>{});
  const deps={computed,current:()=>current,busy:ref(busy),unknown:ref(unknown),error:ref(''),
    props:{items:[]},quote:ref({expectedRewards:rewardRows,eligibility,items:bundle?[{},{}]:[{}]}),
    order:ref(built?{rewards:rewardRows,paymentStatus:status}:null),quoteFresh:ref(fresh),
    revision:ref(0),session:{canExecute,create,pay,confirmed,retryOriginal},
    asApiError:(cause:unknown)=>({message:String(cause)}),p:ref({errorNote:'Error'})};
  const gates=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;${purchaseCode};return {completeTerms,canCreate,canPay,createOrder,pay};`)(deps) as {
    completeTerms:{value:boolean};canCreate:{value:boolean};canPay:{value:boolean};
    createOrder():Promise<void>;pay():Promise<void>;
  };
  return {...gates,deps,createCommand:create,payCommand:pay,canExecute};
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
