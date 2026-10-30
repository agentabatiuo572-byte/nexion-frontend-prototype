import { computed, reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { RemoteCapacityGate, handleNoActiveDeviceDecision, type CapacityDecision } from "@/domain/e20-capacity-coordinator";
import { resolveTradeinCheckoutPreflight } from "@/domain/tradein-checkout-preflight";
import { CheckoutRouteFence } from "@/lib/checkout-route-fence";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const ast = ts.createSourceFile("checkout.ts", script, ts.ScriptTarget.Latest, true);
const functions = new Set(["fireTradeinIntercept", "retryCheckoutCapacity", "goConfirm", "reAddTradein", "onConfirmPay"]);
const variables = new Set(["targetOccupiesPhysicalSlot", "checkoutCapacityRequired", "checkoutCapacityMessage", "slotsFullText"]);
const selected = ast.statements.filter(node =>
  ts.isFunctionDeclaration(node) ? functions.has(node.name?.text ?? "")
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => variables.has(d.name.getText(ast))),
).map(node => node.getText(ast)).join("\n");
const code = ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const quote = (decision: CapacityDecision = "CAPACITY_AVAILABLE") => ({ decision, payableUsdt: 1299 });

function checkout(messages = zh) {
  const identity = { accountKey: "fixture-a", accountEpoch: 1, productNo: "stellarbox-s1" };
  const fence = new CheckoutRouteFence();
  fence.begin(identity);
  const remoteCapacityGate = reactive(new RemoteCapacityGate());
  const deps = {
    computed, fmt, remoteCapacityGate, remoteApiEnabled: true,
    captureCheckoutRoute: () => fence.capture(identity),
    isCurrentCheckoutRoute: (scope: ReturnType<typeof fence.capture>) => fence.isCurrent(scope, identity),
    t: ref(messages), app: { slotCap: 6, refreshRemoteFleet: vi.fn().mockResolvedValue(true) },
    product: ref({ id: identity.productNo, price: 1299, productType: "BOX" }),
    productId: ref(identity.productNo), getProduct: () => deps.product.value,
    KNOWN_KINDS: [identity.productNo], trialConversionMode: ref(false),
    trialQuoteUnavailable: ref(false), purchaseUnavailable: ref(false),
    step: ref("select-payment"), appliedTradeinView: ref<null | { canonicalQuote: object }>(null),
    trialQuoteScreenUnavailable: ref(false), voucherSelecting: ref(false), checkoutWalletRefreshing: ref(false),
    netPrice: ref(1299), cardFee: ref(0), trialView: ref({ applied: false, quoteVersion: null }),
    freeTrial: { refreshRemote: vi.fn().mockResolvedValue(true), hasPendingConversion: vi.fn().mockReturnValue(false),
      convert: vi.fn().mockResolvedValue({ ok: false, reason: "unknown" }) },
    trialQuoteAt: () => ({ applied: false, quoteVersion: null }), mockServerNow: () => 0,
    voucherMatch: ref(null), voucherDiscount: ref(0),
    resumeServerOrder: vi.fn().mockResolvedValue(false), submitRemoteOrder: vi.fn(),
    remoteTradeinRecoveryRequired: ref(false), reAddingTradein: ref(false), removedTradein: ref(false),
    tradeinAvailable: ref(false),
    tradein: { appliedTradein: null, showChoice: vi.fn(), showCanonicalReplace: vi.fn() },
    toast: { warn: vi.fn() }, navTo: vi.fn(),
    deviceE3Api: { capacityQuote: vi.fn().mockResolvedValue(quote()),
      eligibility: vi.fn().mockResolvedValue({ eligible: false, sources: [] }) },
    resolveTradeinCheckoutPreflight, handleNoActiveDeviceDecision,
  };
  const page = new Function(...Object.keys(deps), `let interceptFired = false, confirming = false, trialQuote, quotedTotal, voucherQuote, quotedTradeIn; ${code};
    return {goConfirm, retryCheckoutCapacity, fireTradeinIntercept, reAddTradein, onConfirmPay, checkoutCapacityRequired, checkoutCapacityMessage};`)(...Object.values(deps));
  return { ...deps, page, leaveOrSwitchAccount() { fence.invalidate(); remoteCapacityGate.reset(); } };
}

describe("actual checkout capacity refusal and recovery", () => {
  it.each([zh, en, vietnamese])("explains confirmed full slots and never advances ordinary payment", async messages => {
    const h = checkout(messages);
    h.deviceE3Api.capacityQuote.mockResolvedValue(quote("REPLACE_REQUIRED"));
    await h.page.fireTradeinIntercept();
    h.page.goConfirm();
    expect(h.step.value).toBe("select-payment");
    expect(h.toast.warn).toHaveBeenCalledExactlyOnceWith(fmt(messages.store.coSlotsFull, { max: 6 }));
    expect(h.tradein.showChoice).not.toHaveBeenCalled();
    expect(h.tradein.showCanonicalReplace).not.toHaveBeenCalled();
    expect(h.deviceE3Api.capacityQuote).toHaveBeenCalledOnce();
  });

  it("keeps initial and pending reads closed, explains checking, and coalesces retry clicks", async () => {
    const h = checkout(); const read = deferred<ReturnType<typeof quote>>();
    expect(h.remoteCapacityGate.canConfirm(false)).toBe(false);
    h.deviceE3Api.capacityQuote.mockReturnValue(read.promise);
    const retry = h.page.retryCheckoutCapacity();
    h.page.goConfirm(); await h.page.retryCheckoutCapacity();
    expect(h.toast.warn).toHaveBeenCalledExactlyOnceWith(zh.store.coCapacityChecking);
    expect(h.step.value).toBe("select-payment");
    expect(h.deviceE3Api.capacityQuote).toHaveBeenCalledOnce();
    read.resolve(quote()); await retry;
    h.page.goConfirm(); expect(h.step.value).toBe("confirm");
  });

  it("retries an actual failed read and proceeds only on a fresh available result", async () => {
    const h = checkout();
    h.deviceE3Api.capacityQuote.mockRejectedValueOnce(new Error("offline"));
    await h.page.fireTradeinIntercept();
    expect(h.remoteCapacityGate.canConfirm(false)).toBe(false);
    expect(h.page.checkoutCapacityMessage.value).toBe(zh.store.coCapacityUnavailable);
    expect(h.toast.warn).toHaveBeenCalledExactlyOnceWith(zh.store.coCapacityUnavailable);
    await h.page.retryCheckoutCapacity();
    expect(h.deviceE3Api.capacityQuote).toHaveBeenCalledTimes(2);
    h.page.goConfirm(); expect(h.step.value).toBe("confirm");
  });

  it("rechecks capacity after the user frees a slot without requiring a new checkout", async () => {
    const h = checkout(); h.deviceE3Api.capacityQuote.mockResolvedValueOnce(quote("REPLACE_REQUIRED"));
    await h.page.fireTradeinIntercept();
    await h.page.retryCheckoutCapacity(); h.page.goConfirm();
    expect(h.step.value).toBe("confirm");
    expect(h.tradein.showCanonicalReplace).not.toHaveBeenCalled();
  });

  it("does not overlap replacement with retry while optional eligibility is still pending", async () => {
    const h = checkout(); const eligibility = deferred<{ eligible: boolean; sources: [] }>();
    h.deviceE3Api.eligibility.mockReturnValue(eligibility.promise);
    const first = h.page.retryCheckoutCapacity();
    await Promise.resolve();
    await h.page.reAddTradein(); await h.page.retryCheckoutCapacity();
    expect(h.remoteCapacityGate.pending).toBe(true);
    expect(h.deviceE3Api.capacityQuote).toHaveBeenCalledOnce();
    expect(h.deviceE3Api.eligibility).toHaveBeenCalledOnce();
    eligibility.resolve({ eligible: false, sources: [] }); await first;
    expect(h.remoteCapacityGate.canConfirm(false)).toBe(true);
  });

  it("keeps a retained confirmation from starting a fresh order after a hide/account reset", async () => {
    const h = checkout(); await h.page.fireTradeinIntercept();
    h.page.goConfirm(); expect(h.step.value).toBe("confirm");
    h.leaveOrSwitchAccount();
    const fresh = deferred<ReturnType<typeof quote>>(); h.deviceE3Api.capacityQuote.mockReturnValue(fresh.promise);
    await h.page.onConfirmPay();
    expect(h.submitRemoteOrder).not.toHaveBeenCalled();
    expect(h.step.value).toBe("select-payment");
    expect(h.toast.warn).toHaveBeenCalledWith(zh.store.coCapacityUnavailable);
    fresh.resolve(quote("REPLACE_REQUIRED"));
    await vi.waitFor(() => expect(h.remoteCapacityGate.pending).toBe(false));
    h.page.goConfirm(); expect(h.step.value).toBe("select-payment");
  });

  it("recovers an original order before applying a new-purchase capacity refusal", async () => {
    const h = checkout(); h.step.value = "confirm";
    h.resumeServerOrder.mockResolvedValue(true);
    await h.page.onConfirmPay();
    expect(h.resumeServerOrder).toHaveBeenCalledOnce();
    expect(h.deviceE3Api.capacityQuote).not.toHaveBeenCalled();
    expect(h.freeTrial.refreshRemote).not.toHaveBeenCalled();
    expect(h.submitRemoteOrder).not.toHaveBeenCalled(); expect(h.toast.warn).not.toHaveBeenCalled();
  });

  it("replays a persisted unknown trial conversion from select-payment even after trial authority becomes terminal and slots are full", async () => {
    const h = checkout(); h.freeTrial.hasPendingConversion.mockReturnValue(true);
    h.deviceE3Api.capacityQuote.mockResolvedValue(quote("REPLACE_REQUIRED"));
    await h.page.fireTradeinIntercept();
    h.page.goConfirm(); expect(h.step.value).toBe("confirm");
    await h.page.onConfirmPay();
    expect(h.freeTrial.convert).toHaveBeenCalledExactlyOnceWith("stellarbox-s1", 1299, null);
    expect(h.submitRemoteOrder).not.toHaveBeenCalled();
    expect(h.toast.warn).toHaveBeenCalledExactlyOnceWith(zh.store.coRecoverOriginalOrder);
  });

  it("keeps no-active-device as a business refusal even when fleet refresh fails", async () => {
    const h = checkout();
    h.deviceE3Api.capacityQuote.mockResolvedValue(quote("NO_ACTIVE_DEVICE"));
    h.app.refreshRemoteFleet.mockRejectedValue(new Error("fleet offline"));
    await h.page.fireTradeinIntercept(); h.toast.warn.mockClear(); h.page.goConfirm();
    expect(h.step.value).toBe("select-payment");
    expect(h.toast.warn).toHaveBeenCalledExactlyOnceWith(zh.tradein.errNoActiveDevice);
  });

  it("does not make optional trade-in eligibility a prerequisite to available capacity", async () => {
    const h = checkout(); h.deviceE3Api.eligibility.mockRejectedValue(new Error("eligibility offline"));
    await h.page.fireTradeinIntercept(); h.page.goConfirm();
    expect(h.step.value).toBe("confirm"); expect(h.toast.warn).not.toHaveBeenCalled();
  });

  it.each(["trial ACTIVE/GRACE conversion", "SHARE"])("preserves the %s physical-slot exemption", async kind => {
    const h = checkout();
    if (kind === "SHARE") h.product.value.productType = "SHARE";
    else h.trialConversionMode.value = true;
    await h.page.fireTradeinIntercept(); h.page.goConfirm();
    expect(h.page.checkoutCapacityRequired.value).toBe(false);
    expect(h.step.value).toBe("confirm");
    expect(h.deviceE3Api.capacityQuote).not.toHaveBeenCalled();
  });

  it("keeps a canonical replacement on its existing path while ordinary purchases stay closed", () => {
    const h = checkout(); h.appliedTradeinView.value = { canonicalQuote: { targetDeviceStatus: "INACTIVE" } };
    h.page.goConfirm(); expect(h.step.value).toBe("confirm");
    expect(h.deviceE3Api.capacityQuote).not.toHaveBeenCalled();
  });

  it.each(["CAPACITY_AVAILABLE", "REPLACE_REQUIRED"] as const)("ignores an old %s response after reset while a current read is pending", async decision => {
    const h = checkout(); const old = deferred<ReturnType<typeof quote>>(), current = deferred<ReturnType<typeof quote>>();
    h.deviceE3Api.capacityQuote.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const first = h.page.fireTradeinIntercept();
    h.leaveOrSwitchAccount();
    const second = h.page.retryCheckoutCapacity();
    old.resolve(quote(decision)); await first;
    expect(h.remoteCapacityGate.pending).toBe(true);
    expect(h.remoteCapacityGate.decision).toBeNull();
    expect(h.tradeinAvailable.value).toBe(false);
    expect(h.toast.warn).not.toHaveBeenCalled();
    current.resolve(quote()); await second; h.page.goConfirm();
    expect(h.step.value).toBe("confirm");
  });
});
