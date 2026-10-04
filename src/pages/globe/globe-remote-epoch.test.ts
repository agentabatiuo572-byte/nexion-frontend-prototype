import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import globePage from "./globe.vue?raw";

const start = globePage.indexOf("const selected = ref");
const end = globePage.indexOf("// Procedural dot-map silhouette", start);
if (start < 0 || end < start) throw new Error("Globe lifecycle source is required");
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const projection = (id: string) => ({
  activeNodes: 1, activeJobs: 1, countryCount: 1,
  regions: [{ id, displayName: id, location: id, activeNodes: 1, activeJobs: 1, jobsPerHour: 1,
    latitude: 1, longitude: 1, isUserRegion: true }],
  source: "server" as const, generatedAt: "2026-09-09T00:00:00Z",
});

function actualGlobe() {
  const effects = effectScope();
  cleanups.push(() => effects.stop());
  const source = globePage.slice(start, end);
  const app = reactive({ accountKey: "user:U", accountBindingEpoch: 1, global: { activeDevices: 0, activeJobs: 0 } });
  const api = { list: vi.fn() };
  const show: Array<() => void> = [];
  const hide: Array<() => void> = [];
  const unmount: Array<() => void> = [];
  let activeRefresh: (() => unknown) | null = null;
  let runtimeEpoch = 1;
  const runtimeListeners = new Set<() => void>();
  const captureRuntimeRevision = () => ({ runId: null, epoch: runtimeEpoch });
  const subscribeRuntimeRevision = (listener: () => void) => {
    runtimeListeners.add(listener);
    return () => runtimeListeners.delete(listener);
  };
  const registerActivePageRefresh = (refresh: () => unknown) => {
    activeRefresh = refresh;
    return () => { if (activeRefresh === refresh) activeRefresh = null; };
  };
  const value = effects.run(() => new Function(
    "ref", "computed", "onMounted", "onUnmounted", "watch", "remoteApiEnabled", "app", "cfg", "publicStatsHealth", "REGIONS", "MOCK_GLOBE_FIXTURE_ID", "t", "fmt", "dateLocale", "networkRegionsApi", "registerActivePageRefresh", "onShow", "onHide", "setInterval", "clearInterval", "captureRuntimeRevision", "subscribeRuntimeRevision",
    `${ts.transpileModule(`${source}; return { loadRegions, selected, networkProjection, projectionStatus };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText}`,
  )(
    ref, computed, () => {}, (callback: () => void) => unmount.push(callback), watch, true, app,
    { config: { publicStats: {} }, syncFailed: false }, () => ({ devicesOk: true }), [], "fixture", ref({ globe: {} }),
    () => "", () => "en-US", api, registerActivePageRefresh, (callback: () => void) => show.push(callback), (callback: () => void) => hide.push(callback), () => 0, () => {}, captureRuntimeRevision, subscribeRuntimeRevision,
  )) as {
    loadRegions(): Promise<void>;
    selected: { value: { id: string } | null };
    networkProjection: { value: ReturnType<typeof projection> | null };
    projectionStatus: { value: string };
  };
  return { app, api, value, show, hide, unmount, activeRefresh: () => activeRefresh,
    runtimeListeners, advanceRuntime: () => { runtimeEpoch += 1; runtimeListeners.forEach((listener) => listener()); } };
}

describe("Globe remote projection account-epoch isolation", () => {
  it("rejects a same-account old success and starts one fresh epoch read", async () => {
    const page = actualGlobe();
    const old = deferred<ReturnType<typeof projection>>();
    const fresh = deferred<ReturnType<typeof projection>>();
    page.api.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldLoad = page.value.loadRegions();
    page.value.selected.value = { id: "old" };

    page.app.accountBindingEpoch += 1;
    await nextTick();
    expect(page.api.list).toHaveBeenCalledTimes(2);
    expect(page.value.selected.value).toBeNull();
    expect(page.value.networkProjection.value).toBeNull();

    old.resolve(projection("old"));
    await oldLoad;
    expect(page.value.networkProjection.value).toBeNull();
    expect(page.value.projectionStatus.value).toBe("loading");

    fresh.resolve(projection("fresh"));
    await Promise.resolve();
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("fresh");
    expect(page.value.projectionStatus.value).toBe("ready");
  });

  it("keeps the new epoch success when the old same-account request fails, and coalesces duplicate reads", async () => {
    const page = actualGlobe();
    const old = deferred<ReturnType<typeof projection>>();
    const fresh = deferred<ReturnType<typeof projection>>();
    page.api.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldLoad = page.value.loadRegions();

    page.app.accountBindingEpoch += 1;
    await nextTick();
    expect(page.api.list).toHaveBeenCalledTimes(2);
    const duplicate = page.value.loadRegions();
    expect(page.api.list).toHaveBeenCalledTimes(2);

    fresh.resolve(projection("fresh"));
    await duplicate;
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("fresh");
    expect(page.value.projectionStatus.value).toBe("ready");

    old.reject(new Error("old session unavailable"));
    await oldLoad;
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("fresh");
    expect(page.value.projectionStatus.value).toBe("ready");
  });

  it("coalesces repeated onShow reads and cannot revive the projection after unmount", async () => {
    const page = actualGlobe();
    const old = deferred<ReturnType<typeof projection>>();
    page.api.list.mockReturnValue(old.promise);

    page.show.forEach((callback) => callback());
    page.show.forEach((callback) => callback());
    expect(page.api.list).toHaveBeenCalledOnce();
    expect(page.activeRefresh()).not.toBeNull();

    page.unmount.forEach((callback) => callback());
    expect(page.activeRefresh()).toBeNull();
    old.resolve(projection("old"));
    await Promise.resolve();
    expect(page.value.networkProjection.value).toBeNull();
    expect(page.value.projectionStatus.value).toBe("loading");
  });

  it.each(["success", "failure"])("rejects old runtime %s without clearing the new in-flight read", async (outcome) => {
    const page = actualGlobe();
    const old = deferred<ReturnType<typeof projection>>();
    const fresh = deferred<ReturnType<typeof projection>>();
    page.api.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldLoad = page.value.loadRegions();
    page.value.selected.value = { id: "old" };
    page.advanceRuntime();
    expect(page.api.list).toHaveBeenCalledTimes(2);
    expect(page.value.selected.value).toBeNull();
    if (outcome === "success") old.resolve(projection("old"));
    else old.reject(new Error("old runtime failed"));
    await oldLoad;
    expect(page.value.networkProjection.value).toBeNull();
    expect(page.value.projectionStatus.value).toBe("loading");
    const joined = page.value.loadRegions();
    expect(page.api.list).toHaveBeenCalledTimes(2);
    fresh.resolve(projection("fresh"));
    await joined;
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("fresh");
    expect(page.value.projectionStatus.value).toBe("ready");
  });

  it("retries a synchronous reader throw", async () => {
    const page = actualGlobe();
    page.api.list.mockImplementationOnce(() => { throw new Error("reader unavailable"); })
      .mockResolvedValueOnce(projection("recovered"));
    await page.value.loadRegions();
    expect(page.value.projectionStatus.value).toBe("error");
    await page.value.loadRegions();
    expect(page.api.list).toHaveBeenCalledTimes(2);
    expect(page.value.projectionStatus.value).toBe("ready");
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("recovered");
  });

  it("preserves the current account snapshot on refresh failure and recovers on retry", async () => {
    const page = actualGlobe();
    page.api.list.mockResolvedValueOnce(projection("confirmed"))
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce(projection("recovered"));
    await page.value.loadRegions();
    await page.value.loadRegions();
    expect(page.value.projectionStatus.value).toBe("error");
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("confirmed");
    await page.value.loadRegions();
    expect(page.value.projectionStatus.value).toBe("ready");
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("recovered");
  });

  it.each(["before-show", "after-show"])("rejects pre-hide responses settling %s and reads afresh on return", async (timing) => {
    const page = actualGlobe();
    const old = deferred<ReturnType<typeof projection>>();
    const fresh = deferred<ReturnType<typeof projection>>();
    page.api.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    page.show.forEach((callback) => callback());
    const oldLoad = page.value.loadRegions();
    page.hide.forEach((callback) => callback());
    expect(page.activeRefresh()).toBeNull();
    await page.value.loadRegions();
    expect(page.api.list).toHaveBeenCalledOnce();
    if (timing === "before-show") {
      old.resolve(projection("old"));
      await oldLoad;
      expect(page.value.networkProjection.value).toBeNull();
    }
    page.show.forEach((callback) => callback());
    const joined = page.value.loadRegions();
    expect(page.api.list).toHaveBeenCalledTimes(2);
    if (timing === "after-show") {
      old.resolve(projection("old"));
      await oldLoad;
      expect(page.value.networkProjection.value).toBeNull();
      expect(page.value.loadRegions()).toBe(joined);
    }
    fresh.resolve(projection("fresh"));
    await joined;
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("fresh");
  });

  it("clears a hidden old-account snapshot without fetching until shown", async () => {
    const page = actualGlobe();
    page.api.list.mockResolvedValueOnce(projection("confirmed")).mockResolvedValueOnce(projection("fresh"));
    await page.value.loadRegions();
    page.hide.forEach((callback) => callback());
    page.app.accountBindingEpoch += 1;
    page.advanceRuntime();
    await nextTick();
    expect(page.value.networkProjection.value).toBeNull();
    expect(page.api.list).toHaveBeenCalledOnce();
    page.show.forEach((callback) => callback());
    await page.value.loadRegions();
    expect(page.api.list).toHaveBeenCalledTimes(2);
    expect(page.value.networkProjection.value?.regions[0]?.id).toBe("fresh");
  });

  it("unsubscribes on unmount and ignores queued refresh calls afterwards", async () => {
    const page = actualGlobe();
    page.api.list.mockResolvedValue(projection("confirmed"));
    await page.value.loadRegions();
    page.unmount.forEach((callback) => callback());
    page.show.forEach((callback) => callback());
    expect(page.activeRefresh()).toBeNull();
    page.advanceRuntime();
    await page.value.loadRegions();
    expect(page.api.list).toHaveBeenCalledOnce();
  });
});
