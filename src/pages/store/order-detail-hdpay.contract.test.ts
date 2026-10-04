import { describe, expect, it } from "vitest";
import detailSource from "./order-detail.vue?raw";

describe("wallet payment for a pending commerce order", () => {
  it("lets a placed remote order retry the idempotent wallet debit", () => {
    expect(detailSource).toContain("canPayFromWallet");
    expect(detailSource).toContain("orderApi.pay(");
    expect(detailSource).toContain("`wallet-pay:${requestOrderNo}`");
    expect(detailSource).toContain("adoptCommerceWallet");
  });

  it("guides an insufficient wallet balance to top-up and never opens HDPay", () => {
    expect(detailSource).toContain("ORDER_WALLET_INSUFFICIENT");
    expect(detailSource).toContain("/pages/me/wallet-topup");
    expect(detailSource).not.toContain("createPaymentSession");
    expect(detailSource).not.toContain("openHostedPaymentPage");
  });

  it("keeps the wallet-payment CTA activatable from pointer and keyboard input", () => {
    expect(detailSource).toContain('@keydown.enter.prevent.stop="handleWalletPayment"');
    expect(detailSource).toContain('@keydown.space.prevent.stop="handleWalletPayment"');
    expect(detailSource).toContain('<text @click.stop="handleWalletPayment">{{ t.store.coPayNow }}</text>');
  });

  it("fences payment and readback to the account that opened the detail", () => {
    expect(detailSource).toContain("accountScope: captureAccountScope()");
    expect(detailSource).toContain("isCurrentAccountScope(scope.accountScope)");
    expect(detailSource).toContain("refreshOrderWallet");
  });

  it("never reports a confirmed wallet debit as a failed purchase when readback is unavailable", () => {
    expect(detailSource).toContain("walletPaymentConfirmed.value = true");
    expect(detailSource).toContain("!walletPaymentConfirmed.value");
    expect(detailSource).toContain("walletPaymentConfirmedRefreshPending");
  });

  it("blocks cancellation while wallet payment is in flight or confirmed but readback is pending", () => {
    expect(detailSource.replace(/\r\n/g, "\n")).toContain('return order.value?.status === "placed"\n    && !walletPaymentConfirmed.value\n    && !payingFromWallet.value;');
    expect(detailSource).toContain("const cancellingOrder = ref(false);");
    expect(detailSource).toContain("let cancelAttemptSequence = 0;");
    expect(detailSource).toContain("&& !cancellingOrder.value");
    expect(detailSource).toContain("if (!cancellable.value) return;");
    expect(detailSource).toContain("cancellingOrder.value = true;");
    expect(detailSource).toContain("const cancelAttempt = ++cancelAttemptSequence;");
    expect(detailSource).toContain("if (!ok || !canCancelCurrentOrder() || !isCurrentDetailScope(scope) || !order.value) return;");
    expect(detailSource).toContain("if (cancelAttempt === cancelAttemptSequence) cancellingOrder.value = false;");
    expect(detailSource).toContain('@keydown.enter.prevent.stop="handleCancel"');
    expect(detailSource).toContain('@keydown.space.prevent.stop="handleCancel"');
  });

  it("explains full voucher settlement without implying a wallet debit", () => {
    expect(detailSource).toContain("fullyVoucherSettled");
    expect(detailSource).toContain("voucherSettledNoWalletDebit");
    expect(detailSource).toContain('paymentMethod?.toUpperCase() === "VOUCHER"');
  });
});
