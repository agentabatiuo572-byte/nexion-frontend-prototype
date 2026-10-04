import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { asApiError } from "@/api/errors";
import { en } from "@/i18n/messages/en";

const compiled = ts.transpileModule(source.slice(source.indexOf("async function submitRemoteOrder()"),
  source.indexOf("// ── 抵扣上下文")) + "\nreturn submitRemoteOrder;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  const order = { orderNo: "ORDER-1", productNo: "sku", quantity: 1, amountUsdt: 100, discountUsdt: 0,
    paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT", activationStatus: "WAITING_PAYMENT", canonicalStatus: "placed" };
  const deps = {
    captureAccountScope: () => ({}), isCurrentAccountScope: () => true,
    app: { captureRemoteAccountRequest: () => ({}), user: { usdtBalance: 100 }, adoptCommerceWallet: vi.fn(), refreshRemoteFleet: vi.fn() },
    product: ref({ id: "sku" }), purchaseUnavailable: ref(false), voucherQuote: { id: null }, quotedTotal: 100,
    confirming: true, offerWalletTopup: vi.fn(), refreshPurchaseEligibility: vi.fn().mockResolvedValue("eligible"),
    captureCheckoutRoute: () => ({ accountKey: "a", accountEpoch: 1, productNo: "sku", generation: 1 }),
    isCurrentCheckoutRoute: () => true,
    step: ref("confirm"), t: ref(en), toast: { warn: vi.fn(), error: vi.fn() },
    tradein: { appliedTradein: null }, appliedTradeinView: ref(null),
    orderApi: { create: vi.fn().mockResolvedValue({ ...order, voucherRedemption: null }),
      list: vi.fn().mockImplementation(async () => ({ orders: [{ ...order }] })), pay: vi.fn() },
    remoteOrderKey: () => "same-key", remoteOrderIntent: () => "same-intent", rememberCheckoutOrder: vi.fn(),
    forgetCheckoutOrder: vi.fn(), orders: { currentAccountKey: () => "a" },
    retireRemoteOrderKey: vi.fn(), navReplace: vi.fn().mockResolvedValue(true), asApiError,
    resumeServerOrder: vi.fn().mockResolvedValue(true),
  };
  const submit = new Function(...Object.keys(deps), compiled)(...Object.values(deps));
  return { ...deps, submit, order };
}

describe("real checkout handler outcome recovery", () => {
  it("never coalesces recovery across account generations or products", async () => {
    const body = source.slice(source.indexOf("let serverOrderRecovery:"), source.indexOf("function onKeyboardActivate("));
    const js = ts.transpileModule(body + "\nreturn resumeServerOrder;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    let account = { accountKey: "a", epoch: 1 };
    const productId = ref("sku");
    let resolveA!: (v: boolean) => void;
    const recover = vi.fn().mockReturnValueOnce(new Promise((r) => { resolveA = r; }))
      .mockResolvedValue(false);
    const deps = { remoteApiEnabled: true, productId,
      captureCheckoutRoute: () => ({ accountKey: account.accountKey, accountEpoch: account.epoch, productNo: productId.value, generation: account.epoch }),
      isCurrentCheckoutRoute: (scope: { accountKey: string; accountEpoch: number; productNo: string }) => scope.accountKey === account.accountKey
        && scope.accountEpoch === account.epoch && scope.productNo === productId.value,
      orders: { currentAccountKey: () => account.accountKey }, orderApi: { list: vi.fn() },
      recoverCheckoutOrder: recover, navReplace: vi.fn() };
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
    expect(handler.indexOf("await resumeServerOrder()")).toBeLessThan(handler.indexOf("trialQuote ="));
    expect(source.slice(source.indexOf("onShow(() => {"))).toContain("void resumeServerOrder()");
  });
});
