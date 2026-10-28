import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  goalsApi: {
    list: vi.fn(),
    create: vi.fn(),
    recommendation: vi.fn(),
    setStatus: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => remote);

const { useGoals } = await import("./goals");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function recommendation(targetUsdt: number) {
  return {
    serverCanonical: true as const,
    source: "nx_product",
    sourceEnvironment: "PRODUCTION" as const,
    runId: "",
    purchaseRequired: true,
    productNo: `sku-${targetUsdt}`,
    productName: `Goal ${targetUsdt}`,
    dailyEarn: 10,
    price: 1000,
    requiredDaily: targetUsdt / 30,
    targetUsdt,
    days: 30,
  };
}

function snapshot(goals: Array<{ id: number; targetUsdt: number }> = []) {
  return {
    serverCanonical: true as const,
    source: "nx_earning_goal" as const,
    lifetimeEarningsUsdt: 0,
    goals: goals.map((goal) => ({
      ...goal,
      deadlineAt: 1_900_000_000_000,
      createdAt: 1_800_000_000_000,
      achieved: false,
      progressPct: 0,
      lifetimeEarningsUsdt: 0,
    })),
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  Object.values(remote.goalsApi).forEach((mock) => mock.mockReset());
  remote.goalsApi.list.mockResolvedValue({
    serverCanonical: true,
    source: "nx_earning_goal",
    lifetimeEarningsUsdt: 0,
    goals: [],
  });
});

describe("earning-goal remote safety", () => {
  it("coalesces duplicate saves into one idempotent create command", async () => {
    const create = deferred<{
      id: number; targetUsdt: number; deadlineAt: number; createdAt: number;
      achieved: boolean; progressPct: number; lifetimeEarningsUsdt: number;
    }>();
    remote.goalsApi.create.mockReturnValue(create.promise);
    const store = useGoals();
    const input = { targetUSDT: 1000, deadlineMs: 1_900_000_000_000, idempotencyKey: "goal-save-1" };

    const first = store.setGoal(input);
    const second = store.setGoal(input);

    expect(remote.goalsApi.create).toHaveBeenCalledTimes(1);
    create.resolve({ id: 8, targetUsdt: 1000, deadlineAt: input.deadlineMs, createdAt: 1_800_000_000_000,
      achieved: false, progressPct: 0, lifetimeEarningsUsdt: 0 });
    await Promise.all([first, second]);
    expect(store.goals).toHaveLength(1);
  });

  it("keeps the newest recommendation when responses arrive out of order", async () => {
    const oldResponse = deferred<ReturnType<typeof recommendation>>();
    const newResponse = deferred<ReturnType<typeof recommendation>>();
    remote.goalsApi.recommendation
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    const store = useGoals();

    const oldRequest = store.refreshRecommendation(1000, 1_900_000_000_000);
    const newRequest = store.refreshRecommendation(2000, 1_910_000_000_000);
    newResponse.resolve(recommendation(2000));
    await newRequest;
    oldResponse.resolve(recommendation(1000));
    await oldRequest;

    expect(store.recommendation?.targetUsdt).toBe(2000);
  });

  it("clears a previous purchasable recommendation while a replacement request is pending", async () => {
    const replacement = deferred<ReturnType<typeof recommendation>>();
    remote.goalsApi.recommendation
      .mockResolvedValueOnce(recommendation(1000))
      .mockReturnValueOnce(replacement.promise);
    const store = useGoals();

    await store.refreshRecommendation(1000, 1_900_000_000_000);
    const pending = store.refreshRecommendation(2000, 1_910_000_000_000);

    expect(store.recommendation).toBeNull();
    expect(store.recommendationStatus).toBe("loading");
    replacement.resolve(recommendation(2000));
    await pending;
  });

  it("keeps an impossible target distinct from a goals API outage", async () => {
    remote.goalsApi.recommendation.mockRejectedValueOnce(new Error("GOAL_NO_ELIGIBLE_PRODUCT"));
    const store = useGoals();

    await store.refreshRecommendation(100000, 1_900_000_000_000);

    expect(store.recommendation).toBeNull();
    expect(store.recommendationStatus).toBe("error");
    expect(store.recommendationError).toBe("GOAL_NO_ELIGIBLE_PRODUCT");
  });

  it("drops a recommendation that belongs to the previous account epoch", async () => {
    const oldResponse = deferred<ReturnType<typeof recommendation>>();
    remote.goalsApi.recommendation.mockReturnValueOnce(oldResponse.promise);
    const store = useGoals();

    const pending = store.refreshRecommendation(1000, 1_900_000_000_000);
    store.bindAccount("account-b");
    oldResponse.resolve(recommendation(1000));
    await pending;

    expect(store.recommendation).toBeNull();
  });

  it("keeps a fresh recommendation after the same account is rebound and an old request fails late", async () => {
    const oldResponse = deferred<ReturnType<typeof recommendation>>();
    const freshResponse = deferred<ReturnType<typeof recommendation>>();
    remote.goalsApi.recommendation.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(freshResponse.promise);
    const store = useGoals();
    store.bindAccount("account-a");

    const oldRequest = store.refreshRecommendation(1000, 1_900_000_000_000);
    store.bindAccount("account-a");
    const freshRequest = store.refreshRecommendation(2000, 1_910_000_000_000);
    freshResponse.resolve(recommendation(2000));
    await freshRequest;
    oldResponse.reject(new Error("old response failed"));
    await oldRequest;

    expect(store.recommendationStatus).toBe("ready");
    expect(store.recommendation?.targetUsdt).toBe(2000);
  });

  it("returns stale without mutating the new account after a save crosses an account switch", async () => {
    const create = deferred<{
      id: number; targetUsdt: number; deadlineAt: number; createdAt: number;
      achieved: boolean; progressPct: number; lifetimeEarningsUsdt: number;
    }>();
    remote.goalsApi.create.mockReturnValueOnce(create.promise);
    const store = useGoals();
    store.bindAccount("account-a");

    const pending = store.setGoal({
      targetUSDT: 1000, deadlineMs: 1_900_000_000_000, idempotencyKey: "goal-save-account-a",
    });
    store.bindAccount("account-b");
    create.resolve({ id: 8, targetUsdt: 1000, deadlineAt: 1_900_000_000_000, createdAt: 1_800_000_000_000,
      achieved: false, progressPct: 0, lifetimeEarningsUsdt: 0 });

    await expect(pending).resolves.toBe("stale");
    expect(store.goals).toEqual([]);
  });

  it("retains the last valid server snapshot when a refresh fails", async () => {
    remote.goalsApi.list.mockResolvedValueOnce({
      serverCanonical: true,
      source: "nx_earning_goal",
      lifetimeEarningsUsdt: 25,
      goals: [{
        id: 9,
        targetUsdt: 500,
        deadlineAt: 1_900_000_000_000,
        createdAt: 1_800_000_000_000,
        achieved: false,
        progressPct: 5,
      }],
    });
    const store = useGoals();
    await store.refresh();
    remote.goalsApi.list.mockRejectedValueOnce(new Error("temporary outage"));

    await store.refresh();

    expect(store.status).toBe("error");
    expect(store.goals).toHaveLength(1);
    expect(store.goals[0]?.id).toBe("9");
    expect(store.lifetimeEarningsUsdt).toBe(25);
  });

  it("does not let a pre-command list snapshot erase a current-scope saved goal", async () => {
    const oldList = deferred<ReturnType<typeof snapshot>>();
    remote.goalsApi.list.mockReturnValueOnce(oldList.promise);
    remote.goalsApi.create.mockResolvedValueOnce({
      id: 18, targetUsdt: 1000, deadlineAt: 1_900_000_000_000, createdAt: 1_800_000_000_000,
      achieved: false, progressPct: 0, lifetimeEarningsUsdt: 0,
    });
    const store = useGoals();

    const reading = store.refresh();
    await store.setGoal({ targetUSDT: 1000, deadlineMs: 1_900_000_000_000, idempotencyKey: "goal-save-race" });
    oldList.resolve(snapshot());
    await reading;

    expect(store.goals.map((goal) => goal.id)).toEqual(["18"]);
  });

  it("does not let a pre-command list snapshot restore a current-scope deleted goal", async () => {
    remote.goalsApi.list.mockResolvedValueOnce(snapshot([{ id: 9, targetUsdt: 500 }]));
    const store = useGoals();
    await store.refresh();
    const oldList = deferred<ReturnType<typeof snapshot>>();
    remote.goalsApi.list.mockReturnValueOnce(oldList.promise);
    remote.goalsApi.remove.mockResolvedValueOnce(undefined);

    const reading = store.refresh();
    await store.remove("9");
    oldList.resolve(snapshot([{ id: 9, targetUsdt: 500 }]));
    await reading;

    expect(store.goals).toEqual([]);
  });

  it("keeps a newer same-scope refresh when an older one fails late", async () => {
    const older = deferred<ReturnType<typeof snapshot>>();
    const newer = deferred<ReturnType<typeof snapshot>>();
    remote.goalsApi.list.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const store = useGoals();

    const oldRead = store.refresh();
    const newRead = store.refresh();
    newer.resolve(snapshot([{ id: 22, targetUsdt: 1000 }]));
    await newRead;
    older.reject(new Error("old read failed"));
    await oldRead;

    expect(store.status).toBe("ready");
    expect(store.goals.map((goal) => goal.id)).toEqual(["22"]);
  });
});

it("advances list-read evidence only on current actual success, never swallowed failures or writes",async()=>{
 const store=useGoals();await store.refresh();const revision=store.readSuccessRevision;
 remote.goalsApi.list.mockRejectedValueOnce(new Error("FORBIDDEN"));await store.refresh();
 expect(store.status).toBe("error");expect(store.readSuccessRevision).toBe(revision);
 const old=deferred<ReturnType<typeof snapshot>>();remote.goalsApi.list.mockReturnValueOnce(old.promise);const reading=store.refresh();
 remote.goalsApi.list.mockResolvedValue(snapshot([]));store.bindAccount("user:B");await store.ensure();
 const newest=store.readSuccessRevision;old.resolve(snapshot([{id:1,targetUsdt:500}]));await reading;
 expect(store.readSuccessRevision).toBe(newest);expect(store.goals).toEqual([]);
});

it.each(["success","failure"])("fences a coalesced old %s across a same-account rebind before current completion",async outcome=>{
 const store=useGoals();store.bindAccount("user:A");await store.ensure();
 const binding=store.captureReadBinding(),revision=store.readSuccessRevision;
 const old=deferred<ReturnType<typeof snapshot>>(),fresh=deferred<ReturnType<typeof snapshot>>();
 remote.goalsApi.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
 const calls=remote.goalsApi.list.mock.calls.length;const oldRead=store.ensure();const duplicate=store.ensure();expect(remote.goalsApi.list).toHaveBeenCalledTimes(calls+1);
 store.bindAccount("user:A");const newRead=store.ensure();expect(remote.goalsApi.list).toHaveBeenCalledTimes(calls+2);
 expect(store.captureReadBinding().epoch).toBeGreaterThan(binding.epoch);
 if(outcome==="success")old.resolve(snapshot([{id:1,targetUsdt:500}]));else old.reject(new Error("FORBIDDEN"));
 await Promise.all([oldRead,duplicate]);expect(store.readSuccessRevision).toBe(revision);expect(store.goals).toEqual([]);expect(store.status).toBe("loading");
 fresh.resolve(snapshot([]));await newRead;
 expect(store.readSuccessScope).toEqual(store.captureReadBinding());expect(store.readSuccessRevision).toBe(revision+1);expect(store.goals).toEqual([]);
});

import * as Vue from 'vue';
import {flush,mountEntry,slot} from '@/lib/entry-review.test-support';
import goalSource from '@/pages/me/goals.vue?raw';
import {zh} from '@/i18n/messages/zh';
import {fmt} from '@/i18n/format';
import {formatAmount,formatGroupedAmount} from '@/lib/amount-display';
it.each(['success','failure'])('actual Goals page refuses old coalesced %s across same-tick same-account rebind',async outcome=>{
 const store=useGoals();store.bindAccount('user:1');await store.ensure();remote.goalsApi.recommendation.mockResolvedValue({purchaseRequired:false});
 const app=Vue.reactive({accountKey:'user:1',accountBindingEpoch:1});const runtimeConfig=Vue.reactive({environment:'prod'});let actions:any;
 const page=mountEntry(goalSource.replace('</script>','import {capture} from "test:probe"; capture({refreshRemoteGoals,editorDisplayReady,onSave});\n</script>'),{
 'test:probe':{capture:(v:any)=>{actions=v;}},'@dcloudio/uni-app':{onShow:vi.fn(),onHide:vi.fn()},
 '@/components/app-chassis.vue':slot,'@/components/sub-page-header.vue':{default:{render:()=>null}},'@/components/me/goal-progress-bar.vue':{default:{render:()=>null}},
 '@/lib/amount-display':{formatAmount,formatGroupedAmount},'@/lib/route':{navReset:vi.fn()},'@/lib/brand-copy':{nexGridBrandText:(v:string)=>v},
 '@/i18n/use-t':{useT:()=>Vue.ref(zh)},'@/i18n/format':{fmt},'@/store/goals':{useGoals:()=>store},'@/store/app':{useApp:()=>app},'@/store/ui':{useUI:()=>({pushToast:vi.fn()})},'@/api/runtime':{remoteApiEnabled:true,apiRuntimeConfig:runtimeConfig},
 });await flush();expect(actions.editorDisplayReady.value).toBe(true);
 const old=deferred<ReturnType<typeof snapshot>>(),fresh=deferred<ReturnType<typeof snapshot>>();
 remote.goalsApi.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
 const previous=actions.refreshRemoteGoals();
 app.accountBindingEpoch++; // The page's synchronous watcher still sees the previous store binding.
 expect(actions.editorDisplayReady.value).toBe(false);
 store.bindAccount('user:1');const current=actions.refreshRemoteGoals();
 if(outcome==='success')old.resolve(snapshot([{id:9,targetUsdt:900}]));else old.reject(new Error('FORBIDDEN'));
 await previous;await flush();expect(actions.editorDisplayReady.value).toBe(false);expect(store.goals).toEqual([]);
 fresh.resolve(snapshot([]));await current;await flush();
 expect(actions.editorDisplayReady.value).toBe(true);expect(store.readSuccessScope).toEqual(store.captureReadBinding());
 runtimeConfig.environment="dev";expect(actions.editorDisplayReady.value).toBe(false);await actions.onSave();expect(remote.goalsApi.create).not.toHaveBeenCalled();page.unmount();
});
