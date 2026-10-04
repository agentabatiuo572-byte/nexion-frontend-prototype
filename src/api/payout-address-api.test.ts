import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createPayoutAddressApi, payoutAddressEpochMs } from "./payout-address-api";

const productionSnapshot = {
  addresses: [],
  serverNowEpochMs: 1_800_000_000_000,
  changeCooldownDays: 7,
  effectiveDelayHours: 24,
  inFlightWithdrawalBlocked: true,
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  serverCanonical: true,
};

function clientReturning(value: unknown): ApiClient {
  return { request: vi.fn().mockResolvedValue(value) } as unknown as ApiClient;
}

describe("payout address Java provenance", () => {
  it("reads unzoned payout timestamps in the backend business zone", () => {
    expect(payoutAddressEpochMs("2026-09-07 12:34:56"))
      .toBe(Date.parse("2026-09-07T12:34:56+08:00"));
  });

  it.each(["dev", "prod"] as const)("accepts the production-shaped server projection in %s", async (mode) => {
    await expect(createPayoutAddressApi(clientReturning(productionSnapshot), mode).list())
      .resolves.toMatchObject({ source: "server", sourceEnvironment: "PRODUCTION", runId: "" });
  });

  it("rejects a disabled in-flight withdrawal protection policy", async () => {
    await expect(createPayoutAddressApi(clientReturning({
      ...productionSnapshot,
      inFlightWithdrawalBlocked: false,
    }), "prod").list()).rejects.toMatchObject({ message: "PAYOUT_ADDRESS_RESPONSE_INVALID" });
  });

  it("rejects a non-boolean in-flight state", async () => {
    await expect(createPayoutAddressApi(clientReturning({
      ...productionSnapshot,
      inFlightWithdrawalBlocked: "false",
    }), "prod").list()).rejects.toMatchObject({ message: "PAYOUT_ADDRESS_RESPONSE_INVALID" });
  });

  it("rejects the retired sandbox projection in formal dev", async () => {
    const sandbox = {
      ...productionSnapshot,
      source: "mock",
      sourceEnvironment: "SANDBOX",
      runId: "sandbox-run-1",
    };
    await expect(createPayoutAddressApi(clientReturning(sandbox), "dev").list())
      .rejects.toMatchObject({ message: "PAYOUT_ADDRESS_PROVENANCE_INVALID" });
  });

  it("keeps a legacy snapshot readable but marks its clock unavailable", async () => {
    const legacy = { ...productionSnapshot } as Record<string, unknown>;
    delete legacy.serverNowEpochMs;

    await expect(createPayoutAddressApi(clientReturning(legacy), "prod").list())
      .resolves.toMatchObject({ serverNowEpochMs: null });
  });

  it("does not accept an invalid server clock as authoritative", async () => {
    await expect(createPayoutAddressApi(clientReturning({ ...productionSnapshot, serverNowEpochMs: "tomorrow" }), "prod").list())
      .rejects.toMatchObject({ message: "PAYOUT_ADDRESS_RESPONSE_INVALID" });
  });
});
