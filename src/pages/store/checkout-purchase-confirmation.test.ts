import { computed, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { formatAmount as formatPlainAmount } from "@/lib/amount-display";
import { formatCheckoutReviewAmount } from "@/lib/checkout-review-amount";
import { zh } from "@/i18n/messages/zh";
import { selectedPurchasePaymentFixture } from "@/lib/selected-purchase-payment.test-helper";
import type { PaymentPasswordContext } from "@/store/payment-password";
import type { PaymentPasswordAuthorization } from "@/api/payment-password-api";

// The real review handler enters the production three-method selector; only wallet proceeds to PIN.
const handler = ts.transpileModule(source.slice(source.indexOf("let purchaseConfirmationOpen = false;"),
  source.indexOf("async function onConfirmPay()")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const amountCode = ts.transpileModule(source.slice(source.indexOf('function formatAmount('), source.indexOf('const locale = useLocaleStore();')),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const formatAmount = new Function('formatPlainAmount', amountCode + ';return formatAmount;')(formatPlainAmount);
const totalCode = ts.transpileModule(source.slice(source.indexOf('const confirmTotalText ='), source.indexOf('const paymentLabel =')),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function screen() {
  let current = true;
  let cancelZeroPin!: () => void;
  const authorization = { paymentPassword: '583719', credentialVersion: 1, attemptNo: 'confirmation-fixture' };
  const wallet = vi.fn().mockResolvedValue({ orderNo: 'ORIGINAL-ORDER' });
  const pin = vi.fn((context: PaymentPasswordContext, command: (authorization: PaymentPasswordAuthorization) => Promise<unknown>, isCurrent: () => boolean) => Number(context.amount) === 0
    ? new Promise<unknown>(resolve => { cancelZeroPin = () => resolve(null); })
    : isCurrent() ? command(authorization) : Promise.resolve(null));
  const methodSelection = selectedPurchasePaymentFixture(pin);
  const deps = {
    ref, nextTick, formatCheckoutReviewAmount,
    trialQuoteUnavailable: ref(false), trialQuoteScreenUnavailable: ref(false),
    createdCheckoutOrder: ref(null), pendingCheckoutCreate: ref(null),
    voucherSelecting: ref(false), checkoutWalletRefreshing: ref(false), step: ref("confirm"),
    netPrice: ref(50), cardFee: ref(0), paymentBlocked: ref(""),
    trialView: ref({ applied: false, quoteVersion: 1 }), freeTrial: { hasPendingConversion: () => false },
    captureCheckoutRoute: () => ({}), isCurrentCheckoutRoute: () => current,
    t: ref(zh), toast: { warn: vi.fn() },
    onConfirmPay: vi.fn(),
  };
  deps.onConfirmPay.mockImplementation(() => {
    const amount = deps.netPrice.value + deps.cardFee.value;
    return methodSelection.execute({ amount, currency: 'USDT', summary: 'Reviewed purchase' }, wallet,
      () => current && deps.step.value === 'confirm' && amount === deps.netPrice.value + deps.cardFee.value,
      { kind: 'ORDER_PAY', payload: { orderNo: 'ORIGINAL-ORDER' }, commandKey: () => 'original-command', parseReceipt: (raw: unknown) => raw });
  });
  const api = new Function(...Object.keys(deps),
    `let confirming = false, dialogsOpen = 0; ${handler};
     return { requestConfirmPay, confirmPaymentSheet, closePaymentSheet, paymentSheetOpen, paymentSheetAmount, paymentFlowBusy };`)(...Object.values(deps));
  return { ...deps, ...api, wallet, pin, authorization, methodSelection, cancelZeroPin: () => cancelZeroPin(), leave: () => { current = false; } };
}

describe("checkout purchase confirmation", () => {
  it("keeps the legacy cent-settled card total free of binary float noise", () => {
    const netPrice = ref(0.1), cardFee = ref(0.2);
    const total = new Function('computed', 'netPrice', 'cardFee', 'formatPlainAmount', 'formatAmount', totalCode + ';return confirmTotalText;')(computed, netPrice, cardFee, formatPlainAmount, formatAmount);
    expect(total.value).toBe("0.30");
  });

  it.each([0, 0.000001, 0.004, 1.234567])("hands exact amount %s to its confirmation gate and pays nothing on close", async amount => {
    const page = screen(); page.netPrice.value = amount;
    const pending = page.requestConfirmPay();
    expect(page.paymentSheetAmount.value).toBe(amount);
    await nextTick(); await nextTick();
    if (amount === 0) {
      expect(page.methodSelection.request).not.toHaveBeenCalled();
      expect(page.pin).toHaveBeenCalledWith(expect.objectContaining({ amount: 0 }), page.wallet, expect.any(Function));
      page.cancelZeroPin();
    } else {
      expect(page.methodSelection.state.open).toBe(true);
      expect(page.methodSelection.request).toHaveBeenCalledWith(expect.objectContaining({ amount }));
      expect(page.pin).not.toHaveBeenCalled(); await page.methodSelection.cancel();
    }
    await pending; expect(page.wallet).not.toHaveBeenCalled(); expect(page.methodSelection.state.open).toBe(false);
  });

  it("pays only after wallet confirmation and ignores a second request while the chooser is open", async () => {
    const page = screen();
    const pending = page.requestConfirmPay();
    await nextTick(); await nextTick();
    expect(page.methodSelection.state.open).toBe(true); expect(page.pin).not.toHaveBeenCalled(); expect(page.wallet).not.toHaveBeenCalled();
    await page.requestConfirmPay();
    await page.methodSelection.wallet(); await pending;
    expect(page.onConfirmPay).toHaveBeenCalledOnce();
    expect(page.methodSelection.request).toHaveBeenCalledOnce(); expect(page.pin).toHaveBeenCalledOnce();
    expect(page.wallet).toHaveBeenCalledExactlyOnceWith(page.authorization);
    expect(page.paymentFlowBusy.value).toBe(false);
    expect(page.methodSelection.state.open).toBe(false);
  });

  it("cancels without payment and allows another explicit attempt", async () => {
    const page = screen(); const first = page.requestConfirmPay(); await nextTick(); await nextTick();
    await page.methodSelection.cancel(); await first;
    expect(page.wallet).not.toHaveBeenCalled(); expect(page.pin).not.toHaveBeenCalled(); expect(page.step.value).toBe("confirm");
    const second = page.requestConfirmPay(); await nextTick(); await nextTick(); await page.methodSelection.wallet(); await second;
    expect(page.wallet).toHaveBeenCalledExactlyOnceWith(page.authorization); expect(page.methodSelection.request).toHaveBeenCalledTimes(2);
  });

  it.each(["route", "amount", "step"])("rejects a stale %s confirmation", async change => {
    const page = screen(); const pending = page.requestConfirmPay();
    if (change === "route") page.leave();
    if (change === "amount") page.netPrice.value = 51;
    if (change === "step") page.step.value = "select-payment";
    await pending;
    expect(page.onConfirmPay).not.toHaveBeenCalled();
    expect(page.methodSelection.request).not.toHaveBeenCalled(); expect(page.pin).not.toHaveBeenCalled(); expect(page.wallet).not.toHaveBeenCalled();
    if (change === "amount") {
      expect(page.toast.warn).toHaveBeenCalledWith(zh.store.coTotalQuoteChanged);
      expect(page.step.value).toBe("select-payment");
    }
  });

  it("preserves payment failures instead of claiming success", async () => {
    const page = screen(); page.wallet.mockRejectedValueOnce(new Error("unavailable"));
    const pending = page.requestConfirmPay(), failed = expect(pending).rejects.toThrow("unavailable");
    await nextTick(); await nextTick(); await expect(page.methodSelection.wallet()).rejects.toThrow("unavailable"); await failed;
    expect(page.paymentFlowBusy.value).toBe(false);
    const retry = page.requestConfirmPay();
    await nextTick(); await nextTick(); expect(page.methodSelection.state.open).toBe(true);
    await page.methodSelection.cancel(); await retry; expect(page.wallet).toHaveBeenCalledOnce();
  });

  it.each(["route", "amount", "step"])("rejects a stale %s while the method chooser is open", async change => {
    const page = screen(); const pending = page.requestConfirmPay(); await nextTick(); await nextTick();
    expect(page.methodSelection.state.open).toBe(true);
    if (change === 'route') page.leave();
    if (change === 'amount') page.netPrice.value = 51;
    if (change === 'step') page.step.value = 'select-payment';
    await page.methodSelection.wallet(); await pending;
    expect(page.pin).not.toHaveBeenCalled(); expect(page.wallet).not.toHaveBeenCalled(); expect(page.paymentFlowBusy.value).toBe(false);
  });
});
