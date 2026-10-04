import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import type { OnboardingCalibration } from "@/api/onboarding-calibration-api";

const api = vi.hoisted(() => ({
  result: vi.fn(),
  defer: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({ onboardingCalibrationApi: api }));

import { confirmDeferredPhoneActivation } from "./defer-phone-activation";

function deferred(revision = 0): OnboardingCalibration {
  return {
    userId: 42,
    deviceId: "device-12345678",
    serverCanonical: true,
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    revision,
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
  };
}

function calibrated(revision = 1): OnboardingCalibration {
  return {
    userId: 42,
    deviceId: "device-12345678",
    serverCanonical: true,
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    revision,
    configRevision: 7,
    activationStatus: "CALIBRATED",
    calibrationAvailable: true,
    score: 80,
    tier: 3,
    tierName: "T3",
    tops: 24,
    baseRateUsdt: 0.2,
    baseRateNex: 2,
    signals: {
      memGB: 8,
      cores: 8,
      model: "Test phone",
      brand: "Test",
      gpu: "Test GPU",
      pxDensity: 420,
      pingMs: 30,
      batteryLevel: 80,
      charging: false,
      networkReachable: true,
    },
    comparisonConfig: [{ key: "phone", label: "Phone", dailyUsdt: 0.2, dailyNex: 2, sortOrder: 1 }],
  };
}

function options() {
  return {
    deviceId: "device-12345678",
    command: (revision: number) => ({ revision, idempotencyKey: "phone-activation:deferred:fixed" }),
    isCurrent: () => true,
    accept: () => true,
  };
}

describe("confirmDeferredPhoneActivation", () => {
  beforeEach(() => {
    api.result.mockReset();
    api.defer.mockReset();
  });

  it("records a revision-0 DEFERRED tombstone when calibration never produced a row", async () => {
    api.result.mockRejectedValueOnce(new ApiError({ kind: "http", status: 404, message: "missing" }));
    api.defer.mockResolvedValueOnce(deferred());

    await expect(confirmDeferredPhoneActivation(options())).resolves.toEqual(deferred());
    expect(api.defer).toHaveBeenCalledWith(
      "device-12345678",
      0,
      "phone-activation:deferred:fixed",
    );
  });

  it("accepts a DEFERRED readback after an ambiguous command response without replaying a second mutation", async () => {
    api.result
      .mockRejectedValueOnce(new ApiError({ kind: "http", status: 404, message: "missing" }))
      .mockResolvedValueOnce(deferred());
    api.defer.mockRejectedValueOnce(new ApiError({ kind: "network", message: "lost response" }));

    await expect(confirmDeferredPhoneActivation(options())).resolves.toEqual(deferred());
    expect(api.defer).toHaveBeenCalledTimes(1);
    expect(api.result).toHaveBeenCalledTimes(2);
  });

  it("replays the exact revision-0 command when an ambiguous failure still reads back as missing", async () => {
    api.result
      .mockRejectedValueOnce(new ApiError({ kind: "http", status: 404, message: "missing" }))
      .mockRejectedValueOnce(new ApiError({ kind: "http", status: 404, message: "still missing" }));
    api.defer
      .mockRejectedValueOnce(new ApiError({ kind: "network", message: "connection reset" }))
      .mockResolvedValueOnce(deferred());

    await expect(confirmDeferredPhoneActivation(options())).resolves.toEqual(deferred());
    expect(api.defer).toHaveBeenCalledTimes(2);
    expect(api.defer.mock.calls[0]).toEqual(api.defer.mock.calls[1]);
  });

  it("does not replay a server-settled business rejection", async () => {
    const rejection = new ApiError({ kind: "business", status: 200, code: 409, message: "revision conflict" });
    api.result
      .mockResolvedValueOnce(calibrated())
      .mockResolvedValueOnce(calibrated(2));
    api.defer.mockRejectedValueOnce(rejection);

    await expect(confirmDeferredPhoneActivation(options())).rejects.toBe(rejection);
    expect(api.defer).toHaveBeenCalledTimes(1);
  });

  it("accepts a concurrent DEFERRED winner after a CAS conflict without replaying a stale mutation", async () => {
    api.result
      .mockResolvedValueOnce(calibrated())
      .mockResolvedValueOnce(deferred(2));
    api.defer.mockRejectedValueOnce(new ApiError({ kind: "http", status: 409, message: "revision conflict" }));

    await expect(confirmDeferredPhoneActivation(options())).resolves.toEqual(deferred(2));
    expect(api.defer).toHaveBeenCalledTimes(1);
    expect(api.defer).toHaveBeenCalledWith(
      "device-12345678",
      1,
      "phone-activation:deferred:fixed",
    );
  });

  it("does not issue a new command when the canonical state is already DEFERRED", async () => {
    api.result.mockResolvedValueOnce(deferred(2));

    await expect(confirmDeferredPhoneActivation(options())).resolves.toEqual(deferred(2));
    expect(api.defer).not.toHaveBeenCalled();
  });

  it("rejects a stale account scope before it can mutate the server", async () => {
    api.result.mockResolvedValueOnce(deferred());

    await expect(confirmDeferredPhoneActivation({
      ...options(),
      isCurrent: () => false,
      accept: () => false,
    })).rejects.toThrow("ONBOARDING_CALIBRATION_SCOPE_STALE");
    expect(api.defer).not.toHaveBeenCalled();
  });
});
