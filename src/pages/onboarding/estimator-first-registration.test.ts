import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import ts from "typescript";
import source from "./estimator.vue?raw";
import { ApiError } from "@/api/errors";
import { createPhoneCalibrationFlow } from "@/lib/phone-calibration-flow";

const canonical = { userId: 42, deviceId: "test-device", serverCanonical: true, source: "server",
  sourceEnvironment: "PRODUCTION", runId: "", revision: 0, activationStatus: "CALIBRATED", calibrationAvailable: true, calibrationStatus: "MATCHED" };

function mount() {
  const start = source.indexOf("function loadCalibration(");
  const end = source.indexOf("function retryCalibration()", start);
  const loading = ref(false), deferred = ref(false), loadFailed = ref(false), calibration = ref<unknown>(null), detected = ref(false);
  const failureCode = ref(""), deferFailed = ref(false);
  let current = true;
  const result = vi.fn();
  const calibrate = vi.fn();
  const calibrationFlow = createPhoneCalibrationFlow({ api: { result, calibrate }, collect: () => ({
    model: "", brand: "", gpu: "", memGB: null, cores: null, pxDensity: null, pingMs: null,
    batteryLevel: null, charging: null, networkReachable: null,
  }), key: () => "first-calibration" });
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const load = new Function("scopePair", "isCurrent", "loading", "deferred", "loadFailed", "failureCode", "deferFailed", "calibration", "detected",
    "calibrationFlow", "getDeviceId", "auth", "scheduleReveal", "mounted", "isCurrentEstimatorScope", "createEstimatorScope", "app", "accountEpoch", "generation", "nativePhoneAvailable",
    `${code}\nreturn loadCalibration;`,
  )(() => ({}), () => current, loading, deferred, loadFailed, failureCode, deferFailed, calibration, detected, calibrationFlow, () => "test-device",
    { accountId: "user:42", isAuthenticated: true }, () => { detected.value = true; }, true,
    () => current, () => ({}), { accountKey: "user:42" }, 0, 0, true);
  return { load, result, calibrate, loading, deferred, loadFailed, calibration, detected, invalidate: () => { current = false; } };
}
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

describe("first registration estimator", () => {
  it("an authenticated missing calibration automatically estimates without activating", async () => {
    const h = mount();
    h.result.mockRejectedValue(new ApiError({ kind: "http", status: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND" }));
    h.calibrate.mockResolvedValue(canonical);
    h.load(); await settle();
    expect(h.calibrate).toHaveBeenCalledOnce();
    expect(h.loadFailed.value).toBe(false);
    expect(h.detected.value).toBe(true);
    expect(h.calibration.value).toEqual(canonical);
    expect(source).not.toContain("onboardingCalibrationApi.activate(");
  });
  it("a confirmed deferred record remains distinct from a failed read", async () => {
    const h = mount();
    h.result.mockResolvedValue({ ...canonical, activationStatus: "DEFERRED", calibrationAvailable: false });
    h.load(); await settle();
    expect(h.deferred.value).toBe(true);
    expect(h.loadFailed.value).toBe(false);
    expect(h.calibrate).not.toHaveBeenCalled();
  });
  it("a service failure stays unavailable and a subsequent confirmed read recovers", async () => {
    const h = mount();
    h.result.mockRejectedValueOnce(new ApiError({ kind: "http", status: 503, message: "unavailable" }));
    h.load(); await settle();
    expect(h.loadFailed.value).toBe(true);
    expect(h.calibrate).not.toHaveBeenCalled();
    h.result.mockResolvedValueOnce(canonical);
    h.load(); await settle();
    expect(h.loadFailed.value).toBe(false);
    expect(h.calibration.value).toEqual(canonical);
    expect(h.detected.value).toBe(true);
  });
  it("an old account read cannot change the new page state", async () => {
    const h = mount();
    let reject!: (error: Error) => void;
    h.result.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    h.load(); await settle(); h.invalidate();
    h.calibration.value = canonical;
    reject(new ApiError({ kind: "http", status: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND" }));
    await settle();
    expect(h.calibration.value).toEqual(canonical);
    expect(h.calibrate).not.toHaveBeenCalled();
  });
});
