import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createDeviceE3Api } from "./device-e3-api";

function client(payload: unknown): ApiClient {
  return {
    request: vi.fn().mockResolvedValue(payload),
    upload: vi.fn(),
    refreshSession: vi.fn(),
  } as unknown as ApiClient;
}

describe("device E3 eligibility API", () => {
  function fleetPayload(capacityPct: number) {
    return {
      dailyUsdt: 1,
      dailyNex: 2,
      realizedTodayUsdt: 0,
      realizedTodayNex: 0,
      walletUsdt: 0,
      walletNex: 0,
      userJoinedAt: 1,
      serverNow: 1_800_000_000_000,
      timezone: "Asia/Shanghai",
      slotCap: 6,
      source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      serverCanonical: true,
      capacitySchedule: { stageEarlyEnd: "3", stageMidEnd: "8", capacityFloorPct: "22", capacitySubsidyDays: "30", capacityBand1DeltaPct: "-4", capacityBand2DeltaPct: "-6", capacityBand3DeltaPct: "-23.7", capacityApplyToPhone: "false", capacityApplyToCloudShare: "false", capacityApplyToPcGpu: "false", capacityApplyToS1: "true", capacityApplyToPro: "true", capacityApplyToProV2: "true", capacityApplyToRackP1: "true", capacityApplyToRackP2: "true" },
      devices: [{
        id: 1, rowVersion: 1, instanceNo: "E3-1", name: "Box", deviceType: "BOX", productCode: "STELLARBOX-S1", status: "ACTIVE", pendingDeactivate: false,
        activatedAt: 1, purchasedAt: 1, dailyUsdt: 1, dailyNex: 1, todayEarningsUsdt: 0, todayEarningsNex: 0,
        gpuModel: "GPU", vramTotalGb: 1, basePowerW: 1, location: "Local", capacityPct, capacityAgeMonths: 1,
        capacityConfigKey: "capacityApplyToS1", capacitySubsidized: false, capacitySubsidyDays: 30,
        capacitySubsidyRemainingDays: 0, capacitySubsidyEndsAt: 1_702_592_000_000,
        actualPaidUsdt: 1, cumulativeOutputUsdt: 0,
      }],
    };
  }

  it.each([[-0.0001, "below zero"], [100.0001, "above one hundred"]] as const)(
    "rejects E3 capacityPct %s (%s) instead of accepting an impossible projection",
    async (capacityPct) => {
      const api = createDeviceE3Api(client(fleetPayload(capacityPct)));
      await expect(api.fleet()).rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });
    },
  );

  it("accepts the Java canonical fleet in development mode", async () => {
    const api = createDeviceE3Api(client(fleetPayload(66.5)), "dev");

    await expect(api.fleet()).resolves.toMatchObject({
      source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      serverCanonical: true,
      devices: [{ instanceNo: "E3-1", capacityPct: 66.5, deactivatedAt: null }],
    });
  });

  it("preserves a new backend deactivation time while accepting its absence from an older backend", async () => {
    const current = fleetPayload(100);
    (current.devices[0] as Record<string, unknown>).deactivatedAt = 1_800_000_000_000;

    await expect(createDeviceE3Api(client(current), "dev").fleet()).resolves.toMatchObject({
      devices: [{ deactivatedAt: 1_800_000_000_000 }],
    });
    await expect(createDeviceE3Api(client(fleetPayload(100)), "dev").fleet()).resolves.toMatchObject({
      devices: [{ deactivatedAt: null }],
    });
  });

  it("reads calibrated phone capability while keeping older fleet responses unknown", async () => {
    const calibrated = fleetPayload(100);
    Object.assign(calibrated.devices[0], {
      deviceType: "MOBILE", productCode: "phone", gpuModel: "Mobile NPU · ~32.3 TOPS",
      capabilityTops: 32.3, capabilityTier: 3,
    });
    await expect(createDeviceE3Api(client(calibrated), "dev").fleet()).resolves.toMatchObject({
      devices: [{ capabilityTops: 32.3, capabilityTier: 3 }],
    });
    await expect(createDeviceE3Api(client(fleetPayload(100)), "dev").fleet()).resolves.toMatchObject({
      devices: [{ capabilityTops: null, capabilityTier: null }],
    });
  });

  it("rejects an invalid server phone capability instead of displaying a false value", async () => {
    const invalid = fleetPayload(100);
    Object.assign(invalid.devices[0], { capabilityTops: 0, capabilityTier: 6 });
    await expect(createDeviceE3Api(client(invalid), "dev").fleet()).rejects.toMatchObject({
      message: "E3_CANONICAL_RESPONSE_INVALID",
    });
  });

  it("projects the server-owned trade-in early-access policy", async () => {
    const api = createDeviceE3Api(client({
      enabled: true,
      eligibility: "全部用户",
      outputRatioCutsPct: [25, 50, 75, 100],
      creditRatesPct: [75, 60, 45, 30, 15],
      requireHigherPrice: true,
      maxDevicesPerOrder: 1,
      earlyAccessEnabled: true,
      earlyAccessLeadDays: 30,
      source: "nx_compute_e3_config",
    }));

    await expect(api.tradeinConfig()).resolves.toMatchObject({
      earlyAccessEnabled: true,
      earlyAccessLeadDays: 30,
    });
  });

  it("preserves the server-authored subsidy deadline and true remaining days", async () => {
    const payload = fleetPayload(100);
    payload.devices[0] = {
      ...payload.devices[0],
      capacitySubsidized: true,
      capacitySubsidyRemainingDays: 29,
      capacitySubsidyEndsAt: payload.serverNow + 28 * 86_400_000 + 23 * 3_600_000,
    };

    await expect(createDeviceE3Api(client(payload), "dev").fleet()).resolves.toMatchObject({
      devices: [{
        capacitySubsidized: true,
        capacitySubsidyDays: 30,
        capacitySubsidyRemainingDays: 29,
        capacitySubsidyEndsAt: payload.devices[0].capacitySubsidyEndsAt,
      }],
    });
  });

  it("rejects a remote fleet that omits or contradicts the server countdown", async () => {
    const missing = fleetPayload(100) as ReturnType<typeof fleetPayload> & {
      devices: Array<Record<string, unknown>>;
    };
    delete (missing.devices[0] as { capacitySubsidyRemainingDays?: unknown })
      .capacitySubsidyRemainingDays;
    await expect(createDeviceE3Api(client(missing), "dev").fleet())
      .rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });

    const contradictory = fleetPayload(100);
    contradictory.devices[0] = {
      ...contradictory.devices[0],
      capacitySubsidized: false,
      capacitySubsidyRemainingDays: 9,
      capacitySubsidyEndsAt: contradictory.serverNow + 9 * 86_400_000,
    };
    await expect(createDeviceE3Api(client(contradictory), "dev").fleet())
      .rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });

    const dishonestRemainingDays = fleetPayload(100);
    dishonestRemainingDays.devices[0] = {
      ...dishonestRemainingDays.devices[0],
      capacitySubsidized: true,
      capacitySubsidyRemainingDays: 29,
      capacitySubsidyEndsAt: dishonestRemainingDays.serverNow + 3_600_000,
    };
    await expect(createDeviceE3Api(client(dishonestRemainingDays), "dev").fleet())
      .rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });

    const fractionalDeadline = fleetPayload(100);
    fractionalDeadline.devices[0] = {
      ...fractionalDeadline.devices[0],
      capacitySubsidyEndsAt: fractionalDeadline.serverNow + 3_600_000.5,
    };
    await expect(createDeviceE3Api(client(fractionalDeadline), "dev").fleet())
      .rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });
  });

  it("rejects a retired sandbox fleet in development mode", async () => {
    const payload = {
      ...fleetPayload(66.5),
      sourceEnvironment: "SANDBOX",
      runId: "development-run",
    };
    const api = createDeviceE3Api(client(payload), "dev");

    await expect(api.fleet()).rejects.toMatchObject({ message: "E3_FLEET_PROVENANCE_INVALID" });
  });

  it("requests server eligibility and accepts only a complete server source projection", async () => {
    const request = vi.fn().mockResolvedValue({
      enabled: true,
      eligible: true,
      decisionCode: "ELIGIBLE",
      targetProductId: 22,
      targetProductNo: "stellarbox-pro-v2",
      targetProductName: "NexionBox Pro v2",
      targetPriceUsdt: 1500,
      requireHigherPrice: true,
      maxDevicesPerOrder: 3,
      sources: [{ sourceDeviceId: 11, sourceProductName: "Old", eligible: true, reasonCode: "OK" }],
      decisionSource: "server",
    });

    const api = createDeviceE3Api({ request } as unknown as ApiClient);
    await expect(api.eligibility("stellarbox-pro-v2")).resolves.toMatchObject({
      eligible: true,
      decisionCode: "ELIGIBLE",
      sources: [{ sourceDeviceId: 11, eligible: true, reasonCode: "OK" }],
    });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/app/trade-in/eligibility",
      body: { targetProductNo: "stellarbox-pro-v2" },
    });
  });

  it("rejects local or incomplete eligibility projections", async () => {
    const api = createDeviceE3Api(client({
      enabled: true,
      eligible: true,
      decisionCode: "ELIGIBLE",
      targetProductId: 22,
      targetProductNo: "stellarbox-pro-v2",
      targetProductName: "NexionBox Pro v2",
      targetPriceUsdt: 1500,
      requireHigherPrice: true,
      maxDevicesPerOrder: 3,
      sources: [{ sourceDeviceId: 11, sourceProductName: "Old", eligible: true, reasonCode: "OK" }],
      decisionSource: "local",
    }));

    await expect(api.eligibility("stellarbox-pro-v2")).rejects.toMatchObject({
      message: "TRADEIN_ELIGIBILITY_RESPONSE_INVALID",
    });
  });

  it("rejects an eligible response containing an ineligible source", async () => {
    const api = createDeviceE3Api(client({
      enabled: true,
      eligible: true,
      decisionCode: "ELIGIBLE",
      targetProductId: 22,
      targetProductNo: "stellarbox-pro-v2",
      targetProductName: "NexionBox Pro v2",
      targetPriceUsdt: 1500,
      requireHigherPrice: true,
      maxDevicesPerOrder: 3,
      sources: [{ sourceDeviceId: 11, sourceProductName: "Old", eligible: false, reasonCode: "OK" }],
      decisionSource: "server",
    }));

    await expect(api.eligibility("stellarbox-pro-v2")).rejects.toMatchObject({
      message: "TRADEIN_ELIGIBILITY_RESPONSE_INVALID",
    });
  });

  it("rejects an unknown source reason code", async () => {
    const api = createDeviceE3Api(client({
      enabled: true,
      eligible: false,
      decisionCode: "NO_ELIGIBLE_SOURCE",
      targetProductId: 22,
      targetProductNo: "stellarbox-pro-v2",
      targetProductName: "NexionBox Pro v2",
      targetPriceUsdt: 1500,
      requireHigherPrice: true,
      maxDevicesPerOrder: 3,
      sources: [{ sourceDeviceId: 11, sourceProductName: "Old", eligible: false, reasonCode: "CLIENT_GUESSED" }],
      decisionSource: "server",
    }));

    await expect(api.eligibility("stellarbox-pro-v2")).rejects.toMatchObject({
      message: "TRADEIN_ELIGIBILITY_RESPONSE_INVALID",
    });
  });
});
