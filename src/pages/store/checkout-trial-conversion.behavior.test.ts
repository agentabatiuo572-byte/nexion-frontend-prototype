import { formatAmount } from "@/lib/amount-display";
import { computed, nextTick, reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { en } from "@/i18n/messages/en";
import { resolveTrialAt, accruedShadow, type TrialRowSnapshot } from "@/store/trial-boundary";
import { DEFAULT_TRIAL_CONFIG, computeDiscountedPrice, computeTrialOffset, resolveTrialCheckoutProductId } from "@/store/trial-config";
import { checkoutReviewAmount,formatCheckoutReviewAmount } from '@/lib/checkout-review-amount';
import { CheckoutPurchaseCheckError } from '@/lib/checkout-purchase-check';

describe("trial credit in the actual checkout quote", () => {
  it("keeps a confirmed checkout visible during revalidation without accepting initial, failed or rebound authority", () => {
    const code = ts.transpileModule(source.slice(source.indexOf("const trialQuoteIncomplete ="), source.indexOf("const trialConversionMode =")),
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const freeTrial = reactive({ authorityStatus:"ready", authorityServerState:"CANCELLED" as string|null,
      status:"ended", authoritativeOffsetUSD:0 as number|null, authoritativeRemainderUSD:0 as number|null, authoritativePriceUSD:1299 });
    const trialEarlyQuoteLapsed = ref(false);
    const gates = new Function("computed", "remoteApiEnabled", "freeTrial", "trialEarlyQuoteLapsed", "hasOriginalCheckout", code + "return {screen:trialQuoteScreenUnavailable,action:trialQuoteUnavailable};")
      (computed,true,freeTrial,trialEarlyQuoteLapsed,ref(false));
    const unavailable=gates.screen;
    expect(unavailable.value).toBe(false);
    freeTrial.authorityStatus="loading"; expect(unavailable.value).toBe(false);
    expect(gates.action.value).toBe(true);
    freeTrial.authorityServerState=null; expect(unavailable.value).toBe(true);
    freeTrial.authorityStatus="error"; expect(unavailable.value).toBe(true);
    freeTrial.authorityStatus="ready"; freeTrial.authorityServerState="ACTIVE"; freeTrial.status="active";
    freeTrial.authoritativeOffsetUSD=null; expect(unavailable.value).toBe(true);
    freeTrial.authoritativeOffsetUSD=0; expect(unavailable.value).toBe(false);
    trialEarlyQuoteLapsed.value=true; expect(unavailable.value).toBe(true);
  });
  it.each([499, 1999])("quotes the claim price rather than changed catalogue price %s", catalogPrice => {
    const subtotal = ts.transpileModule(source.slice(source.indexOf("const purchaseSubtotal ="), source.indexOf("const promoDiscount =")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const net = ts.transpileModule(source.slice(source.indexOf("const netPrice ="), source.indexOf("// 异常4: credit")), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const deps = { computed, createdCheckoutOrder:ref(null),pendingCheckoutCreate:ref(null),remoteApiEnabled: true, trialConversionMode: ref(true), freeTrial: { authoritativePriceUSD: 1299 }, product: ref({ price: catalogPrice }), appliedTradeinView: ref(null), voucherDiscount: ref(0), tradeinCredit: ref(0), promoDiscount: ref(20), trialOffsetView: ref({ offsetUSD: 5, earlyDiscountUSD: 0 }) };
    const result = new Function(...Object.keys(deps), subtotal + net + "return {subtotal:purchaseSubtotal.value,net:netPrice.value};")(...Object.values(deps));
    expect(result).toEqual({ subtotal: 1299, net: 1274 });
    deps.trialOffsetView.value.earlyDiscountUSD = 4;
    const early = new Function(...Object.keys(deps), subtotal + net + "return {subtotal:purchaseSubtotal.value,net:netPrice.value};")(...Object.values(deps));
    expect(early).toEqual({ subtotal: 1299, net: 1270 });
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
      NO_TRIAL: { applied: false, promo: 0, offsetUSD: 0, remainderUSD: 0, shadowNEX: 0, earlyDiscountUSD: 0, quoteVersion: null } };
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
    createdCheckoutOrder:ref(null),pendingCheckoutCreate:ref(null),
    trialQuoteUnavailable: ref(false), trialQuoteScreenUnavailable: ref(false),
    ref, voucherSelecting:ref(false), remoteApiEnabled: true, checkoutWalletRefreshing: ref(false), step: ref("confirm"),
    captureCheckoutRoute: () => scope, isCurrentCheckoutRoute: () => current,
    resumeServerOrder: vi.fn().mockResolvedValue(false), product: ref({ id: scope.productNo }),
    trialView: ref({ applied: true, quoteVersion: null as string | null }), trialQuoteAt: vi.fn().mockReturnValue({ applied: true, quoteVersion: null }), mockServerNow: () => 0,
    netPrice: ref(1247.73), cardFee: ref(0), voucherMatch: ref(null), voucherDiscount: ref(0), appliedTradeinView: ref(null),
    freeTrial: { refreshRemote: vi.fn().mockResolvedValue(true), convert: vi.fn(), hasPendingConversion: vi.fn().mockReturnValue(false) },
    app: { user: { usdtBalance: 0.10 }, debitBalance: vi.fn(), creditBalance: vi.fn() },
    t: ref(en), toast: { warn: vi.fn(), error: vi.fn() }, orderId: ref(null), navReplace: vi.fn(), navTo: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true), dialogOwner: "fixture-dialog", fmt: (copy: string) => copy,
    submitRemoteOrder: vi.fn(),
    checkoutCapacityRequired: ref(false),
  };
  const pay = new Function("formatAmount", ...Object.keys(deps),
    `let confirming = false, trialQuote, quotedTotal, voucherQuote, quotedTradeIn, dialogsOpen = 0;\n${topup}\n${handler}\nreturn onConfirmPay;`,
  )(formatAmount, ...Object.values(deps));
  return { ...deps, pay, stale: () => { current = false; } };
}

describe("real trial checkout refusal and recovery feedback", () => {
  it.each(["success","failed","stale"])("keeps the original tap scoped while waiting for a trial poll: %s", async outcome => {
    const code=ts.transpileModule(source.slice(source.indexOf("async function submitReview()"),source.indexOf("function selectPayment(")),
      {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    let finish!: (ready:boolean)=>void,current=true;
    const deps={captureCheckoutRoute:()=>({epoch:1}),isCurrentCheckoutRoute:()=>current,trialQuoteUnavailable:ref(true),
      trialQuoteScreenUnavailable:ref(false),freeTrial:{refreshRemote:vi.fn(()=>new Promise<boolean>(done=>{finish=done;}))},
      quantitySwitching:ref(false),remoteApiEnabled:true,checkoutWalletReadable:ref(true),step:ref("confirm"),
      goConfirm:vi.fn(),nextTick:async()=>{},requestConfirmPay:vi.fn()};
    const tap=new Function(...Object.keys(deps),code+"return submitReview;")(...Object.values(deps));
    const pending=tap(); deps.trialQuoteUnavailable.value=false; current=outcome!=="stale";
    finish(outcome!=="failed"); await pending;
    expect(deps.requestConfirmPay).toHaveBeenCalledTimes(outcome==="success"?1:0);
  });
  it("does not open a new confirmation when identity changes during the review render tick", async () => {
    const code=ts.transpileModule(source.slice(source.indexOf("async function submitReview()"),source.indexOf("function selectPayment(")),
      {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    let current=true; const step=ref("select-payment");
    const deps={createdCheckoutOrder:ref(null),pendingCheckoutCreate:ref(null),checkoutCapacityRequired:ref(false),captureCheckoutRoute:()=>({epoch:1}),isCurrentCheckoutRoute:()=>current,trialQuoteUnavailable:ref(false),
      trialQuoteScreenUnavailable:ref(false),freeTrial:{refreshRemote:vi.fn()},quantitySwitching:ref(false),remoteApiEnabled:true,
      checkoutWalletReadable:ref(true),step,goConfirm:()=>{step.value="confirm";},nextTick:async()=>{current=false;},requestConfirmPay:vi.fn()};
    const tap=new Function(...Object.keys(deps),code+"return submitReview;")(...Object.values(deps));
    await tap(); expect(deps.requestConfirmPay).not.toHaveBeenCalled();
  });
  it.each(["mode","version","poll"])("checks the trial state when the confirmation dialog outlives its %s", async change => {
    const code=ts.transpileModule(source.slice(source.indexOf("let purchaseConfirmationOpen = false;"),source.indexOf("async function onConfirmPay()")),
      { compilerOptions:{target:ts.ScriptTarget.ES2022} }).outputText;
    const trialView=ref({applied:false,quoteVersion:null as string|null});
    const deps={ref,computed,nextTick,checkoutReviewAmount,formatCheckoutReviewAmount,CheckoutPurchaseCheckError,paymentStockFailure:ref(null),flowCopy:ref({queryFailed:'retry'}),createdCheckoutOrder:ref(null),pendingCheckoutCreate:ref(null),trialView,trialQuoteUnavailable:ref(false),trialQuoteScreenUnavailable:ref(false),voucherSelecting:ref(false),checkoutWalletRefreshing:ref(false),
      step:ref("confirm"),captureCheckoutRoute:()=>({}),isCurrentCheckoutRoute:()=>true,netPrice:ref(100),cardFee:ref(0),
      trialConversionMode:computed(()=>trialView.value.applied),freeTrial:{hasPendingConversion:()=>false},
      product:ref({name:"Device"}),t:ref(en),purchaseCopy:ref({}),confirmTotalText:ref("100.00"),trialCreditText:ref(""),
      dialogOwner:"trial-review",fmt:(text:string)=>text,
      onConfirmPay:vi.fn(),toast:{warn:vi.fn()}};
    const flow=new Function(...Object.keys(deps),"let confirming=false,dialogsOpen=0;"+code+"return {requestConfirmPay,confirmPaymentSheet};")(...Object.values(deps));
    const pending=flow.requestConfirmPay();
    if(change==="mode")trialView.value.applied=true;
    else if(change==="version")trialView.value.quoteVersion="NEW";
    else deps.trialQuoteUnavailable.value=true;
    flow.confirmPaymentSheet(); await pending;
    if(change==="poll") { expect(deps.onConfirmPay).toHaveBeenCalledOnce(); return; }
    expect(deps.onConfirmPay).not.toHaveBeenCalled(); expect(deps.toast.warn).toHaveBeenCalledWith(en.store.coTotalQuoteChanged);
    expect(deps.step.value).toBe("select-payment");
  });
  it("waits for current trial authority before an ordinary or trade-in payment and refuses failed reads", async () => {
    const h = harness(); h.trialView.value.applied=false;
    let resolve!: (ready:boolean) => void;
    h.freeTrial.refreshRemote.mockReturnValue(new Promise<boolean>(done => { resolve=done; }));
    const pending=h.pay(); await vi.waitFor(() => expect(h.freeTrial.refreshRemote).toHaveBeenCalledOnce());
    expect(h.submitRemoteOrder).not.toHaveBeenCalled(); expect(h.freeTrial.convert).not.toHaveBeenCalled();
    resolve(false); await pending; expect(h.submitRemoteOrder).not.toHaveBeenCalled();
    h.freeTrial.refreshRemote.mockResolvedValue(true); await h.pay();
    expect(h.submitRemoteOrder).toHaveBeenCalledOnce(); expect(h.freeTrial.convert).not.toHaveBeenCalled();
  });
  it("reaches the fresh payment read when another poll starts while the confirmation is open", async () => {
    const h=harness(); h.trialView.value.applied=false; h.trialQuoteUnavailable.value=true;
    h.freeTrial.refreshRemote.mockImplementation(async()=>{h.trialQuoteUnavailable.value=false;return true;});
    await h.pay(); expect(h.freeTrial.refreshRemote).toHaveBeenCalledOnce(); expect(h.submitRemoteOrder).toHaveBeenCalledOnce();
  });
  it("rejects stale identities and changed trial transaction modes after the fresh read", async () => {
    const h=harness(); h.trialView.value.applied=false;
    h.freeTrial.refreshRemote.mockImplementation(async () => { h.trialView.value.applied=true; return true; });
    await h.pay(); expect(h.submitRemoteOrder).not.toHaveBeenCalled(); expect(h.freeTrial.convert).not.toHaveBeenCalled();
    expect(h.toast.warn).toHaveBeenCalledWith(en.store.coTotalQuoteChanged);
    const stale=harness(); stale.trialView.value.applied=false;
    stale.freeTrial.refreshRemote.mockImplementation(async () => { stale.stale(); return true; });
    await stale.pay(); expect(stale.submitRemoteOrder).not.toHaveBeenCalled(); expect(stale.freeTrial.convert).not.toHaveBeenCalled();
    const version=harness(); version.trialView.value.quoteVersion="REVIEWED";
    version.freeTrial.refreshRemote.mockImplementation(async () => { version.trialView.value.quoteVersion="NEW"; return true; });
    await version.pay(); expect(version.freeTrial.convert).not.toHaveBeenCalled();
    expect(version.toast.warn).toHaveBeenCalledWith(en.store.coTotalQuoteChanged);
  });
  it("echoes the current server quote version without changing its reviewed amount", async () => {
    const h = harness(); h.trialView.value.quoteVersion = "SERVER-QUOTE-05";
    h.trialQuoteAt.mockReturnValue({ applied: true, quoteVersion: "SERVER-QUOTE-05" });
    h.freeTrial.convert.mockResolvedValue({ ok: false, reason: "insufficient-funds" });
    await h.pay();
    expect(h.freeTrial.convert).toHaveBeenCalledExactlyOnceWith("stellarbox-s1", 1247.73, "SERVER-QUOTE-05");
    expect(h.app.debitBalance).not.toHaveBeenCalled(); expect(h.app.creditBalance).not.toHaveBeenCalled();
    expect(h.submitRemoteOrder).not.toHaveBeenCalled();
  });
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
    expect(h.freeTrial.convert).toHaveBeenCalledWith("stellarbox-s1", 1247.73, null);
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
    h.trialView.value.applied = false; h.trialQuoteAt.mockReturnValue({ applied: false, quoteVersion: null });
    h.freeTrial.hasPendingConversion.mockReturnValue(true);
    h.freeTrial.convert.mockResolvedValue({ ok: true, orderNo: "ORIGINAL-ORDER" });
    await h.pay(); expect(h.submitRemoteOrder).not.toHaveBeenCalled();
    expect(h.navReplace).toHaveBeenCalledWith({ url: "/pages/store/order-detail?id=ORIGINAL-ORDER&result=trial" });
  });
  it("reserves the pricing message for an actual quote refusal", async () => {
    const h = harness(); h.freeTrial.convert.mockResolvedValue({ ok: false, reason: "quote-changed" });
    await h.pay(); expect(h.toast.warn).toHaveBeenCalledWith(en.store.coTrialQuoteChanged);
    expect(h.step.value).toBe("select-payment"); expect(h.confirm).not.toHaveBeenCalled();
  });
  it("keeps repeated terminal recovery refusals out of ordinary checkout while the original receipt is missing", async () => {
    const h = harness(); h.trialView.value.applied = false; h.trialQuoteAt.mockReturnValue({ applied: false, quoteVersion: null });
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
