import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import ts from "typescript";
import source from "./order-detail.vue?raw";
import chatSource from "../support/chat.vue?raw";
import { captureRuntimeRevision, createOrderApi, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import type { ApiClient } from "@/api/api-client";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { asApiError } from "@/api/errors";
import { en } from "@/i18n/messages/en";
import { beginOrderAction,readOrderAction,markOrderActionPaid,clearOrderAction } from '@/lib/order-command-fence';
import { purchaseRecoveryCopy } from '@/lib/purchase-recovery-copy';
import { paidOrderReceipt } from '@/api/order-api';
import { checkoutFlowCopy } from '@/lib/checkout-flow-copy';
import { orderPaymentRejection } from '@/lib/order-payment-rejection';
import { ApiError } from '@/api/errors';
import { formatAmount as formatPlainAmount } from '@/lib/amount-display';

const remote = vi.hoisted(() => ({ remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "prod", baseUrl: "https://test.example" },
  productCatalogApi: { catalog: vi.fn() }, orderApi: { list: vi.fn(), pay: vi.fn() }, purchaseEligibilityApi:{get:vi.fn()} }));
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
  paymentMethod: "UVEL_WALLET", paymentStatus: "PAID", orderStatus: "COMPLETED", activationStatus: "ACTIVATED",
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
  activationStatus: "ACTIVATED", canonicalStatus: "activated", amountUsdt: 19.9, paymentMethod: "UVEL_WALLET",
  walletBalanceAfterUsdt: 80.1, idempotent: false, serverCanonical: true, source: "server",
  sourceEnvironment: "PRODUCTION", runId: "" };
// Execute the page's real read/presentation/lifecycle declarations, including
// cleanup. Real Pinia orders, catalog invalidation, and API parsing remain live.
const body = source.slice(source.indexOf('const id = ref("");'), source.indexOf("const fullyVoucherSettled"))
  + source.slice(source.indexOf("const walletPaymentConfirmed"), source.indexOf("const isProvisioning"))
  + source.slice(source.indexOf("const needsRecovery"), source.indexOf("const STATUS_COLORS"))
  + source.slice(source.indexOf("async function offerWalletTopup"), source.indexOf("function goOrders"))
  + source.slice(source.indexOf("const usdt ="), source.indexOf("const trialRewardText"))
  + source.slice(source.indexOf("function cleanup()"), source.indexOf("// ─── styles"));
const js = ts.transpileModule(body + "\nreturn { order, summaryMoney, refundChannelLabel, showRemoteOrderLoading, showOrderNotFound, remoteOrderError, refreshOrder, handleWalletPayment, payingFromWallet, canPayFromWallet, cancellable, contactOrderSupport, recoverOrderAction, orderAction, resumePaymentAllowed, requestPendingPayment, runPaymentNoticeAction, paymentSheetOpen, paymentSheetAmount, paymentNotice, paymentNoticeReason, noticeCancelFailed, paymentResultVisible, paymentResultState, topupPendingOrder, pendingPaymentChecking, autoPayRequested };",
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
  const clipboard: Array<{ data: string; success: () => void; fail?: () => void }> = [];
  const readPaymentCommand=vi.fn().mockResolvedValue({status:'PROCESSING',canResumeSameKey:false});
  const authorize=vi.fn(async(_context:unknown,command:(authorization:unknown)=>Promise<unknown>,current:()=>boolean)=>current()?command({paymentPassword:'039417',credentialVersion:1,attemptNo:'fixture-attempt'}):null);
  const deps = { ref, computed, watch, orders, auth, remoteApiEnabled: true, app, toast, apiRuntimeConfig: reactive({ environment: mode }), locale: reactive({ code: "en" }),
    uni: { setClipboardData: (args: typeof clipboard[number]) => clipboard.push(args) },
    t: ref(en), asApiError, orderApi: remote.orderApi, uiConfirm: vi.fn().mockResolvedValue(true),
    fmt:(message:string,values:Record<string,unknown>)=>message.replace(/\{(\w+)\}/g,(_,key)=>String(values[key])),formatPlainAmount,
    executePaymentWithPassword:authorize, checkoutFlowCopy, purchaseEligibilityApi:remote.purchaseEligibilityApi, orderPaymentRejection,
    beginOrderAction,readOrderAction,markOrderActionPaid,clearOrderAction,purchaseRecoveryCopy,paidOrderReceipt,readPaymentCommand,apiClient:{},
    navTo: vi.fn(), takeNavigationQuery: () => "", detailNow: ref(Date.now()),
    conversations: {}, advisorChatRoute: vi.fn().mockResolvedValue("/pages/support/chat?cid=ADVISOR-THREAD"),
    captureAccountScope: account.snapshot, isCurrentAccountScope: account.isCurrent,
    captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision,
    onLoad: (fn: typeof hooks.load[number]) => hooks.load.push(fn),
    onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn),
    onUnload: (fn: () => void) => hooks.unload.push(fn), onUnmounted: (fn: () => void) => hooks.unmount.push(fn), tickTimer: null };
  const scope = effectScope();
  const page = scope.run(() => new Function(...Object.keys(deps), js)(...Object.values(deps))) as {
    order: ComputedRef<unknown>; summaryMoney: (value: number|string, showCurrency?: boolean) => string;
    refundChannelLabel: ComputedRef<string>; showRemoteOrderLoading: ComputedRef<boolean>;
    showOrderNotFound: ComputedRef<boolean>; remoteOrderError: Ref<boolean>;
    refreshOrder(): Promise<void>; handleWalletPayment(): Promise<void>; contactOrderSupport(): void;
    recoverOrderAction(retry?:boolean):Promise<void>;orderAction:Ref<unknown>;resumePaymentAllowed:Ref<boolean>;
    payingFromWallet: Ref<boolean>; canPayFromWallet: ComputedRef<boolean>; cancellable: ComputedRef<boolean>;
    requestPendingPayment():Promise<void>;runPaymentNoticeAction():Promise<void>;topupPendingOrder():void;
    paymentSheetOpen:Ref<boolean>;paymentSheetAmount:Ref<number|string>;paymentNotice:Ref<string>;paymentNoticeReason:Ref<string>;noticeCancelFailed:Ref<boolean>;paymentResultVisible:Ref<boolean>;paymentResultState:Ref<string>;
    pendingPaymentChecking:Ref<boolean>;autoPayRequested:Ref<boolean>;
  };
  hooks.load.forEach(fn => fn({ id: original.orderNo }));
  const show = () => hooks.show.forEach(fn => fn());
  const hide = () => hooks.hide.forEach(fn => fn());
  const unload = () => hooks.unload.forEach(fn => fn());
  disposals.push(() => { unload(); scope.stop(); orders.$dispose(); });
  show();
  return { page, requests, payments, request, orders, account, auth, app, toast, show, hide, unload, clipboard, readPaymentCommand,authorize,navTo: deps.navTo,
    load: (id: string) => hooks.load.forEach(fn => fn({ id })) };
}
beforeEach(() => {
  const storage=new Map<string,unknown>();
  vi.stubGlobal('uni',{getStorageSync:(key:string)=>storage.get(key),setStorageSync:(key:string,value:unknown)=>storage.set(key,structuredClone(value))});
  remote.orderApi.list.mockReset();
  remote.orderApi.pay.mockReset();
  remote.purchaseEligibilityApi.get.mockReset().mockResolvedValue({eligible:true,policies:[]});
  remote.productCatalogApi.catalog.mockReset();
  prepareProductCatalog();
});
afterEach(() => { disposals.splice(0).forEach(dispose => dispose());vi.unstubAllGlobals(); });

describe('original pending order payment entry',()=>{
  async function pending(){const h=harness();h.requests[0].resolve(list([placed]));await settle();return h;}
  it('reads an unpaid order in dollars one to one with the unit only on totals',async()=>{
    const h=await pending();
    expect(h.page.summaryMoney(19.9,true)).toBe('$19.90');expect(h.page.summaryMoney(19.9)).toBe('19.90');
    h.page.paymentSheetOpen.value=true;expect(h.page.summaryMoney(19.9,true)).toBe('$19.90');
    expect(h.orders.orders[0].total).toBe(19.9);expect(h.payments).toHaveLength(0);
  });
  it('keeps paid receipt totals in the actual payment currency',async()=>{
    const h=harness();h.requests[0].resolve(list([original]));await settle();
    expect(h.page.summaryMoney(19.9,true)).toBe('19.90 USDT');expect(h.page.summaryMoney(19.9)).toBe('19.90');expect(h.payments).toHaveLength(0);
  });
  it('cold pay intent reaches the method sheet when an already visible page receives another onShow',async()=>{
    const h=harness(),eligibility=deferred<{eligible:boolean;policies:[]}>();remote.purchaseEligibilityApi.get.mockReturnValueOnce(eligibility.promise);
    h.page.autoPayRequested.value=true;h.requests[0].resolve(list([placed]));await settle();
    expect(h.page.pendingPaymentChecking.value).toBe(true);h.show();await settle();
    h.requests.slice(1).forEach(request=>request.resolve(list([placed])));await settle();
    eligibility.resolve({eligible:true,policies:[]});await settle();
    expect(h.page.pendingPaymentChecking.value).toBe(false);expect(h.page.paymentSheetOpen.value).toBe(true);
    expect(h.requests).toHaveLength(1);
    expect(h.payments).toHaveLength(0);expect(h.authorize).not.toHaveBeenCalled();
  });
  it('retains cold pay intent and consumes the newer authoritative read after the obsolete preflight settles',async()=>{
    const h=harness(),eligibility=deferred<{eligible:boolean;policies:[]}>();remote.purchaseEligibilityApi.get.mockReturnValueOnce(eligibility.promise);
    h.page.autoPayRequested.value=true;h.requests[0].resolve(list([placed]));await settle();
    expect(h.page.pendingPaymentChecking.value).toBe(true);remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true);await settle();h.requests[1].resolve(list([placed]));await settle();
    eligibility.resolve({eligible:true,policies:[]});await settle();
    expect(h.page.pendingPaymentChecking.value).toBe(false);expect(h.page.paymentSheetOpen.value).toBe(true);
    expect(h.page.autoPayRequested.value).toBe(false);expect(h.requests).toHaveLength(2);expect(remote.purchaseEligibilityApi.get).toHaveBeenCalledTimes(2);
    expect(h.payments).toHaveLength(0);expect(h.authorize).not.toHaveBeenCalled();
  });
  it('also resumes once when the replacement read finishes after the obsolete preflight',async()=>{
    const h=harness(),eligibility=deferred<{eligible:boolean;policies:[]}>();remote.purchaseEligibilityApi.get.mockReturnValueOnce(eligibility.promise);
    h.page.autoPayRequested.value=true;h.requests[0].resolve(list([placed]));await settle();
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);await refreshProductCatalog(true);await settle();
    eligibility.resolve({eligible:true,policies:[]});await settle();expect(h.page.pendingPaymentChecking.value).toBe(false);
    expect(h.page.autoPayRequested.value).toBe(true);expect(h.page.paymentSheetOpen.value).toBe(false);
    h.requests[1].resolve(list([placed]));await settle();expect(h.page.paymentSheetOpen.value).toBe(true);expect(h.page.autoPayRequested.value).toBe(false);
    expect(h.requests).toHaveLength(2);expect(remote.purchaseEligibilityApi.get).toHaveBeenCalledTimes(2);expect(h.payments).toHaveLength(0);
  });
  it('consumes the intent with a visible retry error when the new authoritative read fails',async()=>{
    const h=harness(),eligibility=deferred<{eligible:boolean;policies:[]}>();remote.purchaseEligibilityApi.get.mockReturnValueOnce(eligibility.promise);
    h.page.autoPayRequested.value=true;h.requests[0].resolve(list([placed]));await settle();
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);await refreshProductCatalog(true);await settle();h.requests[1].reject(new Error('read failed'));await settle();
    eligibility.resolve({eligible:true,policies:[]});await settle();expect(h.page.pendingPaymentChecking.value).toBe(false);
    expect(h.page.autoPayRequested.value).toBe(false);expect(h.page.paymentNotice.value).toBe('query');expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.requests).toHaveLength(2);
  });
  it.each(['cancelled','activated'] as const)('uses the newer %s original as the terminal intent outcome',async status=>{
    const h=harness(),eligibility=deferred<{eligible:boolean;policies:[]}>();remote.purchaseEligibilityApi.get.mockReturnValueOnce(eligibility.promise);
    h.page.autoPayRequested.value=true;h.requests[0].resolve(list([placed]));await settle();remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);await refreshProductCatalog(true);await settle();
    h.requests[1].resolve(list([status==='activated'?original:{...placed,canonicalStatus:'cancelled',paymentStatus:'CANCELLED',orderStatus:'CANCELLED'}]));await settle();
    eligibility.resolve({eligible:true,policies:[]});await settle();expect(h.page.pendingPaymentChecking.value).toBe(false);expect(h.page.autoPayRequested.value).toBe(false);expect(h.page.paymentSheetOpen.value).toBe(false);
    expect(status==='activated'?h.page.paymentResultVisible.value:h.page.paymentNotice.value==='blocked').toBe(true);expect(h.payments).toHaveLength(0);expect(remote.purchaseEligibilityApi.get).toHaveBeenCalledOnce();
  });
  it('does not replay a pending intent after the page is hidden',async()=>{
    const h=harness(),eligibility=deferred<{eligible:boolean;policies:[]}>();remote.purchaseEligibilityApi.get.mockReturnValueOnce(eligibility.promise);
    h.page.autoPayRequested.value=true;h.requests[0].resolve(list([placed]));await settle();remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);await refreshProductCatalog(true);await settle();h.requests[1].resolve(list([placed]));await settle();
    h.hide();eligibility.resolve({eligible:true,policies:[]});await settle();expect(h.page.autoPayRequested.value).toBe(false);expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.payments).toHaveLength(0);
  });
  it('does not transfer the former account payment intent to the new account read',async()=>{
    const h=harness(),eligibility=deferred<{eligible:boolean;policies:[]}>();remote.purchaseEligibilityApi.get.mockReturnValueOnce(eligibility.promise);
    h.page.autoPayRequested.value=true;h.requests[0].resolve(list([placed]));await settle();h.account.bind('b');h.auth.accountId='b';h.orders.bindAccount('b');await settle();
    h.requests.at(-1)!.resolve(list([placed]));await settle();eligibility.resolve({eligible:true,policies:[]});await settle();
    expect(h.page.autoPayRequested.value).toBe(false);expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.payments).toHaveLength(0);expect(remote.purchaseEligibilityApi.get).toHaveBeenCalledOnce();
  });
  it('consumes a new same-scope read only once when the current preflight can already finish',async()=>{
    const h=harness(),eligibility=deferred<{eligible:boolean;policies:[]}>();remote.purchaseEligibilityApi.get.mockReturnValueOnce(eligibility.promise);
    h.page.autoPayRequested.value=true;h.requests[0].resolve(list([placed]));await settle();
    const reread=h.page.refreshOrder();await settle();h.requests[1].resolve(list([placed]));await reread;
    eligibility.resolve({eligible:true,policies:[]});await settle();await settle();
    expect(h.page.paymentSheetOpen.value).toBe(true);expect(h.page.autoPayRequested.value).toBe(false);expect(h.page.pendingPaymentChecking.value).toBe(false);
    expect(h.requests).toHaveLength(2);expect(remote.purchaseEligibilityApi.get).toHaveBeenCalledOnce();expect(h.payments).toHaveLength(0);
  });
  it('does not let the former preflight completion unlock a newer visible attempt',async()=>{
    const h=await pending(),oldEligibility=deferred<{eligible:boolean;policies:[]}>(),newEligibility=deferred<{eligible:boolean;policies:[]}>();
    remote.purchaseEligibilityApi.get.mockReturnValueOnce(oldEligibility.promise).mockReturnValueOnce(newEligibility.promise);
    const old=h.page.requestPendingPayment();await settle();h.requests[1].resolve(list([placed]));await settle();h.hide();h.show();await settle();h.requests[2].resolve(list([placed]));await settle();
    const current=h.page.requestPendingPayment();await settle();h.requests[3].resolve(list([placed]));await settle();
    expect(h.page.pendingPaymentChecking.value).toBe(true);oldEligibility.resolve({eligible:true,policies:[]});await old;
    expect(h.page.pendingPaymentChecking.value).toBe(true);expect(h.page.paymentSheetOpen.value).toBe(false);
    newEligibility.resolve({eligible:true,policies:[]});await current;
    expect(h.page.pendingPaymentChecking.value).toBe(false);expect(h.page.paymentSheetOpen.value).toBe(true);
  });
  it('reads the original, opens only its USDT wallet sheet, and does not charge or request PIN yet',async()=>{
    const h=await pending(),opening=h.page.requestPendingPayment();await settle();
    expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.requests).toHaveLength(2);
    h.requests[1].resolve(list([placed]));await opening;
    expect(h.page.paymentSheetOpen.value).toBe(true);expect(h.page.paymentSheetAmount.value).toBe(19.9);
    expect(remote.purchaseEligibilityApi.get).toHaveBeenCalledExactlyOnceWith('cloud-share');
    await settle();expect(h.requests).toHaveLength(2);expect(h.page.autoPayRequested.value).toBe(false);expect(h.page.pendingPaymentChecking.value).toBe(false);
    expect(h.payments).toHaveLength(0);expect(h.authorize).not.toHaveBeenCalled();
  });
  it('blocks an authoritative overall F4B denial before method, PIN or payment',async()=>{
    const h=await pending();remote.purchaseEligibilityApi.get.mockResolvedValue({eligible:false,policies:[{policy:'F4B',eligible:false,conditions:[{kind:'monthlyQuota',met:false}]}]});
    const opening=h.page.requestPendingPayment();await settle();h.requests[1].resolve(list([placed]));await opening;
    expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.page.paymentNotice.value).toBe('blocked');expect(h.authorize).not.toHaveBeenCalled();expect(h.payments).toHaveLength(0);
  });
  it.each(['denied','unreadable','approved'] as const)('checks every original legacy bundle SKU when the second line is %s',async outcome=>{
    const h=await pending();
    const lineItems=[{sku:'cloud-share',name:'Share',quantity:1,unitPriceUsdt:9.9,lineAmountUsdt:9.9},
      {sku:'stellarbox-s1',name:'Box',quantity:1,unitPriceUsdt:10,lineAmountUsdt:10}];
    remote.purchaseEligibilityApi.get.mockImplementation(async productNo=>{
      if(productNo==='stellarbox-s1'&&outcome==='unreadable')throw new Error('read failed');
      return {eligible:productNo!=='stellarbox-s1'||outcome==='approved',policies:[]};
    });
    const opening=h.page.requestPendingPayment();await settle();
    h.requests[1].resolve(list([{...placed,orderType:'BUNDLE',quantity:2,itemCount:2,lineItems}]));await opening;
    expect(remote.purchaseEligibilityApi.get.mock.calls.map(call=>call[0]).sort()).toEqual(['cloud-share','stellarbox-s1']);
    expect(h.page.paymentSheetOpen.value).toBe(outcome==='approved');
    expect(h.page.paymentNotice.value).toBe(outcome==='denied'?'blocked':outcome==='unreadable'?'query':'');
    expect(h.authorize).not.toHaveBeenCalled();expect(h.payments).toHaveLength(0);
  });
  it('follows an authoritative overall EITHER approval without recomputing a rejected subcondition',async()=>{
    const h=await pending();remote.purchaseEligibilityApi.get.mockResolvedValue({eligible:true,policies:[{policy:'E1',mode:'EITHER',eligible:false,conditions:[{kind:'rank',met:false}]},{policy:'F4B',mode:'EITHER',eligible:true,conditions:[{kind:'monthlyQuota',met:true}]}]});
    const opening=h.page.requestPendingPayment();await settle();h.requests[1].resolve(list([placed]));await opening;
    expect(h.page.paymentSheetOpen.value).toBe(true);expect(h.page.paymentNotice.value).toBe('');expect(h.authorize).not.toHaveBeenCalled();expect(h.payments).toHaveLength(0);
  });
  it('keeps a known qualification failure in a small notice and leaves cancellation failure there to retry',async()=>{
    const h=await pending();remote.purchaseEligibilityApi.get.mockResolvedValue({eligible:false,policies:[{policy:'E1',eligible:false,conditions:[{kind:'rank',met:false}]}]});
    const opening=h.page.requestPendingPayment();await settle();h.requests[1].resolve(list([placed]));await opening;
    expect(h.page.paymentNotice.value).toBe('blocked');expect(h.page.paymentSheetOpen.value).toBe(false);
    const cancel=vi.spyOn(h.orders,'cancelOrderRemote').mockResolvedValue(false);
    await h.page.runPaymentNoticeAction();expect(h.page.paymentNotice.value).toBe('blocked');expect(h.page.noticeCancelFailed.value).toBe(true);
    await h.page.runPaymentNoticeAction();expect(cancel).toHaveBeenCalledTimes(2);expect(h.orders.orders[0].status).toBe('placed');
  });
  it('offers retry for a failed read without fabricating a restriction or cancellation',async()=>{
    const h=await pending(),opening=h.page.requestPendingPayment();await settle();h.requests[1].reject(new Error('network'));await opening;
    expect(h.page.paymentNotice.value).toBe('query');expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.payments).toHaveLength(0);
    expect(h.orders.orders[0].status).toBe('placed');
  });
  it('routes a promoted original back to its own command checkout, without using ordinary pay',async()=>{
    const h=await pending(),opening=h.page.requestPendingPayment();await settle();h.requests[1].resolve(list([{...placed,promotionQuoteId:'QUOTE-ORIGINAL',subtotalUsdt:'19.900000',discountUsdt:'0.000000',amountUsdt:'19.900000'}]));await opening;
    expect(h.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/checkout?orderNo=ORD-OLD');expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.payments).toHaveLength(0);expect(h.authorize).not.toHaveBeenCalled();
  });
  it.each(['cancelled','expired'])('does not resume a %s promoted original',async status=>{
    const h=await pending(),opening=h.page.requestPendingPayment();await settle();
    h.requests[1].resolve(list([{...placed,promotionQuoteId:'QUOTE-ORIGINAL',subtotalUsdt:'19.900000',discountUsdt:'0.000000',amountUsdt:'19.900000',canonicalStatus:status,orderStatus:status.toUpperCase(),paymentStatus:status.toUpperCase()}]));await opening;
    expect(h.navTo).not.toHaveBeenCalled();expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.page.paymentNotice.value).toBe('blocked');
    await h.page.handleWalletPayment();expect(h.authorize).not.toHaveBeenCalled();expect(h.payments).toHaveLength(0);
  });
  it('shows a paid promoted original as a result without restarting checkout',async()=>{
    const h=await pending(),opening=h.page.requestPendingPayment();await settle();
    h.requests[1].resolve(list([{...original,promotionQuoteId:'QUOTE-ORIGINAL',subtotalUsdt:'19.900000',discountUsdt:'0.000000',amountUsdt:'19.900000'}]));await opening;
    expect(h.page.paymentResultVisible.value).toBe(true);expect(h.navTo).not.toHaveBeenCalled();
    await h.page.handleWalletPayment();expect(h.authorize).not.toHaveBeenCalled();expect(h.payments).toHaveLength(0);
  });
  it('blocks an expired original and never requests PIN or projects automatic cancellation',async()=>{
    const h=await pending(),opening=h.page.requestPendingPayment();await settle();h.requests[1].resolve(list([{...placed,expiresAt:Date.now()-1}]));await opening;
    expect(h.page.paymentNotice.value).toBe('blocked');expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.orders.orders[0].status).toBe('placed');expect(h.authorize).not.toHaveBeenCalled();expect(h.payments).toHaveLength(0);
  });
  it('closes the method sheet before top-up and preserves the original order',async()=>{
    const h=await pending();h.page.paymentSheetOpen.value=true;h.page.topupPendingOrder();expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.navTo).toHaveBeenCalledWith('/pages/me/wallet-topup');expect(h.orders.orders[0].id).toBe('ORD-OLD');
  });
  it('requires another review when the original amount changes after the sheet opened',async()=>{
    const h=await pending();h.page.paymentSheetOpen.value=true;h.page.paymentSheetAmount.value=18;
    await h.page.handleWalletPayment();expect(h.page.paymentSheetOpen.value).toBe(false);expect(h.page.paymentNotice.value).toBe('query');expect(h.authorize).not.toHaveBeenCalled();expect(h.payments).toHaveLength(0);
  });
  it('cannot submit after the original deadline passes while the PIN dialog is open',async()=>{
    const h=await pending(),gate=deferred<void>();
    h.authorize.mockImplementation(async(_context,command,current)=>{await gate.promise;return current()?command({}):null;});
    const paying=h.page.handleWalletPayment();await settle();expect(h.payments).toHaveLength(0);
    h.orders.orders[0].expiresAt=Date.now()-1;gate.resolve();await paying;
    expect(h.payments).toHaveLength(0);expect(h.orders.orders[0].status).toBe('placed');expect(h.page.payingFromWallet.value).toBe(false);
  });
  it.each([['CAPACITY_REPLACEMENT_REQUIRED','slots are full'],['ORDER_PRODUCT_NOT_PAYABLE','not on sale'],['ORDER_MONTHLY_QUOTA_EXHAUSTED','quota']])('a definitive %s refusal names the reason, retires the key and keeps the order',async(code,reason)=>{
    const h=await pending(),paying=h.page.handleWalletPayment();await settle();
    h.payments[0].reject(new ApiError({kind:'business',message:code,status:409,code:409}));await paying;
    expect(h.page.paymentNotice.value).toBe('blocked');expect(h.page.paymentNoticeReason.value).toContain(reason);
    expect(h.page.orderAction.value).toBeNull();expect(h.orders.orders[0].status).toBe('placed');
  });
  it('an insufficient wallet refusal offers top-up and retires the key',async()=>{
    const h=await pending(),paying=h.page.handleWalletPayment();await settle();
    h.payments[0].reject(new ApiError({kind:'business',message:'ORDER_WALLET_INSUFFICIENT',status:409,code:409}));await paying;
    expect(h.page.orderAction.value).toBeNull();expect(h.page.paymentNotice.value).toBe('');
  });
  it.each(['closed','deadline','amount','quantity','hidden','account'] as const)('revalidates %s after PIN and before pay',async change=>{
    const h=await pending(),gate=deferred<void>();
    h.authorize.mockImplementation(async(_context,command,current)=>{await gate.promise;return current()?command({}):null;});
    const paying=h.page.handleWalletPayment();await settle();
    if(change==='closed')h.orders.orders[0].status='cancelled';
    else if(change==='deadline')h.orders.orders[0].expiresAt=Date.now()-1;
    else if(change==='amount')h.orders.orders[0].total=20;
    else if(change==='quantity')h.orders.orders[0].quantity=2;
    else if(change==='hidden')h.hide();
    else {h.account.bind('b');h.auth.accountId='b';h.orders.bindAccount('b');}
    gate.resolve();await paying;expect(h.payments).toHaveLength(0);expect(h.page.orderAction.value).toBeNull();
  });
});

describe("real order detail after catalogue runtime invalidation", () => {
  it('restores an unresolved payment fence across hide/show and only queries the original command',async()=>{
    const h=harness();h.requests[0].resolve(list([placed]));await settle();
    const paying=h.page.handleWalletPayment();await settle();h.payments[0].reject(new Error('timeout'));await paying;
    h.hide();h.show();await settle();
    expect(h.readPaymentCommand).toHaveBeenCalledWith({},'order-pay',`wallet-pay:${original.orderNo}`);
    expect(h.page.cancellable.value).toBe(false);expect(h.page.canPayFromWallet.value).toBe(false);
    expect(h.payments).toHaveLength(1);h.requests.at(-1)!.resolve(list([placed]));await settle();
  });
  it('recovers an already paid receipt without another PIN or payment and waits for activation readback',async()=>{
    const h=harness();h.requests[0].resolve(list([placed]));await settle();
    const paying=h.page.handleWalletPayment();await settle();h.payments[0].reject(new Error('timeout'));await paying;
    h.readPaymentCommand.mockResolvedValue({status:'SUCCEEDED',canResumeSameKey:false,receipt});
    const recovering=h.page.recoverOrderAction();await settle();
    expect(h.page.cancellable.value).toBe(false);expect(h.page.canPayFromWallet.value).toBe(false);
    h.requests.at(-1)!.resolve(list([original]));await recovering;
    expect(h.payments).toHaveLength(1);expect(h.page.orderAction.value).toBeNull();
  });
  it('NOT_SEEN allows only explicit original-key payment recovery and continues to block cancellation',async()=>{
    const h=harness();h.requests[0].resolve(list([placed]));await settle();
    const paying=h.page.handleWalletPayment();await settle();h.payments[0].reject(new Error('timeout'));await paying;
    h.readPaymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});
    const recovering=h.page.recoverOrderAction();await settle();h.requests.at(-1)!.resolve(list([placed]));await recovering;
    expect(h.page.canPayFromWallet.value).toBe(true);expect(h.page.cancellable.value).toBe(false);expect(h.payments).toHaveLength(1);
    const resumed=h.page.handleWalletPayment();await settle();expect(h.payments).toHaveLength(2);
    h.payments[1].reject(new Error('timeout'));await resumed;
    expect(h.request.mock.calls.filter(([args])=>(args as {method:string}).method==='POST').map(([args])=>(args as {idempotencyKey:string}).idempotencyKey))
      .toEqual([`wallet-pay:${original.orderNo}`,`wallet-pay:${original.orderNo}`]);
  });
  it.each(['cancelled','expired','paid','activated'])('a stale NOT_SEEN resume cannot pay after the authoritative original becomes %s',async status=>{
    const h=harness();h.requests[0].resolve(list([placed]));await settle();
    const paying=h.page.handleWalletPayment();await settle();h.payments[0].reject(new Error('timeout'));await paying;
    h.readPaymentCommand.mockResolvedValue({status:'NOT_SEEN',canResumeSameKey:true});
    const recovering=h.page.recoverOrderAction();await settle();h.requests.at(-1)!.resolve(list([placed]));await recovering;
    expect(h.page.resumePaymentAllowed.value).toBe(true);h.orders.orders[0].status=status as 'cancelled'|'expired'|'paid'|'activated';
    expect(h.page.canPayFromWallet.value).toBe(false);await h.page.handleWalletPayment();expect(h.payments).toHaveLength(1);
    expect(h.page.orderAction.value).not.toBeNull();
  });
  it('only a terminal REJECTED result retires the old payment intent before a reviewed new payment',async()=>{
    const h=harness();h.requests[0].resolve(list([placed]));await settle();
    const paying=h.page.handleWalletPayment();await settle();h.payments[0].reject(new Error('timeout'));await paying;
    h.readPaymentCommand.mockResolvedValue({status:'REJECTED',canResumeSameKey:false});
    const recovering=h.page.recoverOrderAction();await settle();h.requests.at(-1)!.resolve(list([placed]));await recovering;
    expect(h.page.orderAction.value).toBeNull();expect(h.payments).toHaveLength(1);
    const next=h.page.handleWalletPayment();await settle();expect(h.payments).toHaveLength(2);
    const keys=h.request.mock.calls.filter(([args])=>(args as {method:string}).method==='POST').map(([args])=>(args as {idempotencyKey:string}).idempotencyKey);
    expect(keys[0]).toBe(`wallet-pay:${original.orderNo}`);expect(keys[1]).not.toBe(keys[0]);
    h.payments[1].reject(new Error('timeout'));await next;
  });
  it.each(["WALLET", "FUTURE_CHANNEL"])("shows a customer label for refund channel %s", async channel => {
    const h = harness();
    h.requests.at(-1)!.resolve(list([{ ...original, refundChannel: channel, paymentStatus: "REFUNDED",
      orderStatus: "REFUNDED", activationStatus: "REFUNDED", canonicalStatus: "refunded",
      refundedAt: 3, refundAmountUsdt: 19.9, refundBillNo: "REFUND-OLD" }]));
    await settle();
    expect(h.page.refundChannelLabel.value).toBe(channel === "WALLET"
      ? en.promotion.wallet : en.orders.refundDetailsUnavailable);
    expect(h.page.refundChannelLabel.value).not.toBe(channel);
  });
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
    const prior = h.page.order.value;
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    expect(h.requests).toHaveLength(2);
    expect(h.orders.orders).toEqual([]);
    expect(h.page.order.value).toBe(prior);
    expect(h.page.cancellable.value).toBe(false);
    expect(h.page.canPayFromWallet.value).toBe(false);
    expect(h.page.showOrderNotFound.value).toBe(false);
    expect(h.page.showRemoteOrderLoading.value).toBe(false);
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
  it("keeps payment/cancellation mutually blocked after an unknown payment even when the latest order is placed", async () => {
    const h = harness();
    h.requests[0].resolve(list([placed])); await settle();
    expect(h.page.canPayFromWallet.value).toBe(true);
    const payment = h.page.handleWalletPayment();
    await settle();
    await h.page.handleWalletPayment();
    expect(h.payments).toHaveLength(1);
    remote.productCatalogApi.catalog.mockResolvedValueOnce(catalog);
    await refreshProductCatalog(true); await settle();
    h.requests[1].resolve(list([placed])); await settle();
    h.payments[0].reject(new Error("payment rejected")); await payment; await settle();
    expect(h.page.payingFromWallet.value).toBe(false);
    expect(h.page.canPayFromWallet.value).toBe(false);
    expect(h.page.cancellable.value).toBe(false);
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
    expect(h.page.showRemoteOrderLoading.value).toBe(false);
    expect(h.page.canPayFromWallet.value).toBe(false);
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
    await settle();
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


describe("order recovery support navigation", () => {
  const expired = { ...original, canonicalStatus: "expired", orderStatus: "EXPIRED", paymentStatus: "EXPIRED", activationStatus: "WAITING_PAYMENT", paidAt: null, activatedAt: null };
  async function recovery() { const h = harness(); h.requests[0].resolve(list([expired])); await settle(); expect(h.orders.orders[0]?.status).toBe("expired"); return h; }
  it("copies the actual recovery order before opening the advisor chat directly", async () => { const h = await recovery(); h.page.contactOrderSupport(); expect(h.clipboard).toHaveLength(1); expect(h.clipboard[0].data).toBe(original.orderNo); expect(h.navTo).not.toHaveBeenCalled(); h.clipboard[0].success(); await settle(); expect(h.navTo).toHaveBeenCalledExactlyOnceWith('/pages/support/chat?cid=ADVISOR-THREAD'); expect(h.payments).toHaveLength(0); });
  it("drops the chat route when the page leaves while it is being resolved", async () => { const h = await recovery(); h.page.contactOrderSupport(); h.clipboard[0].success(); h.hide(); await settle(); expect(h.navTo).not.toHaveBeenCalled(); });
  it("does not navigate when clipboard copy fails", async () => { const h = await recovery(); h.page.contactOrderSupport(); h.clipboard[0].fail?.(); expect(h.navTo).not.toHaveBeenCalled(); });
  it.each(["a", "b"])("rejects old clipboard success after account epoch binds %s", async account => { const h = await recovery(); h.page.contactOrderSupport(); h.account.bind(account); h.auth.accountId = account; h.orders.bindAccount(account); h.clipboard[0].success(); expect(h.navTo).not.toHaveBeenCalled(); });
  it.each(["hide", "unload"] as const)("rejects old clipboard success after page %s", async event => { const h = await recovery(); h.page.contactOrderSupport(); h[event](); h.clipboard[0].success(); expect(h.navTo).not.toHaveBeenCalled(); });
  it("does not revive a callback after leaving and returning to the same page", async () => { const h = await recovery(); h.page.contactOrderSupport(); h.hide(); h.show(); h.clipboard[0].success(); expect(h.navTo).not.toHaveBeenCalled(); });
  it("rejects old clipboard success after a different order id loads", async () => { const h = await recovery(); h.page.contactOrderSupport(); h.load('OTHER-ORDER'); h.clipboard[0].success(); expect(h.navTo).not.toHaveBeenCalled(); });
  it.each(["absent", "normal"])("does not copy or navigate for %s order state", async state => { const h = harness(); h.requests[0].resolve(list(state === "absent" ? [] : [original])); await settle(); h.page.contactOrderSupport(); expect(h.clipboard).toHaveLength(0); expect(h.navTo).not.toHaveBeenCalled(); });
});

it("legacy start=support selects new composition rather than loading an existing conversation", () => {
  const start = chatSource.indexOf("onLoad((q) => {");
  const end = chatSource.indexOf("// onShow/onHide track", start);
  const conversation = chatSource.slice(chatSource.indexOf("const conv = computed("), chatSource.indexOf("watch([cid,", chatSource.indexOf("const conv = computed(")));
  const code = ts.transpileModule(chatSource.slice(start, end) + conversation + "\nreturn conv;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let load!: (query: {start:string}) => void;
  const cid = ref(""), startType = ref<string|null>(null), get = vi.fn(() => ({id:"existing-server-conversation", messages:[]}));
  const dependencies = { computed, cid, startType, onLoad: (fn: typeof load) => { load=fn; }, convStore:{get}, humanHistory:ref([]), isAi:ref(false), initialPrompt:ref(""), hiddenAiRoute:ref(false), NOVA_SUPPORT_VISIBLE:true, navReplace:vi.fn() };
  const conv = new Function(...Object.keys(dependencies),code)(...Object.values(dependencies));
  load({start:"support"}); expect(startType.value).toBe("support"); expect(cid.value).toBe(""); expect(conv.value).toBeUndefined(); expect(get).not.toHaveBeenCalled();
});
