import { computed, effectScope, reactive, ref, watch } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import ts from 'typescript';
import source from './checkout.vue?raw';
import { zh } from '@/i18n/messages/zh';

const code=ts.transpileModule(source.slice(source.indexOf('const VOUCHER_PREFERENCE_KEY'),source.indexOf('const voucherDiscount =')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const scopes:ReturnType<typeof effectScope>[]=[];
afterEach(()=>scopes.splice(0).forEach(scope=>scope.stop()));
function screen(rows:Record<string,any>={}) {
  const app=reactive({accountKey:'a',accountBindingEpoch:1});
  const productId=ref('sku');let current=true;
  const deps={app,productId,ref,computed,watch,
    readAccountRow:vi.fn((key:string,account:string)=>rows[`${account}:${key}`]),
    writeAccountRow:vi.fn((key:string,account:string,row:unknown)=>{rows[`${account}:${key}`]=row;return true;}),
    pageAlive:true,pageVisible:true,quantityReady:ref(true),checkoutRouteInitialized:true,activeCheckoutLoad:null,
    promotionRoute:ref(null),product:ref({id:'sku',price:100}),purchaseUnavailable:ref(false),step:ref('confirm'),
    quantitySwitching:ref(false),confirming:false,purchaseConfirmationOpen:false,dialogsOpen:0,
    remoteTradeinRecoveryRequired:ref(false),activeSession:ref(null),resumeSessionId:null,orderId:ref(null),
    remoteOrderFailure:ref(null),receiptWriteFailure:ref(null),
    captureCheckoutRoute:()=>({accountKey:app.accountKey,productNo:productId.value,epoch:app.accountBindingEpoch}),
    isCurrentCheckoutRoute:(scope:any)=>current&&scope.accountKey===app.accountKey&&scope.productNo===productId.value&&scope.epoch===app.accountBindingEpoch,
    resumeServerOrder:vi.fn().mockResolvedValue(false),REMOTE_CHECKOUT_COMMANDS_KEY:'commands',toast:{warn:vi.fn()},t:ref(zh),
    remoteApiEnabled:true,tradein:{appliedTradein:null},trialConversionMode:ref(false),
    voucher:{refreshRemote:vi.fn().mockResolvedValue(true),bestVoucherFor:vi.fn(()=>({def:{id:'best'},discountUSD:20}))},
  };
  const scope=effectScope();scopes.push(scope);
  const view=scope.run(()=>new Function('deps',`with(deps){${code};return {selectAutomaticVoucher,voucherAutomatic,voucherMatch,voucherSelecting};}`)(deps));
  return {...deps,...view,rows,leave:()=>{current=false;}};
}
it('opt-out recalculates the discount, survives reload per account/product, and explicitly restores the current best voucher',async()=>{
  const page=screen();expect(page.voucherMatch.value.discountUSD).toBe(20);
  await page.selectAutomaticVoucher(false);expect(page.voucherMatch.value).toBeNull();expect(page.step.value).toBe('select-payment');
  const reload=screen(page.rows);expect(reload.voucherMatch.value).toBeNull();
  await reload.selectAutomaticVoucher(true);expect(reload.voucher.refreshRemote).toHaveBeenCalledOnce();expect(reload.voucherMatch.value.def.id).toBe('best');
  await reload.selectAutomaticVoucher(false);reload.app.accountKey='other';await Promise.resolve();expect(reload.voucherAutomatic.value).toBe(true);
});
it.each(['order','command','storage','stale','voucher-error'])('does not change selection or transaction identity on %s',async failure=>{
  const page=screen();
  if(failure==='order')page.resumeServerOrder.mockResolvedValue(true);
  if(failure==='command')page.rows['a:commands']={commands:{'sku||wallet':'original-key'}};
  if(failure==='storage')page.readAccountRow.mockImplementation(()=>{throw new Error('storage');});
  if(failure==='stale')page.resumeServerOrder.mockImplementation(async()=>{page.leave();return false;});
  if(failure==='voucher-error')page.voucher.refreshRemote.mockResolvedValue(false);
  await page.selectAutomaticVoucher(failure==='voucher-error');
  expect(page.writeAccountRow).not.toHaveBeenCalled();expect(page.voucherAutomatic.value).toBe(true);
});
it('blocks edits while a confirmation or original receipt is active and refuses non-durable opt-out',async()=>{
  const page=screen();page.orderId.value='original' as never;
  await page.selectAutomaticVoucher(false);expect(page.resumeServerOrder).not.toHaveBeenCalled();
  page.orderId.value=null;page.writeAccountRow.mockReturnValue(false);
  await page.selectAutomaticVoucher(false);expect(page.voucherAutomatic.value).toBe(true);
});
it('names the empty automatic state instead of claiming vouchers were declined',()=>{
  const expression=source.match(/<text class="checkout-row-description">\{\{ (remoteApiEnabled && trialConversionMode[^}]*?) \}\}<\/text>/)![1];
  const subtitle=(state:Record<string,boolean>)=>new Function('scope',`with(scope){return ${expression};}`)({remoteApiEnabled:true,trialConversionMode:false,
    trialCopy:{voucherUnavailable:'trial'},auditCopy:{autoApplyVoucher:'auto'},t:zh,...state});
  expect(subtitle({hasVoucher:false,voucherAutomatic:true,expiredVoucherForSku:false})).toBe(zh.voucher.noneAvailable);
  expect(subtitle({hasVoucher:false,voucherAutomatic:false,expiredVoucherForSku:false})).toBe(zh.promotion.noVoucher);
  expect(subtitle({hasVoucher:false,voucherAutomatic:true,expiredVoucherForSku:true})).toBe(zh.voucher.expiredNote);
  expect(subtitle({hasVoucher:true,voucherAutomatic:true,expiredVoucherForSku:false})).toBe('auto');
});
