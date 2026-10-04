import ts from "typescript";
import * as vue from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./achievements.vue?raw";
import { readAchievementsForCurrentSession } from "./achievements-remote-read";
import { zh } from "@/i18n/messages/zh";
import { ApiError } from "@/api/errors";
import { fmt } from "@/i18n/format";

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const scopes: vue.EffectScope[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.useRealTimers(); });
const snapshot = (value = 1) => ({
  dailyMilestones: [{ milestoneId: 1, status: "CLAIMABLE" }],
  earningMilestones: [{ milestoneId: 2, status: "CLAIMABLE" }],
  badgeAchievements: [], streak: { currentStreak: value },
});
const row = (kind = "earning") => ({ kind, id: kind === "daily" ? 1 : 2, key: `${kind}:2`, status: "CLAIMABLE" });
const networkError = () => new ApiError({ kind: "network", message: "Synthetic error", retryable: true });

// Actual SFC worker and reader, real reactive watchers, synthetic IO only.
function mount() {
  const app = vue.reactive({ accountKey: "user:123", accountBindingEpoch: 1 });
  let session: { accessToken: string; user: { userId: number } } | null = { accessToken: "fixture", user: { userId: 123 } };
  const reads: ReturnType<typeof deferred>[] = [], claims: ReturnType<typeof deferred>[] = [];
  const state = vi.fn(() => { const pending = deferred(); reads.push(pending); return pending.promise; });
  const claim = vi.fn(() => { const pending = deferred(); claims.push(pending); return pending.promise; });
  const toast = { success: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const hooks: Record<string, Array<() => void>> = { show: [], hide: [], unmount: [] };
  let beforeDelivery: (() => void) | undefined;
  const modules: Record<string, unknown> = {
    vue: { ...vue, onUnmounted: (fn: () => void) => hooks.unmount.push(fn) },
    "@dcloudio/uni-app": { onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn) },
    "@/pages/daily/daily-reward-view": { dailyMilestoneRewardText: () => "", dailyRewardLabels: () => ({}) },
    "@/i18n/format": { fmt },
    "@/i18n/use-t": { useT: () => vue.ref(zh) }, "@/store/ui": { toast }, "@/store/app": { useApp: () => app },
    "@/store/achievements": { useAchievements: () => ({ records: [] }) },
    "@/lib/money-receipt": { postMoneyBillsOnce: () => { throw Error("Real money action forbidden"); } },
    "@/store/device-types": { isPurchasedHardwareKind: () => false }, "@/mock/achievements": { ACHIEVEMENTS: [] },
    "@/api/runtime": { remoteApiEnabled: true, sessionVault: { read: () => session }, pointsApi: { state, claimMilestone: claim, evaluateEarningMilestones: claim } },
    "./achievements-remote-read": {
      readAchievementsForCurrentSession: async (options: Parameters<typeof readAchievementsForCurrentSession>[0]) => {
        const result = await readAchievementsForCurrentSession(options);
        const delivery = beforeDelivery; beforeDelivery = undefined; delivery?.();
        return result;
      },
    },
  };
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  const output = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const scope = vue.effectScope(); scopes.push(scope);
  const worker = scope.run(() => new Function("require", "exports", output + ";return {refreshRemote,claimRemote,remoteSnapshot,remoteLoading,remoteError,remoteFailure,remoteBusy};")((name: string) => {
    if (name.endsWith(".vue")) return {};
    if (!(name in modules)) throw Error(`Unexpected dependency ${name}`);
    return modules[name];
  }, {}));
  const fire = (name: string) => hooks[name].forEach(fn => fn());
  const rebind = (other = false) => {
    if (other) { session = { accessToken: "other-fixture", user: { userId: 456 } }; app.accountKey = "user:456"; }
    app.accountBindingEpoch++;
  };
  return { app, worker, reads, claims, state, claim, toast, fire, rebind,
    session: (value: typeof session) => { session = value; },
    delivery: (fn: () => void) => { beforeDelivery = fn; },
  };
}
const invalidate = (h: ReturnType<typeof mount>, event: string) => {
  if (event === "account") h.rebind(true);
  else if (event === "rebind") h.rebind();
  else if (event === "hide-show") { h.fire("hide"); h.fire("show"); }
  else h.fire(event);
};
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe("achievements page request lifetime", () => {
  for (const event of ["account", "rebind", "hide", "hide-show", "unmount"]) {
    for (const failure of [false, true]) {
      it(`ignores old read ${failure ? "failure" : "success"} after ${event}`, async () => {
        const h = mount(); const pending = h.worker.refreshRemote(); const old = h.reads[0];
        invalidate(h, event); await vue.nextTick();
        const current = snapshot(7); h.worker.remoteSnapshot.value = current;
        h.worker.remoteError.value = false; h.worker.remoteFailure.value = null;
        const loading = h.worker.remoteLoading.value;
        failure ? old.reject(networkError()) : old.resolve(snapshot(1)); await pending;
        expect(h.worker.remoteSnapshot.value).toEqual(current);
        expect(h.worker.remoteError.value).toBe(false); expect(h.worker.remoteFailure.value).toBeNull();
        expect(h.worker.remoteLoading.value).toBe(loading); expect(h.toast.warn).not.toHaveBeenCalled();
      });
    }
  }
  for (const failure of [false, true]) {
    it(`rechecks the page after reader ${failure ? "failure" : "success"} delivery`, async () => {
      const h = mount(); h.delivery(() => h.fire("hide")); const pending = h.worker.refreshRemote();
      failure ? h.reads[0].reject(networkError()) : h.reads[0].resolve(snapshot()); await pending;
      expect(h.worker.remoteSnapshot.value).toBeNull(); expect(h.worker.remoteError.value).toBe(false);
      expect(h.worker.remoteLoading.value).toBe(false);
    });
  }
  it("shows a real retryable error then accepts a successful retry", async () => {
    const h = mount(); const first = h.worker.refreshRemote(); h.reads[0].reject(networkError()); await first;
    expect(h.worker.remoteError.value).toBe(true); expect(h.worker.remoteFailure.value).toBe("NETWORK");
    expect(h.worker.remoteLoading.value).toBe(false);
    const retry = h.worker.refreshRemote(); h.reads[1].resolve(snapshot()); await retry;
    expect(h.worker.remoteSnapshot.value).toEqual(snapshot()); expect(h.worker.remoteError.value).toBe(false);
    expect(h.worker.remoteFailure.value).toBeNull(); expect(h.worker.remoteLoading.value).toBe(false);
  });
  it("waits for a matching cold session and sends one points read", async () => {
    vi.useFakeTimers(); const h = mount(); h.session(null); const pending = h.worker.refreshRemote();
    expect(h.state).not.toHaveBeenCalled();
    h.session({ accessToken: "fixture", user: { userId: 123 } }); await vi.advanceTimersByTimeAsync(500);
    expect(h.state).toHaveBeenCalledTimes(1); h.reads[0].resolve(snapshot()); await pending;
    expect(h.worker.remoteSnapshot.value).toEqual(snapshot());
  });
  it("cancels cold restoration on hide without issuing a late request", async () => {
    vi.useFakeTimers(); const h = mount(); h.session(null); const pending = h.worker.refreshRemote(); h.fire("hide");
    h.session({ accessToken: "fixture", user: { userId: 123 } }); await vi.runAllTimersAsync(); await pending;
    expect(h.state).not.toHaveBeenCalled(); expect(h.worker.remoteLoading.value).toBe(false);
  });
  it("does not enter reads or claims while hidden or disposed", async () => {
    const h = mount(); h.fire("hide"); await h.worker.refreshRemote(); await h.worker.claimRemote(row());
    expect(h.state).not.toHaveBeenCalled(); expect(h.claim).not.toHaveBeenCalled();
    h.fire("unmount"); h.fire("show"); await h.worker.refreshRemote(); await h.worker.claimRemote(row());
    expect(h.state).not.toHaveBeenCalled(); expect(h.claim).not.toHaveBeenCalled();
  });
  for (const event of ["account", "rebind", "hide-show", "unmount"]) {
    for (const kind of ["daily", "earning"]) {
      for (const failure of [false, true]) {
        it(`isolates ${kind} claim ${failure ? "failure" : "receipt"} after ${event}`, async () => {
          const h = mount(); h.worker.remoteSnapshot.value = snapshot(); const pending = h.worker.claimRemote(row(kind));
          invalidate(h, event); await vue.nextTick(); h.worker.remoteSnapshot.value = snapshot(7);
          h.worker.remoteBusy.value = "new-current-operation"; const readCount = h.state.mock.calls.length;
          failure ? h.claims[0].reject(networkError()) : h.claims[0].resolve({ milestoneId: 1, fired: [{ milestoneId: 2 }] });
          await pending;
          expect(h.worker.remoteSnapshot.value).toEqual(snapshot(7)); expect(h.worker.remoteBusy.value).toBe("new-current-operation");
          expect(h.state).toHaveBeenCalledTimes(readCount); expect(h.toast.success).not.toHaveBeenCalled(); expect(h.toast.error).not.toHaveBeenCalled();
        });
      }
    }
  }
  for (const kind of ["daily", "earning"]) {
    it(`accepts current ${kind} receipt, prevents duplicate submission and refreshes`, async () => {
      const h = mount(); h.worker.remoteSnapshot.value = snapshot(); const pending = h.worker.claimRemote(row(kind));
      await h.worker.claimRemote(row(kind)); expect(h.claim).toHaveBeenCalledTimes(1);
      h.claims[0].resolve({ milestoneId: 1, fired: [{ milestoneId: 2 }] }); await flush();
      expect(h.toast.success).toHaveBeenCalledOnce(); expect(h.state).toHaveBeenCalledOnce();
      h.reads[0].resolve(snapshot(9)); await pending;
      expect(h.worker.remoteSnapshot.value).toEqual(snapshot(9)); expect(h.worker.remoteBusy.value).toBe("");
      expect(h.claim).toHaveBeenCalledWith(...(kind === "daily" ? [1, "h5-achievement-daily:1"] : ["h5-achievement-earning:2", "2"]));
    });
  }
});
