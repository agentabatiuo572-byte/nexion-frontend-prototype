import { describe, expect, it, vi } from 'vitest';
import { PromotionCheckoutSession,selectPromotionCheckoutRecord } from './promotion-checkout-session';
import type { Quote, OrderReceipt } from '../api/promotion-contracts';
const quote = { quoteId:'q1', eligibility:'ELIGIBLE', amountUsdt:'120.000000', quantity:3, items:[{lineId:'sku-a',productNo:'sku-a',quantity:3}], expectedRewards:[] } as unknown as Quote;
const order = {orderNo:'o1',promotionQuoteId:'q1',quantity:3,amountUsdt:'120',paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',payBy:'2026-10-31T00:00:00Z',rewards:[],items:[{lineId:'canonical-line-756',productNo:'sku-a',productName:'Frozen Alpha',quantity:3}]} as OrderReceipt;
function setup() {
  const api={create:vi.fn().mockResolvedValue(order),pay:vi.fn().mockResolvedValue({...order,paymentStatus:'PAID'}),cancel:vi.fn(),command:vi.fn(),findOrder:vi.fn().mockResolvedValue(order)};
  const save=vi.fn(); const key=vi.fn().mockReturnValue('durable-original-key'); const current=vi.fn().mockReturnValue(true);
  const session=new PromotionCheckoutSession({api,save,key,current});session.setQuote(quote);
  return {session,api,save,key,current};
}
describe('promotion checkout original-command safety',()=>{
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
