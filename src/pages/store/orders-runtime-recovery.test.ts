// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import { describe, expect, it } from "vitest";
import {
  createRemoteOrdersRefresh, isInitialOrderReadLoading, orderListPanels,
  remoteCommerceRequestCurrent,
} from "@/lib/remote-commerce-refresh";

const source = readFileSync(new URL("./orders.vue", import.meta.url), "utf8");
const start = source.indexOf("const remoteOrderAvailability");
const end = source.indexOf("const ordersBackHref", start);
const page = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) { await nextTick(); await Promise.resolve(); }
}

// Transport stand-ins implement the stores' account/runtime/generation fences.
// The actual page lifecycle and shared coordinator run unchanged.
function mount() {
  const scope = effectScope();
  const app = reactive({ accountKey: "user:A", accountBindingEpoch: 1 });
  const rows = ref<string[]>([]);
  const genesisState = ref("loading");
  const runtimeListeners = new Set<() => void>();
  const commerce: ReturnType<typeof deferred<string[]>>[] = [];
  const genesisReads: ReturnType<typeof deferred<boolean>>[] = [];
  let runtime = 0, commerceGeneration = 0, genesisGeneration = 0;
  let show = () => {}, hide = () => {};
  const unmounts: (() => void)[] = [];
  const snapshot = () => ({ key: app.accountKey, epoch: app.accountBindingEpoch, runtime });
  const current = (s: ReturnType<typeof snapshot>) => s.key === app.accountKey
    && s.epoch === app.accountBindingEpoch && s.runtime === runtime;
  const orders = {
    async refreshRemote() {
      const s = snapshot(), generation = ++commerceGeneration;
      const read = deferred<string[]>(); commerce.push(read);
      const data = await read.promise;
      if (current(s) && generation === commerceGeneration) rows.value = data;
    },
    loadingMore: false, nextCursor: null,
  };
  const genesis = {
    get remoteAccountReadState() { return genesisState.value; },
    async syncRemote() {
      const s = snapshot(), generation = ++genesisGeneration;
      const read = deferred<boolean>(); genesisReads.push(read); genesisState.value = "loading";
      const ok = await read.promise;
      if (!current(s) || generation !== genesisGeneration) return false;
      genesisState.value = ok ? "ready" : "unavailable";
      return ok;
    },
  };
  const result = scope.run(() => new Function(
    "computed", "ref", "watch", "app", "orders", "genesis", "remoteSessionReady", "remoteApiEnabled",
    "orderList", "t", "createRemoteOrdersRefresh", "isInitialOrderReadLoading", "orderListPanels",
    "remoteCommerceRequestCurrent", "captureRuntimeRevision", "isCurrentRuntimeRevision",
    "subscribeRuntimeRevision", "onShow", "onHide", "onUnmounted", "preserveOrdersOriginInH5",
    `${page}\nreturn { remoteOrdersResolved, remoteOrdersRefreshing, remoteOrderAvailability,
      commerceOrdersUnavailable, genesisOrdersUnavailable, orderPanels };`,
  )(
    computed, ref, watch, app, orders, genesis, ref(true), true, computed(() => rows.value),
    { value: { headerTitles: {}, me: {}, orders: {} } }, createRemoteOrdersRefresh,
    isInitialOrderReadLoading, orderListPanels, remoteCommerceRequestCurrent,
    () => ({ epoch: runtime }), (s: { epoch: number }) => s.epoch === runtime,
    (fn: () => void) => { runtimeListeners.add(fn); return () => runtimeListeners.delete(fn); },
    (fn: () => void) => { show = fn; }, (fn: () => void) => { hide = fn; },
    (fn: () => void) => unmounts.push(fn), () => {},
  ))!;
  return {
    app, rows, result, commerce, genesisReads, show, hide,
    advance() {
      runtime += 1; commerceGeneration += 1; rows.value = [];
      runtimeListeners.forEach((fn) => fn());
    },
    finish(index: number, data = ["original-order"], genesisOk = true) {
      commerce[index].resolve(data); genesisReads[index].resolve(genesisOk);
    },
    get listenerCount() { return runtimeListeners.size; },
    unmount() { unmounts.forEach((fn) => fn()); scope.stop(); },
  };
}

describe("orders visible runtime recovery", () => {
  for (const commerceCommitted of [false, true]) {
    it(`reloads once after catalog invalidation ${commerceCommitted ? "after commerce commit" : "before responses"}`, async () => {
      const h = mount();
      try {
        h.show();
        if (commerceCommitted) {
          h.commerce[0].resolve(["original-order"]); await settle();
          expect(h.rows.value).toEqual(["original-order"]);
        }
        h.advance(); await settle();
        expect(h.commerce).toHaveLength(2);
        h.finish(0); await settle();
        expect(h.result.remoteOrdersResolved.value).toBe(false);
        expect(h.result.genesisOrdersUnavailable.value).toBe(false);
        h.finish(1); await settle();
        expect(h.rows.value).toEqual(["original-order"]);
        expect(h.result.remoteOrderAvailability.value).toBe("ready");
        expect(h.result.orderPanels.value.mainPresentation).toBe("list");
        expect(h.commerce).toHaveLength(2);
      } finally { h.unmount(); }
    });
  }

  it("keeps commerce rows beside a real Genesis failure without automatic retry", async () => {
    const h = mount();
    try {
      h.show(); h.finish(0, ["original-order"], false); await settle();
      expect(h.result.remoteOrderAvailability.value).toBe("partial");
      expect(h.result.genesisOrdersUnavailable.value).toBe(true);
      expect(h.result.commerceOrdersUnavailable.value).toBe(false);
      expect(h.result.orderPanels.value.mainPresentation).toBe("list");
      expect(h.rows.value).toEqual(["original-order"]);
      expect(h.commerce).toHaveLength(1);
    } finally { h.unmount(); }
  });

  it("never publishes the old account response over the new binding", async () => {
    const h = mount();
    try {
      h.show(); h.app.accountKey = "user:B"; h.app.accountBindingEpoch += 1; await settle();
      expect(h.commerce).toHaveLength(2);
      h.finish(0, ["account-A"]); await settle();
      expect(h.rows.value).toEqual([]);
      expect(h.result.remoteOrdersResolved.value).toBe(false);
      h.finish(1, ["account-B"]); await settle();
      expect(h.rows.value).toEqual(["account-B"]);
      expect(h.result.remoteOrderAvailability.value).toBe("ready");
    } finally { h.unmount(); }
  });

  it("coalesces a burst, skips queued reads after hide, and unsubscribes on unmount", async () => {
    const h = mount();
    h.show(); h.advance(); h.advance(); await settle();
    expect(h.listenerCount).toBe(1);
    expect(h.commerce).toHaveLength(2);
    h.advance(); h.hide(); await settle();
    expect(h.commerce).toHaveLength(2);
    h.finish(0); h.finish(1); await settle();
    expect(h.result.remoteOrdersResolved.value).toBe(false);
    expect(h.result.remoteOrdersRefreshing.value).toBe(false);
    expect(h.result.genesisOrdersUnavailable.value).toBe(false);
    h.unmount();
    expect(h.listenerCount).toBe(0);
    h.advance(); await settle();
    expect(h.commerce).toHaveLength(2);
  });
});
