import { computed, ref } from "vue";
import { beforeEach, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { completeVerifiedMutation } from "@/domain/e20-capacity-coordinator";
import { ApiError, asApiError, isSettledRejection } from "@/api/errors";
import { rememberCheckoutOrder, readCheckoutTradein, finishCheckoutTradein, recoverCheckoutOrder } from "@/lib/checkout-order-recovery";
import { createOrderApi } from "@/api/order-api";
import type { ApiClient } from "@/api/api-client";
import { en } from "@/i18n/messages/en";

let disk: Record<string, unknown>;
beforeEach(() => {
  disk = {};
  vi.stubGlobal("uni", { getStorageSync: (key: string) => disk[key], setStorageSync: (key: string, value: unknown) => { disk[key] = structuredClone(value); } });
});

const ast = ts.createSourceFile("checkout.ts", source.split('<script setup lang="ts">')[1].split("</script>")[0], ts.ScriptTarget.Latest, true);
function handler(name: string, deps: Record<string, unknown>) {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  const code = ts.transpileModule(node.getText(ast) + `; return ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), code)(...Object.values(deps));
}
function checkout(active: boolean) {
  const quote = { sourceDeviceId: 11, sourceRowVersion: 9, targetProductNo: "stellarbox-pro", targetDeviceStatus: active ? "ACTIVE" : "INACTIVE" };
  const submitted = { tradeinNo: "TI-1", orderNo: "ORD-1", sourceDeviceId: 11, targetDeviceId: 33,
    targetDeviceStatus: quote.targetDeviceStatus, walletDebitUsdt: 80, discountUsdt: 20 };
  const order = { ...submitted, canonicalStatus: active ? "activated" : "inventory", paymentStatus: "PAID",
    orderStatus: "COMPLETED", activationStatus: active ? "ACTIVATED" : "INVENTORY", amountUsdt: 80 };
  const target = { id: "33", activatedAt: active ? 1000 : null, activationUnconfirmed: false };
  const scope = { accountKey: "a", accountEpoch: 1, productNo: "stellarbox-pro", generation: 1 };
  const deps: Record<string, any> = {
    remoteApiEnabled: true, completeVerifiedMutation, asApiError, isSettledRejection, scope, isCurrentAccountScope: () => true,
    readCheckoutTradein, rememberCheckoutOrder: vi.fn(rememberCheckoutOrder), finishCheckoutTradein: vi.fn(finishCheckoutTradein),
    captureCheckoutRoute: () => ({ ...scope }), isCurrentCheckoutRoute: (snapshot: typeof scope) => snapshot.accountKey === scope.accountKey
      && snapshot.accountEpoch === scope.accountEpoch && snapshot.generation === scope.generation,
    app: { user: { usdtBalance: 100 }, captureRemoteAccountRequest: () => ({}), devices: [target],
      refreshRemoteFleet: vi.fn().mockResolvedValue(true) },
    product: ref({ id: "stellarbox-pro" }), purchaseUnavailable: ref(false), voucherQuote: { id: null },
    quotedTotal: 80, confirming: true, offerWalletTopup: vi.fn(), refreshPurchaseEligibility: vi.fn().mockResolvedValue("eligible"),
    netPrice:ref(80),cardFee:ref(0),trialView:ref({applied:false,quoteVersion:null}),trialQuoteScreenUnavailable:ref(false),
    freeTrial:{hasPendingConversion:()=>false},
    tradein: { appliedTradein: { canonicalQuote: quote }, clearApplied: vi.fn() },
    appliedTradeinView: ref({ device: { id: "11" }, canonicalQuote: quote }),
    deviceE3Api: { submit: vi.fn().mockResolvedValue(submitted) },
    orderApi: { list: vi.fn().mockResolvedValue({ orders: [order] }), create: vi.fn(), pay: vi.fn() },
    orders: { refreshRemote: vi.fn().mockResolvedValue(true) }, remoteOrderIntent: () => "stellarbox-pro||wallet|11|9", remoteOrderKey: () => "e3-same-key",
    remoteTradeinRecoveryError: ref(false), remoteTradeinRecoveryBusy: ref(false), navReplace: vi.fn().mockResolvedValue(true),
    remoteTradeinRecoveryRequired: ref(false), retireRemoteOrderKey: vi.fn(), orderId: ref(null), step: ref("confirm"),
    t: ref(en), toast: { warn: vi.fn(), error: vi.fn() },
    checkoutRouteFence: { invalidate: () => { scope.generation++; } }, activeCheckoutLoad: null,
  };
  // The settled-result replay starts at "confirmed"; its timers belong to the page watcher.
  deps.presentSettledPurchase = vi.fn(() => { deps.step.value = "confirmed"; });
  deps.completeRemoteTradein = handler("completeRemoteTradein", deps);
  deps.resumePendingRemoteTradein = handler("resumePendingRemoteTradein", deps);
  deps.invalidateCheckoutRoute = handler("invalidateCheckoutRoute", deps);
  return { ...deps, target, order, quote, submit: handler("submitRemoteOrder", deps) } as Record<string, any>;
}

it.each([true, false])("the actual RETIRE handler verifies the selected source placement active=%s", async active => {
  const h = checkout(active); await h.submit();
  expect(h.deviceE3Api.submit).toHaveBeenCalledWith(11, "stellarbox-pro", "e3-same-key", h.quote);
  expect(h.orderId.value).toBe("ORD-1"); expect(h.step.value).toBe("confirmed");
  expect(h.presentSettledPurchase).toHaveBeenCalledExactlyOnceWith(false);
  expect(h.orderApi.create).not.toHaveBeenCalled(); expect(h.orderApi.pay).not.toHaveBeenCalled();
  expect(h.tradein.clearApplied).toHaveBeenCalledOnce();
  expect(h.finishCheckoutTradein.mock.invocationCallOrder[0]).toBeLessThan(h.tradein.clearApplied.mock.invocationCallOrder[0]);
  expect(h.app.user.usdtBalance).toBe(100);
});

it.each(["trial","quote","amount","error"])("does not start a new trade-in after eligibility changes the reviewed %s", async change => {
  const h=checkout(false);
  h.refreshPurchaseEligibility.mockImplementation(async () => {
    if(change==="trial")h.trialView.value.applied=true;
    if(change==="quote")h.trialView.value.quoteVersion="NEW";
    if(change==="amount")h.netPrice.value=81;
    if(change==="error")h.trialQuoteScreenUnavailable.value=true;
    return "eligible";
  });
  await h.submit();
  expect(h.deviceE3Api.submit).not.toHaveBeenCalled(); expect(h.orderApi.create).not.toHaveBeenCalled();
  expect(h.rememberCheckoutOrder).not.toHaveBeenCalled();
  expect(h.toast.warn).toHaveBeenCalledWith(en.store.coTotalQuoteChanged);
});

it.each([true, false])("does not commit a changed target placement active=%s", async active => {
  const h = checkout(active); h.target.activatedAt = active ? null : 1000;
  await h.submit();
  expect(h.orderId.value).toBeNull(); expect(h.step.value).toBe("confirm");
  expect(h.tradein.clearApplied).not.toHaveBeenCalled();
});

it.each([true, false])("recovers the original receipt after a later valid target placement change, initially active=%s", async active => {
  const first = checkout(active); first.orderApi.list.mockRejectedValueOnce(new Error("orders blocked")); await first.submit();
  const refreshed = checkout(active); refreshed.target.activatedAt = active ? null : 1000;
  await refreshed.resumePendingRemoteTradein({ ...refreshed.scope }, true);
  expect(refreshed.orderId.value).toBe("ORD-1");
  expect(refreshed.remoteTradeinRecoveryError.value).toBe(false);
  expect(refreshed.deviceE3Api.submit).not.toHaveBeenCalled();
  expect(readCheckoutTradein("a", "stellarbox-pro")).toBeNull();
});

it.each(["missing-target", "unconfirmed-target", "active-source"])("keeps historical recovery pending for invalid fleet identity: %s", async invalid => {
  const first = checkout(false); first.orderApi.list.mockRejectedValueOnce(new Error("orders blocked")); await first.submit();
  const refreshed = checkout(false);
  if (invalid === "missing-target") refreshed.app.devices = [];
  if (invalid === "unconfirmed-target") refreshed.target.activationUnconfirmed = true;
  if (invalid === "active-source") refreshed.app.devices.push({ id: "11", activatedAt: 1000 });
  await refreshed.resumePendingRemoteTradein({ ...refreshed.scope }, true);
  expect(refreshed.orderId.value).toBeNull();
  expect(refreshed.remoteTradeinRecoveryError.value).toBe(true);
  expect(refreshed.deviceE3Api.submit).not.toHaveBeenCalled();
  expect(readCheckoutTradein("a", "stellarbox-pro")).not.toBeNull();
});

it("rejects an activated order for a warehouse quote before refreshing or committing", async () => {
  const h = checkout(false); h.order.canonicalStatus = "activated"; h.order.activationStatus = "ACTIVATED";
  await h.submit(); expect(h.app.refreshRemoteFleet).not.toHaveBeenCalled();
  expect(h.orderId.value).toBeNull(); expect(h.tradein.clearApplied).not.toHaveBeenCalled();
});

it("an already selected RETIRE source skips the full-slot capacity choice", async () => {
  const api = { capacityQuote: vi.fn(), eligibility: vi.fn() };
  const intercept = handler("fireTradeinIntercept", { interceptFired: false, trialConversionMode: ref(false),
    getProduct: () => ({ id: "stellarbox-pro" }), productId: ref("stellarbox-pro"), KNOWN_KINDS: ["stellarbox-pro"],
    tradein: { appliedTradein: { targetKind: "stellarbox-pro", oldDeviceId: "11" } }, deviceE3Api: api });
  await intercept(true); expect(api.capacityQuote).not.toHaveBeenCalled(); expect(api.eligibility).not.toHaveBeenCalled();
});

it("keeps ordinary recovery identities unchanged and isolates a new source revision", () => {
  const tradein = { appliedTradein: null as null | { canonicalQuote: { sourceDeviceId: number; sourceRowVersion: number } } };
  const intent = handler("remoteOrderIntent", { product: ref({ id: "stellarbox-pro" }), voucherQuote: { id: null }, payment: ref("wallet"), tradein });
  expect(intent()).toBe("stellarbox-pro||wallet|ordinary");
  tradein.appliedTradein = { canonicalQuote: { sourceDeviceId: 11, sourceRowVersion: 9 } };
  expect(intent()).toBe("stellarbox-pro||wallet|11|9");
  tradein.appliedTradein.canonicalQuote.sourceRowVersion = 10;
  expect(intent()).toBe("stellarbox-pro||wallet|11|10");
});


it.each(["order", "fleet"])("reload recovers a known RETIRE result after %s failure despite exhausted balance and eligibility", async failure => {
  const first = checkout(true);
  if (failure === "order") first.orderApi.list.mockRejectedValueOnce(new Error("network"));
  else first.app.refreshRemoteFleet.mockResolvedValueOnce(false);
  await first.submit();
  expect(first.remoteTradeinRecoveryError.value).toBe(true);
  expect(first.deviceE3Api.submit).toHaveBeenCalledOnce();
  const persisted = readCheckoutTradein("a", "stellarbox-pro")!;
  expect(persisted.orderNo).toBe("ORD-1"); expect(persisted.tradeinResult).toBeDefined();
  const refreshed = checkout(true);
  refreshed.app.user.usdtBalance = 20; refreshed.refreshPurchaseEligibility.mockResolvedValue("ineligible");
  refreshed.appliedTradeinView.value = null; refreshed.tradein.appliedTradein = null;
  refreshed.product.value = null;
  await refreshed.submit();
  expect(refreshed.orderId.value).toBe("ORD-1"); expect(refreshed.step.value).toBe("confirmed");
  expect(refreshed.deviceE3Api.submit).not.toHaveBeenCalled();
  expect(refreshed.refreshPurchaseEligibility).not.toHaveBeenCalled(); expect(refreshed.offerWalletTopup).not.toHaveBeenCalled();
  expect(readCheckoutTradein("a", "stellarbox-pro")).toBeNull();
});

it("reload replays an outcome-unknown RETIRE with exactly the same key and source quote", async () => {
  const first = checkout(false);
  first.deviceE3Api.submit.mockRejectedValueOnce(new Error("response lost after commit"));
  await first.submit();
  const original = first.deviceE3Api.submit.mock.calls[0];
  expect(readCheckoutTradein("a", "stellarbox-pro")!.tradeinResult).toBeUndefined();
  const refreshed = checkout(false);
  refreshed.app.user.usdtBalance = 0; refreshed.refreshPurchaseEligibility.mockResolvedValue("ineligible");
  refreshed.appliedTradeinView.value = null; refreshed.tradein.appliedTradein = null;
  await refreshed.submit();
  expect(refreshed.deviceE3Api.submit).toHaveBeenCalledExactlyOnceWith(...original);
  expect(refreshed.orderId.value).toBe("ORD-1"); expect(refreshed.orderApi.create).not.toHaveBeenCalled();
  expect(refreshed.refreshPurchaseEligibility).not.toHaveBeenCalled();
});

it("a stale account response cannot apply or clear another account's pending request", async () => {
  const first = checkout(true);
  first.deviceE3Api.submit.mockImplementationOnce(async () => {
    first.scope.accountKey = "b"; first.scope.accountEpoch = 2;
    return first.order;
  });
  await first.submit(); expect(first.orderId.value).toBeNull();
  expect(readCheckoutTradein("a", "stellarbox-pro")).not.toBeNull();
  expect(readCheckoutTradein("b", "stellarbox-pro")).toBeNull();
});

it("keeps a running source available for remote RETIRE while retaining the mock task gate", () => {
  const declaration = ast.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === "appliedTradeinView")!;
  const quote = { sourceDeviceId: 11, sourceRowVersion: 9, targetProductNo: "stellarbox-pro", targetDeviceStatus: "ACTIVE", discountUsdt: 20 };
  const device = { id: "11", activatedAt: 1000, currentTask: { id: "unfinished" } };
  const evaluate = (remoteApiEnabled: boolean) => new Function("computed", "remoteApiEnabled", "DEFAULT_TRADEIN_CONFIG", "trialConversionMode", "tradein", "product", "app", "isDeviceTaskBlocked",
    `return ${declaration.initializer!.getText(ast)};`)(computed, remoteApiEnabled, { enabled: true }, ref(false),
    { appliedTradein: { oldDeviceId: "11", targetKind: "stellarbox-pro", canonicalQuote: quote } }, ref({ id: "stellarbox-pro" }), { devices: [device] }, () => true);
  expect(evaluate(true).value?.device).toBe(device);
  expect(evaluate(false).value).toBeNull();
  expect(device.currentTask.id).toBe("unfinished");
});


it("retains the confirmed original result when recovery navigation fails", async () => {
  const first = checkout(true); first.orderApi.list.mockRejectedValueOnce(new Error("network")); await first.submit();
  const refreshed = checkout(true); refreshed.navReplace.mockResolvedValue(false);
  await refreshed.resumePendingRemoteTradein(refreshed.scope, true);
  expect(readCheckoutTradein("a", "stellarbox-pro")!.orderNo).toBe("ORD-1");
  expect(refreshed.remoteTradeinRecoveryError.value).toBe(true);
  refreshed.navReplace.mockResolvedValue(true);
  await refreshed.resumePendingRemoteTradein(refreshed.scope, true);
  expect(readCheckoutTradein("a", "stellarbox-pro")).toBeNull();
  expect(refreshed.deviceE3Api.submit).not.toHaveBeenCalled();
});


it("retains the original command when the server explicitly reports an unknown idempotency result", async () => {
  const first = checkout(true);
  first.deviceE3Api.submit.mockRejectedValueOnce(new ApiError({ kind: "business", message: "IDEMPOTENCY_RESULT_UNKNOWN" }));
  await first.submit();
  expect(readCheckoutTradein("a", "stellarbox-pro")!.commandKey).toBe("e3-same-key");
  expect(first.remoteTradeinRecoveryError.value).toBe(true);
});

it("recovers a warehouse result through the real inventory-order parser after reload", async () => {
  const first = checkout(false); first.orderApi.list.mockRejectedValueOnce(new Error("orders blocked"));
  await first.submit();
  const recovery = readCheckoutTradein("a", "stellarbox-pro")!;
  const refreshed = checkout(false);
  const payload = { source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, nextCursor: null,
    orders: [{ ...refreshed.order, productId: 5, productNo: "stellarbox-pro×1", productName: "Pro×1", quantity: 1,
      subtotalUsdt: 100, unitPriceUsdt: 100, paymentMethod: "USDT_WALLET", orderType: "TRADE_IN",
      placedAt: 1000, expiresAt: null, paidAt: 1001, activatedAt: null, itemCount: 1,
      targetDeviceInstanceNo: "DEV-TI-1", dataCenter: "DC", refundedAt: null, refundAmountUsdt: null,
      refundChannel: null, refundBillNo: null, refundReasonCode: null, closeReasonCode: null }] };
  const request = vi.fn().mockResolvedValue(payload);
  refreshed.orderApi.list.mockImplementation(createOrderApi({ request } as unknown as ApiClient, "dev").list);
  refreshed.product.value = null; refreshed.appliedTradeinView.value = null; refreshed.tradein.appliedTradein = null;
  refreshed.app.user.usdtBalance = 0; refreshed.refreshPurchaseEligibility.mockResolvedValue("ineligible");
  await refreshed.resumePendingRemoteTradein({ ...refreshed.scope }, true);
  expect(request).toHaveBeenCalledExactlyOnceWith({ method: "GET", path: "/api/orders?pageSize=50" });
  expect(refreshed.deviceE3Api.submit).not.toHaveBeenCalled();
  expect(refreshed.navReplace).toHaveBeenCalledExactlyOnceWith(`/pages/store/order-detail?id=${recovery.orderNo}`);
  expect(refreshed.orderId.value).toBe("ORD-1"); expect(refreshed.remoteTradeinRecoveryError.value).toBe(false);
  expect(readCheckoutTradein("a", "stellarbox-pro")).toBeNull();
});

it("retries the original known result after a pending recovery loses its page scope", async () => {
  const first = checkout(false); first.orderApi.list.mockRejectedValueOnce(new Error("orders blocked")); await first.submit();
  const refreshed = checkout(false);
  let failOld!: (error: Error) => void;
  refreshed.orderApi.list.mockReturnValueOnce(new Promise((_resolve, reject) => { failOld = reject; }));
  const old = refreshed.resumePendingRemoteTradein({ ...refreshed.scope }, true);
  await vi.waitFor(() => expect(refreshed.orderApi.list).toHaveBeenCalledOnce());
  refreshed.invalidateCheckoutRoute();
  failOld(new Error("old page read failed")); await old;
  await refreshed.resumePendingRemoteTradein({ ...refreshed.scope }, true);
  expect(refreshed.orderApi.list).toHaveBeenCalledTimes(2);
  expect(refreshed.orderId.value).toBe("ORD-1");
  expect(refreshed.deviceE3Api.submit).not.toHaveBeenCalled();
  expect(readCheckoutTradein("a", "stellarbox-pro")).toBeNull();
});

it.each(["a", "b"])("cookie bootstrap reads only bound account %s's recovery after checkout first read the guest account", async nextAccount => {
  const first = checkout(false); first.orderApi.list.mockRejectedValueOnce(new Error("orders blocked")); await first.submit();
  const refreshed = checkout(false);
  refreshed.scope.accountKey = "default";
  const recoverySource = source.slice(source.indexOf("let serverOrderRecovery:"), source.indexOf("function onKeyboardActivate("));
  const code = ts.transpileModule(recoverySource + "; return resumeServerOrder;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const recoveryDeps = { ...refreshed, recoverCheckoutOrder, recoverKeepBeforePurchase: vi.fn(() => false) };
  const resumeServerOrder = new Function(...Object.keys(recoveryDeps), code)(...Object.values(recoveryDeps));
  await expect(resumeServerOrder()).resolves.toBe(false);
  expect(refreshed.orderApi.list).not.toHaveBeenCalled();
  const watchNode = ast.statements.filter(ts.isExpressionStatement).map(node => node.expression)
    .filter(ts.isCallExpression).find(node => node.expression.getText(ast) === "watch"
      && node.arguments[0]?.getText(ast) === "[() => app.accountKey, () => app.accountBindingEpoch]")!;
  const deps = { ...refreshed, resumeServerOrder, interceptFired: false, tradeinAvailable: ref(false),
    keepCheckoutTarget: ref(null), keepCheckoutReadError: ref(false), promotionRoute: ref(null),
    remoteCapacityGate: { reset: vi.fn() }, checkoutWalletRefreshSequence: 0, checkoutWalletRefreshing: ref(false),
    quantityReady: ref(false), clearRemotePurchaseEligibility: vi.fn(), remoteOrderFailure: ref(null),
    receiptWriteFailure: ref(null), receiptRetrying: ref(false), restoreReceiptRecovery: vi.fn(),
    remoteOrderCommandKey: { clear: vi.fn() }, activeSession: ref(null), dialogsOpen: 0,
    checkoutRouteInitialized: true, pageAlive: true, pageVisible: true };
  const callback = new Function(...Object.keys(deps), `return ${watchNode.arguments[1].getText(ast)};`)(...Object.values(deps));
  refreshed.scope.accountKey = nextAccount; refreshed.scope.accountEpoch++;
  callback();
  await vi.waitFor(() => expect(refreshed.orderId.value).toBe(nextAccount === "a" ? "ORD-1" : null));
  expect(refreshed.deviceE3Api.submit).not.toHaveBeenCalled();
  expect(refreshed.navReplace).toHaveBeenCalledTimes(nextAccount === "a" ? 1 : 0);
  expect(readCheckoutTradein("a", "stellarbox-pro")?.orderNo).toBe(nextAccount === "a" ? undefined : "ORD-1");
});
