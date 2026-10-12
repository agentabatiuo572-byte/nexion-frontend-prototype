// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { computed, effectScope, reactive, ref, watch } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { createRemoteOrdersRefresh, isInitialOrderReadLoading, orderListPanels, remoteCommerceRequestCurrent } from "@/lib/remote-commerce-refresh";

const source = readFileSync(new URL("./orders.vue", import.meta.url), "utf8");
const from = source.indexOf("const remoteOrderAvailability");
const to = source.indexOf('const ordersBackHref', from);
if (from < 0 || to < 0) throw new Error("Orders refresh lifecycle missing");
const implementation = ts.transpileModule(source.slice(from, to), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const disposals: Array<() => void> = [];
afterEach(() => { disposals.splice(0).forEach((dispose) => dispose()); });
const settled = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

function page() {
  const rows = ref<Array<{ id: string }>>([]);
  const clear = subscribeRuntimeRevision(() => { rows.value = []; });
  const ready = ref(true);
  const refreshRemote = vi.fn(async () => { rows.value = [{ id: "original-order" }]; });
  const hooks: Record<string, Array<() => void>> = { show: [], hide: [], dispose: [] };
  const deps = {
    computed, ref, watch, subscribeRuntimeRevision, createRemoteOrdersRefresh,
    isInitialOrderReadLoading, orderListPanels, remoteCommerceRequestCurrent,
    app: reactive({ accountKey: "user:607", accountBindingEpoch: 1 }),
    remoteApiEnabled: true, remoteSessionReady: ready, orderList: rows,
    orders: { refreshRemote, loadingMore: false, nextCursor: null },
    genesis: { syncRemote: async () => true, remoteAccountReadState: "ready" },
    t: ref({ headerTitles: {}, orders: {}, me: {} }),
    preserveOrdersOriginInH5: () => {},
    onShow: (callback: () => void) => hooks.show.push(callback),
    onHide: (callback: () => void) => hooks.hide.push(callback),
    onUnmounted: (callback: () => void) => hooks.dispose.push(callback),
  };
  const scope = effectScope();
  const state = scope.run(() => new Function(...Object.keys(deps), `${implementation}
    return { refreshOrders, orderPanels, remoteOrdersRefreshing };`)(...Object.values(deps)))!;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    hooks.dispose.forEach((callback) => callback());
    scope.stop();
    clear();
  };
  disposals.push(dispose);
  return { state, refreshRemote, hooks, ready, dispose };
}

describe("visible orders survive catalog revision invalidation", () => {
  it("re-reads the existing order after a later catalog response clears the store", async () => {
    const p = page();
    await p.state.refreshOrders();
    expect(p.state.orderPanels.value.mainPresentation).toBe("list");
    advanceRuntimeRevision();
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(2);
    expect(p.state.orderPanels.value.mainPresentation).toBe("list");
  });

  it("shows a retryable source failure instead of claiming the cleared list is empty", async () => {
    const p = page();
    await p.state.refreshOrders();
    p.refreshRemote.mockRejectedValueOnce(new Error("read failed"));
    advanceRuntimeRevision();
    await settled();
    expect(p.state.orderPanels.value.mainPresentation).toBe("partial");
    expect(p.state.orderPanels.value.showSourceOutage).toBe(true);
  });

  for (const staleOutcome of ["resolve", "reject"] as const) {
    it(`ignores an older read that later ${staleOutcome}s after the current read failed`, async () => {
      const p = page();
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const oldRead = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      p.refreshRemote.mockImplementationOnce(() => oldRead).mockRejectedValueOnce(new Error("current read failed"));
      const oldRefresh = p.state.refreshOrders();
      advanceRuntimeRevision();
      await settled();
      expect(p.state.orderPanels.value.mainPresentation).toBe("partial");
      if (staleOutcome === "resolve") resolve(); else reject(new Error("old read failed"));
      await oldRefresh;
      expect(p.state.orderPanels.value.mainPresentation).toBe("partial");
      expect(p.state.orderPanels.value.showSourceOutage).toBe(true);
      expect(p.state.remoteOrdersRefreshing.value).toBe(false);
    });
  }

  it("does not read for a hidden, unbound or disposed page", async () => {
    const p = page();
    await p.state.refreshOrders();
    p.hooks.hide.forEach((callback) => callback());
    advanceRuntimeRevision();
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(1);
    p.hooks.show.forEach((callback) => callback());
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(2);
    expect(p.state.orderPanels.value.mainPresentation).toBe("list");
    p.hooks.hide.forEach((callback) => callback());
    p.ready.value = false;
    p.hooks.show.forEach((callback) => callback());
    advanceRuntimeRevision();
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(2);
    p.dispose();
    p.ready.value = true;
    advanceRuntimeRevision();
    await settled();
    expect(p.refreshRemote).toHaveBeenCalledTimes(2);
  });
});
