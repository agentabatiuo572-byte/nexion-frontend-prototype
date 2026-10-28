import { compile } from "@vue/compiler-dom";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./live-social-proof.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { nexGridBrandText } from "@/lib/brand-copy";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { isTransientReadFailure } from "@/lib/remote-read-failure";
import { ApiError } from "@/api/errors";
import type { StorefrontSocialProof } from "@/api/storefront-activity-api";
import * as fixtures from "@/mock/storefront-social-proof";

const { descriptor } = parse(source);
const code = ts.transpileModule(compileScript(descriptor, { id: "proof-brand" }).content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code)(Vue);

// Execute the real setup, mounted read and template; adapt only the remote boundary.
type ProofExercise = {
  state: { remoteProof: Vue.Ref<StorefrontSocialProof | null>; remoteUnavailable: Vue.Ref<boolean> };
  tick: () => void; inView: Vue.Ref<boolean>; app: { accountKey: string };
  product: { id: string; stock: number; sold: number }; locale: Vue.Ref<typeof en>;
  flush: () => Promise<void>; html: () => Promise<string>;
};
async function proofView(copy: typeof en, name: string | null, theme: string, live = false,
  options: { read?: () => Promise<unknown>; exercise?: (context: ProofExercise) => Promise<void> } = {}) {
  const mounted: Array<() => void> = [];
  const unmounted: Array<() => void> = [];
  const snapshot = { productName: name, windowSales: 0, cumulativeSales: 7, windowDays: 30, ...(live ? { liveActivity: { viewers: 32, sales24h: 12, sales30m: 3 } } : {}) };
  let tick = () => {};
  const inView = Vue.ref(true);
  const socialProof = vi.fn(options.read ?? (() => name === null ? Promise.reject(new Error("unavailable")) : Promise.resolve(snapshot)));
  const app = Vue.reactive({ accountKey: "test-user" });
  const product = Vue.reactive({ id: "nexgridbox-pro-v2", stock: 3, sold: 7 });
  const locale = Vue.ref(copy);
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await Vue.nextTick(); };
  const imports: Record<string, unknown> = {
    vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn), onUnmounted: (fn: () => void) => unmounted.push(fn) },
    "@/i18n/use-t": { useT: () => locale }, "@/i18n/format": { fmt },
    "@/lib/brand-copy": { nexGridBrandText }, "@/lib/remote-account-epoch": { createRemoteAccountEpoch },
    "@/lib/remote-read-failure": { isTransientReadFailure },
    "@/api/runtime": { remoteApiEnabled: true, storefrontActivityApi: { socialProof } },
    "@/store/app": { useApp: () => app },
    "@/store/product-catalog": { productCatalogState: Vue.reactive({ status: "ready", source: "server", revision: 1 }) },
    "@/api/order-api": { captureRuntimeRevision: () => 1, isCurrentRuntimeRevision: () => true },
    "@/mock/storefront-social-proof": fixtures,
    "@/composables/use-scroll-grow-progress": { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView }) },
    "@/composables/use-tab-page-lifecycle": { useVisibleInterval: (fn: () => void) => { tick = fn; } },
  };
  const exports = { default: {} as { setup: (...args: unknown[]) => Record<string, unknown> } };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in imports)) throw new Error(`Unexpected social proof import: ${id}`);
    return imports[id];
  }, exports);
  const scope = Vue.effectScope();
  try {
    const state = scope.run(() => exports.default.setup({ product }, { expose() {} }))!;
    const html = () => renderToString(Vue.createSSRApp({ render, setup: () => Vue.proxyRefs({ ...state }) }));
    const loading = await html();
    mounted.forEach(fn => fn());
    await flush();
    if (options.exercise) await options.exercise({ state: state as ProofExercise["state"], tick, inView, app, product, locale, flush, html });
    else if (live) {
      inView.value = false; tick();
      expect(socialProof).toHaveBeenCalledTimes(1);
      inView.value = true; tick();
      await flush();
      expect(socialProof).toHaveBeenCalledTimes(2);
    }
    return { loading, body: `<main data-theme="${theme}">${await html()}</main>`, snapshot, socialProof };
  } finally {
    unmounted.forEach(fn => fn());
    scope.stop();
  }
}

for (const [locale, copy] of [["en", en], ["zh", zh], ["vi", vietnamese]] as const) {
  it(`${locale}: renders live activity supplied by the endpoint and polls only in view`, async () => {
    const result = await proofView(copy, "UVEL Box S1", "dark", true);
    for (const label of [copy.store.liveProof.viewingLabel, copy.store.liveProof.sold24hLabel, copy.store.liveProof.sold30mLabel]) expect(result.body).toContain(label);
    for (const count of [32, 12, 3]) expect(result.body).toContain(`>${count}</text>`);
  });
  for (const theme of ["light", "dark"]) {
    it(`${locale}/${theme}: renders the stored hero name without changing the snapshot, product key or counts`, async () => {
      const original = "NexGridBox Pro v2";
      const result = await proofView(copy, original, theme);
      expect(result.body).toContain(`aria-label="${original}"`);
      expect(result.body).toContain(copy.store.liveProof.cumulativeSalesLabel);
      expect(result.body).toContain(">7</text>");
      expect(result.body).toContain(">0</text>");
      expect(result.body).toContain(">3</text>");
      expect(result.snapshot.productName).toBe(original);
      expect(result.socialProof).toHaveBeenCalledExactlyOnceWith("nexgridbox-pro-v2", 30);
      expect(result.loading).toContain(`aria-label="${copy.store.liveProof.unavailableLabel}"`);
    });
  }
  it(`${locale}: preserves unavailable feedback and does not render sales after failed reads`, async () => {
    const result = await proofView(copy, null, "light");
    expect(result.body).toContain(`aria-label="${copy.store.liveProof.unavailableLabel}"`);
    expect(result.body).toContain(copy.store.liveProof.unavailableLabel);
    expect(result.body).not.toContain(copy.store.liveProof.cumulativeSalesLabel);
  });
}

it.each(["UVELBox Pro v2", "CloudShare", "Custom Compute Model"])("preserves other current product names: %s", async name => {
  expect((await proofView(en, name, "light")).body).toContain(`aria-label="${name}"`);
});

const recoveredProof = (viewers = 32) => ({ productName: "NexGrid stored name", windowSales: 2, cumulativeSales: 7, windowDays: 30,
  liveActivity: { viewers, sales24h: 12, sales30m: 3 } });

it.each([
  new ApiError({ kind: "network", message: "offline" }),
  new ApiError({ kind: "http", status: 503, message: "busy" }),
  new ApiError({ kind: "http", status: 429, message: "limited" }),
])("retains the confirmed visible snapshot through a temporary read failure and recovers (%s)", async cause => {
  const first = recoveredProof(), recovered = recoveredProof(55);
  const read = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(cause).mockResolvedValue(recovered);
  await proofView(en, first.productName, "light", true, { read, exercise: async f => {
    const before = await f.html();
    f.tick(); await f.flush();
    expect(f.state.remoteProof.value).toEqual(first); expect(f.state.remoteUnavailable.value).toBe(false);
    expect(await f.html()).toBe(before);
    f.inView.value = false;
    for (let i = 0; i < 8; i++) { f.tick(); await f.flush(); }
    expect(read).toHaveBeenCalledTimes(2);
    f.inView.value = true; f.tick(); await f.flush();
    expect(read).toHaveBeenCalledTimes(3); expect(f.state.remoteProof.value).toEqual(recovered);
    f.locale.value = zh; await f.flush();
    expect(await f.html()).toContain(zh.store.liveProof.viewingLabel);
    expect(await f.html()).toContain(first.productName); expect(read).toHaveBeenCalledTimes(3);
  } });
});

it.each([
  new ApiError({ kind: "auth", message: "login required" }),
  new ApiError({ kind: "http", status: 403, message: "forbidden" }),
  new ApiError({ kind: "business", code: 403, message: "forbidden" }),
  new ApiError({ kind: "protocol", message: "invalid response" }),
])("clears denied or invalid display before a later authorized read (%s)", async cause => {
  const read = vi.fn().mockResolvedValueOnce(recoveredProof()).mockRejectedValueOnce(cause).mockResolvedValue(recoveredProof(55));
  await proofView(en, "Stored name", "light", true, { read, exercise: async f => {
    f.tick(); await f.flush();
    expect(f.state.remoteProof.value).toBeNull(); expect(f.state.remoteUnavailable.value).toBe(true);
    expect(await f.html()).not.toContain('NexGrid stored name');
    f.tick(); await f.flush();
    expect(f.state.remoteProof.value?.liveActivity?.viewers).toBe(55); expect(read).toHaveBeenCalledTimes(3);
  } });
});

it("retries an initial failure only when visible and does not overlap pending reads", async () => {
  let resolve!: (value: unknown) => void;
  const read = vi.fn().mockRejectedValueOnce(new ApiError({ kind: "network", message: "offline" }))
    .mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await proofView(en, "Stored name", "light", true, { read, exercise: async f => {
    expect(f.state.remoteUnavailable.value).toBe(true);
    f.inView.value = false; f.tick(); await f.flush(); expect(read).toHaveBeenCalledTimes(1);
    f.inView.value = true; f.tick(); await f.flush();
    for (let i = 0; i < 8; i++) f.tick();
    expect(read).toHaveBeenCalledTimes(2);
    resolve(recoveredProof()); await f.flush();
    expect(f.state.remoteProof.value?.productName).toBe("NexGrid stored name");
  } });
});

it("rejects late account and product responses while allowing the new scope read", async () => {
  const pending: Array<(value: unknown) => void> = [];
  const read = vi.fn(() => new Promise(resolve => pending.push(resolve)));
  await proofView(en, "Stored name", "light", true, { read, exercise: async f => {
    f.tick(); expect(read).toHaveBeenCalledTimes(1);
    f.app.accountKey = "another-user"; await f.flush(); expect(read).toHaveBeenCalledTimes(2);
    pending[0](recoveredProof(11)); await f.flush(); expect(f.state.remoteProof.value).toBeNull();
    f.tick(); expect(read).toHaveBeenCalledTimes(2);
    f.product.id = "another-sku"; await f.flush(); expect(read).toHaveBeenCalledTimes(3);
    pending[1](recoveredProof(22)); await f.flush(); expect(f.state.remoteProof.value).toBeNull();
    pending[2](recoveredProof(33)); await f.flush(); expect(f.state.remoteProof.value?.liveActivity?.viewers).toBe(33);
  } });
});
