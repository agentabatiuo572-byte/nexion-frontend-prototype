import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./promotion-reward-list.vue?raw";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { rewardStateKey } from "@/lib/promotion-display";
import { en } from "@/i18n/messages/en";
import type { Reward, RewardState } from "@/api/promotion-api";
import type { RewardPage } from "@/api/promotion-contracts";

// Execute the complete production component setup; only API/store/platform
// boundaries are fixtures. Stale reads must never cross account or view epochs.
const script = compileScript(parse(source).descriptor, { id: "promotion-reward-list" });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const row = (id: string): Reward => ({ obligationId: id } as Reward);
const page = (ids: string[], cursor: string | null = null): RewardPage => ({ items: ids.map(row), nextCursor: cursor, hasMore: cursor !== null });
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); };
const cleanups: Array<() => void> = [];
type View = {
  rewards: Vue.Ref<Reward[]>; state: Vue.Ref<RewardState | null>; loading: Vue.Ref<boolean>;
  error: Vue.Ref<boolean>; hasMore: Vue.Ref<boolean>; sessionReady: Vue.ComputedRef<boolean>;
  load: (reset: boolean) => Promise<void>; chooseState: () => void;
};
function mount(ready = true, activate = true) {
  const app = Vue.reactive({ accountKey: ready ? "user:7" : "guest", accountBindingEpoch: 1 });
  const auth = Vue.reactive({ accountId: ready ? "user:7" : "guest", isAuthenticated: ready });
  const session = Vue.reactive({ userId: ready ? 7 : null as number | null });
  const props = Vue.reactive({ activityId: "", orderNo: "" });
  const rewards = vi.fn<(filters: Record<string, unknown>) => Promise<RewardPage>>().mockResolvedValue(page([]));
  const mounted: Array<() => void> = [], shown: Array<() => void> = [], hidden: Array<() => void> = [], unmounted: Array<() => void> = [];
  const showActionSheet = vi.fn();
  vi.stubGlobal("uni", { showActionSheet });
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn), onBeforeUnmount: (fn: () => void) => unmounted.push(fn) },
    "@dcloudio/uni-app": { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    "@/components/promotion/promotion-action.vue": { default: {} },
    "@/components/promotion/reward-rows.vue": { default: {} },
    "@/i18n/use-t": { useT: () => Vue.ref(en) },
    "@/store/app": { useApp: () => app }, "@/store/auth": { useAuth: () => auth },
    "@/api/runtime": { promotionApi: { rewards }, remoteApiEnabled: true,
      sessionVault: { read: () => session.userId === null ? null : ({ user: { userId: session.userId } }) } },
    "@/lib/binary-session-ready": { binarySessionReady },
    "@/lib/promotion-display": { rewardStateKey }, "@/lib/route": { navTo: vi.fn() },
  };
  const exports = { default: {} as { setup: (input: typeof props, context: { expose: () => void }) => View } };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected promotion list dependency: ${id}`);
    return modules[id];
  }, exports);
  const scope = Vue.effectScope();
  const view = scope.run(() => exports.default.setup(props, { expose() {} }))!;
  const hide = () => hidden.forEach(fn => fn()), show = () => shown.forEach(fn => fn());
  const unmount = () => { unmounted.forEach(fn => fn()); scope.stop(); };
  cleanups.push(unmount);
  const start = () => mounted.forEach(fn => fn());
  if (activate) start();
  function bind(userId: number) {
    session.userId = userId; auth.accountId = `user:${userId}`;
    auth.isAuthenticated = true; app.accountKey = `user:${userId}`;
  }
  return { view, app, auth, session, props, rewards, showActionSheet, bind, hide, show, unmount, start };
}
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); });

describe("promotion rewards shared by the existing category and legacy route", () => {
  it("does not present an empty result before its first remote read", async () => {
    const screen = mount(true, false);
    expect(screen.rewards).not.toHaveBeenCalled();
    expect(screen.view.loading.value).toBe(true);
    screen.start(); await flush();
    expect(screen.rewards).toHaveBeenCalledOnce();
    expect(screen.view.loading.value).toBe(false); expect(screen.view.error.value).toBe(false);
    expect(screen.view.rewards.value).toEqual([]);
  });

  it("waits for account restore before its protected read and starts once binding is ready", async () => {
    const screen = mount(false);
    expect(screen.view.sessionReady.value).toBe(false);
    expect(screen.rewards).not.toHaveBeenCalled();
    screen.bind(7); await flush();
    expect(screen.view.sessionReady.value).toBe(true);
    expect(screen.rewards).toHaveBeenCalledOnce();
    screen.show(); await flush();
    expect(screen.rewards).toHaveBeenCalledOnce();
  });

  it("ignores the former account's late failure and keeps the current account's rows", async () => {
    const screen = mount(false), old = deferred<RewardPage>(), current = deferred<RewardPage>();
    screen.rewards.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    screen.bind(7); screen.bind(8);
    current.resolve(page(["account-8"])); await flush();
    old.reject(new Error("old account unavailable")); await flush();
    expect(screen.view.rewards.value.map(item => item.obligationId)).toEqual(["account-8"]);
    expect(screen.view.error.value).toBe(false);
    expect(screen.view.loading.value).toBe(false);
  });

  it("rejects a late success after rebinding the same account", async () => {
    const screen = mount(false), old = deferred<RewardPage>(), current = deferred<RewardPage>();
    screen.rewards.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    screen.bind(7); screen.app.accountBindingEpoch++;
    old.resolve(page(["stale"])); await flush();
    expect(screen.view.rewards.value).toEqual([]);
    expect(screen.view.loading.value).toBe(true);
    current.resolve(page(["fresh"])); await flush();
    expect(screen.view.rewards.value.map(item => item.obligationId)).toEqual(["fresh"]);
  });

  it("clears hidden records and defers new-account reads until the page returns", async () => {
    const screen = mount(false), old = deferred<RewardPage>();
    screen.rewards.mockReturnValueOnce(old.promise);
    screen.bind(7); screen.hide(); screen.bind(8);
    old.resolve(page(["hidden-old"])); await flush();
    expect(screen.rewards).toHaveBeenCalledOnce();
    expect(screen.view.rewards.value).toEqual([]);
    expect(screen.view.loading.value).toBe(false);
    screen.rewards.mockResolvedValueOnce(page(["visible-new"])); screen.show(); await flush();
    expect(screen.rewards).toHaveBeenCalledTimes(2);
    expect(screen.view.rewards.value.map(item => item.obligationId)).toEqual(["visible-new"]);
  });

  it("passes both source filters through refresh and cursor pagination without duplicate appends", async () => {
    const screen = mount(false);
    screen.props.activityId = "campaign-A"; screen.props.orderNo = "order-A";
    screen.rewards.mockResolvedValueOnce(page(["first"], "cursor-1")); screen.bind(7); await flush();
    expect(screen.rewards).toHaveBeenLastCalledWith({ activityId: "campaign-A", orderNo: "order-A", cursor: null, limit: 20, state: undefined });
    const tail = deferred<RewardPage>(); screen.rewards.mockReturnValueOnce(tail.promise);
    const first = screen.view.load(false), duplicate = screen.view.load(false);
    expect(screen.rewards).toHaveBeenCalledTimes(2);
    expect(screen.rewards).toHaveBeenLastCalledWith({ activityId: "campaign-A", orderNo: "order-A", cursor: "cursor-1", limit: 20, state: undefined });
    tail.resolve(page(["second"])); await Promise.all([first, duplicate]);
    expect(screen.view.rewards.value.map(item => item.obligationId)).toEqual(["first", "second"]);
    expect(screen.view.hasMore.value).toBe(false);
    screen.props.orderNo = "order-B"; await flush();
    expect(screen.rewards).toHaveBeenLastCalledWith({ activityId: "campaign-A", orderNo: "order-B", cursor: null, limit: 20, state: undefined });
  });

  it("keeps failed reads distinct from a confirmed empty result and supports retry", async () => {
    const screen = mount(false);
    screen.rewards.mockRejectedValueOnce(new Error("unavailable")); screen.bind(7); await flush();
    expect(screen.view.error.value).toBe(true); expect(screen.view.loading.value).toBe(false);
    screen.rewards.mockResolvedValueOnce(page([])); await screen.view.load(true);
    expect(screen.view.error.value).toBe(false); expect(screen.view.rewards.value).toEqual([]);
  });

  it("uses translated state choices and fences an old account's pending action sheet", async () => {
    const screen = mount(); await flush(); screen.view.chooseState();
    const first = screen.showActionSheet.mock.calls[0][0];
    expect(first.itemList).toEqual([en.promotion.allStates, ...(["PENDING", "READY", "PROCESSING", "ISSUED", "RETRYABLE_FAILED", "OUTCOME_UNKNOWN", "CANCELLED", "REVERSAL_PENDING", "REVERSED", "MANUAL_REVIEW"] as RewardState[]).map(state => en.promotion[rewardStateKey(state)])]);
    first.success({ tapIndex: 4 }); await flush();
    expect(screen.view.state.value).toBe("ISSUED");
    expect(screen.rewards).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null, state: "ISSUED" }));
    screen.view.chooseState(); const stale = screen.showActionSheet.mock.calls[1][0]; screen.bind(8); await flush();
    const calls = screen.rewards.mock.calls.length; stale.success({ tapIndex: 1 }); await flush();
    expect(screen.rewards).toHaveBeenCalledTimes(calls);
    expect(screen.view.state.value).toBe("ISSUED");
  });

  it("drops pending results after unmount and stops watching account changes", async () => {
    const screen = mount(false), pending = deferred<RewardPage>();
    screen.rewards.mockReturnValueOnce(pending.promise); screen.bind(7); screen.unmount();
    pending.reject(new Error("late failure")); screen.bind(8); await flush();
    expect(screen.rewards).toHaveBeenCalledOnce(); expect(screen.view.error.value).toBe(false);
    expect(screen.view.rewards.value).toEqual([]);
  });
});
