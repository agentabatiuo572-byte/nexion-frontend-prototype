import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createDeviceE3Api } from "./device-e3-api";

const DAY_MS = 86_400_000;

function client(payload: unknown): ApiClient {
  return {
    request: vi.fn().mockResolvedValue(payload),
    upload: vi.fn(),
    refreshSession: vi.fn(),
  } as unknown as ApiClient;
}

function fleetPayload() {
  const serverNow = 1_800_000_000_000;
  return {
    dailyUsdt: 1,
    dailyNex: 2,
    realizedTodayUsdt: 0,
    realizedTodayNex: 0,
    walletUsdt: 0,
    walletNex: 0,
    userJoinedAt: 1,
    serverNow,
    timezone: "Asia/Shanghai",
    slotCap: 6,
    source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    serverCanonical: true,
    capacitySchedule: { capacitySubsidyDays: "30" },
    devices: [{
      id: 1,
      rowVersion: 1,
      instanceNo: "E3-1",
      name: "Box",
      deviceType: "BOX",
      productCode: "STELLARBOX-S1",
      status: "ACTIVE",
      pendingDeactivate: false,
      activatedAt: 1,
      purchasedAt: 1,
      dailyUsdt: 1,
      dailyNex: 1,
      todayEarningsUsdt: 0,
      todayEarningsNex: 0,
      gpuModel: "GPU",
      vramTotalGb: 1,
      basePowerW: 1,
      location: "Local",
      capacityPct: 100,
      capacityAgeMonths: 0,
      capacityConfigKey: "capacityApplyToS1",
      capacitySubsidized: true,
      capacitySubsidyDays: 30,
      capacitySubsidyRemainingDays: 29,
      capacitySubsidyEndsAt: serverNow + 28 * DAY_MS + 23 * 3_600_000,
      actualPaidUsdt: 1,
      cumulativeOutputUsdt: 0,
    }],
  };
}

describe("device E3 server countdown contract", () => {
  it("preserves the server-authored deadline and exact remaining days", async () => {
    const payload = fleetPayload();

    await expect(createDeviceE3Api(client(payload)).fleet()).resolves.toMatchObject({
      serverNow: payload.serverNow,
      devices: [{
        capacitySubsidized: true,
        capacitySubsidyRemainingDays: 29,
        capacitySubsidyEndsAt: payload.devices[0].capacitySubsidyEndsAt,
      }],
    });
  });

  it("fails closed when countdown fields are missing, contradictory, dishonest, or fractional", async () => {
    const missing = fleetPayload() as ReturnType<typeof fleetPayload> & {
      devices: Array<Record<string, unknown>>;
    };
    Reflect.deleteProperty(missing.devices[0], "capacitySubsidyRemainingDays");
    await expect(createDeviceE3Api(client(missing)).fleet())
      .rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });

    const contradictory = fleetPayload();
    contradictory.devices[0] = {
      ...contradictory.devices[0],
      capacitySubsidized: false,
    };
    await expect(createDeviceE3Api(client(contradictory)).fleet())
      .rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });

    const dishonest = fleetPayload();
    dishonest.devices[0] = {
      ...dishonest.devices[0],
      capacitySubsidyEndsAt: dishonest.serverNow + 3_600_000,
    };
    await expect(createDeviceE3Api(client(dishonest)).fleet())
      .rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });

    const fractional = fleetPayload();
    fractional.devices[0] = {
      ...fractional.devices[0],
      capacitySubsidyEndsAt: fractional.devices[0].capacitySubsidyEndsAt + 0.5,
    };
    await expect(createDeviceE3Api(client(fractional)).fleet())
      .rejects.toMatchObject({ message: "E3_CANONICAL_RESPONSE_INVALID" });
  });
});
