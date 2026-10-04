import { afterEach, describe, expect, it, vi } from "vitest";
import { parseOnboardingCalibration, createOnboardingCalibrationApi, type CalibrationRequestSignals, type CalibrationSignals } from "./onboarding-calibration-api";
import { advanceRuntimeRevision } from "./order-api";
import { ApiError } from "./errors";

const valid = {
  userId: 9,
  deviceId: "device-a",
  serverCanonical: true,
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  revision: 2,
  configRevision: 7,
  activationStatus: "CALIBRATED",
  calibrationAvailable: true,
  score: 87,
  tier: 3,
  tierName: "Tier 3",
  tops: 28.3,
  baseRateUsdt: 0.06,
  baseRateNex: 10,
  signals: { memGB: 8, cores: 8, model: "Pixel", brand: "Google", gpu: "Mali", pxDensity: 900, pingMs: 42, batteryLevel: 80, charging: true, networkReachable: true },
  comparisonConfig: [{ key: "phone", label: "Phone", dailyUsdt: 0.06, dailyNex: 10, sortOrder: 1 }],
};

describe("onboarding calibration API", () => {
  afterEach(() => advanceRuntimeRevision(null));

  it("checks the current installation with one ordinary authenticated request", async () => {
    const request = vi.fn().mockResolvedValue({ status: "BOUND" });
    const api = createOnboardingCalibrationApi({ request } as never);
    expect(await api.phoneLogin(" device-a ")).toBe("BOUND");
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: "POST", path: "/api/onboarding/phone-installation/login", body: { deviceId: "device-a" },
    });
    request.mockClear().mockResolvedValue({ status: "UNKNOWN" });
    await expect(api.phoneLogin("device-a")).rejects.toThrow("ONBOARDING_CALIBRATION_RESPONSE_INVALID");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("propagates a business rejection without an extra device handshake or retry", async () => {
    const denial = new ApiError({ kind: "business", message: "PHONE_REPLACEMENT_DISABLED" });
    const request = vi.fn().mockRejectedValue(denial);
    const api = createOnboardingCalibrationApi({ request } as never);
    await expect(api.activate("device-a", 2, "phone-active-001")).rejects.toBe(denial);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("accepts only a server-canonical capability projection", () => {
    expect(parseOnboardingCalibration(valid, "PRODUCTION")).toMatchObject({ source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", tier: 3, tops: 28.3 });
  });

  it("rejects an environment/run mismatch", () => {
    expect(() => parseOnboardingCalibration({ ...valid, runId: "stale" }, "PRODUCTION")).toThrow();
    expect(() => parseOnboardingCalibration({ ...valid, sourceEnvironment: "SANDBOX", runId: "retired" })).toThrow();
  });

  it("keeps unknown hardware pending and accepts platform points outside the legacy fake TOPS scale", () => {
    const pending = { ...valid, calibrationAvailable: false, calibrationStatus: "PENDING_VERIFICATION",
      pendingReason: "RULES_UNAVAILABLE", computeUnit: "platform", computeValue: null, ruleId: null, ruleVersion: 0,
      score: null, tier: null, tierName: null, tops: null, baseRateUsdt: null, baseRateNex: null, comparisonConfig: [] };
    expect(parseOnboardingCalibration(pending)).toMatchObject({ calibrationStatus: "PENDING_VERIFICATION", calibrationAvailable: false, computeValue: null });
    expect(() => parseOnboardingCalibration({ ...pending, activationStatus: "ACTIVE" })).toThrow();
    expect(() => parseOnboardingCalibration({ ...valid, calibrationStatus: "PENDING_VERIFICATION", computeUnit: "platform", computeValue: null, ruleId: null, ruleVersion: 0 })).toThrow();
    const matched = { ...valid, calibrationStatus: "MATCHED", computeUnit: "platform", computeValue: 120.5,
      score: 121, tops: 120.5, ruleId: "fixture", ruleVersion: 2 };
    expect(parseOnboardingCalibration(matched)).toMatchObject({ computeValue: 120.5, ruleVersion: 2 });
    expect(() => parseOnboardingCalibration({ ...matched, tops: 119 })).toThrow();
    expect(() => parseOnboardingCalibration({ ...matched, ruleId: null })).toThrow();
  });

  it("rejects a client/mock projection or out-of-range raw signal", () => {
    expect(() => parseOnboardingCalibration({ ...valid, source: "mock" })).toThrow("ONBOARDING_CALIBRATION_RESPONSE_INVALID");
    expect(() => parseOnboardingCalibration({ ...valid, signals: { ...valid.signals, batteryLevel: 101 } })).toThrow();
  });

  it("retains unavailable canonical observations as null", () => {
    const parsed = parseOnboardingCalibration({ ...valid, signals: {
      ...valid.signals, memGB: null, cores: null, pxDensity: null, pingMs: null,
      batteryLevel: null, charging: null, networkReachable: null,
    } });
    expect(parsed.signals).toMatchObject({ memGB: null, cores: null, pxDensity: null, pingMs: null, batteryLevel: null, charging: null, networkReachable: null });
  });

  it("accepts only an explicit server deferred tombstone when detection created no calibration", () => {
    const deferred = parseOnboardingCalibration({
      ...valid,
      configRevision: 0,
      activationStatus: "DEFERRED",
      calibrationAvailable: false,
      score: null,
      tier: null,
      tierName: null,
      tops: null,
      baseRateUsdt: null,
      baseRateNex: null,
      signals: null,
      comparisonConfig: [],
    }, "PRODUCTION");

    expect(deferred).toMatchObject({ activationStatus: "DEFERRED", calibrationAvailable: false, revision: 2 });
    expect(() => parseOnboardingCalibration({ ...deferred, activationStatus: "ACTIVE" }, "PRODUCTION")).toThrow();
  });

  it("sends raw signals and idempotency key without client final facts", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    const api = createOnboardingCalibrationApi({ request } as never);
    const signals: CalibrationSignals = valid.signals;
    await api.calibrate("device-a", signals, 1, "calibration-key");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/api/onboarding/calibrate",
      idempotencyKey: "calibration-key",
      body: { deviceId: "device-a", expectedRevision: 1, signals },
    }));
    expect(request.mock.calls[0][0].body).not.toHaveProperty("tier");
    expect(request.mock.calls[0][0].body).not.toHaveProperty("baseRateUsdt");
  });

  it("preserves unknown raw observations as null instead of inventing values", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    const api = createOnboardingCalibrationApi({ request } as never);
    const signals: CalibrationRequestSignals = { ...valid.signals, pingMs: null, batteryLevel: null, charging: null, networkReachable: null };
    await api.calibrate("device-a", signals, 1, "calibration-key");
    expect(request.mock.calls[0][0].body.signals).toMatchObject({ pingMs: null, batteryLevel: null, charging: null, networkReachable: null });
  });

  it("uses separate idempotent activation and defer commands", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ...valid, activationStatus: "ACTIVE", revision: 3 })
      .mockResolvedValueOnce({ ...valid, activationStatus: "DEFERRED", revision: 4 });
    const api = createOnboardingCalibrationApi({ request } as never);

    await api.activate("device-a", 2, "phone-active-001");
    await api.defer("device-a", 3, "phone-defer-001");

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: "POST", path: "/api/onboarding/calibrate/activate", idempotencyKey: "phone-active-001",
      body: { deviceId: "device-a", expectedRevision: 2 },
    }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "POST", path: "/api/onboarding/calibrate/defer", idempotencyKey: "phone-defer-001",
      body: { deviceId: "device-a", expectedRevision: 3 },
    }));
  });
});
