import { describe, expect, it, vi } from 'vitest';
import { PromotionCheckoutSession,selectPromotionCheckoutRecord,type PromotionCheckoutRecord } from './promotion-checkout-session';
import type { Quote, OrderReceipt } from '../api/promotion-contracts';
const quote = { quoteId:'q1', eligibility:'ELIGIBLE', amountUsdt:'120.000000', quantity:3, items:[{lineId:'sku-a',productNo:'sku-a',quantity:3}], expectedRewards:[] } as unknown as Quote;
const order = {orderNo:'o1',promotionQuoteId:'q1',quantity:3,amountUsdt:'120',paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',payBy:'2026-10-31T00:00:00Z',rewards:[],items:[{lineId:'canonical-line-756',productNo:'sku-a',productName:'Frozen Alpha',quantity:3}]} as OrderReceipt;
function setup() {
  const api={create:vi.fn().mockResolvedValue(order),pay:vi.fn().mockResolvedValue({...order,paymentStatus:'PAID'}),cancel:vi.fn(),command:vi.fn(),paymentCommand:vi.fn(),findOrder:vi.fn().mockResolvedValue(order)};
  const save=vi.fn(); const key=vi.fn().mockReturnValue('durable-original-key'); const current=vi.fn().mockReturnValue(true);
  const session=new PromotionCheckoutSession({api,save,key,current});session.setQuote(quote);
  return {session,api,save,key,current};
}
describe('promotion checkout original-command safety',()=>{
  it('choosing external after a wallet refusal marks external and preserves the exact original key',async()=>{
    const {api,save,key,current}=setup();
    const session=new PromotionCheckoutSession({api,save,key,current},{quote,order,pending:{operation:'payOrder',targetId:'o1',key:'legacy-original-key',paymentMethod:'WALLET'}});
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    expect(session.externalPaymentKey()).toBe('legacy-original-key');
    expect(session.record.pending).toMatchObject({key:'legacy-original-key',paymentMethod:'EXTERNAL'});
    expect(session.canExecute('cancelOrder')).toBe(false);expect(key).not.toHaveBeenCalled();expect(api.pay).not.toHaveBeenCalled();
  });
  it('legacy missing provenance stays cancellation-closed until an explicit same-key wallet call establishes it',async()=>{
    const {api,save,key,current}=setup();
    const session=new PromotionCheckoutSession({api,save,key,current},{quote,order,pending:{operation:'payOrder',targetId:'o1',key:'legacy-original-key'}});
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    expect(session.canExecute('payOrder')).toBe(true);expect(session.canExecute('cancelOrder')).toBe(false);
    api.pay.mockRejectedValueOnce(new Error('PAYMENT_PASSWORD_INCORRECT'));await expect(session.pay()).rejects.toThrow();
    expect(api.pay).toHaveBeenCalledExactlyOnceWith('o1','legacy-original-key',undefined);
    expect(session.record.pending).toMatchObject({key:'legacy-original-key',paymentMethod:'WALLET'});
    await session.recover();expect(session.canExecute('cancelOrder')).toBe(true);
    expect(key).not.toHaveBeenCalled();
  });
  it('an external pending payment cannot inherit wallet cancellation permission from legacy NOT_SEEN',async()=>{
    const {session,api}=setup();await session.create();const original=session.externalPaymentKey();
    expect(session.record.pending).toMatchObject({key:original,paymentMethod:'EXTERNAL'});
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    expect(session.canExecute('cancelOrder')).toBe(false);expect(session.canExecute('payOrder')).toBe(false);
    await expect(session.cancel()).rejects.toThrow();await expect(session.pay()).rejects.toThrow();
    expect(api.cancel).not.toHaveBeenCalled();expect(api.pay).not.toHaveBeenCalled();expect(session.record.pending?.key).toBe(original);
  });
  it('a rejected PIN followed by authoritative NOT_SEEN can cancel the original order without another payment key',async()=>{
    const {session,api,key}=setup();
    key.mockImplementation(intent=>intent.startsWith('cancelOrder:')?'original-cancel-key':intent.startsWith('payOrder:')?'original-pay-key':'original-create-key');
    await session.create();api.pay.mockRejectedValueOnce(new Error('PAYMENT_PASSWORD_INCORRECT'));
    await expect(session.pay()).rejects.toThrow('PAYMENT_PASSWORD_INCORRECT');
    expect(session.canExecute('cancelOrder')).toBe(false);
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    expect(session.canExecute('cancelOrder')).toBe(true);
    api.cancel.mockResolvedValue({...order,paymentStatus:'CANCELLED',orderStatus:'CANCELLED'});await session.cancel();
    expect(api.paymentCommand).toHaveBeenCalledExactlyOnceWith('original-pay-key');
    expect(api.pay).toHaveBeenCalledOnce();expect(api.cancel).toHaveBeenCalledExactlyOnceWith('o1','original-cancel-key');
    expect(session.record).toMatchObject({order:{orderNo:'o1',paymentStatus:'CANCELLED'},pending:null,
      previousPayment:{operation:'payOrder',targetId:'o1',key:'original-pay-key'}});
    expect(key.mock.calls.filter(([intent])=>intent.startsWith('payOrder:'))).toEqual([['payOrder:o1']]);
  });
  it('an unknown cancellation after NOT_SEEN keeps both identities and reload retries only its original cancellation',async()=>{
    const {session,api,key,save,current}=setup();
    key.mockImplementation(intent=>intent.startsWith('cancelOrder:')?'cancel-original':'pay-original');
    await session.create();api.pay.mockRejectedValueOnce(new Error('PAYMENT_PASSWORD_INCORRECT'));await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    api.cancel.mockRejectedValueOnce(new Error('timeout'));await expect(session.cancel()).rejects.toThrow('timeout');
    expect(session.record).toMatchObject({pending:{operation:'cancelOrder',targetId:'o1',key:'cancel-original'},previousPayment:{key:'pay-original'}});
    const restored=new PromotionCheckoutSession({api,save,key,current},structuredClone(session.record));
    api.command.mockResolvedValue({status:'NOT_FOUND'});await restored.recover();
    expect(restored.canExecute('cancelOrder')).toBe(true);expect(restored.canExecute('payOrder')).toBe(false);
    api.cancel.mockResolvedValue({...order,paymentStatus:'CANCELLED',orderStatus:'CANCELLED'});await restored.cancel();
    expect(api.cancel.mock.calls.map(call=>call[1])).toEqual(['cancel-original','cancel-original']);
    expect(api.pay).toHaveBeenCalledOnce();expect(api.paymentCommand).toHaveBeenCalledOnce();
  });
  it('NOT_SEEN cannot authorize cancellation when the original order is unreadable',async()=>{
    const {session,api}=setup();await session.create();api.pay.mockRejectedValueOnce(new Error('PAYMENT_PASSWORD_INCORRECT'));await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});api.findOrder.mockResolvedValue(null as never);await session.recover();
    expect(session.unknown).toBe(true);expect(session.canExecute('cancelOrder')).toBe(false);expect(api.cancel).not.toHaveBeenCalled();
  });
  it.each(['CANCELLED','EXPIRED','PAID'] as const)('unknown cancel + missing command accepts authoritative original %s without retrying payment',async paymentStatus=>{
    const {session,api}=setup();await session.create();api.pay.mockRejectedValueOnce(new Error('PAYMENT_PASSWORD_INCORRECT'));await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    api.cancel.mockRejectedValueOnce(new Error('timeout'));await expect(session.cancel()).rejects.toThrow();
    api.command.mockResolvedValue({status:'NOT_FOUND'});api.findOrder.mockResolvedValue({...order,paymentStatus});await session.recover();
    expect(session.record.order?.paymentStatus).toBe(paymentStatus);expect(session.record.pending).toBeNull();expect(session.confirmed).toBe(true);
    expect(session.record.previousPayment?.key).toBe('durable-original-key');expect(api.pay).toHaveBeenCalledOnce();expect(api.cancel).toHaveBeenCalledOnce();
  });
  it('a later processing/read failure revokes the earlier NOT_SEEN cancellation permission',async()=>{
    const {session,api}=setup();await session.create();api.pay.mockRejectedValueOnce(new Error('PAYMENT_PASSWORD_INCORRECT'));await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();expect(session.canExecute('cancelOrder')).toBe(true);
    api.paymentCommand.mockResolvedValue({status:'PROCESSING',canResumeSameKey:false});await session.recover();
    expect(session.canExecute('cancelOrder')).toBe(false);expect(session.record.pending?.key).toBe('durable-original-key');expect(api.cancel).not.toHaveBeenCalled();
  });
  it('a nonterminal cancel acknowledgement retains the original cancellation and payment identities',async()=>{
    const {session,api,key}=setup();key.mockImplementation(intent=>intent.startsWith('cancelOrder:')?'cancel-key':'pay-key');
    await session.create();api.pay.mockRejectedValueOnce(new Error('PAYMENT_PASSWORD_INCORRECT'));await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    api.cancel.mockResolvedValue(order);await expect(session.cancel()).rejects.toThrow('ORDER_CANCELLATION_UNCONFIRMED');
    expect(session.record).toMatchObject({pending:{operation:'cancelOrder',key:'cancel-key'},previousPayment:{operation:'payOrder',key:'pay-key'}});
    expect(session.unknown).toBe(true);expect(session.canExecute('payOrder')).toBe(false);
  });
  it('a payment winning the server lock is recovered after cancellation409 without another debit',async()=>{
    const {session,api}=setup();await session.create();api.pay.mockRejectedValueOnce(new Error('PAYMENT_PASSWORD_INCORRECT'));await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    api.cancel.mockRejectedValue(new Error('ORDER_NOT_CANCELLABLE'));await expect(session.cancel()).rejects.toThrow();
    api.command.mockResolvedValue({status:'FAILED',order:null});api.findOrder.mockResolvedValue({...order,paymentStatus:'PAID',orderStatus:'COMPLETED'});await session.recover();
    expect(session.record).toMatchObject({order:{orderNo:'o1',paymentStatus:'PAID'},pending:null,previousPayment:{key:'durable-original-key'}});
    expect(api.pay).toHaveBeenCalledOnce();expect(api.cancel).toHaveBeenCalledOnce();
  });
  it.each([
    ['PROCESSING',false],['INDETERMINATE',false],['NOT_SEEN',false],
  ] as const)('payment %s never uses legacy NOT_FOUND to unlock another payment/cancellation',async(status,canResumeSameKey)=>{
    const {session,api}=setup();await session.create();api.pay.mockRejectedValueOnce(new Error('timeout'));
    await expect(session.pay()).rejects.toThrow('timeout');
    api.command.mockResolvedValue({status:'NOT_FOUND'});
    api.paymentCommand.mockResolvedValue({status,canResumeSameKey});
    await session.recover();
    expect(api.paymentCommand).toHaveBeenCalledWith('durable-original-key');
    expect(api.command).not.toHaveBeenCalled();expect(session.unknown).toBe(true);
    expect(session.canExecute('payOrder')).toBe(false);expect(session.canExecute('cancelOrder')).toBe(false);
  });
  it('a paid command receipt recovers without a PIN or another POST',async()=>{
    const {session,api}=setup();await session.create();api.pay.mockRejectedValueOnce(new Error('timeout'));
    await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'SUCCEEDED',canResumeSameKey:false,order:{...order,paymentStatus:'PAID'}});
    await session.recover();expect(session.record.order?.paymentStatus).toBe('PAID');
    expect(api.pay).toHaveBeenCalledOnce();expect(api.command).not.toHaveBeenCalled();
  });
  it('only NOT_SEEN with permission enables a same-key payment retry or atomic original-order cancellation',async()=>{
    const {session,api}=setup();await session.create();api.pay.mockRejectedValueOnce(new Error('timeout'));
    await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});await session.recover();
    expect(session.canExecute('payOrder')).toBe(true);expect(session.canExecute('cancelOrder')).toBe(true);
    expect(api.pay).toHaveBeenCalledOnce();await session.pay();
    expect(api.pay.mock.calls.map(call=>call[1])).toEqual(['durable-original-key','durable-original-key']);
  });
  it('a definitive payment rejection retires the original key only after a readable original order',async()=>{
    const {session,api,key}=setup();key.mockImplementation(intent=>intent.includes(':payment-intent:1')?'reviewed-next-key':'durable-original-key');
    await session.create();api.pay.mockRejectedValueOnce(new Error('timeout'));await expect(session.pay()).rejects.toThrow();
    api.paymentCommand.mockResolvedValue({status:'REJECTED',canResumeSameKey:false});await session.recover();
    expect(api.pay).toHaveBeenCalledOnce();await session.pay();
    expect(api.pay.mock.calls.map(call=>call[1])).toEqual(['durable-original-key','reviewed-next-key']);
    expect(session.record.paymentIntentRevision).toBe(1);
  });
  it('durably keeps one leave reminder through reload, requote, creation and original-order recovery',async()=>{
    const {session,api,save,key,current}=setup();let saved:PromotionCheckoutRecord=session.record;
    save.mockImplementation(record=>{saved=JSON.parse(JSON.stringify(record));});
    session.setQuote(quote,'old-voucher');session.rememberLeavePrompt();expect(saved.leavePromptShown).toBe(true);
    const restored=new PromotionCheckoutSession({api,save,key,current},saved);
    restored.invalidateQuote();expect(restored.record.voucherId).toBe('old-voucher');expect(saved.leavePromptShown).toBe(true);
    restored.setQuote(quote);expect(saved.leavePromptShown).toBe(true);expect(restored.record.voucherId).toBeNull();
    await restored.create();expect(saved.leavePromptShown).toBe(true);
    const original=new PromotionCheckoutSession({api,save,key,current},saved);await original.recover();
    expect(original.record.leavePromptShown).toBe(true);expect(original.record.order?.orderNo).toBe('o1');
    await original.pay();expect(api.create).toHaveBeenCalledOnce();expect(api.pay).toHaveBeenCalledOnce();expect(api.cancel).not.toHaveBeenCalled();
  });
  it('failed-create recovery preserves the reminder but discards the failed quote and voucher',async()=>{
    const {session,api}=setup();session.setQuote(quote,'voucher');session.rememberLeavePrompt();
    api.create.mockRejectedValueOnce(new Error('timeout'));await expect(session.create()).rejects.toThrow('timeout');
    api.command.mockResolvedValue({status:'FAILED',order:null});await session.recover();
    expect(session.record).toEqual({quote:null,order:null,pending:null,leavePromptShown:true});
    session.setQuote(quote);expect(session.record.leavePromptShown).toBe(true);expect(session.record.voucherId).toBeNull();
  });
  it('only an explicit new purchase after a confirmed final order resets the durable reminder',async()=>{
    const {session,api}=setup();session.rememberLeavePrompt();await session.create();
    expect(()=>session.startNewPurchase()).toThrow('ORIGINAL_ORDER_UNRESOLVED');expect(session.record.leavePromptShown).toBe(true);
    await session.pay();session.startNewPurchase();expect(session.record.leavePromptShown).toBeUndefined();
    session.setQuote({...quote,quoteId:'new-purchase'});session.rememberLeavePrompt();expect(session.record.leavePromptShown).toBe(true);
    expect(api.create).toHaveBeenCalledOnce();expect(api.pay).toHaveBeenCalledOnce();
  });
  it('another intent or account cannot inherit a saved reminder',()=>{
    const {session}=setup();session.rememberLeavePrompt();const input={activityId:'a',items:[{productNo:'sku-a',quantity:3}]};
    const original=selectPromotionCheckoutRecord({},input).intent;
    expect(selectPromotionCheckoutRecord({[original]:session.record},input).record?.leavePromptShown).toBe(true);
    expect(selectPromotionCheckoutRecord({[original]:session.record},{...input,activityId:'b'}).record).toBeUndefined();
    expect(selectPromotionCheckoutRecord({},input).record).toBeUndefined();
  });
  it.each([false,true])('an order recovery entry reuses the actual created purchase record and its durable reminder, existingDraft=%s',async existingDraft=>{
    const {session,api,key,current}=setup();
    const purchase={activityId:'a',items:[{productNo:'sku-a',quantity:3}]};
    const purchaseIntent=selectPromotionCheckoutRecord({},purchase).intent;
    const records:Record<string,PromotionCheckoutRecord>={};
    const save=vi.fn(record=>{records[purchaseIntent]=JSON.parse(JSON.stringify(record));});
    const checkout=new PromotionCheckoutSession({api,save,key,current},session.record);
    checkout.rememberLeavePrompt();await checkout.create();
    const input={activityId:'',items:[],orderNo:'o1'};
    if(existingDraft)records[JSON.stringify(['order','o1'])]={quote:null,order:null,pending:null};
    const selected=selectPromotionCheckoutRecord(records,input);
    expect(selected.intent).toBe(purchaseIntent);expect(selected.record).toBe(records[purchaseIntent]);
    expect(selected.record?.leavePromptShown).toBe(true);expect(selected.openedOriginal).toBe(false);
    const original=new PromotionCheckoutSession({api,save,key,current},selected.record);await original.recover();
    const reentered=selectPromotionCheckoutRecord(records,input);
    expect(reentered.intent).toBe(purchaseIntent);expect(reentered.record?.leavePromptShown).toBe(true);
    expect(api.create).toHaveBeenCalledOnce();expect(api.pay).not.toHaveBeenCalled();expect(api.cancel).not.toHaveBeenCalled();
    expect(selectPromotionCheckoutRecord(records,{...input,orderNo:'o2'}).record).toBeUndefined();
    expect(selectPromotionCheckoutRecord({},input).record).toBeUndefined();
  });
  it.each([false,true])('existing order-entry records keep their receipt while sharing an earlier once-only decision, requestedFlag=%s',requestedFlag=>{
    const requested=JSON.stringify(['order','o1']);
    const old={quote,order,pending:null,leavePromptShown:!requestedFlag};
    const recent={quote:null,order:{...order,paymentStatus:'PAID' as const},pending:null,leavePromptShown:requestedFlag};
    const records={purchase:old,[requested]:recent};
    const selected=selectPromotionCheckoutRecord(records,{activityId:'',items:[],orderNo:'o1'});
    expect(selected.intent).toBe(requested);expect(selected.record?.order).toBe(recent.order);
    expect(selected.record?.quote).toBeNull();expect(selected.record?.leavePromptShown).toBe(true);
    const purchase=selectPromotionCheckoutRecord({[JSON.stringify(['a',[]])]:old,[requested]:recent},{activityId:'a',items:[]});
    expect(purchase.record?.order).toBe(old.order);expect(purchase.record?.leavePromptShown).toBe(true);
    expect(selectPromotionCheckoutRecord(records,{activityId:'',items:[],orderNo:'o2'}).record).toBeUndefined();
  });
  it('any unresolved command still takes priority over a matching same-order recovery record',()=>{
    const requested=JSON.stringify(['order','o1']);
    const matching={quote:null,order,pending:null,leavePromptShown:true};
    const unresolved={quote:null,order:{...order,orderNo:'o2'},pending:{key:'cancel-o2',operation:'cancelOrder' as const,targetId:'o2'}};
    const selected=selectPromotionCheckoutRecord({[requested]:matching,purchase:matching,unresolved},{activityId:'',items:[],orderNo:'o1'});
    expect(selected.intent).toBe('unresolved');expect(selected.record).toBe(unresolved);expect(selected.openedOriginal).toBe(true);
    expect(selected.record?.leavePromptShown).toBeUndefined();
  });
  it('a new purchase remains separate from its completed order-entry alias',async()=>{
    const {session,api,key,current}=setup();session.rememberLeavePrompt();await session.create();await session.pay();
    api.findOrder.mockResolvedValue({...order,paymentStatus:'PAID'});
    const purchase={activityId:'a',items:[{productNo:'sku-a',quantity:3}]},intent=selectPromotionCheckoutRecord({},purchase).intent;
    const records:Record<string,PromotionCheckoutRecord>={[JSON.stringify(['order','o1'])]:JSON.parse(JSON.stringify(session.record))};
    const fresh=new PromotionCheckoutSession({api,key,current,save:record=>{records[intent]=JSON.parse(JSON.stringify(record));}},session.record);
    await fresh.recover();fresh.startNewPurchase();fresh.setQuote({...quote,quoteId:'q2'});
    expect(selectPromotionCheckoutRecord(records,purchase).record?.leavePromptShown).toBeUndefined();
    expect(selectPromotionCheckoutRecord(records,{activityId:'',items:[],orderNo:'o1'}).record?.leavePromptShown).toBe(true);
    expect(api.create).toHaveBeenCalledOnce();expect(api.pay).toHaveBeenCalledOnce();
  });
  it('order A then order B uses separate persistent receipts',()=>{
    const a=selectPromotionCheckoutRecord({}, {activityId:'',items:[],orderNo:'a'});
    const record={quote:null,order:{...order,orderNo:'a'},pending:null};
    const b=selectPromotionCheckoutRecord({[a.intent]:record},{activityId:'',items:[],orderNo:'b'});
    expect(b.intent).not.toBe(a.intent);expect(b.record).toBeUndefined();expect(b.openedOriginal).toBe(false);
  });
  it('an unresolved A takes priority over a B deep link with an explicit original-order notice',()=>{
    const record={quote:null,order:{...order,orderNo:'a'},pending:{key:'cancel-a',operation:'cancelOrder' as const,targetId:'a'}};
    const selected=selectPromotionCheckoutRecord({'original-a':record},{activityId:'',items:[],orderNo:'b'});
    expect(selected.record).toBe(record);expect(selected.openedOriginal).toBe(true);
  });
  it('persists the command before create and requires its confirmed receipt before pay',async()=>{
    const {session,api,save}=setup();await expect(session.pay()).rejects.toThrow();
    api.create.mockImplementation(async()=>{expect(save.mock.lastCall?.[0].pending.key).toBe('durable-original-key');return order;});
    await session.create();await session.pay();expect(api.pay).toHaveBeenCalledOnce();
  });
  it('lost response, reload and recovery perform only a read and keep the original key',async()=>{
    const {session,api,save,key,current}=setup();api.create.mockRejectedValue(new Error('timeout'));
    await expect(session.create()).rejects.toThrow();expect(session.unknown).toBe(true);
    const reloaded=new PromotionCheckoutSession({api,save,key,current},session.record);
    api.command.mockResolvedValue({status:'SUCCEEDED',order});await reloaded.recover();
    expect(api.create).toHaveBeenCalledOnce();expect(api.pay).not.toHaveBeenCalled();expect(reloaded.record.order?.orderNo).toBe('o1');
  });
  it('NOT_FOUND permits only an explicit same-key retry, never automatic creation',async()=>{
    const {session,api}=setup();api.create.mockRejectedValueOnce(new Error('timeout'));await expect(session.create()).rejects.toThrow();
    api.command.mockResolvedValue({status:'NOT_FOUND'});await session.recover();expect(api.create).toHaveBeenCalledOnce();
    await session.create();expect(api.create.mock.calls.map(c=>c[1])).toEqual(['durable-original-key','durable-original-key']);
  });
  it('storage failure prevents any write and stale account responses cannot mutate state',async()=>{
    const {session,api,save,current}=setup();save.mockImplementationOnce(()=>{throw new Error('disk');});await expect(session.create()).rejects.toThrow('disk');expect(api.create).not.toHaveBeenCalled();
    api.create.mockImplementation(async()=>{current.mockReturnValue(false);return order;});await session.create();expect(session.record.order).toBeNull();
  });
  it('different order, quote or monetary amount never unlocks payment',async()=>{
    const {session,api}=setup();api.create.mockResolvedValue({...order,amountUsdt:'120.000001'});await expect(session.create()).rejects.toThrow('ORDER_QUOTE_MISMATCH');expect(session.confirmed).toBe(false);
  });
  it('accepts canonical order-line IDs while retaining every approved reward field',async()=>{
    const {session,api}=setup();const expected={lineId:'sku-a',activityId:'a',version:1,ruleId:'rule-a',rewardRuleId:'reward-a',beneficiaryRole:'BUYER',groups:1,reward:{type:'USDT',amount:'1.000000'},disclosure:{title:{zh:'条款'}}} as unknown as Quote['expectedRewards'][number];
    session.setQuote({...quote,expectedRewards:[expected]});api.create.mockResolvedValue({...order,rewards:[{...expected,lineId:'canonical-line-756'}]});
    await session.create();expect(session.confirmed).toBe(true);expect(session.record.order?.rewards?.[0].lineId).toBe('canonical-line-756');
  });
  it('accepts only a missing legacy display-name enrichment and rejects changes to frozen names or other terms',async()=>{
    const {session,api}=setup();
    const expected={lineId:'sku-a',activityId:'a',version:1,ruleId:'rule-a',rewardRuleId:'reward-a',beneficiaryRole:'BUYER',groups:1,reward:{type:'DEVICE',giftProductNo:'gift-hidden',quantity:1},disclosure:{title:{zh:'原条款'},terms:{zh:'原权利'}}} as unknown as Quote['expectedRewards'][number];
    session.setQuote({...quote,expectedRewards:[expected]});
    const enriched={...expected,lineId:'canonical-line-756',disclosure:{...expected.disclosure,deviceName:'Frozen gift'}};
    api.create.mockResolvedValue({...order,rewards:[enriched]});await session.create();expect(session.confirmed).toBe(true);
    const known=setup();known.session.setQuote({...quote,expectedRewards:[{...expected,disclosure:{...expected.disclosure,deviceName:'Original gift'}}]});
    known.api.create.mockResolvedValue({...order,rewards:[enriched]});await expect(known.session.create()).rejects.toThrow('ORDER_REWARDS_MISMATCH');
    const changed=setup();changed.session.setQuote({...quote,expectedRewards:[expected]});changed.api.create.mockResolvedValue({...order,rewards:[{...enriched,reward:{...enriched.reward,quantity:2}}]});await expect(changed.session.create()).rejects.toThrow('ORDER_REWARDS_MISMATCH');
  });
  it('a known failed create can be requoted, but a failed pay first reads the same order',async()=>{
    const {session,api}=setup();api.create.mockRejectedValueOnce(new Error('timeout'));
    await expect(session.create()).rejects.toThrow();api.command.mockResolvedValue({status:'FAILED',order:null});
    await session.recover();expect(session.record).toEqual({quote:null,order:null,pending:null});
    session.setQuote(quote);await session.create();api.pay.mockRejectedValueOnce(new Error('timeout'));
    api.paymentCommand.mockResolvedValue({status:'REJECTED',canResumeSameKey:false});
    await expect(session.pay()).rejects.toThrow();await session.recover();
    expect(api.findOrder).toHaveBeenCalledWith('o1');expect(session.confirmed).toBe(true);expect(api.pay).toHaveBeenCalledOnce();
  });
  it('an original receipt resumes without current campaign data and persists immutable terms',()=>{
    const {api,save,key,current}=setup();const session=new PromotionCheckoutSession({api,save,key,current});
    session.resume(order);expect(save.mock.lastCall?.[0].order).toEqual(order);expect(session.confirmed).toBe(true);
    expect(()=>session.resume({...order,orderNo:'other'})).toThrow('ORIGINAL_COMMAND_UNRESOLVED');
  });
  it('changed rewards never unlock payment even when order amount remains the same',async()=>{
    const {session,api}=setup();api.create.mockResolvedValue({...order,rewards:[{lineId:'canonical-line-756',unexpected:true}]});
    await expect(session.create()).rejects.toThrow('ORDER_REWARDS_MISMATCH');expect(session.confirmed).toBe(false);
  });
  it('NOT_FOUND cancellation exposes only the original same-key cancellation retry',async()=>{
    const {session,api}=setup();await session.create();api.cancel.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({...order,paymentStatus:'CANCELLED',orderStatus:'CANCELLED'});
    await expect(session.cancel()).rejects.toThrow();const originalKey=session.record.pending?.key;
    api.command.mockResolvedValue({status:'NOT_FOUND'});await session.recover();
    expect(session.canExecute('cancelOrder')).toBe(true);expect(session.canExecute('payOrder')).toBe(false);expect(session.canExecute('createOrder')).toBe(false);
    await expect(session.pay()).rejects.toThrow('ORIGINAL_COMMAND_UNRESOLVED');expect(api.pay).not.toHaveBeenCalled();
    await session.cancel();expect(api.cancel.mock.calls.map(c=>c[1])).toEqual([originalKey,originalKey]);expect(session.record.order?.paymentStatus).toBe('CANCELLED');
  });
  it.each(['PAID','CANCELLED','EXPIRED','REFUNDED'] as const)('explicit repurchase starts a fresh quote only after %s is confirmed',async paymentStatus=>{
    const {session,api,save,key,current}=setup();await session.create();
    const reloaded=new PromotionCheckoutSession({api,save,key,current},session.record);
    expect(()=>reloaded.startNewPurchase()).toThrow('ORIGINAL_ORDER_UNRESOLVED');
    api.findOrder.mockResolvedValue({...order,paymentStatus});await reloaded.recover();reloaded.startNewPurchase();
    expect(reloaded.record).toEqual({quote:null,order:null,pending:null});reloaded.setQuote({...quote,quoteId:'q2'});expect(reloaded.record.quote?.quoteId).toBe('q2');expect(api.create).toHaveBeenCalledOnce();
  });
  it('pending payment and an unresolved cancellation cannot be replaced by a new purchase',async()=>{
    const {session,api}=setup();await session.create();expect(()=>session.startNewPurchase()).toThrow();
    api.cancel.mockRejectedValue(new Error('timeout'));await expect(session.cancel()).rejects.toThrow();expect(()=>session.startNewPurchase()).toThrow();
  });
  it('two canonical line IDs preserve SKU association and reject rewards attached to the wrong SKU',async()=>{
    const {session,api}=setup();const first={lineId:'sku-a',ruleId:'r-a',rewardRuleId:'gift-a',groups:1,reward:{type:'USDT',amount:'1.000000'}} as unknown as Quote['expectedRewards'][number];
    const second={...first,lineId:'sku-b',ruleId:'r-b',rewardRuleId:'gift-b',reward:{...first.reward,amount:'2.000000'}} as Quote['expectedRewards'][number];
    const items=[{lineId:'sku-a',productNo:'sku-a',quantity:2},{lineId:'sku-b',productNo:'sku-b',quantity:1}];
    session.setQuote({...quote,items:items as Quote['items'],expectedRewards:[first,second]});
    const canonical={...order,items:[{...items[0],lineId:'701'},{...items[1],lineId:'702'}],rewards:[{...first,lineId:'701'},{...second,lineId:'702'}]};
    api.create.mockResolvedValue({...canonical,rewards:[{...first,lineId:'702'},{...second,lineId:'701'}]});await expect(session.create()).rejects.toThrow('ORDER_REWARDS_MISMATCH');
    api.command.mockResolvedValue({status:'SUCCEEDED',order:canonical});await session.recover();expect(session.record.order?.items?.map(item=>item.lineId)).toEqual(['701','702']);expect(session.confirmed).toBe(true);
  });
});

it('voucher entry intents are isolated but cannot bypass an unresolved original command',()=>{
  const input={activityId:'',items:[{productNo:'sku',quantity:1}]},ordinary=selectPromotionCheckoutRecord({},input),event=selectPromotionCheckoutRecord({},{...input,voucherId:'BF20',upgradeActivityId:'pro'});
  expect(event.intent).not.toBe(ordinary.intent);
  const record:PromotionCheckoutRecord={quote,order:null,pending:{key:'pending-key',operation:'createOrder',targetId:'q1'},voucherId:'old-coupon'};
  const resumed=selectPromotionCheckoutRecord({[ordinary.intent]:record},{...input,voucherId:'BF20',upgradeActivityId:'pro'});
  expect(resumed).toEqual({intent:ordinary.intent,record,openedOriginal:true});
});
