// @ts-expect-error Node-only SFC harness.
import { readFileSync } from "node:fs";
// @ts-expect-error Node-only platform compiler.
import { createRequire } from "node:module";
import ts from "typescript";
import * as vue from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { ApiError } from "@/api/errors";
import { createNativeGpuRequest } from "@/lib/native-gpu-request";
import * as flow from "@/lib/phone-calibration-flow";
import * as estimatorScope from "@/lib/estimator-scope";
import * as calibrationScope from "@/lib/onboarding-calibration-scope";
import * as format from "@/i18n/format";

const require = createRequire(import.meta.url);
const { initPreContext, preHtml, preJs } = require("@dcloudio/uni-cli-shared");
function compileGuidance(h5: boolean) {
  initPreContext(h5 ? "h5" : "app-plus");
  const source = preJs(readFileSync(new URL("../../lib/phone-activation-guidance.ts", import.meta.url), "utf8"), "phone-activation-guidance.ts");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("exports", code)(exports);
  return exports;
}

const raw = { memGB: null, cores: null, model: "", brand: "", gpu: "", pxDensity: null,
  pingMs: null, batteryLevel: null, charging: null, networkReachable: null };
const record = { userId: 42, deviceId: "phone-1", serverCanonical: true, source: "server", sourceEnvironment: "PRODUCTION",
  runId: "", revision: 3, configRevision: 1, activationStatus: "CALIBRATED", calibrationAvailable: true,
  calibrationStatus: "MATCHED", computeValue: 8, computeUnit: "platform", ruleVersion: 1, ruleId: "android-test",
  score: 62, tier: 1, tierName: "Tier 1", tops: 8, baseRateUsdt: 0.04, baseRateNex: 6, signals: raw, comparisonConfig: [] };
const missing = () => new ApiError({ kind: "http", status: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND" });
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function settle() { for (let n = 0; n < 15; n++) await vue.nextTick(); }

function mount(name: "connect" | "estimator", api: any, query: Record<string, string> = {}, nativePhone = true, h5 = !nativePhone) {
  api.activationEligibility ??= vi.fn().mockResolvedValue({ binding: null, policyVersion: 1, canActivate: true, blockedReasons: [] });
  api.activationFailed ??= vi.fn().mockResolvedValue(false);
  const uiConfirm = vi.fn().mockResolvedValue(true);
  const hooks: Record<string, (...args: any[]) => void> = {};
  const auth = vue.reactive({ accountId: "user:42", email: "", isAuthenticated: true,
    completeOnboarding: vi.fn(() => true), requireOnboarding: vi.fn(), signOut: vi.fn() });
  const app = vue.reactive({ accountKey: "user:42", devices: [],
    refreshRemoteFleet: vi.fn(async () => {}), resumeMining: vi.fn(), acceptPhoneActivation: vi.fn() });
  const navReset = vi.fn();
  const confirmDeferredPhoneActivation = vi.fn();
  const requireCryptoUuid = vi.fn(() => "fixed-unique-command");
  let epoch = 0;
  const modules: Record<string, unknown> = {
    vue: { ...vue, onMounted: (fn: () => void) => { hooks.mount = fn; }, onUnmounted: (fn: () => void) => { hooks.unmount = fn; } },
    "@dcloudio/uni-app": { onLoad: (fn: any) => { hooks.load = fn; }, onBackPress: (fn: any) => { hooks.back = fn; } },
    "@/lib/route": { navReset }, "@/store/auth": { useAuth: () => auth }, "@/store/app": { useApp: () => app },
    "@/i18n/use-t": { useT: () => vue.ref(zh) }, "@/i18n/format": format,
    "@/store/ui": { confirm: uiConfirm, useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/store/session": { useSession: () => ({ markCalibrated: () => true, markPhoneActivationDeferred: () => true }) },
    "@/store/auth-account": { markAuthAccountOnboardingComplete: () => true },
    "@/lib/secure-command-id": { requireCryptoUuid },
    "@/lib/device-id": { getDeviceId: () => "phone-1" },
    "@/lib/native-phone-runtime": { hasNativeAndroidPhoneRuntime: () => nativePhone },
    "@/lib/phone-activation-guidance": compileGuidance(h5),
    "@/lib/native-gpu-request": { createNativeGpuRequest: (send: (id: number) => void) => {
      const reader = createNativeGpuRequest(id => { send(id); queueMicrotask(() => reader.receive({ id, status: "observed", renderer: "Actual test renderer" })); });
      return reader;
    } },
    "@/lib/device-signals": { collectDeviceSignals: () => raw },
    "@/api/runtime": { onboardingCalibrationApi: api, remoteApiEnabled: true },
    "@/lib/account-scope": { captureAccountScope: () => ({ epoch }), isCurrentAccountScope: (scope: any) => scope.epoch === epoch },
    "@/lib/estimator-scope": estimatorScope, "@/lib/onboarding-calibration-scope": calibrationScope,
    "@/lib/phone-calibration-flow": flow,
    "@/lib/defer-phone-activation": { confirmDeferredPhoneActivation },
  };
  vi.stubGlobal("uni", { showToast: vi.fn() });
  initPreContext(h5 ? "h5" : "app-plus");
  const compiled = preJs(preHtml(readFileSync(new URL(`./${name}.vue`, import.meta.url), "utf8"), `${name}.vue`), `${name}.vue`);
  const source = compiled.split('<script setup lang="ts">')[1].split("</script>")[0];
  const fields = name === "connect" ? "phase, canonical, activationBusy, titleText, isRecal, failureTitle, failureDetail, retryCalibration, activate, leaveConnect, deferPhoneActivation" : "detected, loadFailed, deferred, deferFailed, calibration, failureDetail, retryCalibration, goConnect, leaveEstimator, deferPhoneActivation";
  const code = ts.transpileModule(`${source}\nexport const page = { ${fields}, phoneActivationGuidance };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports: any = {};
  const scope = vue.effectScope();
  scope.run(() => new Function("require", "exports", code)((id: string) => modules[id] ?? {}, exports));
  hooks.load?.(query); hooks.mount?.();
  cleanups.push(() => { hooks.unmount?.(); scope.stop(); });
  return { page: exports.page, auth, app, navReset, confirmDeferredPhoneActivation, requireCryptoUuid, uiConfirm, back: hooks.back, invalidate: () => { epoch++; } };
}

describe("real onboarding page workers", () => {
  it.each([false, true])("refreshes versions and key only after a persisted failed receipt=%s", async failed => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(),
      activationEligibility: vi.fn().mockResolvedValueOnce({ binding: null, policyVersion: 1, canActivate: true, blockedReasons: [] })
        .mockResolvedValue({ binding: null, policyVersion: 2, canActivate: true, blockedReasons: [] }),
      activationFailed: vi.fn().mockResolvedValue(failed),
      activate: vi.fn().mockRejectedValueOnce(new ApiError({ kind: "network", message: "lost response" }))
        .mockResolvedValue({ ...record, revision: 4, activationStatus: "ACTIVE" }) };
    const { page, requireCryptoUuid } = mount("connect", api); await settle();
    requireCryptoUuid.mockReturnValueOnce("command-one").mockReturnValueOnce("command-two");
    await page.activate(); await page.activate();
    expect(api.activationEligibility).toHaveBeenCalledTimes(failed ? 2 : 1);
    expect(api.activate.mock.calls[1][2]).toBe(`phone-activation:active:command-${failed ? "two" : "one"}`);
    expect(api.activate.mock.calls[1][3]).toEqual({ expectedBindingVersion: null,
      expectedPolicyVersion: failed ? 2 : 1, replacementConfirmed: false });
  });
  it("blocks policy-denied replacement before posting activation", async () => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(), activate: vi.fn(),
      activationEligibility: vi.fn().mockResolvedValue({ binding: { installationId: "old-phone", bindingVersion: 7 },
        policyVersion: 3, canActivate: false, blockedReasons: ["PHONE_REPLACEMENT_DISABLED"] }) };
    const { page, uiConfirm } = mount("connect", api); await settle(); await page.activate();
    expect(api.activate).not.toHaveBeenCalled(); expect(uiConfirm).not.toHaveBeenCalled();
    expect(page.phase.value).toBe("error"); expect(page.activationBusy.value).toBe(false);
  });
  it("asks for consent after the server identifies a same-installation hardware replacement", async () => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(),
      activationEligibility: vi.fn().mockResolvedValue({ binding: { installationId: "phone-1", bindingVersion: 7 },
        policyVersion: 3, canActivate: true, blockedReasons: [] }),
      activationFailed: vi.fn().mockResolvedValue(true),
      activate: vi.fn().mockRejectedValueOnce(new ApiError({ kind: "http", status: 409, message: "PHONE_REPLACEMENT_CONFIRMATION_REQUIRED" }))
        .mockResolvedValue({ ...record, revision: 4, activationStatus: "ACTIVE" }) };
    const { page, uiConfirm } = mount("connect", api); await settle();
    await page.activate(); expect(uiConfirm).not.toHaveBeenCalled();
    await page.activate(); expect(uiConfirm).toHaveBeenCalledOnce();
    expect(api.activate.mock.calls[0][3].replacementConfirmed).toBe(false);
    expect(api.activate.mock.calls[1][3].replacementConfirmed).toBe(true);
  });
  it.each([false, true])("requires explicit replacement consent=%s and sends the read versions", async confirmed => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(),
      activate: vi.fn().mockResolvedValue({ ...record, revision: 4, activationStatus: "ACTIVE" }),
      activationEligibility: vi.fn().mockResolvedValue({ binding: { installationId: "old-phone", bindingVersion: 7 },
        policyVersion: 3, canActivate: true, blockedReasons: [], grantId: "grant-one" }) };
    const { page, uiConfirm } = mount("connect", api); await settle(); uiConfirm.mockResolvedValue(confirmed);
    await page.activate(); expect(uiConfirm).toHaveBeenCalledOnce();
    expect(api.activate).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    if (confirmed) expect(api.activate.mock.calls[0][3]).toEqual({ expectedBindingVersion: 7,
      expectedPolicyVersion: 3, replacementConfirmed: true, exceptionGrantId: "grant-one" });
    expect(page.activationBusy.value).toBe(false);
  });
  it("discards eligibility after the account changes before activation", async () => {
    let resolve!: (value: unknown) => void;
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(), activate: vi.fn(),
      activationEligibility: vi.fn(() => new Promise(r => { resolve = r; })) };
    const { page, auth } = mount("connect", api); await settle(); const pending = page.activate();
    auth.accountId = "user:43"; await settle();
    resolve({ binding: null, policyVersion: 1, canActivate: true, blockedReasons: [] }); await pending;
    expect(api.activate).not.toHaveBeenCalled();
  });
  it.each([
    ["connect", {}], ["connect", { mode: "login" }],
    ["connect", { mode: "recalibrate" }], ["connect", { mode: "resume" }],
    ["estimator", {}],
  ] as const)("a browser sends %s %j to the download guide without changing phone or registration state", async (name, query) => {
    const api = { phoneLogin: vi.fn(), result: vi.fn(), calibrate: vi.fn(), activate: vi.fn(), defer: vi.fn() };
    const { page, auth, app, navReset, confirmDeferredPhoneActivation, back } = mount(name, api, query, false);
    await settle();
    expect(page.phoneActivationGuidance.value).toEqual({ title: zh.myDevices.phoneActivationAppOnlyTitle, body: zh.myDevices.phoneActivationAppOnlyBody });
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/pages/register/success?download=1" }));
    navReset.mockClear();
    const leave = name === "connect" ? page.leaveConnect : page.leaveEstimator;
    leave();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/pages/index/index" }));
    navReset.mockClear();
    back();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/pages/index/index" }));
    for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
    expect(confirmDeferredPhoneActivation).not.toHaveBeenCalled();
    expect(auth.completeOnboarding).not.toHaveBeenCalled();
    expect(app.refreshRemoteFleet).not.toHaveBeenCalled();
    expect(app.resumeMining).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "/pages/onboarding/estimator"],
    [{ mode: "login" }, "/pages/index/index"],
    [{ mode: "recalibrate" }, "/pages/me/devices"],
    [{ mode: "resume" }, "/pages/onboarding/estimator"],
  ])("retains the native connect exit for %j", async (query, expected) => {
    const api = { phoneLogin: vi.fn().mockResolvedValue("NEEDS_CALIBRATION"), result: vi.fn().mockResolvedValue(record), calibrate: vi.fn() };
    const { page, navReset } = mount("connect", api, query as Record<string, string>, true);
    await settle();
    page.leaveConnect();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: expected }));
  });

  it("retains the native estimator return to its introduction", async () => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn() };
    const { page, navReset } = mount("estimator", api, {}, true);
    await settle();
    page.leaveEstimator();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/pages/onboarding/intro" }));
  });

  it.each([
    ["connect", {}, "/pages/onboarding/estimator"],
    ["connect", { mode: "recalibrate" }, "/pages/me/devices"],
    ["estimator", {}, "/pages/onboarding/intro"],
  ] as const)("retains the %s APP exit without an Android runtime", async (name, query, expected) => {
    const api = { phoneLogin: vi.fn(), result: vi.fn(), calibrate: vi.fn(), activate: vi.fn() };
    const { page, navReset } = mount(name, api, query, false, false);
    await settle();
    expect(page.phoneActivationGuidance.value).toEqual({ title: zh.myDevices.phoneActivationNativeUnavailableTitle, body: zh.myDevices.phoneActivationNativeUnavailableBody });
    expect(navReset).not.toHaveBeenCalled();
    (name === "connect" ? page.leaveConnect : page.leaveEstimator)();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: expected }));
    for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
  });

  it("returns the bound installation to Home without calibration or replacement", async () => {
    const api = { phoneLogin: vi.fn().mockResolvedValue("BOUND"), result: vi.fn(), calibrate: vi.fn(), activate: vi.fn() };
    const { page, navReset } = mount("connect", api, { mode: "login" });
    expect(page.titleText.value).toBe(zh.onboarding.phoneBindingCheckTitle);
    await settle();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/pages/index/index" }));
    expect(page.isRecal.value).toBe(false);
    expect(api.result).not.toHaveBeenCalled();
    expect(api.calibrate).not.toHaveBeenCalled();
    expect(api.activate).not.toHaveBeenCalled();
  });
  it("keeps failed or unknown binding reads as errors without claiming recalibration", async () => {
    for (const status of [new ApiError({ kind: "network", message: "offline" }), "UNKNOWN"]) {
      const api = { phoneLogin: status instanceof Error ? vi.fn().mockRejectedValue(status) : vi.fn().mockResolvedValue(status),
        result: vi.fn(), calibrate: vi.fn(), activate: vi.fn() };
      const { page, navReset } = mount("connect", api, { mode: "login" }); await settle();
      expect(page.phase.value).toBe("error");
      expect(page.titleText.value).toBe(zh.onboarding.phoneBindingReadUnavailableTitle);
      expect(page.failureDetail.value).toBe(zh.onboarding.phoneBindingReadUnavailableBody);
      expect(page.isRecal.value).toBe(false);
      expect(navReset).not.toHaveBeenCalled();
      expect(api.calibrate).not.toHaveBeenCalled();
      expect(api.activate).not.toHaveBeenCalled();
    }
  });
  it("persists a first-login defer after a canonical unbound read instead of only returning Home", async () => {
    const api = { phoneLogin: vi.fn().mockResolvedValue("NEEDS_CALIBRATION"),
      bindingStatus: vi.fn().mockResolvedValue(false), result: vi.fn().mockResolvedValue(record), calibrate: vi.fn() };
    const { page, confirmDeferredPhoneActivation, navReset, auth } = mount("connect", api, { mode: "login" });
    await settle(); page.phase.value = "calibrating"; await settle();
    confirmDeferredPhoneActivation.mockResolvedValue({ ...record, activationStatus: "DEFERRED", revision: 4 });
    await page.deferPhoneActivation();
    expect(api.bindingStatus).toHaveBeenCalledOnce();
    expect(confirmDeferredPhoneActivation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ initialOnly: true }));
    expect(auth.completeOnboarding).toHaveBeenCalledOnce();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/pages/index/index" }));
  });

  it("does not treat a failed login binding read as an unbound installation", async () => {
    const api = { phoneLogin: vi.fn().mockResolvedValue("NEEDS_CALIBRATION"),
      bindingStatus: vi.fn().mockRejectedValue(new ApiError({ kind: "network", message: "offline" })),
      result: vi.fn().mockResolvedValue(record), calibrate: vi.fn() };
    const { page, confirmDeferredPhoneActivation, navReset, auth } = mount("connect", api, { mode: "login" });
    await settle(); page.phase.value = "calibrating"; await settle();
    await page.deferPhoneActivation();
    expect(page.phase.value).toBe("error");
    expect(confirmDeferredPhoneActivation).not.toHaveBeenCalled();
    expect(auth.completeOnboarding).not.toHaveBeenCalled();
    expect(navReset).not.toHaveBeenCalled();
  });

  it.each(["NEEDS_CALIBRATION", "REPLACEMENT_REQUIRED"])("preserves the old phone on login defer for %s", async (status) => {
    const api = { phoneLogin: vi.fn().mockResolvedValue(status), bindingStatus: vi.fn().mockResolvedValue(true),
      result: vi.fn().mockResolvedValue(record), calibrate: vi.fn().mockResolvedValue(record), activate: vi.fn(), defer: vi.fn() };
    const { page, confirmDeferredPhoneActivation, navReset, auth } = mount("connect", api, { mode: "login" });
    await settle(); page.phase.value = "calibrating"; await settle();
    await page.deferPhoneActivation();
    expect(confirmDeferredPhoneActivation).not.toHaveBeenCalled();
    expect(api.defer).not.toHaveBeenCalled(); expect(api.activate).not.toHaveBeenCalled();
    expect(auth.completeOnboarding).not.toHaveBeenCalled();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/pages/index/index" }));
  });

  it("ignores a late unbound read after an account switch", async () => {
    let resolve!: (value: boolean) => void;
    const api = { phoneLogin: vi.fn().mockResolvedValue("NEEDS_CALIBRATION"),
      bindingStatus: vi.fn(() => new Promise<boolean>(done => { resolve = done; })),
      result: vi.fn().mockResolvedValue(record), calibrate: vi.fn() };
    const { page, confirmDeferredPhoneActivation, navReset, invalidate } = mount("connect", api, { mode: "login" });
    await settle(); page.phase.value = "calibrating"; await settle();
    const pending = page.deferPhoneActivation(); invalidate(); resolve(false); await pending;
    expect(confirmDeferredPhoneActivation).not.toHaveBeenCalled(); expect(navReset).not.toHaveBeenCalled();
  });

  it("suppresses duplicate defer clicks while binding status is pending", async () => {
    let resolve!: (value: boolean) => void;
    const api = { phoneLogin: vi.fn().mockResolvedValue("NEEDS_CALIBRATION"),
      bindingStatus: vi.fn(() => new Promise<boolean>(done => { resolve = done; })),
      result: vi.fn().mockResolvedValue(record), calibrate: vi.fn() };
    const { page, confirmDeferredPhoneActivation } = mount("connect", api, { mode: "login" });
    await settle(); page.phase.value = "calibrating"; await settle();
    confirmDeferredPhoneActivation.mockResolvedValue({ ...record, activationStatus: "DEFERRED" });
    const pending = page.deferPhoneActivation(); await page.deferPhoneActivation(); resolve(false); await pending;
    expect(api.bindingStatus).toHaveBeenCalledOnce(); expect(confirmDeferredPhoneActivation).toHaveBeenCalledOnce();
  });

  it("uses the first-calibration title only after the server requests calibration", async () => {
    const api = { phoneLogin: vi.fn().mockResolvedValue("NEEDS_CALIBRATION"), result: vi.fn(), calibrate: vi.fn() };
    const { page } = mount("connect", api, { mode: "login" }); await settle();
    expect(page.phase.value).toBe("intro");
    expect(page.titleText.value).toBe(zh.onboarding.calibrationTitle);
    expect(page.isRecal.value).toBe(false);
    expect(api.calibrate).not.toHaveBeenCalled();
  });
  it("checks the server on native login before allowing a denied replacement to calibrate", async () => {
    const api = { phoneLogin: vi.fn().mockResolvedValueOnce("PHONE_REPLACEMENT_DISABLED").mockResolvedValue("REPLACEMENT_REQUIRED"),
      result: vi.fn().mockResolvedValue(record), calibrate: vi.fn().mockResolvedValue(record), activate: vi.fn() };
    const { page } = mount("connect",api,{mode:"login"}); await settle();
    expect(page.phase.value).toBe("error"); expect(api.result).not.toHaveBeenCalled();
    expect(page.titleText.value).toBe(zh.onboarding.phoneBindingReadUnavailableTitle);
    expect(page.isRecal.value).toBe(false);
    await page.activate(); expect(api.activate).not.toHaveBeenCalled();
    page.retryCalibration(); await settle();
    expect(page.phase.value).toBe("intro"); expect(api.calibrate).not.toHaveBeenCalled();
    expect(page.isRecal.value).toBe(true);
    page.phase.value="calibrating"; await settle(); expect(api.calibrate).toHaveBeenCalledOnce();
  });
  it("retains unknown hardware and recalibrates on explicit retry without allowing activation", async () => {
    const pending = { ...record, calibrationAvailable: false, calibrationStatus: "PENDING_VERIFICATION",
      computeValue: null, tier: null, tops: null, score: null, baseRateUsdt: null, baseRateNex: null };
    for (const name of ["connect", "estimator"] as const) {
      const api = { result: vi.fn().mockResolvedValue(pending), calibrate: vi.fn().mockResolvedValue(record), activate: vi.fn() };
      const { page } = mount(name, api); await settle();
      if (name === "connect") {
        expect(page.canonical.value.calibrationStatus).toBe("PENDING_VERIFICATION");
        expect(page.phase.value).toBe("error");
        await page.activate();
      } else {
        expect(page.calibration.value.calibrationStatus).toBe("PENDING_VERIFICATION");
        expect(page.detected.value).toBe(false);
      }
      expect(api.activate).not.toHaveBeenCalled();
      page.retryCalibration(); await settle();
      expect(api.calibrate).toHaveBeenCalledOnce();
    }
  });
  it("does not calibrate or activate a browser installation, while Android can", async () => {
    const browserApi = { result: vi.fn(), calibrate: vi.fn(), activate: vi.fn() };
    const browserEstimate = mount("estimator", browserApi, {}, false);
    const browserConnect = mount("connect", browserApi, {}, false);
    await settle();
    browserConnect.page.phase.value = "calibrating";
    await settle();
    await browserConnect.page.activate();
    expect(browserApi.result).not.toHaveBeenCalled();
    expect(browserApi.calibrate).not.toHaveBeenCalled();
    expect(browserApi.activate).not.toHaveBeenCalled();
    expect(browserEstimate.page.detected.value).toBe(false);

    const androidApi = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(),
      activate: vi.fn().mockResolvedValue({ ...record, revision: 4, activationStatus: "ACTIVE" }) };
    const androidConnect = mount("connect", androidApi, {}, true);
    await settle();
    await androidConnect.page.activate();
    expect(androidApi.result).toHaveBeenCalled();
    expect(androidApi.activate).toHaveBeenCalled();
  });
  it("automatically creates an estimate on first registration and enables the next step", async () => {
    vi.useFakeTimers();
    const api = { result: vi.fn().mockRejectedValue(missing()), calibrate: vi.fn().mockResolvedValue(record), activate: vi.fn() };
    const { page, navReset } = mount("estimator", api);
    await settle(); await vi.advanceTimersByTimeAsync(1200);
    expect(api.calibrate).toHaveBeenCalledExactlyOnceWith("phone-1", raw, 0, "onboarding:fixed-unique-command");
    expect(page.detected.value).toBe(true); expect(page.loadFailed.value).toBe(false);
    page.goConnect(); expect(navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/onboarding/connect" }));
    expect(api.activate).not.toHaveBeenCalled();
  });
  it("connect reuses that result and waits for an explicit activation click", async () => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(),
      activate: vi.fn().mockResolvedValue({ ...record, revision: 4, activationStatus: "ACTIVE" }) };
    const { page, app, navReset } = mount("connect", api);
    await settle(); expect(page.phase.value).toBe("result");
    expect(api.calibrate).not.toHaveBeenCalled(); expect(api.activate).not.toHaveBeenCalled();
    await page.activate();
    expect(api.activate).toHaveBeenCalledWith("phone-1", 3, "phone-activation:active:fixed-unique-command", {
      expectedBindingVersion: null, expectedPolicyVersion: 1, replacementConfirmed: false,
    });
    expect(app.refreshRemoteFleet).toHaveBeenCalledOnce();
    expect(app.acceptPhoneActivation).toHaveBeenCalledOnce();
    expect(navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/index/index" }));
  });
  it("warehouse recalibration starts only on click and uses the latest revision", async () => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn().mockResolvedValue({ ...record, revision: 4 }) };
    const { page } = mount("connect", api, { mode: "recalibrate" });
    await settle(); expect(api.result).not.toHaveBeenCalled();
    page.phase.value = "calibrating"; await settle();
    expect(api.calibrate).toHaveBeenCalledWith("phone-1", raw, 3, "onboarding:fixed-unique-command");
    expect(page.phase.value).toBe("result");
  });
  it("releases activation after command creation fails and lets the user retry", async () => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(),
      activate: vi.fn().mockResolvedValue({ ...record, revision: 4, activationStatus: "ACTIVE" }) };
    const { page, requireCryptoUuid, navReset } = mount("connect", api);
    await settle();
    requireCryptoUuid.mockImplementationOnce(() => { throw new Error("CRYPTO_RANDOM_UUID_UNAVAILABLE"); });
    await page.activate();
    expect(page.phase.value).toBe("error");
    expect(page.activationBusy.value).toBe(false);
    expect(api.activate).not.toHaveBeenCalled();
    page.retryCalibration(); await settle();
    expect(api.activate).toHaveBeenCalledOnce();
    expect(navReset).toHaveBeenCalledOnce();
  });
  it.each(["activate", "defer"])("releases %s after a same-account session rebind without accepting the old result", async (action) => {
    let resolve!: (value: unknown) => void;
    const delayed = vi.fn(() => new Promise(r => { resolve = r; }));
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(), activate: delayed };
    const { page, app, navReset, invalidate, confirmDeferredPhoneActivation } = mount("connect", api);
    await settle();
    confirmDeferredPhoneActivation.mockImplementation(delayed);
    const pending = action === "activate" ? page.activate() : page.deferPhoneActivation();
    await settle();
    expect(page.activationBusy.value).toBe(true);
    invalidate();
    resolve({ ...record, revision: 4, activationStatus: action === "activate" ? "ACTIVE" : "DEFERRED" });
    await pending;
    expect(page.activationBusy.value).toBe(false);
    expect(page.canonical.value).toEqual(record);
    expect(app.refreshRemoteFleet).not.toHaveBeenCalled();
    expect(navReset).not.toHaveBeenCalled();
    page.leaveConnect();
    expect(navReset).toHaveBeenCalledOnce();
  });
  it("confirms a lost activation response by readback without a second activation", async () => {
    const api = { result: vi.fn().mockResolvedValueOnce(record).mockResolvedValue({ ...record, revision: 4, activationStatus: "ACTIVE" }),
      calibrate: vi.fn(), activate: vi.fn().mockRejectedValue(new ApiError({ kind: "network", message: "lost response" })) };
    const { page, app, navReset } = mount("connect", api); await settle(); await page.activate();
    expect(api.activate).toHaveBeenCalledOnce(); expect(app.refreshRemoteFleet).toHaveBeenCalledOnce();
    expect(navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/index/index" }));
  });
  it("does not let an old account's completion unlock a new account's activation", async () => {
    const completions: Array<(value: unknown) => void> = [];
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(),
      activate: vi.fn(() => new Promise(resolve => { completions.push(resolve); })) };
    const { page, auth, navReset } = mount("connect", api);
    await settle();
    const first = page.activate();
    await settle();
    auth.accountId = "user:43";
    await settle();
    const next = { ...record, userId: 43 };
    page.canonical.value = next;
    const second = page.activate();
    await settle();
    completions[0]({ ...record, revision: 4, activationStatus: "ACTIVE" });
    await first;
    expect(page.activationBusy.value).toBe(true);
    expect(page.canonical.value).toEqual(next);
    expect(navReset).not.toHaveBeenCalled();
    completions[1]({ ...next, revision: 4, activationStatus: "ACTIVE" });
    await second;
    expect(page.activationBusy.value).toBe(false);
    expect(navReset).toHaveBeenCalledOnce();
  });
  it("does not keep retrying an obsolete activation revision after a conflict", async () => {
    const api = { result: vi.fn().mockResolvedValueOnce(record).mockResolvedValue({ ...record, revision: 5 }), calibrate: vi.fn(),
      activate: vi.fn().mockRejectedValueOnce(new ApiError({ kind: "http", status: 409, message: "REVISION_CONFLICT" }))
        .mockResolvedValue({ ...record, revision: 6, activationStatus: "ACTIVE" }) };
    const { page, app } = mount("connect", api); await settle(); await page.activate();
    expect(page.phase.value).toBe("error"); expect(app.refreshRemoteFleet).not.toHaveBeenCalled();
    page.retryCalibration(); await settle();
    expect(api.activate.mock.calls[1][1]).toBe(5); expect(app.refreshRemoteFleet).toHaveBeenCalledOnce();
  });
  it("rereads server state on the next explicit defer retry after an uncertain write", async () => {
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn() };
    const { page, confirmDeferredPhoneActivation, navReset } = mount("connect", api); await settle();
    confirmDeferredPhoneActivation.mockRejectedValueOnce(new Error("revision conflict"))
      .mockResolvedValue({ ...record, revision: 5, activationStatus: "DEFERRED" });
    await page.deferPhoneActivation(); expect(page.phase.value).toBe("error");
    expect(navReset).not.toHaveBeenCalled(); page.retryCalibration(); await settle();
    expect(confirmDeferredPhoneActivation.mock.calls[1][0].current).toBeNull();
    expect(navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/index/index" }));
  });
  it("keeps a previous defer out of the failure screen", async () => {
    const api = { result: vi.fn().mockResolvedValue({ ...record, activationStatus: "DEFERRED" }), calibrate: vi.fn() };
    const { page, navReset } = mount("estimator", api); await settle();
    expect(page.deferred.value).toBe(true); expect(page.loadFailed.value).toBe(false);
    expect(api.calibrate).not.toHaveBeenCalled(); page.retryCalibration();
    expect(navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/onboarding/connect?mode=resume" }));
  });
  it("blocks visual and hardware back while a recalibration may disable the previous phone", async () => {
    let resolve!: (value: unknown) => void;
    const api = { result: vi.fn().mockResolvedValue(record), calibrate: vi.fn(() => new Promise(r => { resolve = r; })) };
    const { page, navReset, back } = mount("connect", api, { mode: "recalibrate" });
    page.phase.value = "calibrating"; await settle();
    page.leaveConnect(); back(); expect(navReset).not.toHaveBeenCalled();
    resolve({ ...record, revision: 4 }); await settle();
    expect(page.phase.value).toBe("result"); page.leaveConnect(); expect(navReset).toHaveBeenCalledOnce();
  });
  it("makes an invalidated same-account estimator request retryable without exposing its result", async () => {
    let resolve!: (value: unknown) => void;
    const api = { result: vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(record), calibrate: vi.fn() };
    const { page, invalidate } = mount("estimator", api); await settle();
    invalidate(); resolve(record); await settle();
    expect(page.calibration.value).toBeNull(); expect(page.loadFailed.value).toBe(true);
    page.retryCalibration(); await settle();
    expect(api.result).toHaveBeenCalledTimes(2); expect(page.calibration.value).toEqual(record);
  });
  it("discards a late result after a same-account session rebind", async () => {
    let resolve!: (value: unknown) => void;
    const api = { result: vi.fn(() => new Promise(r => { resolve = r; })), calibrate: vi.fn() };
    const { page, invalidate } = mount("connect", api); await settle();
    invalidate(); resolve(record); await settle();
    expect(page.canonical.value).toBeNull(); expect(page.phase.value).not.toBe("result");
    expect(api.calibrate).not.toHaveBeenCalled();
  });
  it("retries a failed initial read through the complete flow", async () => {
    const api = { result: vi.fn().mockRejectedValueOnce(new ApiError({ kind: "network", message: "offline" })).mockRejectedValue(missing()),
      calibrate: vi.fn().mockResolvedValue(record) };
    const { page } = mount("connect", api); await settle(); expect(page.phase.value).toBe("error");
    page.retryCalibration(); await settle(); expect(page.phase.value).toBe("result");
    expect(api.calibrate).toHaveBeenCalledOnce();
  });
  it("estimator retries a failed defer against fresh server state without recalibrating", async () => {
    const pending = { ...record, calibrationStatus: "PENDING_VERIFICATION", calibrationAvailable: false };
    const api = { result: vi.fn().mockResolvedValue(pending), calibrate: vi.fn() };
    const { page, confirmDeferredPhoneActivation, navReset } = mount("estimator", api); await settle();
    confirmDeferredPhoneActivation.mockRejectedValueOnce(new ApiError({
      kind: "network", message: "lost response",
    })).mockResolvedValue({ ...record, revision: 5, activationStatus: "DEFERRED" });

    await page.deferPhoneActivation();
    expect(page.deferFailed.value).toBe(true);
    expect(page.failureDetail.value).toBe(zh.onboarding.activationDeferFailed);
    expect(page.calibration.value).toBeNull();
    expect(navReset).not.toHaveBeenCalled();

    page.retryCalibration(); await settle();
    expect(confirmDeferredPhoneActivation).toHaveBeenCalledTimes(2);
    expect(confirmDeferredPhoneActivation.mock.calls[1][0].current).toBeNull();
    expect(api.calibrate).not.toHaveBeenCalled();
    expect(navReset).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/index/index" }));
  });
  it("keeps unavailable calibration and defer failures explicit without activating", async () => {
    const api = { result: vi.fn().mockRejectedValue(missing()), calibrate: vi.fn().mockRejectedValue(
      new ApiError({ kind: "http", status: 503, message: "CALIBRATION_UNAVAILABLE" })), activate: vi.fn() };
    const { page, confirmDeferredPhoneActivation, navReset } = mount("connect", api); await settle();
    expect(page.phase.value).toBe("error");
    expect(page.titleText.value).toBe(zh.onboarding.calibrationFailedTitle);
    expect(page.failureDetail.value).toBe(zh.onboarding.calibrationRetry);
    confirmDeferredPhoneActivation.mockRejectedValue(new ApiError({
      kind: "network", message: "lost response",
    }));
    await page.deferPhoneActivation();
    expect(page.failureTitle.value).toBe("暂不激活未保存");
    expect(page.failureDetail.value).toBe(zh.onboarding.activationDeferFailed);
    expect(navReset).not.toHaveBeenCalled();
    expect(api.activate).not.toHaveBeenCalled();
  });
});
