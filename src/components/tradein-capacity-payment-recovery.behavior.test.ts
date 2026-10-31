import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { ref } from 'vue';
import source from './tradein-sheets.vue?raw';
import { acquireAccountCommandKey, readAccountRow, releaseAccountCommandKey, writeAccountRow } from '@/store/account-scoped-storage';
import { zh } from '@/i18n/messages/zh';
import type { CanonicalCapacityReplaceQuote } from '@/api/device-e3-api';
import { purchasePrincipalUsdt } from '@/api/device-e3-api';
import { selectedPurchasePaymentFixture } from '@/lib/selected-purchase-payment.test-helper';
import { readPendingKeepCommand } from '@/lib/keep-command-recovery';
import type { TradeinSheetState } from '@/store/tradein-sheet';

const script=parse(source).descriptor.scriptSetup!.content;
const ast=ts.createSourceFile('capacity.ts',script,ts.ScriptTarget.Latest,true);
const names=['readPendingKeep','capacityIntent','canonicalCapacityKey','submitCanonicalCapacityReplacement','submitCanonicalKeepBuy','readCapacityPending','writeCapacityPending','runCanonicalCapacityPurchase','recoverCapacityPurchase'];
const code=ts.transpileModule(ast.statements.filter(ts.isFunctionDeclaration).filter(node=>names.includes(node.name?.text??'')).map(node=>node.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const quote:CanonicalCapacityReplaceQuote={decision:'REPLACE_REQUIRED',sourceDeviceId:11,sourceDeviceName:'Old',targetProductNo:'stellarbox-s1',targetProductId:22,targetProductName:'Device',targetPriceUsdt:100,payableUsdt:100,maxActiveDevices:2,activeDevices:2,walletBalanceUsdt:1000,sufficientFunds:true,decisionSource:'server'};
function page(storage=new Map<string,unknown>()){
  vi.stubGlobal('uni',{getStorageSync:(key:string)=>storage.get(key),setStorageSync:(key:string,value:unknown)=>storage.set(key,structuredClone(value))});
  const props={active:true},state=ref<TradeinSheetState>({kind:'replace',newKind:'stellarbox-s1',newPrice:100,oldDeviceId:'11',canonicalCapacityQuote:{...quote}});
  const scope={accountKey:'account-a',epoch:1};
  const replacement={tradeinNo:'TI-1',orderNo:'ORDER-1',sourceDeviceId:11,targetDeviceId:31,targetDeviceStatus:'ACTIVE',applicationStatus:'COMPLETED',orderStatus:'COMPLETED',discountUsdt:0,walletDebitUsdt:100,walletBalanceAfterUsdt:900};
  const deviceE3Api={capacityReplace:vi.fn().mockResolvedValue(replacement),capacityKeep:vi.fn(),replayCapacityKeep:vi.fn()};
  const readPaymentCommand=vi.fn().mockResolvedValue({status:'PROCESSING',canResumeSameKey:false});
  const executePaymentWithPassword=vi.fn(async(_context,command,current)=>current()?command({paymentPassword:'039417',credentialVersion:1,attemptNo:'fixture-attempt'}):null);
  const methodSelection=selectedPurchasePaymentFixture(executePaymentWithPassword);
  const executeSelectedPurchase=vi.fn((...args:any[])=>{const result=methodSelection.execute(...args);methodSelection.decide({method:'WALLET'});return result;});
  const completeVerifiedMutation=vi.fn(async steps=>steps.submit());
  const deps={ref,props,state,app:{accountKey:'account-a',devices:[]},captureAccountScope:()=>scope,isCurrentAccountScope:(value:unknown)=>value===scope,
    acquireAccountCommandKey,readAccountRow,readPendingKeepCommand,releaseAccountCommandKey,writeAccountRow,deviceE3Api,readPaymentCommand,executePaymentWithPassword,executeSelectedPurchase,purchasePrincipalUsdt,completeVerifiedMutation,
    apiClient:{},parseCanonicalTradeinResult:(value:unknown)=>value,parseCanonicalCapacityKeepResult:(value:unknown)=>value,
    capacityCommandKey:ref(null),CAPACITY_COMMAND_TABLE:'nexgrid-e3-capacity-commands-accounts-v1',CAPACITY_RECOVERY_TABLE:'nexgrid-e3-capacity-payment-accounts-v1',
    capacityRecovery:ref(null),capacityRecoveryBusy:ref(false),capacityResumeAllowed:ref(false),capacityRecoveryUnavailable:ref(false),recoveryCopy:ref({paymentPending:'Confirming',rejected:'Declined'}),
    confirming:ref(false),toast:{warn:vi.fn(),success:vi.fn()},t:ref(zh),kindLabel:(value:string)=>value,fmt:(value:string)=>value,hide:vi.fn(),goDevices:vi.fn(),orders:{},orderApi:{}};
  const actual=new Function(...Object.keys(deps),code+';return {submitCanonicalCapacityReplacement,submitCanonicalKeepBuy,recoverCapacityPurchase};')(...Object.values(deps));
  return {...deps,actual,storage,replacement,methodSelection,quote:{...quote}};
}
afterEach(()=>vi.unstubAllGlobals());
describe('actual capacity purchase result recovery',()=>{
  it.each(['PROCESSING','INDETERMINATE','NOT_SEEN'])('a lost response stays read-only while the original command is %s without resume permission',async status=>{
    const p=page();p.deviceE3Api.capacityReplace.mockRejectedValueOnce(new Error('timeout'));
    p.readPaymentCommand.mockResolvedValue({status,canResumeSameKey:false});
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    expect(p.deviceE3Api.capacityReplace).toHaveBeenCalledOnce();
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    expect(p.readPaymentCommand).toHaveBeenCalledOnce();expect(p.executePaymentWithPassword).toHaveBeenCalledOnce();
    expect(p.deviceE3Api.capacityReplace).toHaveBeenCalledOnce();
  });
  it('changing replace to keep while the first purchase is unknown never creates another key or POST',async()=>{
    const p=page();p.deviceE3Api.capacityReplace.mockRejectedValueOnce(new Error('timeout'));
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    await p.actual.submitCanonicalKeepBuy(p.quote.targetProductNo,p.quote);
    expect(p.readPaymentCommand).toHaveBeenCalledOnce();expect(p.deviceE3Api.capacityKeep).not.toHaveBeenCalled();
    expect(p.executePaymentWithPassword).toHaveBeenCalledOnce();
  });
  it('after reload a successful original receipt is restored without another PIN/POST',async()=>{
    const p=page();p.deviceE3Api.capacityReplace.mockRejectedValueOnce(new Error('timeout'));
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    const restored=page(p.storage);restored.readPaymentCommand.mockResolvedValue({status:'SUCCEEDED',canResumeSameKey:false,receipt:p.replacement});
    await restored.actual.recoverCapacityPurchase(false);
    expect(restored.executePaymentWithPassword).not.toHaveBeenCalled();expect(restored.deviceE3Api.capacityReplace).not.toHaveBeenCalled();
    expect(restored.completeVerifiedMutation).toHaveBeenCalledOnce();
  });
  it('capacity keep also recovers its paid receipt without issuing another purchase or requiring PIN',async()=>{
    const p=page();p.deviceE3Api.capacityKeep.mockRejectedValueOnce(new Error('timeout'));
    const available:CanonicalCapacityReplaceQuote={...p.quote,decision:'CAPACITY_AVAILABLE',sourceDeviceId:null,sourceDeviceName:null};
    p.state.value={kind:'replace',newKind:'stellarbox-s1',newPrice:100,oldDeviceId:'11',canonicalCapacityQuote:available};
    await p.actual.submitCanonicalKeepBuy(p.quote.targetProductNo,available);
    p.readPaymentCommand.mockResolvedValue({status:'SUCCEEDED',canResumeSameKey:false,receipt:{operationNo:'KEEP-1',orderNo:'KEEP-ORDER',targetDeviceId:32,deviceStatus:'ACTIVE',orderStatus:'COMPLETED',walletDebitUsdt:100,walletBalanceAfterUsdt:900}});
    await p.actual.recoverCapacityPurchase(false);
    expect(p.readPaymentCommand.mock.lastCall?.slice(1,2)).toEqual(['capacity-keep']);
    expect(p.deviceE3Api.capacityKeep).toHaveBeenCalledOnce();expect(p.executePaymentWithPassword).toHaveBeenCalledOnce();
    expect(p.completeVerifiedMutation).toHaveBeenCalledOnce();
  });
  it('NOT_SEEN permission only enables a separate explicit same-key recovery',async()=>{
    const p=page();p.deviceE3Api.capacityReplace.mockRejectedValueOnce(new Error('timeout'));
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    const key=p.deviceE3Api.capacityReplace.mock.calls[0][2];
    p.readPaymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});
    await p.actual.recoverCapacityPurchase(false);
    expect(p.capacityResumeAllowed.value).toBe(true);expect(p.executePaymentWithPassword).toHaveBeenCalledOnce();
    await p.actual.recoverCapacityPurchase(true);
    expect(p.deviceE3Api.capacityReplace.mock.calls.map(call=>call[2])).toEqual([key,key]);
    expect(JSON.stringify([...p.storage.values()])).not.toContain('039417');
  });
  it('cancelling before POST stores no command and a page/amount change prevents the write',async()=>{
    const p=page();p.executePaymentWithPassword.mockResolvedValueOnce(null);
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    expect(p.storage.size).toBe(0);expect(p.deviceE3Api.capacityReplace).not.toHaveBeenCalled();
    p.executePaymentWithPassword.mockImplementationOnce(async(_context,command,current)=>{
      p.state.value={kind:'replace',newKind:'stellarbox-s1',newPrice:100,oldDeviceId:'11',canonicalCapacityQuote:{...p.quote,payableUsdt:101}};
      return current()?command({paymentPassword:'039417'}):null;
    });
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    expect(p.deviceE3Api.capacityReplace).not.toHaveBeenCalled();expect(p.storage.size).toBe(0);
  });
  it('a definitive rejection releases only the original key and never auto-starts another purchase',async()=>{
    const p=page();p.deviceE3Api.capacityReplace.mockRejectedValueOnce(new Error('timeout'));
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    p.readPaymentCommand.mockResolvedValue({status:'REJECTED',canResumeSameKey:false});
    await p.actual.recoverCapacityPurchase(false);
    expect(p.capacityRecovery.value).toBeNull();expect(p.deviceE3Api.capacityReplace).toHaveBeenCalledOnce();
  });
  it.each(['PROCESSING','INDETERMINATE','NOT_SEEN'])('legacy KEEP remains read-only with its original key/payable when %s has no resume permission',async status=>{
    const p=page(),intent='keep|1156|stellarbox-pro-v2|5|2639|2639|6';
    writeAccountRow(p.CAPACITY_COMMAND_TABLE,'account-a',{commands:{[intent]:'legacy-keep-key'}});
    p.readPaymentCommand.mockResolvedValue({status,canResumeSameKey:false});
    await p.actual.submitCanonicalCapacityReplacement(p.quote,p.quote.targetProductNo);
    expect(p.readPaymentCommand).toHaveBeenCalledExactlyOnceWith(p.apiClient,'capacity-keep','legacy-keep-key');
    expect(p.executePaymentWithPassword).not.toHaveBeenCalled();
    expect(p.deviceE3Api.capacityReplace).not.toHaveBeenCalled();expect(p.deviceE3Api.capacityKeep).not.toHaveBeenCalled();
    expect(p.deviceE3Api.replayCapacityKeep).not.toHaveBeenCalled();
    expect(p.capacityRecovery.value).toEqual({operation:'keep',intent,key:'legacy-keep-key',targetProductNo:'stellarbox-pro-v2',payableUsdt:2639,quote:null});
  });
  it('legacy KEEP resume requires an explicit fresh PIN and reuses its original payload despite the changed current quote',async()=>{
    const p=page(),intent='keep|1156|stellarbox-pro-v2|5|2639|2639|6';
    writeAccountRow(p.CAPACITY_COMMAND_TABLE,'account-a',{commands:{[intent]:'legacy-keep-key'}});
    p.readPaymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});
    p.deviceE3Api.replayCapacityKeep.mockRejectedValueOnce(new Error('response lost again'));
    await p.actual.recoverCapacityPurchase(false);
    expect(p.capacityResumeAllowed.value).toBe(true);expect(p.executePaymentWithPassword).not.toHaveBeenCalled();
    await p.actual.recoverCapacityPurchase(true);
    expect(p.executePaymentWithPassword.mock.calls[0][0]).toMatchObject({amount:2639,currency:'USDT'});
    expect(p.deviceE3Api.replayCapacityKeep).toHaveBeenCalledExactlyOnceWith('stellarbox-pro-v2','legacy-keep-key',2639,
      {paymentPassword:'039417',credentialVersion:1,attemptNo:'fixture-attempt'});
    expect(p.deviceE3Api.capacityKeep).not.toHaveBeenCalled();expect(p.deviceE3Api.capacityReplace).not.toHaveBeenCalled();
    expect(JSON.stringify([...p.storage.values()])).not.toContain('039417');
    expect(p.capacityRecovery.value).toMatchObject({quote:null});
  });
  it('the dedicated KEEP recovery surface permits only the explicitly allowed original-key PIN resume',async()=>{
    const p=page(),intent='keep|1156|stellarbox-pro-v2|5|2639|2639|6';
    writeAccountRow(p.CAPACITY_COMMAND_TABLE,'account-a',{commands:{[intent]:'legacy-keep-key'}});
    p.state.value={kind:'keep-recovery',targetKind:'stellarbox-pro-v2'};
    p.readPaymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});
    p.deviceE3Api.replayCapacityKeep.mockRejectedValueOnce(new Error('response lost again'));
    await p.actual.recoverCapacityPurchase(false);
    expect(p.executePaymentWithPassword).not.toHaveBeenCalled();
    await p.actual.recoverCapacityPurchase(true);
    expect(p.deviceE3Api.replayCapacityKeep).toHaveBeenCalledExactlyOnceWith('stellarbox-pro-v2','legacy-keep-key',2639,
      {paymentPassword:'039417',credentialVersion:1,attemptNo:'fixture-attempt'});
    expect(p.deviceE3Api.capacityKeep).not.toHaveBeenCalled();expect(p.deviceE3Api.capacityReplace).not.toHaveBeenCalled();
  });
  it('a fresh full-capacity KEEP is rejected before asking for PIN or storing a new command',async()=>{
    const p=page();
    await p.actual.submitCanonicalKeepBuy(p.quote.targetProductNo,p.quote);
    expect(p.executePaymentWithPassword).not.toHaveBeenCalled();expect(p.deviceE3Api.capacityKeep).not.toHaveBeenCalled();
    expect(p.storage.size).toBe(0);
  });
});
