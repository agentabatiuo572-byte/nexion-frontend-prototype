import ts from "typescript";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { deviceDetailBackHref } from "@/lib/device-detail-navigation";
import source from "./device-detail.vue?raw";

const body = source.slice(source.indexOf('const id = ref("");'), source.indexOf("const loadingStyle:"));
const code = ts.transpileModule(body + "\nreturn { device, waitingForFleet, fleetFailed, showNotFound, retryFleet, id, backHref };",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const disposals: Array<() => void> = [];
function deferred() {
  let resolve!: (value: boolean) => void, reject!: (error: Error) => void;
  const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(remoteApiEnabled = true, routeId = "85", cached: Array<{ id: string; activatedAt: number | null }> = []) {
  const account = createRemoteAccountEpoch("A");
  const app = reactive({ accountBindingEpoch: 0, remoteFleetStatus: "ready", visibleDevices: cached,
    captureRemoteAccountRequest: account.snapshot, refreshRemoteFleet: vi.fn() });
  const pending: ReturnType<typeof deferred>[] = [];
  app.refreshRemoteFleet.mockImplementation(() => { const next = deferred(); pending.push(next); return next.promise; });
  const hooks = { load: [] as Array<(options: Record<string, string>) => void>, show: [] as Array<() => void> };
  const deps = { computed, ref, watch, app, remoteApiEnabled, deviceDetailBackHref,
    t: ref({ earn: { deviceDetailTitle: "Detail", backToEarn: "Back" }, profile: { back: "Back" } }),
    deviceName: () => "device", deviceGpuLabel: () => "gpu", navBack: vi.fn(), takeNavigationQuery: () => "",
    onLoad: (fn: typeof hooks.load[number]) => hooks.load.push(fn), onShow: (fn: () => void) => hooks.show.push(fn) };
  const scope = effectScope();
  const page = scope.run(() => new Function(...Object.keys(deps), code)(...Object.values(deps))) as {
    device: { value: unknown }; waitingForFleet: { value: boolean }; fleetFailed: { value: boolean };
    showNotFound: { value: boolean }; retryFleet(): Promise<void>; id: { value: string }; backHref: { value: string };
  };
  hooks.load.forEach(fn => fn({ id: routeId, from: "home" }));
  const show = () => hooks.show.forEach(fn => fn());
  disposals.push(() => scope.stop());
  return { page, app, account, pending, show };
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await nextTick(); }
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });

describe("remote device detail recovery", () => {
  it("rereads a ready pre-issue empty fleet before showing a gift or declaring it missing", async () => {
    const { page, app, pending, show } = harness();
    expect(page.showNotFound.value).toBe(false);
    show(); expect(app.refreshRemoteFleet).toHaveBeenCalledOnce();
    expect(app.refreshRemoteFleet).toHaveBeenCalledWith({ accountKey: "A", epoch: 0 });
    expect(page.waitingForFleet.value).toBe(true); expect(page.showNotFound.value).toBe(false);
    app.visibleDevices = [{ id: "85", activatedAt: 1 }]; pending[0].resolve(true); await settle();
    expect(page.device.value).not.toBeNull(); expect(page.waitingForFleet.value).toBe(false);
    expect(page.showNotFound.value).toBe(false);
    show(); expect(app.refreshRemoteFleet).toHaveBeenCalledTimes(2);
    app.visibleDevices = []; pending[1].resolve(true); await settle();
    expect(page.showNotFound.value).toBe(true);
  });
  it.each([false, "reject"])("shows read failure and retry, even with a cached device (%s)", async outcome => {
    const { page, app, pending, show } = harness(true, "85", [{ id: "85", activatedAt: 1 }]); show();
    expect(page.waitingForFleet.value).toBe(true);
    if (outcome === false) pending[0].resolve(false); else pending[0].reject(new Error("offline"));
    await settle(); expect(page.fleetFailed.value).toBe(true); expect(page.showNotFound.value).toBe(false);
    const retry = page.retryFleet(); expect(page.waitingForFleet.value).toBe(true);
    pending[1].resolve(true); await retry;
    expect(page.fleetFailed.value).toBe(false); expect(page.device.value).not.toBeNull();
    expect(app.refreshRemoteFleet).toHaveBeenCalledTimes(2);
  });
  it.each(["A", "B"])("fences a late prior-account read during a %s rebind", async nextAccount => {
    const { page, app, account, pending, show } = harness(); show();
    account.bind(nextAccount); app.accountBindingEpoch += 1; await nextTick();
    expect(app.refreshRemoteFleet).toHaveBeenCalledTimes(2);
    pending[0].resolve(true); await settle();
    expect(page.waitingForFleet.value).toBe(true); expect(page.showNotFound.value).toBe(false);
    pending[1].resolve(false); await settle(); expect(page.fleetFailed.value).toBe(true);
  });
  it("shows retry when the store declines an idle read, rather than staying loading forever", async () => {
    const { page, app, pending, show } = harness(); app.remoteFleetStatus = "idle"; show();
    pending[0].resolve(false); await settle();
    expect(page.waitingForFleet.value).toBe(false); expect(page.fleetFailed.value).toBe(true);
    expect(page.showNotFound.value).toBe(false);
  });
  it("ignores a superseded same-account failure and treats inactive devices as absent only after readback", async () => {
    const { page, app, pending, show } = harness(true, "85", [{ id: "85", activatedAt: null }]);
    show(); show(); pending[1].resolve(true); await settle();
    expect(page.showNotFound.value).toBe(true);
    pending[0].reject(new Error("stale")); await settle();
    expect(page.fleetFailed.value).toBe(false); expect(app.refreshRemoteFleet).toHaveBeenCalledTimes(2);
  });
  it("keeps local/native navigation and invalid-id behavior without remote reads", () => {
    const local = harness(false, "85", [{ id: "85", activatedAt: 1 }]); local.show();
    expect(local.page.device.value).not.toBeNull(); expect(local.app.refreshRemoteFleet).not.toHaveBeenCalled();
    expect(local.page.backHref.value).toBe("/pages/index/index");
    const empty = harness(true, ""); empty.show();
    expect(empty.page.showNotFound.value).toBe(true); expect(empty.app.refreshRemoteFleet).not.toHaveBeenCalled();
  });
  it("preserves the H5 device query and home return source while refreshing", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", { location: { hash: "#/pages/earn/device-detail", href: "http://localhost/#/pages/earn/device-detail" },
      history: { state: {}, replaceState } });
    const detail = harness(true, "85"); detail.show();
    expect(replaceState.mock.calls[0][2]).toBe("http://localhost/#/pages/earn/device-detail?id=85&from=home");
    expect(detail.app.refreshRemoteFleet).toHaveBeenCalledOnce();
  });
  it("wires loading, read failure and retry to the actual template", () => {
    expect(source).toContain('device && !waitingForFleet && !fleetFailed');
    expect(source).toContain('v-else-if="waitingForFleet"');
    expect(source).toContain('v-else-if="fleetFailed"');
    expect(source).toContain('v-else-if="showNotFound"');
    expect(source).toContain('@cta="retryFleet"');
  });
});
