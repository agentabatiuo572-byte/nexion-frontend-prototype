import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./tradein-sheets.vue?raw";
import { createPassiveTabReadFixture } from "@/lib/passive-tab-read.test-support";
import { capturePassiveWriteRevision, invalidatePassiveTabReads } from "@/lib/passive-read-window";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";

const script = parse(source).descriptor.scriptSetup!.content;
const config = script.slice(script.indexOf("watch([() => app.accountKey, () => app.accountBindingEpoch],"),
  script.indexOf("// ───────────────────────── helpers"));
const targets = script.slice(script.indexOf("const remoteRetireLoadKey ="), script.indexOf("const retireView ="));
const code = ts.transpileModule(config + targets, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const enabledConfig = { enabled: true, requireHigherPrice: true, earlyAccessEnabled: false, earlyAccessLeadDays: 0 };
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(stop => stop()));
async function settle() { for (let index = 0; index < 12; index++) await Promise.resolve(); }
function page() {
  const account = createRemoteAccountEpoch("user:a"); account.bind("user:a");
  const app = reactive({ accountKey: "user:a", accountBindingEpoch: 1,
    devices: [{ id: "1209", rowVersion: 3, paidPriceUsdt: 2499 }] });
  const state = ref<Record<string, any>>({ kind: "none" });
  const props = reactive({ active: true });
  const apiRuntimeConfig = reactive({ environment: "dev", baseUrl: "https://test.invalid" });
  const passive = createPassiveTabReadFixture(() => JSON.stringify([account.snapshot(), app.accountBindingEpoch,
    apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl, capturePassiveWriteRevision()]));
  const mount: (() => void)[] = [];
  const deviceE3Api = {
    tradeinConfig: vi.fn().mockResolvedValue(enabledConfig),
    eligibility: vi.fn(targetProductNo => Promise.resolve({ enabled: true, eligible: true, targetProductNo,
      sources: [{ eligible: true, sourceDeviceId: 1209 }] })),
    quote: vi.fn((_: number, target: string) => Promise.resolve({ sourceDeviceId: 1209, sourceRowVersion: 3,
      targetProductNo: target, payableUsdt: 3000 })),
  };
  const deps = { ...passive, computed, ref, watch, nextTick, app, state, props, apiRuntimeConfig, deviceE3Api,
    remoteApiEnabled: true, purchaseMounted: true, remoteRetireRequest: 0,
    purchaseOpeningRead: null, purchaseReturn: null,
    canonicalTradeinConfig: ref<any>(null), canonicalTradeinConfigStatus: ref("loading"),
    canonicalQuote: ref(null), canonicalQuoteOrigin: ref(null), capacityCommandKey: ref(null),
    quoteRequestGeneration: ref(0), quoteLoading: ref(false),
    remoteRetireEligibleTargets: ref(new Set<string>()), remoteRetirePayables: ref(new Map<string, number>()),
    remoteRetirePending: ref(false), remoteRetireLoadError: ref(false), remoteRetireOrigin: ref(null),
    productCatalogState: reactive({ status: "ready" }), refreshProductCatalog: vi.fn(),
    PRODUCTS: [{ id: "stellarrack-p1", price: 4499 }],
    captureAccountScope: () => account.snapshot(), isCurrentAccountScope: (scope: ReturnType<typeof account.snapshot>) => account.isCurrent(scope),
    onMounted: (callback: () => void) => mount.push(callback),
  };
  const scope = effectScope();
  const actual = scope.run(() => new Function(...Object.keys(deps), code +
    ";return {loadCanonicalTradeinConfig,dispose:()=>{purchaseMounted=false}};")(...Object.values(deps)));
  cleanup.push(() => { actual.dispose(); scope.stop(); });
  const open = () => { state.value = { kind: "retire", oldDeviceId: "1209" }; };
  const close = () => { state.value = { kind: "none" }; };
  return { ...deps, actual, account, open, close, mount: () => mount.forEach(callback => callback()) };
}

describe("actual trade-in config startup and demanded recovery", () => {
  it("applies a current config despite successful read-only POSTs changing the passive revision", async () => {
    const p = page(), pending = deferred(); p.deviceE3Api.tradeinConfig.mockReturnValue(pending.promise);
    p.mount(); p.open();
    for (let index = 0; index < 12; index++) invalidatePassiveTabReads();
    pending.resolve(enabledConfig); await settle();
    expect(p.canonicalTradeinConfig.value).toEqual(enabledConfig);
    expect(p.deviceE3Api.tradeinConfig).toHaveBeenCalledTimes(1);
    expect(p.deviceE3Api.eligibility).toHaveBeenCalledExactlyOnceWith("stellarrack-p1");
    expect(p.remoteRetireEligibleTargets.value.has("stellarrack-p1")).toBe(true);
  });

  it("waits for the synchronous app binding and global account binding stack to finish", async () => {
    const p = page();
    p.app.accountBindingEpoch++; p.app.accountKey = "user:b";
    p.account.bind("user:b");
    await nextTick(); await settle(); p.open(); await settle();
    expect(p.canonicalTradeinConfig.value).toEqual(enabledConfig);
    expect(p.deviceE3Api.tradeinConfig).toHaveBeenCalledTimes(1);
    expect(p.deviceE3Api.eligibility).toHaveBeenCalledTimes(1);
  });

  it("recovers a failed startup config when the visible list is opened and shares an in-flight retry", async () => {
    const p = page(); p.deviceE3Api.tradeinConfig.mockRejectedValueOnce(new Error("startup unavailable"));
    p.mount(); await settle();
    const retry = deferred(); p.deviceE3Api.tradeinConfig.mockReturnValueOnce(retry.promise);
    p.open(); p.close(); p.open(); await settle();
    expect(p.deviceE3Api.tradeinConfig).toHaveBeenCalledTimes(2);
    retry.resolve(enabledConfig); await settle();
    expect(p.deviceE3Api.eligibility).toHaveBeenCalledTimes(1);
    expect(p.remoteRetireEligibleTargets.value.has("stellarrack-p1")).toBe(true);
  });

  it("continues when catalog and config become ready after the list was opened", async () => {
    const p = page(), pending = deferred();
    p.productCatalogState.status = "loading"; p.deviceE3Api.tradeinConfig.mockReturnValue(pending.promise);
    p.mount(); p.open();
    expect(p.deviceE3Api.eligibility).not.toHaveBeenCalled();
    p.productCatalogState.status = "ready"; pending.resolve(enabledConfig); await settle();
    expect(p.deviceE3Api.tradeinConfig).toHaveBeenCalledTimes(1);
    expect(p.deviceE3Api.eligibility).toHaveBeenCalledTimes(1);
  });

  it.each(["account", "binding", "environment"].flatMap(change => [
    { change, outcome: "success" }, { change, outcome: "failure" },
  ]))("does not let stale config $outcome replace the new $change", async ({ change, outcome }) => {
    const p = page(), old = deferred(); p.deviceE3Api.tradeinConfig.mockReturnValueOnce(old.promise);
    p.mount();
    if (change === "account") { p.app.accountKey = "user:b"; p.app.accountBindingEpoch++; p.account.bind("user:b"); }
    if (change === "binding") { p.app.accountBindingEpoch++; p.account.bind("user:a"); }
    if (change === "environment") p.apiRuntimeConfig.baseUrl = "https://other-test.invalid";
    await nextTick(); await settle();
    if (outcome === "success") old.resolve({ ...enabledConfig, enabled: false });
    else old.reject(new Error("old config unavailable"));
    await settle();
    expect(p.canonicalTradeinConfig.value).toEqual(enabledConfig);
    p.open(); await settle(); expect(p.deviceE3Api.eligibility).toHaveBeenCalledTimes(1);
  });

  it("does not start target requests while hidden or apply config after disposal", async () => {
    const p = page(), pending = deferred(); p.deviceE3Api.tradeinConfig.mockReturnValueOnce(pending.promise);
    p.props.active = false; p.mount(); p.open(); pending.resolve(enabledConfig); await settle();
    expect(p.deviceE3Api.eligibility).not.toHaveBeenCalled();
    p.props.active = true; await settle(); expect(p.deviceE3Api.eligibility).toHaveBeenCalledTimes(1);
    const gone = page(), late = deferred(); gone.deviceE3Api.tradeinConfig.mockReturnValueOnce(late.promise);
    gone.mount(); gone.actual.dispose(); late.resolve(enabledConfig); await settle();
    expect(gone.canonicalTradeinConfig.value).toBeNull();
  });

  it("keeps server-disabled trade-in closed", async () => {
    const p = page(); p.deviceE3Api.tradeinConfig.mockResolvedValueOnce({ ...enabledConfig, enabled: false });
    p.mount(); p.open(); await settle();
    expect(p.canonicalTradeinConfig.value?.enabled).toBe(false);
    expect(p.deviceE3Api.eligibility).not.toHaveBeenCalled(); expect(p.deviceE3Api.quote).not.toHaveBeenCalled();
  });
});
