import { computed, ref } from "vue";
import { beforeEach, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./checkout.vue?raw";
import { completeVerifiedMutation } from "@/domain/e20-capacity-coordinator";
import { ApiError, asApiError, isSettledRejection } from "@/api/errors";
import { rememberCheckoutOrder, readCheckoutTradein, finishCheckoutTradein } from "@/lib/checkout-order-recovery";
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
  const scope = { accountKey: "a", accountEpoch: 1, productNo: "stellarbox-pro" };
  const deps: Record<string, any> = {
    remoteApiEnabled: true, completeVerifiedMutation, asApiError, isSettledRejection, scope, isCurrentAccountScope: () => true,
    readCheckoutTradein, rememberCheckoutOrder: vi.fn(rememberCheckoutOrder), finishCheckoutTradein: vi.fn(finishCheckoutTradein),
    captureCheckoutRoute: () => ({ ...scope }), isCurrentCheckoutRoute: (snapshot: typeof scope) => snapshot.accountKey === scope.accountKey && snapshot.accountEpoch === scope.accountEpoch,
    app: { user: { usdtBalance: 100 }, captureRemoteAccountRequest: () => ({}), devices: [target],
      refreshRemoteFleet: vi.fn().mockResolvedValue(true) },
    product: ref({ id: "stellarbox-pro" }), purchaseUnavailable: ref(false), voucherQuote: { id: null },
    quotedTotal: 80, confirming: true, offerWalletTopup: vi.fn(), refreshPurchaseEligibility: vi.fn().mockResolvedValue("eligible"),
    tradein: { appliedTradein: { canonicalQuote: quote }, clearApplied: vi.fn() },
    appliedTradeinView: ref({ device: { id: "11" }, canonicalQuote: quote }),
    deviceE3Api: { submit: vi.fn().mockResolvedValue(submitted) },
    orderApi: { list: vi.fn().mockResolvedValue({ orders: [order] }), create: vi.fn(), pay: vi.fn() },
    orders: { refreshRemote: vi.fn().mockResolvedValue(true) }, remoteOrderIntent: () => "stellarbox-pro||wallet|11|9", remoteOrderKey: () => "e3-same-key",
    remoteTradeinRecoveryError: ref(false), remoteTradeinRecoveryBusy: ref(false), navReplace: vi.fn().mockResolvedValue(true),
    remoteTradeinRecoveryRequired: ref(false), retireRemoteOrderKey: vi.fn(), orderId: ref(null), step: ref("confirm"),
    t: ref(en), toast: { warn: vi.fn(), error: vi.fn() },
  };
  deps.completeRemoteTradein = handler("completeRemoteTradein", deps);
  deps.resumePendingRemoteTradein = handler("resumePendingRemoteTradein", deps);
  return { ...deps, target, order, quote, submit: handler("submitRemoteOrder", deps) } as Record<string, any>;
}

it.each([true, false])("the actual RETIRE handler verifies the selected source placement active=%s", async active => {
  const h = checkout(active); await h.submit();
  expect(h.deviceE3Api.submit).toHaveBeenCalledWith(11, "stellarbox-pro", "e3-same-key", h.quote);
  expect(h.orderId.value).toBe("ORD-1"); expect(h.step.value).toBe("live");
  expect(h.orderApi.create).not.toHaveBeenCalled(); expect(h.orderApi.pay).not.toHaveBeenCalled();
  expect(h.tradein.clearApplied).toHaveBeenCalledOnce();
  expect(h.finishCheckoutTradein.mock.invocationCallOrder[0]).toBeLessThan(h.tradein.clearApplied.mock.invocationCallOrder[0]);
  expect(h.app.user.usdtBalance).toBe(100);
});

it.each([true, false])("does not commit a changed target placement active=%s", async active => {
  const h = checkout(active); h.target.activatedAt = active ? null : 1000;
  await h.submit();
  expect(h.orderId.value).toBeNull(); expect(h.step.value).toBe("confirm");
  expect(h.tradein.clearApplied).not.toHaveBeenCalled();
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
  expect(refreshed.orderId.value).toBe("ORD-1"); expect(refreshed.step.value).toBe("live");
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
