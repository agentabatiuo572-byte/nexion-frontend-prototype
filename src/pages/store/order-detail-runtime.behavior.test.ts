import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import ts from "typescript";
import source from "./order-detail.vue?raw";
import { captureRuntimeRevision, createOrderApi, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import type { ApiClient } from "@/api/api-client";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { asApiError } from "@/api/errors";
import { en } from "@/i18n/messages/en";

const remote = vi.hoisted(() => ({ remoteApiEnabled: true,
  productCatalogApi: { catalog: vi.fn() }, orderApi: { list: vi.fn(), pay: vi.fn() } }));
vi.mock("@/api/runtime", () => remote);
const { useOrders } = await import("@/store/orders");
const { prepareProductCatalog, refreshProductCatalog } = await import("@/store/product-catalog");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const original = {
  orderNo: "ORD-OLD", productId: 10, productNo: "cloud-share", productName: "Cloud Share×1",
  quantity: 1, itemCount: 1, subtotalUsdt: 19.9, unitPriceUsdt: 19.9, discountUsdt: 0, amountUsdt: 19.9,
  paymentMethod: "NEXGRID_WALLET", paymentStatus: "PAID", orderStatus: "COMPLETED", activationStatus: "ACTIVATED",
  canonicalStatus: "activated", orderType: "SINGLE", placedAt: 1, expiresAt: null, paidAt: 2, activatedAt: 2,
  dataCenter: "Cloud-Global", tradeinNo: null, sourceDeviceId: null, targetDeviceId: null,
  targetDeviceInstanceNo: "NEX-OLD", refundedAt: null, refundAmountUsdt: null, refundChannel: null, refundBillNo: null,
};
function list(orders: unknown[] = [original]) {
  return { source: "server", sourceEnvironment: "PRODUCTION", runId: null, serverCanonical: true, nextCursor: null, orders };
}
const catalog = { source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
  revision: "same-catalog", products: [] };
const placed = { ...original, canonicalStatus: "placed", paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT",
  activationStatus: "WAITING_PAYMENT", paidAt: null, activatedAt: null, expiresAt: Date.now() + 1_800_000 };
const receipt = { orderNo: original.orderNo, paymentNo: "PAY-OLD", paymentStatus: "PAID", orderStatus: "COMPLETED",
  activationStatus: "ACTIVATED", canonicalStatus: "activated", amountUsdt: 19.9, paymentMethod: "NEXGRID_WALLET",
  walletBalanceAfterUsdt: 80.1, idempotent: false, serverCanonical: true, source: "server",
  sourceEnvironment: "PRODUCTION", runId: "" };
// Execute the page's real read/presentation/lifecycle declarations, including
// cleanup. Real Pinia orders, catalog invalidation, and API parsing remain live.
const body = source.slice(source.indexOf('const id = ref("");'), source.indexOf("const fullyVoucherSettled"))
  + source.slice(source.indexOf("const walletPaymentConfirmed"), source.indexOf("const isProvisioning"))
  + source.slice(source.indexOf("async function offerWalletTopup"), source.indexOf("function goOrders"))
  + source.slice(source.indexOf("function cleanup()"), source.indexOf("// ─── styles"));
const js = ts.transpileModule(body + "\nreturn { order, showRemoteOrderLoading, showOrderNotFound, remoteOrderError, refreshOrder, handleWalletPayment, payingFromWallet, canPayFromWallet, cancellable };",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const disposals: (() => void)[] = [];
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); await nextTick(); }
function harness(mode: "dev" | "prod" = "prod") {
  const pinia = createPinia();
  setActivePinia(pinia);
  const account = createRemoteAccountEpoch("a");
  const auth = reactive({ isAuthenticated: true, accountId: "a" });
  const requests: ReturnType<typeof deferred<unknown>>[] = [];
  const payments: ReturnType<typeof deferred<unknown>>[] = [];
  const request = vi.fn((args: unknown) => { const pending = deferred<unknown>();
    ((args as { method: string }).method === "POST" ? payments : requests).push(pending); return pending.promise; });
  const api = createOrderApi({ request } as unknown as ApiClient, mode);
  remote.orderApi.list.mockImplementation(api.list);
  remote.orderApi.pay.mockImplementation(api.pay);
  const orders = useOrders();
  orders.bindAccount("a");
  const hooks = { load: [] as ((options: { id: string }) => void)[], show: [] as (() => void)[],
    hide: [] as (() => void)[], unload: [] as (() => void)[], unmount: [] as (() => void)[] };
  const app = { user: reactive({ usdtBalance: 100 }), captureRemoteAccountRequest: account.snapshot,
    adoptCommerceWallet: vi.fn().mockReturnValue(true), refreshRemoteFleet: vi.fn().mockResolvedValue(true) };
  const toast = { warn: vi.fn() };
  const deps = { ref, computed, watch, orders, auth, remoteApiEnabled: true, app, toast,
    t: ref(en), asApiError, orderApi: remote.orderApi, uiConfirm: vi.fn().mockResolvedValue(true),
    navTo: vi.fn(), detailNow: ref(Date.now()),
    captureAccountScope: account.snapshot, isCurrentAccountScope: account.isCurrent,
    captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision,
    onLoad: (fn: typeof hooks.load[number]) => hooks.load.push(fn),
    onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn),
    onUnload: (fn: () => void) => hooks.unload.push(fn), onUnmounted: (fn: () => void) => hooks.unmount.push(fn), tickTimer: null };
  const scope = effectScope();
  const page = scope.run(() => new Function(...Object.keys(deps), js)(...Object.values(deps))) as {
    order: ComputedRef<unknown>; showRemoteOrderLoading: ComputedRef<boolean>;
    showOrderNotFound: ComputedRef<boolean>; remoteOrderError: Ref<boolean>;
    refreshOrder(): Promise<void>; handleWalletPayment(): Promise<void>;
    payingFromWallet: Ref<boolean>; canPayFromWallet: ComputedRef<boolean>; cancellable: ComputedRef<boolean>;
  };
  hooks.load.forEach(fn => fn({ id: original.orderNo }));
  const show = () => hooks.show.forEach(fn => fn());
  const hide = () => hooks.hide.forEach(fn => fn());
  const unload = () => hooks.unload.forEach(fn => fn());
  disposals.push(() => { unload(); scope.stop(); orders.$dispose(); });
  show();
  return { page, requests, payments, request, orders, account, auth, app, toast, show, hide, unload };
}
beforeEach(() => {
  remote.orderApi.list.mockReset();
  remote.orderApi.pay.mockReset();
  remote.productCatalogApi.catalog.mockReset();
  prepareProductCatalog();
});
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); });

describe("real order detail after catalogue runtime invalidation", () => {
  it.each(["dev", "prod"] as const)("rereads the original in %s when catalogue completes before the pending list", async (mode) => {
    const h = harness(mode);
    const snapshot = deferred<typeof catalog>();
    remote.productCatalogApi.catalog.mockReturnValueOnce(snapshot.promise);
    const refresh = refreshProductCatalog(true);
    snapshot.resolve(catalog);
    await refresh;
    await settle();
    expect(h.requests).toHaveLength(2);
    expect(h.page.showRemoteOrderLoading.value).toBe(true);
    expect(h.page.showOrderNotFound.value).toBe(false);
    h.requests[0].resolve(list());
    await settle();
    expect(h.orders.orders).toEqual([]);
    expect(h.page.showOrderNotFound.value).toBe(false);
    h.requests[1].resolve(list());
    await settle();
    expect(h.orders.orders[0]?.status).toBe("activated");
    expect(h.page.showOrderNotFound.value).toBe(false);
    expect(h.page.showRemoteOrderLoading.value).toBe(false);
    expect(h.request.mock.calls.every(([args]) => (args as { method: string }).method === "GET")).toBe(true);
  });
  it("rereads when the same catalogue completes after the original was already displayed", async () => {
    const h = harness();
    h.requests[0].resolve(list()); await settle();
    expect(h.orders.orders[0]?.id).toBe(original.orderNo);
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    expect(h.requests).toHaveLength(2);
    expect(h.page.showOrderNotFound.value).toBe(false);
    expect(h.page.showRemoteOrderLoading.value).toBe(true);
    h.requests[1].resolve(list()); await settle();
    expect(h.orders.orders[0]?.id).toBe(original.orderNo);
  });
  it("calls an order missing only after the current complete canonical list proves absence", async () => {
    const h = harness();
    expect(h.page.showOrderNotFound.value).toBe(false);
    h.requests[0].resolve(list([])); await settle();
    expect(h.page.showRemoteOrderLoading.value).toBe(false);
    expect(h.page.showOrderNotFound.value).toBe(true);
  });
  it.each([new Error("network unavailable"), new Error("401 AUTH_REQUIRED")])("shows retry instead of local success or not-found after a failed reread: %s", async (error) => {
    const h = harness();
    h.requests[0].resolve(list()); await settle();
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    expect(h.requests).toHaveLength(2);
    h.requests[1].reject(error); await settle();
    expect(h.page.remoteOrderError.value).toBe(true);
    expect(h.page.showOrderNotFound.value).toBe(false);
    expect(h.orders.orders).toEqual([]);
    const retry = h.page.refreshOrder();
    h.requests[2].resolve(list()); await retry; await settle();
    expect(h.orders.orders[0]?.id).toBe(original.orderNo);
    expect(h.page.remoteOrderError.value).toBe(false);
  });
  it("rejects forged noncanonical readback without presenting the paid fixture", async () => {
    const h = harness();
    h.requests[0].resolve({ ...list(), serverCanonical: false }); await settle();
    expect(h.orders.orders).toEqual([]);
    expect(h.page.remoteOrderError.value).toBe(true);
    expect(h.page.showOrderNotFound.value).toBe(false);
  });
  it("rejects the previous account's pending reread after an account switch", async () => {
    const h = harness();
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    expect(h.requests).toHaveLength(2);
    h.account.bind("b"); h.auth.accountId = "b"; h.orders.bindAccount("b");
    await settle();
    expect(h.requests).toHaveLength(3);
    h.requests[2].resolve(list([])); await settle();
    h.requests[1].resolve(list()); h.requests[0].resolve(list()); await settle();
    expect(h.orders.orders).toEqual([]);
    expect(h.page.showOrderNotFound.value).toBe(true);
  });
  it("does not start hidden or unloaded rereads, and rereads when shown again", async () => {
    const h = harness();
    h.requests[0].resolve(list()); await settle();
    h.hide();
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    expect(h.requests).toHaveLength(1);
    h.show(); expect(h.requests).toHaveLength(2);
    h.requests[1].resolve(list()); await settle();
    h.unload();
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    expect(h.requests).toHaveLength(2);
  });
  it("releases the private payment lock after catalogue reread stays placed and the one payment rejects", async () => {
    const h = harness();
    h.requests[0].resolve(list([placed])); await settle();
    expect(h.page.canPayFromWallet.value).toBe(true);
    const payment = h.page.handleWalletPayment();
    await h.page.handleWalletPayment();
    expect(h.payments).toHaveLength(1);
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    h.requests[1].resolve(list([placed])); await settle();
    h.payments[0].reject(new Error("payment rejected")); await payment; await settle();
    expect(h.page.payingFromWallet.value).toBe(false);
    expect(h.page.canPayFromWallet.value).toBe(true);
    expect(h.page.cancellable.value).toBe(true);
    expect(h.page.remoteOrderError.value).toBe(false);
    expect(h.app.adoptCommerceWallet).not.toHaveBeenCalled();
    expect(h.payments).toHaveLength(1);
    expect(h.request.mock.calls.find(([args]) => (args as { method: string }).method === "POST")?.[0])
      .toMatchObject({ path: `/api/orders/${original.orderNo}/pay`, idempotencyKey: `wallet-pay:${original.orderNo}` });
  });
  it("settles only the payment lock when an old receipt arrives while the newer catalogue read is pending", async () => {
    const h = harness();
    h.requests[0].resolve(list([placed])); await settle();
    const payment = h.page.handleWalletPayment();
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    h.payments[0].resolve(receipt); await payment; await settle();
    expect(h.page.payingFromWallet.value).toBe(false);
    expect(h.page.showRemoteOrderLoading.value).toBe(true);
    expect(h.page.remoteOrderError.value).toBe(false);
    expect(h.app.adoptCommerceWallet).not.toHaveBeenCalled();
    expect(h.app.refreshRemoteFleet).toHaveBeenCalledOnce();
    expect(h.app.user.usdtBalance).toBe(100);
    expect(h.requests).toHaveLength(2);
    expect(h.payments).toHaveLength(1);
    h.requests[1].resolve(list()); await settle();
    expect(h.orders.orders[0]?.status).toBe("activated");
    expect(h.page.canPayFromWallet.value).toBe(false);
  });
  it.each(["a", "b"])("does not adopt an old payment receipt after account generation changes to %s", async (nextAccount) => {
    const h = harness();
    h.requests[0].resolve(list([placed])); await settle();
    const payment = h.page.handleWalletPayment();
    h.account.bind(nextAccount); h.auth.accountId = nextAccount; h.orders.bindAccount(nextAccount);
    await settle();
    h.requests[1].resolve(list(nextAccount === "a" ? [placed] : [])); await settle();
    const currentOrders = [...h.orders.orders];
    h.payments[0].resolve(receipt); await payment; await settle();
    expect(h.page.payingFromWallet.value).toBe(false);
    expect(h.orders.orders).toEqual(currentOrders);
    expect(h.app.adoptCommerceWallet).not.toHaveBeenCalled();
    expect(h.app.user.usdtBalance).toBe(100);
    expect(h.page.remoteOrderError.value).toBe(false);
    expect(h.page.showRemoteOrderLoading.value).toBe(false);
    expect(h.payments).toHaveLength(1);
    expect(h.toast.warn).not.toHaveBeenCalled();
  });
});
