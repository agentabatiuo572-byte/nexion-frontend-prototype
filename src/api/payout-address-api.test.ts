import { describe, expect, it, vi } from "vitest";
import type { ApiClient, ApiRequest } from "./api-client";
import { createPayoutAddressApi, payoutAddressEpochMs } from "./payout-address-api";
// @ts-expect-error Standalone demo is intentionally outside production sources.
import { bankDemo } from "../../scripts/lib/prototype-demo-bank.mjs";

it("loopback address replacement validates OTP, reads back pending state and reuses its command", async () => {
  const state = { dataState: "normal" };
  const api = createPayoutAddressApi({ request: async (r: ApiRequest) => bankDemo(new URL(r.path, "http://127.0.0.1"), state, {
    method: () => r.method || "GET", postDataJSON: () => r.body, headers: () => ({ "idempotency-key": r.idempotencyKey }),
  }) } as never);
  const otp = await api.sendOtp();
  const input = { network: "USDT-BEP20" as const, address: '0x' + '2'.repeat(40), challengeNo: otp.challengeNo, code: '000000', idempotencyKey: 'local-address' };
  await expect(api.save(input)).rejects.toThrow('OTP_INVALID');
  input.code = '123456';
  const saved = await api.save(input);
  expect(saved.changePending).toBe(true);
  expect(await api.save(input)).toEqual(saved);
  expect((await api.list()).addresses).toEqual([saved]);
  await expect(api.save({ ...input, address: '0x' + '3'.repeat(40) })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
});

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
