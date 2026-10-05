import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import type { OnboardingCalibration } from "@/api/onboarding-calibration-api";
import { calibrationBelongsTo } from "@/lib/phone-calibration-flow";

const api = vi.hoisted(() => ({ result: vi.fn(), defer: vi.fn(), fleet: vi.fn() }));
vi.mock("@/api/runtime", () => ({ onboardingCalibrationApi: api, deviceE3Api: { fleet: api.fleet } }));
import { confirmInitialWebPhoneDeferral } from "./defer-phone-activation";

const missing = () => new ApiError({ kind: "http", status: 404, code: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND" });
const deferred = (): OnboardingCalibration => ({ userId: 42, deviceId: "web-install-42", serverCanonical: true,
  source: "server", sourceEnvironment: "PRODUCTION", runId: "", revision: 0, configRevision: 0,
  activationStatus: "DEFERRED", calibrationAvailable: false, score: null, tier: null, tierName: null,
  tops: null, baseRateUsdt: null, baseRateNex: null, signals: null, comparisonConfig: [], userDeviceId: null });
function options() {
  return { deviceId: "web-install-42", isCurrent: () => true,
    accept: (result: OnboardingCalibration) => calibrationBelongsTo(result, "user:42", "web-install-42"),
    command: vi.fn((revision: number) => ({ revision, idempotencyKey: "web-initial-defer:fixed-command" })) };
}

describe("initial H5 phone deferral", () => {
  beforeEach(() => { vi.resetAllMocks(); api.fleet.mockResolvedValue({ serverCanonical: true,
    sourceEnvironment: "PRODUCTION", runId: "", devices: [] }); });

  it("writes revision zero only after a true missing result/no phone and completes from a persistent GET", async () => {
    api.result.mockRejectedValueOnce(missing()).mockResolvedValueOnce(deferred());
    api.defer.mockResolvedValueOnce(deferred());
    const request = options();
    await expect(confirmInitialWebPhoneDeferral(request)).resolves.toEqual(deferred());
    expect(api.result).toHaveBeenCalledTimes(2);
    expect(api.fleet).toHaveBeenCalledOnce();
    expect(api.defer).toHaveBeenCalledExactlyOnceWith("web-install-42", 0, "web-initial-defer:fixed-command");
    expect(api.result.mock.invocationCallOrder[0]).toBeLessThan(api.fleet.mock.invocationCallOrder[0]);
    expect(api.fleet.mock.invocationCallOrder[0]).toBeLessThan(api.defer.mock.invocationCallOrder[0]);
    expect(api.defer.mock.invocationCallOrder[0]).toBeLessThan(api.result.mock.invocationCallOrder[1]);
  });
  it("restores existing DEFERRED with only GET", async () => {
    api.result.mockResolvedValue(deferred());
    await expect(confirmInitialWebPhoneDeferral(options())).resolves.toEqual(deferred());
    expect(api.defer).not.toHaveBeenCalled(); expect(api.fleet).not.toHaveBeenCalled();
  });
  it.each(["ACTIVE", "CALIBRATED"])("keeps existing %s read-only", async status => {
    api.result.mockResolvedValue({ ...deferred(), activationStatus: status, userDeviceId: 12 });
    await expect(confirmInitialWebPhoneDeferral(options())).rejects.toThrow("PHONE_WEB_SETUP_READ_ONLY");
    expect(api.defer).not.toHaveBeenCalled(); expect(api.fleet).not.toHaveBeenCalled();
  });
  it.each(["PHONE", "MOBILE", "mobile-npu"])("does not touch a bound %s on another installation", async deviceType => {
    api.result.mockRejectedValue(missing());
    api.fleet.mockResolvedValue({ serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
      devices: [{ deviceType, id: 12, activatedAt: null }] });
    await expect(confirmInitialWebPhoneDeferral(options())).rejects.toThrow("PHONE_WEB_SETUP_READ_ONLY");
    expect(api.defer).not.toHaveBeenCalled();
  });
  it.each([
    new ApiError({ kind: "http", status: 404, message: "HTTP_404" }),
    new ApiError({ kind: "http", status: 403, message: "FORBIDDEN" }),
    new ApiError({ kind: "http", status: 503, message: "UNAVAILABLE" }),
    new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" }),
  ])("does not treat %s as permission for initial deferral", async cause => {
    api.result.mockRejectedValue(cause);
    await expect(confirmInitialWebPhoneDeferral(options())).rejects.toBe(cause);
    expect(api.fleet).not.toHaveBeenCalled(); expect(api.defer).not.toHaveBeenCalled();
  });
  it("does not complete from POST when the mandatory GET is unavailable", async () => {
    api.result.mockRejectedValueOnce(missing()).mockRejectedValueOnce(new ApiError({ kind: "http", status: 503, message: "READ_UNAVAILABLE" }));
    api.defer.mockResolvedValueOnce(deferred());
    await expect(confirmInitialWebPhoneDeferral(options())).rejects.toThrow("READ_UNAVAILABLE");
  });
  it("restores an ambiguous committed POST via GET without another command", async () => {
    api.result.mockRejectedValueOnce(missing()).mockResolvedValueOnce(deferred());
    api.defer.mockRejectedValue(new ApiError({ kind: "network", message: "LOST_REPLY" }));
    await expect(confirmInitialWebPhoneDeferral(options())).resolves.toEqual(deferred());
    expect(api.defer).toHaveBeenCalledOnce();
  });
  it.each([{ userId: 7 }, { deviceId: "other-install" }, { sourceEnvironment: "SANDBOX" }, { runId: "other-run" }])(
    "rejects a foreign persisted readback %s", async mismatch => {
      api.result.mockRejectedValueOnce(missing()).mockResolvedValueOnce({ ...deferred(), ...mismatch });
      api.defer.mockResolvedValueOnce(deferred());
      await expect(confirmInitialWebPhoneDeferral(options())).rejects.toThrow("ONBOARDING_CALIBRATION_SCOPE_STALE");
    });
  it("does not POST after an account epoch changes during the fleet read", async () => {
    let current = true;
    api.result.mockRejectedValueOnce(missing());
    api.fleet.mockImplementation(async () => { current = false; return { devices: [] }; });
    await expect(confirmInitialWebPhoneDeferral({ ...options(), isCurrent: () => current })).rejects.toThrow("SCOPE_STALE");
    expect(api.defer).not.toHaveBeenCalled();
  });
  it("keeps conflict/rejected writes incomplete when readback has no DEFERRED fact", async () => {
    const conflict = new ApiError({ kind: "http", status: 409, message: "REVISION_CONFLICT" });
    api.result.mockRejectedValue(missing()); api.defer.mockRejectedValue(conflict);
    await expect(confirmInitialWebPhoneDeferral(options())).rejects.toBe(conflict);
    expect(api.defer).toHaveBeenCalledOnce();
  });
});
