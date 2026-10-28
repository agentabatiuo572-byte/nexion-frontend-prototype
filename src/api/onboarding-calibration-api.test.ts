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
const versions = { expectedBindingVersion: null, expectedPolicyVersion: 1, replacementConfirmed: false };

describe("onboarding calibration API", () => {
  it("reads nullable initial binding and rejects missing or invalid version metadata", async () => {
    const eligibility = { binding: null, policy: { policyVersion: 4 }, canReplace: true, blockedReasons: [], grant: null };
    const request = vi.fn().mockResolvedValue(eligibility);
    const api = createOnboardingCalibrationApi({ request } as never);
    expect(await api.activationEligibility()).toEqual({ binding: null, policyVersion: 4, canActivate: true, blockedReasons: [] });
    for (const invalid of [{ ...eligibility, binding: undefined }, { ...eligibility, policy: {} },
      { ...eligibility, binding: { installationId: "old", bindingVersion: null } },
      { ...eligibility, canReplace: "true" }, { ...eligibility, blockedReasons: [null] }]) {
      request.mockResolvedValue(invalid);
      await expect(api.activationEligibility()).rejects.toThrow("ONBOARDING_CALIBRATION_RESPONSE_INVALID");
    }
  });
  it("settles a retry only from its failed activation receipt", async () => {
    const request = vi.fn(); const api = createOnboardingCalibrationApi({ request } as never);
    for (const response of [null, { commandType: "PHONE_ACTIVATE", status: "PROCESSING" },
      { commandType: "PHONE_ACTIVATE", status: "SUCCEEDED" }, { commandType: "OTHER", status: "FAILED" }]) {
      request.mockResolvedValue(response); expect(await api.activationFailed("phone-key:1")).toBe(false);
    }
    request.mockResolvedValue({ commandType: "PHONE_ACTIVATE", status: "FAILED" });
    expect(await api.activationFailed("phone-key:1")).toBe(true);
    expect(request.mock.lastCall?.[0].path).toContain("idempotencyKey=phone-key%3A1");
  });
  afterEach(() => advanceRuntimeRevision(null));

  it("reads binding existence without an installation login or inferred fallback", async () => {
    const request = vi.fn().mockResolvedValue({ serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", hasBinding: false });
    const api = createOnboardingCalibrationApi({ request } as never);
    expect(await api.bindingStatus()).toBe(false);
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: "GET", path: "/api/onboarding/calibrate/binding-status" });
    for (const invalid of [null, {}, { serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", hasBinding: "false" },
      { serverCanonical: true, sourceEnvironment: "SANDBOX", runId: "", hasBinding: false }]) {
      request.mockResolvedValue(invalid);
      await expect(api.bindingStatus()).rejects.toThrow("ONBOARDING_CALIBRATION_RESPONSE_INVALID");
    }
  });

  it("sends initialOnly only for the explicit first-login defer and preserves normal command bodies", async () => {
    const request = vi.fn().mockResolvedValue({ ...valid, activationStatus: "DEFERRED" });
    const api = createOnboardingCalibrationApi({ request } as never);
    await api.defer("device-a", 2, "phone-defer-001", true);
    expect(request.mock.calls[0][0]).toMatchObject({ body: { deviceId: "device-a", expectedRevision: 2, initialOnly: true } });
    await api.defer("device-a", 2, "phone-defer-002");
    expect(request.mock.calls[1][0].body).toEqual({ deviceId: "device-a", expectedRevision: 2 });
  });

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
    await expect(api.activate("device-a", 2, "phone-active-001", versions)).rejects.toBe(denial);
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

  it("reads the stored iPhone allocation by model without needing the server-only range", () => {
    const iphone = { ...valid, calibrationStatus: "MATCHED", computeUnit: "platform", computeValue: 113.42, tops: 113.42, score: 113,
      tier: 5, ruleId: "ios-iphone-16-pro", ruleVersion: 4, calibrationMethod: "IOS_MODEL_RANGE", model: "iPhone 16 Pro",
      signals: { ...valid.signals, platform: "ios", soc: "", memGB: null, cores: null, model: "iPhone17,1", brand: "Apple", gpu: "" } };
    const parsed = parseOnboardingCalibration(iphone);
    expect(parsed).toMatchObject({ computeValue: 113.42, iosModel: { method: "IOS_MODEL_RANGE", model: "iPhone 16 Pro" } });
    expect(JSON.stringify(parsed)).not.toMatch(/minComputeValue|maxComputeValue|OPERATOR_PRESET/);
    // An older server that still sends the range parses the same; the range is never kept.
    expect(parseOnboardingCalibration({ ...iphone, minComputeValue: 100, maxComputeValue: 120, valueSource: "OPERATOR_PRESET" }))
      .toEqual(parsed);
    for (const change of [{ computeValue: 113.425, tops: 113.425 }, { calibrationMethod: "GPU_BENCHMARK" }, { model: "" },
      { calibrationStatus: "PENDING_VERIFICATION" }]) {
      expect(() => parseOnboardingCalibration({ ...iphone, ...change }), JSON.stringify(change)).toThrow();
    }
    expect(parseOnboardingCalibration({ ...valid, calibrationStatus: "MATCHED", computeUnit: "platform", computeValue: 28.3,
      ruleId: "fixture", ruleVersion: 2 }).iosModel).toBeUndefined();
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

    await api.activate("device-a", 2, "phone-active-001", versions);
    await api.defer("device-a", 3, "phone-defer-001");

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: "POST", path: "/api/onboarding/calibrate/activate", idempotencyKey: "phone-active-001",
      body: { deviceId: "device-a", expectedRevision: 2, ...versions },
    }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "POST", path: "/api/onboarding/calibrate/defer", idempotencyKey: "phone-defer-001",
      body: { deviceId: "device-a", expectedRevision: 3 },
    }));
  });
});
