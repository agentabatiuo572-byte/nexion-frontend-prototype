import { describe, expect, it } from "vitest";
import checkoutSource from "./checkout.vue?raw";
import depositBankSource from "../../components/me/deposit-bank-pane.vue?raw";

describe("wallet-only commerce checkout", () => {
  it("pays from the NexGrid wallet after the canonical order readback", () => {
    const readback = checkoutSource.indexOf("E20_CAPACITY_AVAILABLE_ORDER_READBACK_MISMATCH");
    const payment = checkoutSource.indexOf("orderApi.pay(");
    const settled = checkoutSource.indexOf("WALLET_PAYMENT_ORDER_READBACK_MISMATCH");
    expect(readback).toBeGreaterThan(-1);
    expect(payment).toBeGreaterThan(readback);
    expect(settled).toBeGreaterThan(payment);
  });

  it("has no commerce route to an HDPay hosted page", () => {
    expect(checkoutSource).not.toContain("createPaymentSession");
    expect(checkoutSource).not.toContain("openHostedPaymentPage");
    expect(checkoutSource).toContain("ORDER_WALLET_INSUFFICIENT");
    expect(checkoutSource).toContain("/pages/me/wallet-topup");
  });

  it("rechecks the account after eligibility before creating an order", () => {
    const eligibility = checkoutSource.indexOf("await refreshPurchaseEligibility(submissionScope)");
    const create = checkoutSource.indexOf("const created = await orderApi.create(");
    const fence = checkoutSource.indexOf("if (!scopeIsCurrent())", eligibility);
    expect(eligibility).toBeGreaterThan(-1);
    expect(fence).toBeGreaterThan(eligibility);
    expect(fence).toBeLessThan(create);
  });

  it("refreshes the canonical wallet before returning from a credited top-up", () => {
    const refresh = depositBankSource.indexOf("await app.refreshRemoteFleet(");
    const back = depositBankSource.indexOf('navBack("/pages/me/wallet")');
    expect(refresh).toBeGreaterThan(-1);
    expect(back).toBeGreaterThan(refresh);
  });
});
