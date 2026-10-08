import * as Vue from "vue";
import { compileTemplate, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rewardSource from "./promotion-reward-detail.vue?raw";
import billsSource from "../me/wallet-bills.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { binarySessionReady } from "@/lib/binary-session-ready";
import type { WalletBillRow, WalletBillsSnapshot } from "@/api/wallet-bills-api";

const remote = vi.hoisted(() => ({ fundsServerEnabled: true,
  walletBillsApi: { list: vi.fn(), summary: vi.fn() } }));
vi.mock("@/api/runtime", () => remote);
const { useBills } = await import("@/store/bills");
const disposals: (() => void)[] = [];
const vueDependencies = { ref: Vue.ref, computed: Vue.computed, watch: Vue.watch, nextTick: Vue.nextTick };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 8; i++) await Vue.nextTick(); }
function evaluate<T>(source: string, dependencies: Record<string, unknown>, exposed: string): T {
  const script = parse(source).descriptor.scriptSetup!.content.replace(/import[\s\S]*?from\s*["'][^"']+["'];?/g, "");
  const code = ts.transpileModule(`${script}\nreturn {${exposed}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const scope = Vue.effectScope(); disposals.push(() => scope.stop());
  return scope.run(() => new Function(...Object.keys(dependencies), code)(...Object.values(dependencies))) as T;
}
function lifecycle() {
  const hooks = { load: [] as ((options: Record<string, string>) => void)[], show: [] as (() => void)[],
    hide: [] as (() => void)[], unmount: [] as (() => void)[] };
  return { hooks, deps: { onLoad: (fn: typeof hooks.load[number]) => hooks.load.push(fn),
    onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn),
    onBeforeUnmount: (fn: () => void) => hooks.unmount.push(fn) } };
}
const row = (id: string, bizNo: string, asset: "USDT" | "NEX" = "USDT"): WalletBillRow => ({
  id, bizNo, bizType: "PROMOTION_REWARD", asset, direction: "IN", amount: 0.000001,
  amountExact: "0.000001", balanceAfter: 999999999999.999999, balanceAfterExact: "999999999999.999999",
  status: "SUCCESS", remark: "private ledger note", createdAt: 1000,
});
function snapshot(rows: WalletBillRow[], cursor: string | null = null, page = 1): WalletBillsSnapshot {
  return { source: "server", sourceEnvironment: "PRODUCTION", bills: rows, page, pageSize: 50,
    total: 100, nextPage: cursor ? page + 1 : null, nextCursor: cursor };
}
function billsHarness(target = "R1:receipt + exact", query = "") {
  setActivePinia(createPinia()); const store = useBills(); store.bindAccount("user:7");
  const app = Vue.reactive({ accountKey: "user:7", accountBindingEpoch: 1 });
  const auth = Vue.reactive({ isAuthenticated: true, accountId: "user:7" });
  const life = lifecycle();
  const page = evaluate<{
    ledgerBizNo: Vue.Ref<string>; filtered: Vue.ComputedRef<ReturnType<typeof useBills>["bills"]>;
    locatingReceipt: Vue.Ref<boolean>; initialLoading: Vue.ComputedRef<boolean>; initialError: Vue.ComputedRef<boolean>;
    showManualLoadMore: Vue.ComputedRef<boolean>; tab: Vue.Ref<"all" | "in" | "out">; refreshLedger(): Promise<void>;
  }>(billsSource, { ...vueDependencies, ...life.deps, useT: () => Vue.ref(en), useApp: () => app, useAuth: () => auth,
    useBills: () => store, useCourseRewardTitles: () => Vue.ref({}), useDeposits: () => ({ records: [] }),
    fundsServerEnabled: true, sessionVault: { read: () => ({ user: { userId: Number(auth.accountId.slice(5)) } }) },
    binarySessionReady, useManualScrollLoadMore: vi.fn(), takeNavigationQuery: () => query,
    dateLocale: () => "en", navTo: vi.fn(),
  }, "ledgerBizNo, filtered, locatingReceipt, initialLoading, initialError, showManualLoadMore, tab, refreshLedger");
  life.hooks.load.forEach(fn => fn(target ? { ledgerBizNo: target } : {}));
  disposals.push(() => store.$dispose());
  return { page, app, auth, store, ...life };
}
function rewardHarness(options: Record<string, string> = {}, query = "") {
  const app = Vue.reactive({ accountKey: "user:7", accountBindingEpoch: 1 });
  const life = lifecycle(); const reward = vi.fn(), referral = vi.fn(), navTo = vi.fn();
  const page = evaluate<{
    reward: Vue.Ref<Record<string, unknown> | null>; progress: Vue.Ref<unknown>; loading: Vue.Ref<boolean>;
    error: Vue.Ref<boolean>; p: Vue.ComputedRef<typeof en.promotion>; id: string; load(): Promise<void>;
  }>(rewardSource, { ...vueDependencies, ...life.deps, useT: () => Vue.ref(en), useApp: () => app,
    useLocaleStore: () => ({ code: "en" }), useSetPageHeader: vi.fn(), navTo,
    takeNavigationQuery: () => query, promotionApi: { reward, referral },
    localized: (title: { en: string }) => title.en, displayDeadline: () => "",
  }, "reward, progress, loading, error, p, get id(){return id;}, load, navTo, locale, localized, displayDeadline");
  return { page, app, reward, referral, navTo, ...life,
    start: () => life.hooks.load.forEach(fn => fn(options)) };
}
const rewardItem = { obligationId: "OB-1", activityId: "A1", beneficiaryRole: "BUYER", state: "ISSUED", orderNo: "ORD-1",
  updatedAt: "2026-10-08T00:00:00Z", disclosure: { title: { en: "Reward" } },
  assetReceipt: { ledgerBizNo: "R1:receipt + exact", deviceIds: [], instanceNos: [], issuedAt: null } };

async function renderReward(page: ReturnType<typeof rewardHarness>["page"], click?: string) {
  const template = compileTemplate({ source: parse(rewardSource).descriptor.template!.content, filename: "promotion-reward-detail.vue", id: "receipt-flow",
    compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } });
  const module = { exports: {} as { render: Vue.ComponentOptions["render"] } };
  const code = ts.transpileModule(template.code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", code)((name: string) => {
    if (name !== "vue") throw new Error(`Unknown template dependency ${name}`); return Vue;
  }, module, module.exports);
  function textContent(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(textContent).join("");
    return Vue.isVNode(value) ? textContent(value.children) : "";
  }
  function visit(value: unknown): void {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!Vue.isVNode(value)) return;
    if (click && value.props?.onClick && textContent(value).includes(click)) value.props.onClick();
    visit(value.children);
  }
  const chassis = Vue.defineComponent({ setup: (_props, { slots }) => () => {
    const children = slots.default?.(); visit(children); return Vue.h("main", children);
  } });
  const empty = Vue.defineComponent(() => () => null);
  return renderToString(Vue.createSSRApp({ setup: () => page, render: module.exports.render,
    components: { AppChassis: chassis, RewardRows: empty, DisclosureDetails: empty } }));
}

beforeEach(() => {
  remote.walletBillsApi.list.mockReset(); remote.walletBillsApi.summary.mockReset().mockResolvedValue({ recentNexBills: [] });
});
afterEach(() => { disposals.splice(0).forEach(fn => fn()); });

describe("promotion receipt exact wallet lookup", () => {
  it.each(["USDT", "NEX"] as const)("finds only the exact server receipt on a later page and keeps %s decimals", async asset => {
    const first = deferred<WalletBillsSnapshot>(), second = deferred<WalletBillsSnapshot>();
    remote.walletBillsApi.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const h = billsHarness(); const read = h.page.refreshLedger();
    expect(h.page.initialLoading.value).toBe(true);
    first.resolve(snapshot([{ ...row("near", "R1:receipt + exact-REV"), publicReference: "R1:receipt + exact" }], "c1"));
    await settle();
    expect(remote.walletBillsApi.list).toHaveBeenCalledWith(2, 50, { cursor: "c1" });
    expect(h.page.filtered.value).toEqual([]); expect(h.page.initialLoading.value).toBe(true);
    second.resolve(snapshot([row("actual", "R1:receipt + exact", asset)], "c2", 2)); await read;
    expect(h.page.filtered.value.map(b => b.id)).toEqual(["actual"]);
    expect(h.page.filtered.value[0]).toMatchObject({ ledgerBizNo: "R1:receipt + exact", ref: undefined,
      amountExact: "0.000001", balanceAfterExact: "999999999999.999999", symbol: asset });
    expect(h.page.initialLoading.value).toBe(false); expect(h.page.showManualLoadMore.value).toBe(false);
    expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(2);
  });
  it("uses the retained navigation query and reaches a proven empty result without guessed matches", async () => {
    remote.walletBillsApi.list.mockResolvedValueOnce(snapshot([row("near", "same-prefix")]));
    const h = billsHarness("", "ledgerBizNo=same"); await h.page.refreshLedger();
    expect(h.page.ledgerBizNo.value).toBe("same"); expect(h.page.filtered.value).toEqual([]);
    expect(h.page.initialError.value).toBe(false); expect(h.page.initialLoading.value).toBe(false);
  });
  it("shows a later-page failure and retries without exposing unrelated rows", async () => {
    remote.walletBillsApi.list.mockResolvedValueOnce(snapshot([row("near", "other")], "c1"))
      .mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(snapshot([row("actual", "R1:receipt + exact")]));
    const h = billsHarness(); await h.page.refreshLedger();
    expect(h.page.initialError.value).toBe(true); expect(h.page.filtered.value).toEqual([]);
    await h.page.refreshLedger(); expect(h.page.initialError.value).toBe(false);
    expect(h.page.filtered.value[0].id).toBe("actual");
  });
  it.each(["hide", "unmount"] as const)("stops pagination after page %s even when the first page returns late", async hook => {
    const first = deferred<WalletBillsSnapshot>(); remote.walletBillsApi.list.mockReturnValue(first.promise);
    const h = billsHarness(); const read = h.page.refreshLedger(); h.hooks[hook].forEach(fn => fn());
    first.resolve(snapshot([row("near", "other")], "c1")); await read;
    expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(1); expect(h.page.locatingReceipt.value).toBe(false);
    await h.page.refreshLedger(); expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("rejects a previous account request across rebind (same account=%s)", async sameAccount => {
    const old = deferred<WalletBillsSnapshot>(), fresh = deferred<WalletBillsSnapshot>();
    remote.walletBillsApi.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const h = billsHarness(); const read = h.page.refreshLedger();
    h.store.bindAccount(sameAccount ? "user:7" : "user:8");
    if (!sameAccount) { h.app.accountKey = "user:8"; h.auth.accountId = "user:8"; }
    h.app.accountBindingEpoch++; await settle();
    expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(2);
    fresh.resolve(snapshot([])); await settle();
    old.resolve(snapshot([row("old-private", "R1:receipt + exact")], "old-cursor")); await read;
    expect(h.page.filtered.value).toEqual([]); expect(h.store.bills).toEqual([]);
    expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(2);
  });
  it("keeps ordinary bill tabs on their existing pagers without searching all history", async () => {
    remote.walletBillsApi.list.mockResolvedValue(snapshot([row("row-1", "receipt")], "c1"));
    const h = billsHarness(""); await h.page.refreshLedger();
    expect(remote.walletBillsApi.list).toHaveBeenCalledTimes(1); expect(h.page.filtered.value).toHaveLength(1);
    expect(h.page.showManualLoadMore.value).toBe(true);
    h.page.tab.value = "out"; await settle();
    expect(remote.walletBillsApi.list).toHaveBeenLastCalledWith(1, 50, { direction: "OUT", cursor: "start" });
  });
});

describe("reward detail missing ID and account-safe receipt", () => {
  it.each(["", "   "])("shows a clear failure and a working return for absent ID '%s'", async obligationId => {
    const h = rewardHarness({ obligationId }); h.start();
    expect(h.page.error.value).toBe(true); expect(h.page.loading.value).toBe(false);
    expect(h.reward).not.toHaveBeenCalled();
    for (const dict of [en, zh, vietnamese]) {
      const page = { ...h.page, p: Vue.computed(() => dict.promotion) };
      const html = await renderReward(page, dict.promotion.back);
      expect(html).toContain(dict.promotion.error); expect(html).toContain(dict.promotion.back);
      expect(html).not.toContain(dict.promotion.retry);
    }
    expect(h.navTo).toHaveBeenCalledWith("/pages/me/rewards-list?cat=promotion");
  });
  it("opens the exact escaped receipt from a successfully read reward", async () => {
    const h = rewardHarness({}, "obligationId=OB-1"); h.reward.mockResolvedValue(rewardItem); h.start(); await settle();
    expect(h.reward).toHaveBeenCalledWith("OB-1"); expect(h.page.reward.value).toEqual(rewardItem);
    await renderReward(h.page, en.promotion.viewBills);
    expect(h.navTo).toHaveBeenCalledWith("/pages/me/wallet-bills?ledgerBizNo=R1%3Areceipt%20%2B%20exact");
  });
  it("retains a retry after a real read failure and successfully rereads the same reward", async () => {
    const h = rewardHarness({ obligationId: "OB-1" }); h.reward.mockRejectedValueOnce(new Error("offline"));
    h.start(); await settle(); expect(h.page.error.value).toBe(true);
    const html = await renderReward({ ...h.page, id: "OB-1" }); expect(html).toContain(en.promotion.retry);
    h.reward.mockResolvedValueOnce(rewardItem); await h.page.load();
    expect(h.page.error.value).toBe(false); expect(h.page.reward.value).toEqual(rewardItem);
  });
  it("drops a previous epoch reward and referral response before revealing the new account", async () => {
    const old = deferred<typeof rewardItem>(), fresh = deferred<typeof rewardItem>();
    const progress = deferred<{ qualifyingOrders: number }>();
    const h = rewardHarness({ obligationId: "OB-1" }); h.reward.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    h.referral.mockReturnValue(progress.promise); h.start();
    old.resolve({ ...rewardItem, beneficiaryRole: "DIRECT_INVITER", activityId: "A1" }); await settle();
    h.app.accountKey = "user:8"; h.app.accountBindingEpoch++; await settle();
    expect(h.page.reward.value).toBeNull(); expect(h.page.progress.value).toBeNull();
    fresh.resolve(rewardItem); await settle(); progress.resolve({ qualifyingOrders: 77 }); await settle();
    expect(h.page.reward.value).toEqual(rewardItem); expect(h.page.progress.value).toBeNull();
  });
  it.each(["hide", "unmount"] as const)("does not reveal a reward arriving after %s", async hook => {
    const pending = deferred<typeof rewardItem>(); const h = rewardHarness({ obligationId: "OB-1" });
    h.reward.mockReturnValue(pending.promise); h.start(); h.hooks[hook].forEach(fn => fn());
    pending.resolve(rewardItem); await settle(); expect(h.page.reward.value).toBeNull();
  });
});
