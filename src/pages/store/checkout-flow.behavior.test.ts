import { computed, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import source from './checkout.vue?raw';
import { en } from '@/i18n/messages/en';
import { formatCheckoutReviewAmount } from '@/lib/checkout-review-amount';

const script = source.split('<script setup lang="ts">')[1].split('</script>')[0];
const ast = ts.createSourceFile('checkout.ts', script, ts.ScriptTarget.Latest, true);
function payment() {
  const scope = { accountKey: 'a', productNo: 's1', generation: 1 };
  const deps = {
    createdCheckoutOrder: ref(null), pendingCheckoutCreate: ref(null),
    formatCheckoutReviewAmount,
    paymentBlocked:ref(''), flowCopy:ref({queryFailed:'retry'}),
    ref, computed, nextTick, dialogsOpen: 0, trialQuoteUnavailable: ref(false), trialQuoteScreenUnavailable: ref(false),
    voucherSelecting: ref(false), confirming: false, checkoutWalletRefreshing: ref(false), step: ref('confirm'),
    captureCheckoutRoute: () => ({ ...scope }), isCurrentCheckoutRoute: (value: typeof scope) => value.generation === scope.generation,
    netPrice: ref(100), cardFee: ref(0), trialView: ref({ applied: false, quoteVersion: 1 }),
    freeTrial: { hasPendingConversion: () => false }, t: ref(en), toast: { warn: vi.fn() }, onConfirmPay: vi.fn(),
  };
  const fragment = script.slice(script.indexOf('let purchaseConfirmationOpen ='), script.indexOf('async function onConfirmPay()'));
  const code = ts.transpileModule(fragment + ';return {requestConfirmPay,closePaymentSheet,confirmPaymentSheet,paymentSheetOpen,paymentSheetAmount,paymentFlowBusy,reviewMoney};', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return { ...deps, scope, ...new Function(...Object.keys(deps), code)(...Object.values(deps)) };
}
function leaving() {
  const scope = { accountKey: 'a', productNo: 's1' };
  const deps = {
    checkoutLeaving: ref(false), paymentFlowBusy: ref(false), confirming: false,
    pendingCheckoutCreate: ref(null), readCheckoutCreate: vi.fn(() => null), productId: ref('s1'),
    orderApi: { create: vi.fn() }, rememberCheckoutOrder: vi.fn(), forgetCheckoutCreate: vi.fn(),
    createdCheckoutOrder: ref<null | { orderNo: string }>({ orderNo: 'ORDER-1' }), settledResultReplay: ref(false),
    checkoutBackHref: ref('/pages/store/detail?id=s1'), navBack: vi.fn(), captureCheckoutRoute: () => scope,
    checkoutLeaveError: ref(''), isCurrentCheckoutRoute: vi.fn(() => true), readOrderAction: vi.fn(() => null),
    readPaymentCommand: vi.fn(), apiClient: {}, clearOrderAction: vi.fn(),
    orders: { currentAccountKey: () => 'a', ensureRemoteOrder: vi.fn(), orders: [{ id: 'ORDER-1', status: 'placed' }], cancelOrderRemote: vi.fn().mockResolvedValue(true) },
    orderId: ref<string | null>(null), presentSettledPurchase: vi.fn(), beginOrderAction: vi.fn(() => ({ key: 'order-cancel:ORDER-1' })),
    forgetCheckoutOrder: vi.fn(), retireRemoteOrderKey: vi.fn(), t: ref(en),
  };
  // Keep the attempt counter in the same closure as the extracted handler.
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'cancelCheckout')!;
  const code = ts.transpileModule('let checkoutLeaveAttempt = 0;' + node.getText(ast) + ';return cancelCheckout;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return { ...deps, run: new Function(...Object.keys(deps), code)(...Object.values(deps)) };
}
describe('unified checkout payment and explicit back', () => {
  it('keeps the review in dollars one to one while the sheet holds the wallet amount',async()=>{
    const h=payment();expect(h.reviewMoney(100,false,true)).toBe('$100.00');expect(h.reviewMoney(5,true)).toBe('−5.00');
    const pending=h.requestConfirmPay();expect(h.paymentSheetAmount.value).toBe(100);expect(h.reviewMoney(100,false,true)).toBe('$100.00');
    h.closePaymentSheet();await pending;expect(h.onConfirmPay).not.toHaveBeenCalled();
  });
  it('passes the sheet amount through method confirmation once',async()=>{
    const h=payment();let finish!:()=>void;h.onConfirmPay.mockReturnValueOnce(new Promise<void>(done=>{finish=done;}));
    const pending=h.requestConfirmPay();h.confirmPaymentSheet();await nextTick();await nextTick();
    expect(h.onConfirmPay).toHaveBeenCalledOnce();expect(h.paymentSheetAmount.value).toBe(100);finish();await pending;expect(h.paymentFlowBusy.value).toBe(false);
  });
  it('opens method selection before any payment and closing preserves the draft', async () => {
    const h = payment(); const pending = h.requestConfirmPay();
    expect(h.paymentSheetOpen.value).toBe(true); expect(h.onConfirmPay).not.toHaveBeenCalled();
    h.closePaymentSheet(); await pending;
    expect(h.onConfirmPay).not.toHaveBeenCalled(); expect(h.step.value).toBe('confirm');
  });
  it('only method confirmation enters the existing PIN/command path once', async () => {
    const h = payment(); const first = h.requestConfirmPay(); await h.requestConfirmPay();
    h.confirmPaymentSheet(); await first;
    expect(h.onConfirmPay).toHaveBeenCalledOnce(); expect(h.paymentSheetOpen.value).toBe(false);
  });
  it.each(['amount', 'account', 'quote'])('rejects a changed %s between sheet and password', async kind => {
    const h = payment(); const pending = h.requestConfirmPay();
    if (kind === 'amount') h.netPrice.value = 120;
    else if (kind === 'account') h.scope.generation++;
    else h.trialView.value.quoteVersion++;
    h.confirmPaymentSheet(); await pending; expect(h.onConfirmPay).not.toHaveBeenCalled();
  });
  it('back cancels the original pending order before leaving', async () => {
    const h = leaving(); await h.run();
    expect(h.orders.cancelOrderRemote).toHaveBeenCalledExactlyOnceWith('ORDER-1');
    expect(h.forgetCheckoutOrder).toHaveBeenCalledWith('a', 's1', 'ORDER-1');
    expect(h.navBack).toHaveBeenCalledOnce();
    expect(h.orders.cancelOrderRemote.mock.invocationCallOrder[0]).toBeLessThan(h.navBack.mock.invocationCallOrder[0]);
  });
  it('a failed/unknown cancellation retains the original identity and retry', async () => {
    const h = leaving(); h.orders.cancelOrderRemote.mockResolvedValue(false); await h.run();
    expect(h.navBack).not.toHaveBeenCalled(); expect(h.forgetCheckoutOrder).not.toHaveBeenCalled();
    expect(h.checkoutLeaveError.value).not.toBe(''); expect(h.createdCheckoutOrder.value?.orderNo).toBe('ORDER-1');
  });
  it('hiding during the cancellation readback releases UI busy without a stale write', async () => {
    const h = leaving(); let resolve!: () => void;
    const gate = new Promise<void>(done => { resolve = done; });
    h.orders.ensureRemoteOrder.mockReturnValueOnce(gate);
    const pending = h.run(); expect(h.checkoutLeaving.value).toBe(true);
    h.isCurrentCheckoutRoute.mockReturnValue(false); resolve(); await pending;
    expect(h.checkoutLeaving.value).toBe(false);
    expect(h.orders.cancelOrderRemote).not.toHaveBeenCalled(); expect(h.navBack).not.toHaveBeenCalled();
    h.isCurrentCheckoutRoute.mockReturnValue(true); await h.run(); expect(h.orders.cancelOrderRemote).toHaveBeenCalledOnce();
  });
  it('an unresolved payment cannot race a cancellation', async () => {
    const h = leaving(); h.readOrderAction.mockReturnValue({ kind: 'pay', key: 'original' } as never);
    h.readPaymentCommand.mockResolvedValue({ status: 'PROCESSING', canResumeSameKey: false }); await h.run();
    expect(h.orders.cancelOrderRemote).not.toHaveBeenCalled(); expect(h.navBack).not.toHaveBeenCalled();
  });
  it('a paid readback shows its result instead of cancelling', async () => {
    const h = leaving(); h.orders.orders[0].status = 'activated'; await h.run();
    expect(h.orders.cancelOrderRemote).not.toHaveBeenCalled(); expect(h.presentSettledPurchase).toHaveBeenCalledOnce();
  });
  it('a recovered successful payment must reveal the result when back is pressed', async () => {
    const h = leaving(); h.readOrderAction.mockReturnValue({ kind: 'pay', key: 'original' } as never);
    h.readPaymentCommand.mockResolvedValue({ status: 'SUCCEEDED', canResumeSameKey: false });
    h.orders.orders[0].status = 'activated'; await h.run();
    expect(h.orders.cancelOrderRemote).not.toHaveBeenCalled(); expect(h.presentSettledPurchase).toHaveBeenCalledOnce();
    expect(h.clearOrderAction).toHaveBeenCalledWith('a', 'ORDER-1', 'original');
  });
  it('an uncreated draft exits without a cancel write', async () => {
    const h = leaving(); h.createdCheckoutOrder.value = null; await h.run();
    expect(h.orders.cancelOrderRemote).not.toHaveBeenCalled(); expect(h.navBack).toHaveBeenCalledOnce();
  });
  it('back resolves a lost create response using its exact persisted request before cancelling', async () => {
    const h = leaving(); h.createdCheckoutOrder.value = null;
    const original = {request:{productNo:'s1',quantity:1,voucherId:'old-voucher',idempotencyKey:'original-create'},intent:'original',subtotal:100,discount:10,amount:90};
    h.readCheckoutCreate.mockReturnValue(original as never); h.orderApi.create.mockResolvedValue({orderNo:'ORDER-1'});
    await h.run();
    expect(h.orderApi.create).toHaveBeenCalledExactlyOnceWith(original.request);
    expect(h.rememberCheckoutOrder).toHaveBeenCalledWith('a',expect.objectContaining({orderNo:'ORDER-1',commandKey:'original-create'}));
    expect(h.orders.cancelOrderRemote).toHaveBeenCalledExactlyOnceWith('ORDER-1');
    expect(h.forgetCheckoutCreate).toHaveBeenCalledWith('a',original); expect(h.navBack).toHaveBeenCalledOnce();
  });
});
