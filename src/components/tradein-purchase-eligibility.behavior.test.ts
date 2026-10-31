import { effectScope, computed, reactive, ref, watch } from "vue";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./tradein-sheets.vue?raw";
import { createPurchaseEligibilityApi, type PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";
import { resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import { zh } from "@/i18n/messages/zh";
import { rackPurchaseEligibility } from "./store/purchase-eligibility.fixture";

const script = parse(source).descriptor.scriptSetup!.content;
const ast = ts.createSourceFile("tradein.ts", script, ts.ScriptTarget.Latest, true);
const block = script.slice(script.indexOf("const purchaseSnapshot ="), script.indexOf("let remoteRetireRequest ="));
const functions = ast.statements.filter(ts.isFunctionDeclaration)
  .filter(node => ["hide", "onConfirmTradein"].includes(node.name?.text ?? ""))
  .map(node => node.getText(ast)).join("\n");
const code = ts.transpileModule(block + functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function allowed(): PurchaseEligibilitySnapshot {
  return { ...rackPurchaseEligibility, eligible: true, decisionCode: "ELIGIBLE", policies: [
    rackPurchaseEligibility.policies[0], { ...rackPurchaseEligibility.policies[1], eligible: true, decisionCode: "ELIGIBLE", mode: "EITHER" },
  ] };
}
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(stop => stop()); vi.useRealTimers(); });
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function page(recovery: unknown = null) {
  const state = ref<Record<string, any>>({ kind: "none" });
  const props = reactive({ active: true });
  const app = reactive({ accountKey: "user:a", accountBindingEpoch: 1,
    devices: [{ id: "1204", rowVersion: 3, kind: "stellarbox-pro-v2", name: "Pro v2" }] });
  const quote = { sourceDeviceId: 1204, sourceRowVersion: 3, targetProductNo: "stellarrack-p1", targetDeviceStatus: "ACTIVE",
    payableUsdt: 3250.4375, discountUsdt: 1248.5625 };
  const canonicalQuote = ref(quote);
  const request = vi.fn().mockResolvedValue(rackPurchaseEligibility);
  const readCheckoutTradein = vi.fn(() => recovery);
  const purchaseEligibilityApi = createPurchaseEligibilityApi({ request } as any, "dev");
  const sheet = { hide: () => { state.value = { kind: "none" }; },
    showTradein: (oldDeviceId = "1204", newKind = "stellarrack-p1", newPrice = 4499) => { state.value = { kind: "tradein", oldDeviceId, newKind, newPrice }; },
    applyTradein: vi.fn(), showRetireBlock: vi.fn() };
  const captureAccountScope = () => ({ accountKey: app.accountKey, epoch: app.accountBindingEpoch });
  const deps = { computed, ref, watch, props, state, app, canonicalQuote, sheet, remoteApiEnabled: true,
    apiRuntimeConfig: reactive({ environment: "dev", baseUrl: "https://test.invalid" }),
    canonicalQuoteOrigin: ref({ environment: "dev", baseUrl: "https://test.invalid" }),
    purchaseEligibilityApi, readCheckoutTradein, resolvePurchaseEligibilityMessage, t: ref(zh), confirming: ref(false),
    tradeinView: ref({ ctaText: "Confirm · checkout" }), quoteRequestGeneration: ref(0), quoteLoading: ref(false),
    captureAccountScope, isCurrentAccountScope: (scope: ReturnType<typeof captureAccountScope>) =>
      scope.accountKey === app.accountKey && scope.epoch === app.accountBindingEpoch,
    navTo: vi.fn().mockResolvedValue(true), getCurrentPages: () => [], toast: { warn: vi.fn() },
    isDeviceTaskBlocked: () => false, onUnmounted: (fn: () => void) => cleanup.push(fn) };
  const scope = effectScope();
  const actual = scope.run(() => new Function(...Object.keys(deps), code +
    "return {purchaseStatus,purchaseSnapshot,purchaseRecovery,purchaseBlocked,purchaseConfirmed,purchaseActionText,purchaseActionDisabled,refreshTradeinPurchaseEligibility,onConfirmTradein,hide,restoreTradeinAfterConditions};")(...Object.values(deps)));
  cleanup.push(() => scope.stop());
  sheet.showTradein();
  return { ...deps, actual, request };
}

describe("actual trade-in confirmation purchase authorization", () => {
  it("loads the exact SKU, offers conditions for the real Rack denial, and returns with a fresh read", async () => {
    const p = page(); await settle();
    expect(p.request.mock.calls[0][0].path).toContain("productNo=stellarrack-p1");
    expect(p.actual.purchaseActionText.value).toBe(zh.tradein.purchaseViewConditions);
    expect(p.actual.purchaseBlocked.value).toBe(true);
    await p.actual.onConfirmTradein();
    expect(p.navTo).toHaveBeenCalledExactlyOnceWith("/pages/team/quota?product=stellarrack-p1&intent=tradein-conditions");
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
    const returning = deferred<PurchaseEligibilitySnapshot>(); p.request.mockReturnValueOnce(returning.promise);
    p.props.active = false; p.props.active = true;
    expect(p.actual.purchaseStatus.value).toBe('loading'); expect(p.actual.purchaseConfirmed.value).toBe(false);
    returning.resolve(rackPurchaseEligibility); await settle();
    expect(p.state.value.kind).toBe("tradein");
    expect(p.request).toHaveBeenCalledTimes(2);
  });
  it("rechecks a ready grant at the click and keeps the sheet when authorization changes", async () => {
    const p = page(); await settle();
    p.request.mockResolvedValueOnce(allowed()); await p.actual.refreshTradeinPurchaseEligibility();
    expect(p.actual.purchaseActionText.value).toBe("Confirm · checkout");
    expect(p.actual.purchaseBlocked.value).toBe(false);
    await p.actual.onConfirmTradein();
    expect(p.request).toHaveBeenCalledTimes(3);
    expect(p.sheet.applyTradein).not.toHaveBeenCalled(); expect(p.navTo).not.toHaveBeenCalled();
    expect(p.actual.purchaseActionText.value).toBe(zh.tradein.purchaseViewConditions);
  });
  it("revokes full-confirmation presentation immediately during a fresh click read", async () => {
    const p = page(); await settle();
    p.request.mockResolvedValueOnce(allowed()); await p.actual.refreshTradeinPurchaseEligibility();
    expect(p.actual.purchaseConfirmed.value).toBe(true);
    const delayed = deferred<PurchaseEligibilitySnapshot>(); p.request.mockReturnValueOnce(delayed.promise);
    const click = p.actual.onConfirmTradein();
    expect(p.actual.purchaseStatus.value).toBe('loading'); expect(p.actual.purchaseSnapshot.value).toBeNull();
    expect(p.actual.purchaseConfirmed.value).toBe(false);
    delayed.resolve(rackPurchaseEligibility); await click;
    expect(p.actual.purchaseBlocked.value).toBe(true); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });
  it("only passes the original quote after a second canonical grant", async () => {
    vi.useFakeTimers(); const p = page(); await settle();
    p.request.mockResolvedValue(allowed()); await p.actual.refreshTradeinPurchaseEligibility();
    await p.actual.onConfirmTradein();
    expect(p.sheet.applyTradein).toHaveBeenCalledExactlyOnceWith("1204", "stellarrack-p1", p.canonicalQuote.value);
    await vi.advanceTimersByTimeAsync(260);
    expect(p.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/checkout?product=stellarrack-p1");
  });
  it.each(["close", "version", "target", "rebind", "hide"])("ignores the old pending grant after %s", async change => {
    const p = page(); await settle();
    p.request.mockResolvedValueOnce(allowed()); await p.actual.refreshTradeinPurchaseEligibility();
    const delayed = deferred<PurchaseEligibilitySnapshot>(); p.request.mockReturnValueOnce(delayed.promise);
    const click = p.actual.onConfirmTradein();
    if (change === "close") { p.actual.hide(); p.sheet.showTradein(); }
    if (change === "version") p.app.devices[0].rowVersion++;
    if (change === "target") { p.canonicalQuote.value.targetProductNo = "stellarbox-s1"; p.state.value.newKind = "stellarbox-s1"; }
    if (change === "rebind") p.app.accountBindingEpoch++;
    if (change === "hide") p.props.active = false;
    delayed.resolve(allowed()); await click; await settle();
    expect(p.sheet.applyTradein).not.toHaveBeenCalled(); expect(p.navTo).not.toHaveBeenCalled();
  });
  it.each(["rebind", "reopen", "hide"])("cancels the delayed checkout navigation after %s", async change => {
    vi.useFakeTimers(); const p = page(); await settle();
    p.request.mockResolvedValue(allowed()); await p.actual.refreshTradeinPurchaseEligibility(); await p.actual.onConfirmTradein();
    if (change === "rebind") p.app.accountBindingEpoch++;
    if (change === "reopen") { p.sheet.showTradein(); p.actual.hide(); }
    if (change === "hide") p.props.active = false;
    await vi.advanceTimersByTimeAsync(260); expect(p.navTo).not.toHaveBeenCalled();
  });
  it("keeps failure retryable and quota exhaustion disabled without navigating", async () => {
    const p = page(); await settle(); p.request.mockRejectedValueOnce(new Error("network"));
    await p.actual.refreshTradeinPurchaseEligibility();
    expect(p.actual.purchaseActionText.value).toBe(zh.store.purchaseEligibilityRetry);
    const exhausted = { ...rackPurchaseEligibility, decisionCode: "F4B_MONTHLY_QUOTA_EXHAUSTED" };
    p.request.mockResolvedValue(exhausted); await p.actual.onConfirmTradein();
    expect(p.actual.purchaseActionDisabled.value).toBe(true);
    expect(p.actual.purchaseBlocked.value).toBe(true);
    await p.actual.onConfirmTradein(); expect(p.navTo).not.toHaveBeenCalled(); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });
  it("rejects a response naming another SKU", async () => {
    const p = page(); await settle(); p.request.mockResolvedValue({ ...allowed(), productNo: "stellarbox-s1" });
    await p.actual.refreshTradeinPurchaseEligibility();
    expect(p.actual.purchaseStatus.value).toBe("error"); expect(p.sheet.applyTradein).not.toHaveBeenCalled();
  });
  it("does not restore a stale quote after a same-account binding or source version change", async () => {
    const p = page(); await settle(); await p.actual.onConfirmTradein(); p.props.active = false;
    p.app.accountBindingEpoch++; p.props.active = true;
    expect(p.state.value.kind).toBe("none"); expect(p.request).toHaveBeenCalledTimes(1);
  });
  it.each(["known", "unknown"])("prioritizes the stored %s transaction before new qualification, even without the retired source", async result => {
    vi.useFakeTimers();
    const pointer = { commandKey: "original-only-key", orderNo: result === "known" ? "TIO-original" : "",
      tradeinQuote: { sourceDeviceId: 1156, sourceRowVersion: 1, targetProductNo: "stellarrack-p1" } };
    const p = page(pointer); p.app.devices.splice(0); await settle();
    expect(p.actual.purchaseRecovery.value).toBe("pending");
    expect(p.actual.purchaseActionText.value).toBe(zh.tradein.purchaseResume);
    expect(p.request).not.toHaveBeenCalled();
    await p.actual.onConfirmTradein(); await vi.advanceTimersByTimeAsync(260);
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
    expect(p.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/checkout?product=stellarrack-p1");
    expect(pointer.commandKey).toBe("original-only-key"); expect(p.request).not.toHaveBeenCalled();
  });
  it("prioritizes a newly discovered saved transaction while the qualification GET is pending", async () => {
    vi.useFakeTimers(); const p = page(); await settle();
    const delayed = deferred<PurchaseEligibilitySnapshot>(); p.request.mockReturnValueOnce(delayed.promise);
    const read = p.actual.refreshTradeinPurchaseEligibility();
    p.readCheckoutTradein.mockReturnValue({ commandKey: "original-only-key" });
    await p.actual.onConfirmTradein(); await vi.advanceTimersByTimeAsync(260);
    delayed.resolve(allowed()); await read;
    expect(p.sheet.applyTradein).not.toHaveBeenCalled();
    expect(p.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/checkout?product=stellarrack-p1");
  });
  it("does not treat unavailable recovery storage as an empty history", async () => {
    const p = page(); await settle(); p.readCheckoutTradein.mockImplementation(() => { throw new Error("storage"); });
    await p.actual.onConfirmTradein();
    expect(p.actual.purchaseRecovery.value).toBe("error");
    expect(p.sheet.applyTradein).not.toHaveBeenCalled(); expect(p.navTo).not.toHaveBeenCalled();
  });
  it("rebinds the recovery projection even when the source and ordinary quote scope have disappeared", async () => {
    const p = page({ commandKey: "A-only-key" }); p.app.devices.splice(0); await settle();
    expect(p.actual.purchaseRecovery.value).toBe("pending");
    p.readCheckoutTradein.mockImplementation((...args: unknown[]) => args[0] === "user:a" ? { commandKey: "A-only-key" } : null);
    p.app.accountKey = "user:b"; p.app.accountBindingEpoch++;
    expect(p.actual.purchaseRecovery.value).toBe("none");
    p.app.accountKey = "user:a"; p.app.accountBindingEpoch++;
    expect(p.actual.purchaseRecovery.value).toBe("pending");
    p.readCheckoutTradein.mockReturnValue(null); p.state.value.newKind = "stellarbox-s1";
    expect(p.actual.purchaseRecovery.value).toBe("none");
  });
});
