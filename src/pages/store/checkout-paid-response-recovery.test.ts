import { walletSelectedPurchaseFixture } from '@/lib/selected-purchase-payment.test-helper';
import type { PaymentPasswordAuthorization } from '@/api/payment-password-api';
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { ApiError, asApiError } from "@/api/errors";
import { beginOrderAction, clearOrderAction, markOrderActionPaid, readOrderAction } from "@/lib/order-command-fence";
import { en } from "@/i18n/messages/en";
import { readCheckoutCreate, rememberCheckoutCreate, forgetCheckoutCreate } from '@/lib/checkout-create-recovery';
import { orderPaymentRejection } from '@/lib/order-payment-rejection';

const compiled = ts.transpileModule(source.slice(source.indexOf("async function submitRemoteOrder()"),
  source.indexOf("// ── 抵扣上下文")) + "\nreturn submitRemoteOrder;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

beforeEach(() => {
  const disk: Record<string, unknown> = {};
  vi.stubGlobal("uni", { getStorageSync: (key: string) => disk[key],
    setStorageSync: (key: string, value: unknown) => { disk[key] = structuredClone(value); } });
});

function harness() {
  const order = { orderNo: "ORDER-1", productNo: "sku", quantity: 1, amountUsdt: 100, discountUsdt: 0,
    paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", activationStatus: "WAITING_PAYMENT", canonicalStatus: "placed", expiresAt: Date.now()+900000, subtotalUsdt:100 };
  const deps = {
    createdCheckoutOrder: ref(null),
    hasOriginalCheckout:ref(false), orderPaymentRejection, locale:{code:'en' as const}, paymentBlocked:ref(''), flowCopy:ref({queryFailed:'retry'}),
    pendingCheckoutCreate: ref(null), readCheckoutCreate, rememberCheckoutCreate, forgetCheckoutCreate,
    purchaseSubtotal: ref(100), voucherDiscount: ref(0), nowTick: ref(Date.now()),
    resumePendingRemoteTradein: async () => false,
    captureAccountScope: () => ({}), isCurrentAccountScope: () => true,
    app: { captureRemoteAccountRequest: () => ({}), user: { usdtBalance: 100 }, adoptCommerceWallet: vi.fn(), refreshRemoteFleet: vi.fn() },
    product: ref({ id: "sku" }), purchaseUnavailable: ref(false), voucherQuote: { id: null }, quotedTotal: 100,
    netPrice:ref(100),cardFee:ref(0),trialView:ref({applied:false,quoteVersion:null}),trialQuoteScreenUnavailable:ref(false),
    freeTrial:{hasPendingConversion:()=>false},
    confirming: true, offerWalletTopup: vi.fn(), refreshPurchaseEligibility: vi.fn().mockResolvedValue("eligible"),
    captureCheckoutRoute: () => ({ accountKey: "a", accountEpoch: 1, productNo: "sku", generation: 1 }),
    isCurrentCheckoutRoute: () => true,
    step: ref("confirm"), t: ref(en), toast: { warn: vi.fn(), error: vi.fn() },
    tradein: { appliedTradein: null }, appliedTradeinView: ref(null),
    orderApi: { create: vi.fn().mockResolvedValue({ ...order, voucherRedemption: null }),
      list: vi.fn().mockImplementation(async () => ({ orders: [{ ...order }] })), pay: vi.fn() },
    remoteOrderKey: () => "same-key", remoteOrderIntent: () => "same-intent", rememberCheckoutOrder: vi.fn(),
    forgetCheckoutOrder: vi.fn(), orders: { currentAccountKey: () => "a", refreshRemote:vi.fn().mockResolvedValue(true), orders:[{id:'ORDER-1',status:'activated'}] },
    orderId:ref<string|null>(null),remoteOrderFailure:ref<string|null>(null),voucher:{refreshRemote:vi.fn()},
    retireRemoteOrderKey: vi.fn(), navReplace: vi.fn().mockResolvedValue(true), asApiError,
    beginOrderAction, clearOrderAction, markOrderActionPaid,
    executePaymentWithPassword: async (_context: unknown, command: (authorization: PaymentPasswordAuthorization) => Promise<unknown>, current: () => boolean) =>
      current() ? command({ paymentPassword: "039417", credentialVersion: 1, attemptNo: "ATTEMPT-1" }) : null,
    remoteTradeinRecoveryRequired: ref(false), remoteTradeinRecoveryError: ref(false),
    resumeServerOrder: vi.fn().mockResolvedValue(true),
    presentSettledPurchase: vi.fn(), isFirstHardwareOrder: vi.fn(() => false),
  };
  const executeSelectedPurchase=walletSelectedPurchaseFixture(deps.executePaymentWithPassword);
  Object.assign(deps,{executeSelectedPurchase,paidOrderReceipt:(raw:unknown)=>raw});
  const submit = new Function(...Object.keys(deps), compiled)(...Object.values(deps));
  return { ...deps, submit, order };
}

describe("real checkout handler outcome recovery", () => {
  it('pays without a client stock read; the server owns stock at pay time', async () => {
    const h=harness(); h.app.adoptCommerceWallet.mockReturnValue(true);
    h.orderApi.pay.mockResolvedValue({orderNo:'ORDER-1',paymentMethod:'WALLET',walletBalanceAfterUsdt:0});
    await h.submit(); expect(h.orderApi.pay).toHaveBeenCalledOnce();
  });
  it.each([['CAPACITY_REPLACEMENT_REQUIRED','slots are full'],['ORDER_PRODUCT_NOT_PAYABLE','not on sale'],['COMMERCE_PAYMENT_EMERGENCY_STOPPED','maintenance']])(
    'a definitive %s refusal states its reason and retires the payment key without navigating', async (code,reason) => {
    const h=harness(); h.orderApi.pay.mockRejectedValue(new ApiError({kind:'business',message:code,status:409,code:409}));
    await h.submit();
    expect(h.paymentBlocked.value).toContain(reason); expect(h.step.value).toBe('confirm');
    expect(readOrderAction('a','ORDER-1')).toBeNull(); expect(h.navReplace).not.toHaveBeenCalled();
    expect(h.toast.warn).not.toHaveBeenCalledWith(en.store.coRecoverOriginalOrder);
  });
  it('an insufficient wallet after the order exists offers top-up instead of order recovery', async () => {
    const h=harness(); h.orderApi.pay.mockRejectedValue(new ApiError({kind:'business',message:'ORDER_WALLET_INSUFFICIENT',status:409,code:409}));
    await h.submit();
    expect(h.offerWalletTopup).toHaveBeenCalledOnce(); expect(h.paymentBlocked.value).toBe('');
    expect(readOrderAction('a','ORDER-1')).toBeNull(); expect(h.navReplace).not.toHaveBeenCalled();
  });
  it("successful payment replays the settled result and releases recovery only once the result shows",async()=>{
    const h=harness();
    h.app.adoptCommerceWallet.mockReturnValue(true);
    h.orderApi.pay.mockResolvedValue({orderNo:'ORDER-1',paymentMethod:'WALLET',walletBalanceAfterUsdt:0});
    await h.submit();
    expect(h.orderId.value).toBe('ORDER-1');
    expect(h.orderApi.create).toHaveBeenCalledOnce();expect(h.orderApi.pay).toHaveBeenCalledOnce();
    expect(h.navReplace).not.toHaveBeenCalled();
    expect(h.isFirstHardwareOrder).toHaveBeenCalledWith('ORDER-1');
    expect(h.presentSettledPurchase).toHaveBeenCalledOnce();
    const [firstHardware,resultShown]=h.presentSettledPurchase.mock.calls[0] as [boolean,()=>void];
    expect(firstHardware).toBe(false);
    expect(h.forgetCheckoutOrder).not.toHaveBeenCalled();
    resultShown();
    expect(h.forgetCheckoutOrder).toHaveBeenCalledExactlyOnceWith('a','sku','ORDER-1');
    expect(h.rememberCheckoutOrder).toHaveBeenCalledOnce();
    expect(readOrderAction('a','ORDER-1')).toBeNull();
  });
  it("celebrates only the first paid hardware order",()=>{
    const start=source.indexOf("function isFirstHardwareOrder(");
    const body=source.slice(start,source.indexOf("function restoreReceiptRecovery(",start));
    const js=ts.transpileModule(body+"\nreturn isFirstHardwareOrder;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const product=ref({productType:'DEVICE'}),orders={orders:[{id:'NEW',paidAt:2},{id:'UNPAID',paidAt:undefined}]};
    const first=new Function('product','orders',js)(product,orders);
    expect(first('NEW')).toBe(true);
    orders.orders.push({id:'OLD',paidAt:1});expect(first('NEW')).toBe(false);
    orders.orders.pop();product.value={productType:'SHARE'};expect(first('NEW')).toBe(false);
  });
  it("never coalesces recovery across account generations or products", async () => {
    const body = source.slice(source.indexOf("let serverOrderRecovery:"), source.indexOf("function onKeyboardActivate("));
    const js = ts.transpileModule(body + "\nreturn resumeServerOrder;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    let account = { accountKey: "a", epoch: 1 };
    const productId = ref("sku");
    let resolveA!: (v: boolean) => void;
    const recover = vi.fn().mockReturnValueOnce(new Promise((r) => { resolveA = r; }))
      .mockResolvedValue(false);
    const deps = { pendingCheckoutCreate:ref(null), readCheckoutCreate, resumePendingRemoteTradein: async () => false, remoteApiEnabled: true, productId,
      captureCheckoutRoute: () => ({ accountKey: account.accountKey, accountEpoch: account.epoch, productNo: productId.value, generation: account.epoch }),
      isCurrentCheckoutRoute: (scope: { accountKey: string; accountEpoch: number; productNo: string }) => scope.accountKey === account.accountKey
        && scope.accountEpoch === account.epoch && scope.productNo === productId.value,
      orders: { currentAccountKey: () => account.accountKey }, orderApi: { list: vi.fn() },
      recoverCheckoutOrder: recover, recoverKeepBeforePurchase: vi.fn(() => false), navReplace: vi.fn() };
    const resume = new Function(...Object.keys(deps), js)(...Object.values(deps));
    const first = resume();
    expect(resume()).toBe(first);
    account = { accountKey: "b", epoch: 2 };
    const second = resume();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBe(false);
    expect(recover).toHaveBeenCalledTimes(2);
    productId.value = "other";
    await expect(resume()).resolves.toBe(false);
    resolveA(true);
    await first;
  });
  it("persists the original identity before a committed payment loses its response", async () => {
    const h = harness();
    h.orderApi.pay.mockImplementation(async () => {
      expect(h.rememberCheckoutOrder).toHaveBeenCalledOnce();
      expect(readOrderAction('a','ORDER-1')).toMatchObject({kind:'pay',key:'wallet-pay:ORDER-1',phase:'pending',amount:100});
      h.order.paymentStatus = "PAID";
      h.app.user.usdtBalance = 0;
      throw new Error("response lost after commit");
    });
    await h.submit();
    expect(h.orderApi.pay).toHaveBeenCalledOnce();
    expect(h.retireRemoteOrderKey).not.toHaveBeenCalled();
    expect(h.navReplace).toHaveBeenCalledWith("/pages/store/order-detail?id=ORDER-1");
    expect(h.step.value).toBe("awaiting");
    expect(h.app.adoptCommerceWallet).not.toHaveBeenCalled();
    expect(readOrderAction('a','ORDER-1')).toMatchObject({kind:'pay',key:'wallet-pay:ORDER-1',phase:'pending'});
    expect(() => beginOrderAction('a','cancel','ORDER-1',null)).toThrow('ORIGINAL_ORDER_COMMAND_UNRESOLVED');
  });
  it("keeps a confirmed payment fenced when activation readback fails",async()=>{
    const h=harness();h.app.adoptCommerceWallet.mockReturnValue(true);
    h.orderApi.pay.mockResolvedValue({orderNo:'ORDER-1',paymentMethod:'WALLET',walletBalanceAfterUsdt:0});
    h.orders.refreshRemote.mockRejectedValue(new Error('readback offline'));
    await h.submit();
    expect(readOrderAction('a','ORDER-1')).toMatchObject({kind:'pay',phase:'paid',key:'wallet-pay:ORDER-1'});
    expect(h.navReplace).toHaveBeenCalledWith('/pages/store/order-detail?id=ORDER-1');
    expect(() => beginOrderAction('a','pay','ORDER-1',100)).toThrow('ORIGINAL_ORDER_COMMAND_UNRESOLVED');
  });
  it("releases only an explicit rejected PIN before returning to input",async()=>{
    const h=harness();h.orderApi.pay.mockRejectedValue(new ApiError({kind:'business',message:'PAYMENT_PASSWORD_INCORRECT'}));
    await h.submit();
    expect(h.orderApi.pay).toHaveBeenCalledOnce();expect(readOrderAction('a','ORDER-1')).toBeNull();
  });
  it("does not pay when recovery storage fails, but still offers the known server order", async () => {
    const h = harness();
    h.rememberCheckoutOrder.mockImplementation(() => { throw new Error("disk full"); });
    await h.submit();
    expect(h.orderApi.pay).not.toHaveBeenCalled();
    expect(h.navReplace).toHaveBeenCalledWith("/pages/store/order-detail?id=ORDER-1");
  });
  it("accepts paid readback after create replay without a second payment", async () => {
    const h = harness();
    Object.assign(h.order, { canonicalStatus: "activated", paymentStatus: "PAID", orderStatus: "COMPLETED", activationStatus: "ACTIVATED" });
    await h.submit();
    expect(h.resumeServerOrder).toHaveBeenCalledOnce();
    expect(h.orderApi.pay).not.toHaveBeenCalled();
  });
  it("does not create, pay, toast, or reset the visible step after a stale eligibility result", async () => {
    const h = harness();
    h.refreshPurchaseEligibility.mockResolvedValue("stale");
    h.isCurrentCheckoutRoute = () => false;
    await h.submit();
    expect(h.orderApi.create).not.toHaveBeenCalled();
    expect(h.orderApi.pay).not.toHaveBeenCalled();
    expect(h.toast.warn).not.toHaveBeenCalled();
    expect(h.step.value).toBe("confirm");
  });
  it("checks durable recovery before changing the quote or running new-purchase gates", () => {
    const handler = source.slice(source.indexOf("async function onConfirmPay()"), source.indexOf("// $0 due"));
    expect(handler.indexOf("await resumeServerOrder(recoveryScope)")).toBeGreaterThan(-1);
    expect(handler.indexOf("await resumeServerOrder(recoveryScope)")).toBeLessThan(handler.indexOf("trialQuote ="));
    expect(source.slice(source.indexOf("onShow(() => {"))).toContain("void resumeServerOrder()");
  });
});
