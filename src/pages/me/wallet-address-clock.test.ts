// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import * as Vue from "vue";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { advanceMonotonicHighWater, projectServerNow, readTrustedMonotonicNowMs } from "@/lib/server-deadline-clock";

const source = readFileSync(new URL("./wallet-address-rebind.vue", import.meta.url), "utf8");
const start = source.indexOf("const mockNow = ref(mockServerNow());");
const end = source.indexOf("const freezeLeftMs = computed", start);
if (start < 0 || end <= start) throw new Error("Address page clock implementation missing");
const implementation = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const scopes: Vue.EffectScope[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function setup() {
  const hooks = { mount: [] as Array<() => void>, show: [] as Array<() => void>,
    hide: [] as Array<() => void>, unmount: [] as Array<() => void> };
  const clock = { now: 1000 };
  vi.stubGlobal("performance", { now: () => clock.now });
  const app = Vue.reactive({ accountKey: "A", accountBindingEpoch: 1 });
  const payout = Vue.reactive({
    serverClock: { serverNowEpochMs: 1_800_000_000_000, receivedMonotonicAt: 1000 } as
      { serverNowEpochMs: number; receivedMonotonicAt: number } | null,
    refreshRemote: vi.fn().mockResolvedValue(true),
  });
  const toast = { error: vi.fn() };
  const runtime = { epoch: 1 };
  let tick = () => {};
  const clear = vi.fn();
  const dependencies = {
    ref: Vue.ref, computed: Vue.computed, watch: Vue.watch, payout, app, toast,
    t: Vue.ref({ addrRebind: { startFailed: "Read failed" } }), payoutAddressServerEnabled: true,
    mockServerNow: () => Date.now(), readTrustedMonotonicNowMs, advanceMonotonicHighWater, projectServerNow,
    captureRuntimeRevision: () => runtime.epoch, isCurrentRuntimeRevision: (epoch: number) => epoch === runtime.epoch,
    onMounted: (fn: () => void) => hooks.mount.push(fn), onShow: (fn: () => void) => hooks.show.push(fn),
    onHide: (fn: () => void) => hooks.hide.push(fn), onUnmounted: (fn: () => void) => hooks.unmount.push(fn),
    setInterval: (fn: () => void) => { tick = fn; return 7; }, clearInterval: clear, resendTimer: undefined,
  };
  const execute = new Function(...Object.keys(dependencies), `${implementation}; return { projectedServerNow, retryRemoteSnapshot, remoteRefreshPending };`);
  const scope = Vue.effectScope(); scopes.push(scope);
  const page = scope.run(() => execute(...Object.values(dependencies))) as {
    projectedServerNow: Vue.ComputedRef<number | null>; retryRemoteSnapshot: () => Promise<void>;
    remoteRefreshPending: Vue.Ref<boolean>;
  };
  return { page, hooks, clock, app, payout, toast, runtime, tick: () => tick(), clear };
}

describe("address page server clock and read recovery", () => {
  it("renders retry instead of a change entry while time is unknown", async () => {
    const templateStart = source.indexOf('<view v-if="changeBlock === \'withdrawal-in-flight\'"');
    const templateEnd = source.indexOf("<!-- 历史地址", templateStart);
    expect(templateStart).toBeGreaterThan(0);
    expect(templateEnd).toBeGreaterThan(templateStart);
    const render = new Function("Vue", compile(source.slice(templateStart, templateEnd), {
      mode: "function", prefixIdentifiers: true,
    }).code)(Vue);
    for (const pending of [false, true]) {
      const html = await renderToString(Vue.createSSRApp({ render, setup: () => ({
        changeBlock: "time-unknown", remoteRefreshPending: pending,
        t: { addrRebind: { timeStatusUnavailable: "Time unavailable", refreshingStatus: "Refreshing", refreshTimeStatusCta: "Refresh time" } },
        blockBoxStyle: {}, warnTextStyle: {}, retryRemoteSnapshot() {},
      }) }));
      expect(html).toContain("Time unavailable");
      expect(html).toContain("nx-rebind-refresh-time");
      expect(html).toContain(`aria-disabled="${pending}"`);
      expect(html).toContain(pending ? "Refreshing" : "Refresh time");
      expect(html).not.toContain("nx-rebind-change-cta");
    }
  });

  it("executes the SFC clock independent of forward and backward device wall time", async () => {
    const s = setup(); s.hooks.mount[0](); await Promise.resolve();
    vi.spyOn(Date, "now").mockReturnValue(9_000_000_000_000);
    s.clock.now = 6000; s.tick();
    expect(s.page.projectedServerNow.value).toBe(1_800_000_005_000);
    vi.spyOn(Date, "now").mockReturnValue(0);
    s.clock.now = 2000; s.tick();
    expect(s.page.projectedServerNow.value).toBe(1_800_000_005_000);
  });

  it.each([undefined, { now: () => NaN }, { now: () => { throw new Error("clock lost"); } }])(
    "closes after clock loss and requires a new anchor to recover (%s)", async (broken) => {
      const s = setup(); s.hooks.mount[0](); await Promise.resolve();
      vi.stubGlobal("performance", broken); s.tick();
      expect(s.page.projectedServerNow.value).toBeNull();
      vi.stubGlobal("performance", { now: () => 50 }); s.tick();
      expect(s.page.projectedServerNow.value).toBeNull();
      s.payout.serverClock = { serverNowEpochMs: 1_800_000_010_000, receivedMonotonicAt: 50 };
      expect(s.page.projectedServerNow.value).toBe(1_800_000_010_000);
    },
  );

  it("resets the high-water mark when a fresh snapshot has a new clock origin", async () => {
    const s = setup(); s.hooks.mount[0](); await Promise.resolve();
    s.clock.now = 1_000_000; s.tick();
    s.clock.now = 10;
    s.payout.serverClock = { serverNowEpochMs: 1_800_000_001_000, receivedMonotonicAt: 10 };
    expect(s.page.projectedServerNow.value).toBe(1_800_000_001_000);
    s.clock.now = 9; s.tick();
    expect(s.page.projectedServerNow.value).toBeNull();
  });

  it("deduplicates reads and restores retry after false or rejected failures", async () => {
    const s = setup(); const first = deferred();
    s.payout.refreshRemote.mockReturnValueOnce(first.promise);
    s.hooks.show[0](); s.hooks.mount[0]();
    expect(s.payout.refreshRemote).toHaveBeenCalledTimes(1);
    expect(s.page.remoteRefreshPending.value).toBe(true);
    first.resolve(false); await first.promise; await Promise.resolve();
    expect(s.toast.error).toHaveBeenCalledTimes(1);
    expect(s.page.remoteRefreshPending.value).toBe(false);
    s.payout.refreshRemote.mockRejectedValueOnce(new Error("network"));
    await s.page.retryRemoteSnapshot();
    expect(s.toast.error).toHaveBeenCalledTimes(2);
    expect(s.page.remoteRefreshPending.value).toBe(false);
  });

  it("ignores a hidden page's failure without clearing the new visible request", async () => {
    const s = setup(); const old = deferred(); const fresh = deferred();
    s.payout.refreshRemote.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    s.hooks.mount[0](); s.hooks.hide[0](); s.hooks.show[0]();
    old.resolve(false); await old.promise; await Promise.resolve();
    expect(s.toast.error).not.toHaveBeenCalled();
    expect(s.page.remoteRefreshPending.value).toBe(true);
    fresh.resolve(true); await fresh.promise; await Promise.resolve();
    expect(s.page.remoteRefreshPending.value).toBe(false);
  });

  it.each(["account", "runtime", "unmount"] as const)("drops late read errors after %s changes", async (boundary) => {
    const s = setup(); const old = deferred(); s.payout.refreshRemote.mockReturnValueOnce(old.promise);
    s.hooks.mount[0]();
    if (boundary === "account") s.app.accountBindingEpoch += 1;
    if (boundary === "runtime") s.runtime.epoch += 1;
    if (boundary === "unmount") s.hooks.unmount[0]();
    old.reject(new Error("stale")); await old.promise.catch(() => {}); await Promise.resolve();
    expect(s.toast.error).not.toHaveBeenCalled();
    expect(s.page.remoteRefreshPending.value).toBe(false);
    if (boundary === "unmount") expect(s.clear).toHaveBeenCalledWith(7);
  });
});
