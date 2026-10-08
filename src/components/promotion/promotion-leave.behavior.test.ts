import { expect, it } from 'vitest';
import { ref } from 'vue';
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
