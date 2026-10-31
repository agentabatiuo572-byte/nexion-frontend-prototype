import { computed, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { formatAmount as formatPlainAmount } from "@/lib/amount-display";
import { formatCheckoutReviewAmount } from "@/lib/checkout-review-amount";
import { zh } from "@/i18n/messages/zh";

// The real checkout confirmation handler: payment sheet open → user accepts or closes → pay.
const handler = ts.transpileModule(source.slice(source.indexOf("let purchaseConfirmationOpen = false;"),
  source.indexOf("async function onConfirmPay()")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const amountCode = ts.transpileModule(source.slice(source.indexOf('function formatAmount('), source.indexOf('const locale = useLocaleStore();')),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const formatAmount = new Function('formatPlainAmount', amountCode + ';return formatAmount;')(formatPlainAmount);
const totalCode = ts.transpileModule(source.slice(source.indexOf('const confirmTotalText ='), source.indexOf('const paymentLabel =')),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function screen() {
  let current = true;
  const deps = {
    ref, nextTick, formatCheckoutReviewAmount,
    trialQuoteUnavailable: ref(false), trialQuoteScreenUnavailable: ref(false),
    createdCheckoutOrder: ref(null), pendingCheckoutCreate: ref(null),
    voucherSelecting: ref(false), checkoutWalletRefreshing: ref(false), step: ref("confirm"),
    netPrice: ref(50), cardFee: ref(0), paymentBlocked: ref(""),
    trialView: ref({ applied: false, quoteVersion: 1 }), freeTrial: { hasPendingConversion: () => false },
    captureCheckoutRoute: () => ({}), isCurrentCheckoutRoute: () => current,
    t: ref(zh), toast: { warn: vi.fn() },
    onConfirmPay: vi.fn().mockResolvedValue(undefined),
  };
  const api = new Function(...Object.keys(deps),
    `let confirming = false, dialogsOpen = 0; ${handler};
     return { requestConfirmPay, confirmPaymentSheet, closePaymentSheet, paymentSheetOpen, paymentSheetAmount, paymentFlowBusy };`)(...Object.values(deps));
  return { ...deps, ...api, leave: () => { current = false; } };
}

describe("checkout purchase confirmation", () => {
  it("keeps the legacy cent-settled card total free of binary float noise", () => {
    const netPrice = ref(0.1), cardFee = ref(0.2);
    const total = new Function('computed', 'netPrice', 'cardFee', 'formatPlainAmount', 'formatAmount', totalCode + ';return confirmTotalText;')(computed, netPrice, cardFee, formatPlainAmount, formatAmount);
    expect(total.value).toBe("0.30");
  });

  it.each([0, 0.000001, 0.004, 1.234567])("hands the exact amount %s to the payment sheet and pays nothing on close", async amount => {
    const page = screen(); page.netPrice.value = amount;
    const pending = page.requestConfirmPay();
    expect(page.paymentSheetOpen.value).toBe(true);
    expect(page.paymentSheetAmount.value).toBe(amount);
    page.closePaymentSheet(); await pending;
    expect(page.onConfirmPay).not.toHaveBeenCalled();
    expect(page.paymentSheetOpen.value).toBe(false);
  });

  it("pays only after the sheet is confirmed and ignores a second request while it is open", async () => {
    const page = screen();
    const pending = page.requestConfirmPay();
    expect(page.onConfirmPay).not.toHaveBeenCalled();
    await page.requestConfirmPay();
    page.confirmPaymentSheet(); await pending;
    expect(page.onConfirmPay).toHaveBeenCalledOnce();
    expect(page.paymentFlowBusy.value).toBe(false);
    expect(page.paymentSheetOpen.value).toBe(false);
  });

  it("cancels without payment and allows another explicit attempt", async () => {
    const page = screen(); const first = page.requestConfirmPay(); page.closePaymentSheet(); await first;
    expect(page.onConfirmPay).not.toHaveBeenCalled(); expect(page.step.value).toBe("confirm");
    const second = page.requestConfirmPay(); page.confirmPaymentSheet(); await second;
    expect(page.onConfirmPay).toHaveBeenCalledOnce();
  });

  it.each(["route", "amount", "step"])("rejects a stale %s confirmation", async change => {
    const page = screen(); const pending = page.requestConfirmPay();
    if (change === "route") page.leave();
    if (change === "amount") page.netPrice.value = 51;
    if (change === "step") page.step.value = "select-payment";
    page.confirmPaymentSheet(); await pending;
    expect(page.onConfirmPay).not.toHaveBeenCalled();
    if (change === "amount") {
      expect(page.toast.warn).toHaveBeenCalledWith(zh.store.coTotalQuoteChanged);
      expect(page.step.value).toBe("select-payment");
    }
  });

  it("preserves payment failures instead of claiming success", async () => {
    const page = screen(); page.onConfirmPay.mockRejectedValue(new Error("unavailable"));
    const pending = page.requestConfirmPay(); page.confirmPaymentSheet();
    await expect(pending).rejects.toThrow("unavailable");
    expect(page.paymentFlowBusy.value).toBe(false);
    const retry = page.requestConfirmPay();
    expect(page.paymentSheetOpen.value).toBe(true);
    page.closePaymentSheet(); await retry;
  });
});
