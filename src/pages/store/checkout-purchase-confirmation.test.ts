import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { formatAmount } from "@/lib/amount-display";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

const handler = ts.transpileModule(source.slice(source.indexOf("let purchaseConfirmationOpen = false;"),
  source.indexOf("async function onConfirmPay()")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function screen(messages = zh) {
  let current = true;
  let accept!: (value: boolean) => void;
  const deps = {
    checkoutWalletRefreshing: ref(false), step: ref("confirm"), netPrice: ref(50), cardFee: ref(0),
    captureCheckoutRoute: () => ({}), isCurrentCheckoutRoute: () => current,
    t: ref(messages), formatAmount, fmt, dialogOwner: "test-checkout",
    confirm: vi.fn(() => new Promise<boolean>(resolve => { accept = resolve; })),
    onConfirmPay: vi.fn().mockResolvedValue(undefined), toast: { warn: vi.fn() },
  };
  const pay = new Function(...Object.keys(deps),
    `let confirming = false, dialogsOpen = 0; ${handler}; return requestConfirmPay;`)(...Object.values(deps));
  return { ...deps, pay, accept: (value: boolean) => accept(value), leave: () => { current = false; } };
}

describe("checkout purchase confirmation", () => {
  it.each([zh, en, vietnamese])("shows the exact two-decimal amount and pays only after acceptance", async messages => {
    const page = screen(messages);
    const pending = page.pay();
    expect(page.confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: fmt(messages.store.coConfirmPurchaseMessage, { amount: "50.00" }),
      confirmLabel: messages.store.coConfirmPayment, cancelLabel: messages.store.coCancel,
    }));
    expect(page.onConfirmPay).not.toHaveBeenCalled();
    await page.pay();
    expect(page.confirm).toHaveBeenCalledOnce();
    page.accept(true); await pending;
    expect(page.onConfirmPay).toHaveBeenCalledOnce();
  });

  it("cancels without payment and allows another explicit attempt", async () => {
    const page = screen(); const first = page.pay(); page.accept(false); await first;
    expect(page.onConfirmPay).not.toHaveBeenCalled(); expect(page.step.value).toBe("confirm");
    const second = page.pay(); page.accept(true); await second;
    expect(page.onConfirmPay).toHaveBeenCalledOnce();
  });

  it.each(["route", "amount", "step"])("rejects a stale %s confirmation", async change => {
    const page = screen(); const pending = page.pay();
    if (change === "route") page.leave();
    if (change === "amount") page.netPrice.value = 51;
    if (change === "step") page.step.value = "select-payment";
    page.accept(true); await pending;
    expect(page.onConfirmPay).not.toHaveBeenCalled();
    if (change === "amount") expect(page.toast.warn).toHaveBeenCalledWith(zh.store.coTotalQuoteChanged);
  });

  it("preserves payment failures instead of claiming success", async () => {
    const page = screen(); page.onConfirmPay.mockRejectedValue(new Error("unavailable"));
    const pending = page.pay(); page.accept(true);
    await expect(pending).rejects.toThrow("unavailable");
    const retry = page.pay(); page.accept(false); await retry;
    expect(page.confirm).toHaveBeenCalledTimes(2);
  });
});
