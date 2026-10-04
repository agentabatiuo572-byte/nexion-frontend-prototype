import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import type { OnboardingCalibration, CalibrationRequestSignals } from "@/api/onboarding-calibration-api";
import { createPhoneCalibrationFlow } from "./phone-calibration-flow";

export const signals: CalibrationRequestSignals = { memGB: null, cores: null, model: "", brand: "", gpu: "",
  pxDensity: null, pingMs: null, batteryLevel: null, charging: null, networkReachable: null };
export const measured = (revision = 0, status: "ACTIVE" | "CALIBRATED" | "DEFERRED" = "CALIBRATED"): OnboardingCalibration => ({
  userId: 42, deviceId: "phone-1", serverCanonical: true, source: "server", sourceEnvironment: "PRODUCTION", runId: "",
  revision, configRevision: 1, activationStatus: status, calibrationAvailable: true,
  score: 62, tier: 1, tierName: "Tier 1", tops: 8, baseRateUsdt: 0.04, baseRateNex: 6, signals, comparisonConfig: [],
});
const missing = () => new ApiError({ kind: "http", status: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND" });
const offline = () => new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" });
const options = { deviceId: "phone-1", accountKey: "user:42", isCurrent: () => true };
function setup() {
  const api = { result: vi.fn<() => Promise<OnboardingCalibration>>(), calibrate: vi.fn(async () => measured()) };
  const collect = vi.fn(() => signals), key = vi.fn(() => "onboarding:fixed-key");
  return { api, collect, key, flow: createPhoneCalibrationFlow({ api, collect, key }) };
}

describe("automatic phone calibration", () => {
  it("creates the first canonical estimate with unavailable observations, without activating", async () => {
    const { api, collect, flow } = setup();
    api.result.mockRejectedValueOnce(missing());
    expect(await flow.run(options)).toEqual(measured());
    expect(api.calibrate).toHaveBeenCalledExactlyOnceWith("phone-1", signals, 0, "onboarding:fixed-key");
    expect(collect).toHaveBeenCalledOnce();
  });
  it.each(["CALIBRATED", "ACTIVE", "DEFERRED"] as const)("reuses %s across the estimator/connect transition without remeasurement", async status => {
    const { api, collect, flow } = setup();
    api.result.mockResolvedValue(measured(8, status));
    expect(await flow.run(options)).toEqual(measured(8, status));
    expect(api.calibrate).not.toHaveBeenCalled();
    expect(collect).not.toHaveBeenCalled();
  });
  it.each([offline(), new ApiError({ kind: "auth", status: 401, message: "EXPIRED" }),
    new ApiError({ kind: "http", status: 503, message: "UNAVAILABLE" }),
    new ApiError({ kind: "http", status: 404, message: "No route" })])("never creates after an unreadable result: %s", async error => {
    const { api, flow } = setup(); api.result.mockRejectedValue(error);
    await expect(flow.run(options)).rejects.toBe(error);
    expect(api.calibrate).not.toHaveBeenCalled();
  });
  it("recovers a lost POST response by readback without repeating the command", async () => {
    const { api, flow } = setup(); api.result.mockRejectedValueOnce(missing()).mockResolvedValue(measured());
    api.calibrate.mockRejectedValueOnce(offline());
    expect(await flow.run(options)).toEqual(measured());
    expect(api.calibrate).toHaveBeenCalledOnce();
  });
  it("replays exactly the same observations, key and revision after an unresolved response", async () => {
    const { api, collect, key, flow } = setup(); api.result.mockRejectedValue(missing());
    api.calibrate.mockRejectedValueOnce(offline());
    await expect(flow.run(options)).rejects.toThrow("NETWORK_UNAVAILABLE");
    await flow.run(options);
    expect(api.calibrate.mock.calls[1]).toEqual(api.calibrate.mock.calls[0]);
    expect(collect).toHaveBeenCalledOnce(); expect(key).toHaveBeenCalledOnce();
  });
  it("explicit remeasurement reads the current revision, and a newer defer wins on recovery", async () => {
    const { api, flow } = setup(); api.result.mockResolvedValueOnce(measured(4, "ACTIVE")).mockResolvedValue(measured(5, "DEFERRED"));
    api.calibrate.mockRejectedValueOnce(new ApiError({ kind: "http", status: 409, message: "REVISION_CONFLICT" }));
    expect((await flow.run({ ...options, recalibrate: true })).activationStatus).toBe("DEFERRED");
    expect(api.calibrate).toHaveBeenCalledExactlyOnceWith("phone-1", signals, 4, "onboarding:fixed-key");
  });
  it("does not issue a follow-up write after account switch during the read", async () => {
    const { api, flow } = setup(); let current = true;
    api.result.mockImplementation(async () => { current = false; throw missing(); });
    await expect(flow.run({ ...options, isCurrent: () => current })).rejects.toThrow("SCOPE_STALE");
    expect(api.calibrate).not.toHaveBeenCalled();
  });
  it.each([{ userId: 99 }, { deviceId: "another-phone" }, { runId: "sandbox" }])("rejects results outside the requested scope: %s", async patch => {
    const { api, flow } = setup(); api.result.mockResolvedValue({ ...measured(), ...patch });
    await expect(flow.run(options)).rejects.toThrow("SCOPE_INVALID");
    expect(api.calibrate).not.toHaveBeenCalled();
  });
});
