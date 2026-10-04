import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import type { OnboardingCalibration } from "@/api/onboarding-calibration-api";
import { estimatorCalibrationReadErrorState, estimatorCalibrationReadState } from "./estimator-calibration-read-state";

function canonical(status: OnboardingCalibration["activationStatus"], calibrationAvailable: boolean): OnboardingCalibration {
  return {
    userId: 7,
    deviceId: "device-12345678",
    serverCanonical: true,
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    revision: 1,
    configRevision: calibrationAvailable ? 4 : 0,
    activationStatus: status,
    calibrationAvailable,
    score: calibrationAvailable ? 80 : null,
    tier: calibrationAvailable ? 3 : null,
    tierName: calibrationAvailable ? "T3" : null,
    tops: calibrationAvailable ? 24 : null,
    baseRateUsdt: calibrationAvailable ? 0.2 : null,
    baseRateNex: calibrationAvailable ? 2 : null,
    signals: calibrationAvailable ? {
      memGB: 8, cores: 8, model: "Test", brand: "Test", gpu: null, pxDensity: 420,
      pingMs: null, batteryLevel: null, charging: null, networkReachable: null,
    } : null,
    comparisonConfig: calibrationAvailable ? [{ key: "phone", label: "Phone", dailyUsdt: 0.2, dailyNex: 2, sortOrder: 1 }] : [],
  } as OnboardingCalibration;
}

describe("estimator calibration read state", () => {
  it("keeps a missing calibration record actionable instead of treating it as detection failure", () => {
    expect(estimatorCalibrationReadErrorState(new ApiError({ kind: "http", status: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND" }))).toBe("not-started");
    expect(estimatorCalibrationReadErrorState(new ApiError({ kind: "business", status: 200, code: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND" }))).toBe("not-started");
  });

  it("keeps a persisted DEFERRED state distinct and makes canonical calibrated states ready", () => {
    expect(estimatorCalibrationReadState(canonical("DEFERRED", false))).toBe("deferred");
    expect(estimatorCalibrationReadState(canonical("CALIBRATED", true))).toBe("ready");
    expect(estimatorCalibrationReadState(canonical("ACTIVE", true))).toBe("ready");
  });

  it("leaves network and server failures retryable read errors", () => {
    expect(estimatorCalibrationReadErrorState(new ApiError({ kind: "http", status: 404, message: "HTTP_404" }))).toBe("error");
    expect(estimatorCalibrationReadErrorState(new ApiError({ kind: "network", message: "offline" }))).toBe("error");
    expect(estimatorCalibrationReadErrorState(new ApiError({ kind: "http", status: 503, message: "unavailable" }))).toBe("error");
  });
});
