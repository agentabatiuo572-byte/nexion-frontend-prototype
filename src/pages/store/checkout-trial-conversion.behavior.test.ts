import { formatAmount } from "@/lib/amount-display";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { en } from "@/i18n/messages/en";
import { resolveTrialAt, accruedShadow, type TrialRowSnapshot } from "@/store/trial-boundary";
import { DEFAULT_TRIAL_CONFIG, computeDiscountedPrice, computeTrialOffset, resolveTrialCheckoutProductId } from "@/store/trial-config";

describe("trial credit in the actual checkout quote", () => {
  it.each([499, 1999])("quotes the claim price rather than changed catalogue price %s", catalogPrice => {
    const subtotal = ts.transpileModule(source.slice(source.indexOf("const purchaseSubtotal ="), source.indexOf("const promoDiscount =")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const net = ts.transpileModule(source.slice(source.indexOf("const netPrice ="), source.indexOf("// 异常4: credit")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const deps = { computed, remoteApiEnabled: true, trialConversionMode: ref(true), freeTrial: { authoritativePriceUSD: 1299 }, product: ref({ price: catalogPrice }), appliedTradeinView: ref(null), voucherDiscount: ref(0), tradeinCredit: ref(0), promoDiscount: ref(20), trialOffsetView: ref({ offsetUSD: 5 }) };
    const result = new Function(...Object.keys(deps), subtotal + net + "return {subtotal:purchaseSubtotal.value,net:netPrice.value};")(...Object.values(deps));
    expect(result).toEqual({ subtotal: 1299, net: 1274 });
  });
  it("does not quote a voucher that the trial conversion command cannot redeem", () => {
    const code = ts.transpileModule(source.slice(source.indexOf("const voucherMatch ="), source.indexOf("const voucherDiscount =")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const bestVoucherFor = vi.fn().mockReturnValue({ discountUSD: 50 });
    const quote = new Function("computed", "remoteApiEnabled", "trialConversionMode", "voucher", code + "return voucherMatch.value;");
    expect(quote(computed, true, ref(true), { bestVoucherFor })).toBeNull();
    expect(bestVoucherFor).not.toHaveBeenCalled();
  });
  const quoteCode = ts.transpileModule(source.slice(source.indexOf("function trialQuoteAt(now:"), source.indexOf("const trialView =")),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  function quoteHarness(remoteApiEnabled: boolean) {
    const day = 86_400_000;
    const cfg = { ...DEFAULT_TRIAL_CONFIG, trialProductId: "stellarbox-s1", shadowDailyUSD: 38.52, shadowDailyNEX: 30, trialOffsetCapUSD: 100 };
    const row: TrialRowSnapshot = { status: "active", startedAt: 1, expiresAt: 3 * day + 1, graceEndsAt: 4 * day + 1,
      finishedAt: null, shadowFrozenAtUSD: 12.84, shadowFrozenAtNEX: 10, legacyCardMigrated: false };
    const freeTrial = { snapshot: () => row, authoritativeShadowUSD: 12.84, authoritativeShadowNEX: 10,
      authoritativeOffsetUSD: 12.84, authoritativeRemainderUSD: 0 };
    const deps = { remoteApiEnabled, freeTrial, trialCfg: ref(cfg), productId: ref("stellarbox-s1"), resolveTrialAt, accruedShadow,
      computeTrialOffset, computeDiscountedPrice, resolveTrialCheckoutProductId,
      NO_TRIAL: { applied: false, promo: 0, offsetUSD: 0, remainderUSD: 0, shadowNEX: 0 } };
    const quote = new Function(...Object.keys(deps), quoteCode + "\nreturn trialQuoteAt;")(...Object.values(deps));
    return { quote, day, freeTrial, cfg, row };
  }
  it("uses the server amount shown on the trial page, never client time accrual", () => {
    const h = quoteHarness(true);
    expect(h.quote(h.day + 1)).toMatchObject({ applied: true, offsetUSD: 12.84, shadowNEX: 10 });
    h.freeTrial.authoritativeShadowUSD = 4.25;
    h.freeTrial.authoritativeOffsetUSD = 4.25;
    h.freeTrial.authoritativeShadowNEX = 3;
    expect(h.quote(2 * h.day + 1)).toMatchObject({ offsetUSD: computeTrialOffset(h.cfg, 4.25).offsetUSD, shadowNEX: 3 });
    h.row.status = "grace";
    expect(h.quote(3 * h.day + 2)).toMatchObject({ offsetUSD: 4.25, shadowNEX: 3 });
    expect(h.quote(5 * h.day)).toMatchObject({ applied: false, offsetUSD: 0 });
  });
  it("uses the claim split when current cap changes, including its purchase remainder", () => {
    const h = quoteHarness(true);
    h.cfg.trialOffsetCapUSD = 1;
    h.freeTrial.authoritativeOffsetUSD = 5;
    h.freeTrial.authoritativeRemainderUSD = 7.84;
    expect(h.quote(h.day + 1)).toMatchObject({ offsetUSD: 5, remainderUSD: 7.84 });
  });
  it("keeps local-only accrual and the frozen grace boundary", () => {
    const h = quoteHarness(false);
    expect(h.quote(h.day + 1)).toMatchObject({ applied: true, offsetUSD: 38.52, shadowNEX: 30 });
    h.row.status = "grace";
    expect(h.quote(3 * h.day + 2)).toMatchObject({ offsetUSD: 12.84, shadowNEX: 10 });
  });
});

const handler = ts.transpileModule(source.slice(source.indexOf("async function onConfirmPay()"),
  source.indexOf("/** 恢复一张仍在窗内的发票")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const topup = ts.transpileModule(source.slice(source.indexOf("async function offerWalletTopup("),
  source.indexOf("async function submitRemoteOrder()")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  let current = true;
  const scope = { accountKey: "fixture-a", accountEpoch: 1, productNo: "stellarbox-s1", generation: 1 };
  const deps = {
    trialQuoteUnavailable: ref(false),
    ref, voucherSelecting:ref(false), remoteApiEnabled: true, checkoutWalletRefreshing: ref(false), step: ref("confirm"),
    captureCheckoutRoute: () => scope, isCurrentCheckoutRoute: () => current,
    resumeServerOrder: vi.fn().mockResolvedValue(false), product: ref({ id: scope.productNo }),
    trialView: ref({ applied: true }), trialQuoteAt: vi.fn().mockReturnValue({ applied: true }), mockServerNow: () => 0,
    netPrice: ref(1247.73), cardFee: ref(0), voucherMatch: ref(null), voucherDiscount: ref(0), appliedTradeinView: ref(null),
    freeTrial: { convert: vi.fn(), hasPendingConversion: vi.fn().mockReturnValue(false) },
    app: { user: { usdtBalance: 0.10 }, debitBalance: vi.fn(), creditBalance: vi.fn() },
    t: ref(en), toast: { warn: vi.fn(), error: vi.fn() }, orderId: ref(null), navReplace: vi.fn(), navTo: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true), dialogOwner: "fixture-dialog", fmt: (copy: string) => copy,
    submitRemoteOrder: vi.fn(),
  };
  const pay = new Function("formatAmount", ...Object.keys(deps),
    `let confirming = false, trialQuote, quotedTotal, voucherQuote, quotedTradeIn, dialogsOpen = 0;\n${topup}\n${handler}\nreturn onConfirmPay;`,
  )(formatAmount, ...Object.values(deps));
  return { ...deps, pay, stale: () => { current = false; } };
}

describe("real trial checkout refusal and recovery feedback", () => {
  it("requires another quote review if the amount changes during order recovery", async () => {
    const h = harness(); let resolve!: (result: boolean) => void;
    h.resumeServerOrder.mockReturnValue(new Promise(r => { resolve = r; }));
    const pending = h.pay(); h.netPrice.value += 1; resolve(false); await pending;
    expect(h.freeTrial.convert).not.toHaveBeenCalled(); expect(h.submitRemoteOrder).not.toHaveBeenCalled();
    expect(h.toast.warn).toHaveBeenCalledWith(en.store.coTotalQuoteChanged);
    expect(h.step.value).toBe("select-payment");
  });
  it("offers the normal balance warning/recharge route and preserves the confirmation step", async () => {
    const h = harness(); h.freeTrial.convert.mockResolvedValue({ ok: false, reason: "insufficient-funds" });
    await h.pay();
    expect(h.freeTrial.convert).toHaveBeenCalledOnce();
    expect(h.freeTrial.convert).toHaveBeenCalledWith("stellarbox-s1", 1247.73);
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: en.errors.insufficientBalanceTitle,
      message: en.errors.insufficientBalanceMsg, confirmLabel: en.me.topup }));
    expect(h.navTo).toHaveBeenCalledWith("/pages/me/wallet-topup");
    expect(h.toast.warn).not.toHaveBeenCalled(); expect(h.step.value).toBe("confirm");
    expect(h.submitRemoteOrder).not.toHaveBeenCalled();
    expect(h.app.user.usdtBalance).toBe(0.10); expect(h.app.debitBalance).not.toHaveBeenCalled();
    expect(h.app.creditBalance).not.toHaveBeenCalled();
  });
  it("can decline top-up without navigating or resetting the quote", async () => {
    const h = harness(); h.freeTrial.convert.mockResolvedValue({ ok: false, reason: "insufficient-funds" });
    h.confirm.mockResolvedValue(false); await h.pay();
    expect(h.navTo).not.toHaveBeenCalled(); expect(h.step.value).toBe("confirm");
  });
  it("describes an unknown result as original-order recovery, keeping the retry on the original conversion", async () => {
    const h = harness(); h.freeTrial.convert.mockResolvedValue({ ok: false, reason: "unknown" });
    await h.pay(); expect(h.toast.warn).toHaveBeenCalledWith(en.store.coRecoverOriginalOrder);
    expect(h.toast.warn).not.toHaveBeenCalledWith(en.store.coTrialQuoteChanged); expect(h.step.value).toBe("confirm");
    // State readback may already be terminal. The pending intent still routes
    // through conversion replay rather than creating an ordinary second order.
    h.trialView.value.applied = false; h.trialQuoteAt.mockReturnValue({ applied: false });
    h.freeTrial.hasPendingConversion.mockReturnValue(true);
    h.freeTrial.convert.mockResolvedValue({ ok: true, orderNo: "ORIGINAL-ORDER" });
    await h.pay(); expect(h.submitRemoteOrder).not.toHaveBeenCalled();
    expect(h.navReplace).toHaveBeenCalledWith({ url: "/pages/store/order-detail?id=ORIGINAL-ORDER" });
  });
  it("reserves the pricing message for an actual quote refusal", async () => {
    const h = harness(); h.freeTrial.convert.mockResolvedValue({ ok: false, reason: "quote-changed" });
    await h.pay(); expect(h.toast.warn).toHaveBeenCalledWith(en.store.coTrialQuoteChanged);
    expect(h.step.value).toBe("select-payment"); expect(h.confirm).not.toHaveBeenCalled();
  });
  it("keeps repeated terminal recovery refusals out of ordinary checkout while the original receipt is missing", async () => {
    const h = harness(); h.trialView.value.applied = false; h.trialQuoteAt.mockReturnValue({ applied: false });
    h.freeTrial.hasPendingConversion.mockReturnValue(true);
    // The store keeps NOT_CONVERTIBLE on a restored unknown intent as unknown,
    // even when the original receipt expired and cannot currently be recovered.
    h.freeTrial.convert.mockResolvedValue({ ok: false, reason: "unknown" });
    for (let retry = 0; retry < 2; retry++) {
      await h.pay(); expect(h.step.value).toBe("confirm");
      expect(h.toast.warn).toHaveBeenLastCalledWith(en.store.coRecoverOriginalOrder);
      expect(h.submitRemoteOrder).not.toHaveBeenCalled(); expect(h.navReplace).not.toHaveBeenCalled();
    }
    expect(h.freeTrial.convert).toHaveBeenCalledTimes(2); expect(h.confirm).not.toHaveBeenCalled();
  });
  it.each(["insufficient-funds", "unknown", "quote-changed", "success"])("ignores late %s after account/route departure", async (reason) => {
    const h = harness(); let resolve!: (result: unknown) => void;
    h.freeTrial.convert.mockReturnValue(new Promise((r) => { resolve = r; }));
    const pay = h.pay(); await Promise.resolve(); h.stale();
    resolve(reason === "success" ? { ok: true, orderNo: "ORIGINAL-ORDER" } : { ok: false, reason }); await pay;
    expect(h.toast.warn).not.toHaveBeenCalled(); expect(h.confirm).not.toHaveBeenCalled();
    expect(h.navTo).not.toHaveBeenCalled(); expect(h.navReplace).not.toHaveBeenCalled(); expect(h.step.value).toBe("confirm");
  });
  it("does not navigate after a late acceptance of the recharge dialog", async () => {
    const h = harness(); let resolve!: (accepted: boolean) => void;
    h.freeTrial.convert.mockResolvedValue({ ok: false, reason: "insufficient-funds" });
    h.confirm.mockReturnValue(new Promise((r) => { resolve = r; }));
    const pay = h.pay(); await vi.waitFor(() => expect(h.confirm).toHaveBeenCalledOnce());
    h.stale(); resolve(true); await pay; expect(h.navTo).not.toHaveBeenCalled();
  });
  it("guards repeated pay clicks while the original conversion is in flight", async () => {
    const h = harness(); let resolve!: (result: unknown) => void;
    h.freeTrial.convert.mockReturnValue(new Promise((r) => { resolve = r; }));
    const pay = h.pay(); await Promise.resolve(); await h.pay();
    expect(h.freeTrial.convert).toHaveBeenCalledOnce();
    resolve({ ok: false, reason: "insufficient-funds" }); await pay;
  });
});
