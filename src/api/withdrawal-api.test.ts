import { expect, test, vi } from "vitest";
import { createWithdrawalApi, toCanonicalWithdrawal } from "./withdrawal-api";

const row = {
  withdrawalNo: "WD-1", targetAddress: "0x1234567890123456789012345678901234567890",
  amount: 25, chain: "USDT-BEP20", status: "REVIEW_PENDING", holdUntil: "2026-08-20T00:00:00Z",
  createdAt: "2026-08-15T00:00:00Z", networkConfirmUsd: 1, networkFee: 1, penaltyFee: 0,
  grossFee: 1, nexBurned: 0, feeWaived: 0, actualFee: 1, netReceive: 24,
  policyVersion: "p1", useNexFeeOffset: false, riskRoute: "delay", idSource: "server",
};

test("accepts an explicit zero-day policy and rejects negative, fractional or missing days", async () => {
  const policy = {
    minAmount: 20, dailyLimitCount: 10, balanceMaxRatio: 0.8, smallAmountThresholdUsd: 50,
    strongReviewThresholdUsdt: 1000, payoutSlaHours: 24,
    networkConfirmFeeUsd: { trc20: 1, bep20: 1, erc20: 5 }, nexFeeOffsetRate: 0.4,
    policyVersion: "4", cooldownDays: 0, currentPhase: "P2", currentMonth: 3,
    complianceHoldEnabled: false, withdrawalEnabled: true, gateSource: "J1",
    enabledNetworks: ["USDT-TRC20"], source: "D5+H1",
  };
  const api = createWithdrawalApi({ request: async () => policy } as never);
  await expect(api.policy()).resolves.toMatchObject({ cooldownDays: 0, dailyLimitCount: 10 });
  await expect(createWithdrawalApi({ request: async () => ({ ...policy, enabledNetworks: [] }) } as never).policy())
    .resolves.toMatchObject({ enabledNetworks: [], withdrawalEnabled: true });
  for (const days of [-1, 0.5, undefined, null, "", false]) {
    const invalid = createWithdrawalApi({ request: async () => ({ ...policy, cooldownDays: days }) } as never);
    await expect(invalid.policy()).rejects.toThrow("WITHDRAWAL_POLICY_INVALID");
  }
});

test("hydrates the durable withdrawal list and sends the server eligibility snapshot request", async () => {
  const requests: any[] = [];
  const api = createWithdrawalApi({ request: async (request: any) => {
    requests.push(request);
    if (request.method === "GET") return {
      source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION", withdrawals: [row],
      page: { pageNum: 1, pageSize: 50, total: 1, hasMore: false },
    };
    return {
      canSubmit: true, maxWithdrawableUsdt: 100, route: "delay", riskReasons: ["K3_ROUTE:delay"],
      fastLaneApplied: false, waivedGates: [], dailyLimitReached: false,
      dailyCountResetAt: 1786838400000, configVersion: "p1",
    };
  }} as never);
  await expect(api.list()).resolves.toMatchObject([{ withdrawalNo: "WD-1", targetAddress: row.targetAddress }]);
  await expect(api.eligibility({ amount: 25, chain: "USDT-BEP20", address: row.targetAddress, policyVersion: "p1" })).resolves.toMatchObject({ route: "delay" });
  expect(requests[0].path).toBe("/api/withdrawals?pageNum=1&pageSize=50");
  expect(requests[1].path).toBe("/api/withdrawals/eligibility");
  expect(requests[1].body.policyVersion).toBe("p1");
});

test("does not send a preflight with a missing policy version", async () => {
  const request = vi.fn();
  const api = createWithdrawalApi({ request } as never);
  await expect(api.eligibility({ amount: 20, chain: "USDT-BEP20", address: row.targetAddress,
    policyVersion: " " })).rejects.toThrow("WITHDRAWAL_POLICY_VERSION_REQUIRED");
  expect(request).not.toHaveBeenCalled();
});

test("reads the exact owned withdrawal detail instead of discarding its cold-restore fields", async () => {
  const request = vi.fn().mockResolvedValue({
    source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION", withdrawal: row,
  });
  const api = createWithdrawalApi({ request } as never);

  await expect(api.get("WD-1")).resolves.toMatchObject({
    withdrawalNo: "WD-1",
    status: "review-pending",
    withdrawal: { withdrawalNo: "WD-1", targetAddress: row.targetAddress },
  });
  expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/withdrawals/WD-1" });
});

test("rejects an exact withdrawal response if its authenticated route returns another user's receipt", async () => {
  const api = createWithdrawalApi({ request: async () => ({
    source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION",
    withdrawal: { ...row, withdrawalNo: "WD-OTHER" },
  }) } as never);

  await expect(api.get("WD-1")).rejects.toThrow("WITHDRAWAL_RESPONSE_INVALID");
});

test("rejects a non-terminal exact receipt that lacks its authoritative hold deadline", async () => {
  const api = createWithdrawalApi({ request: async () => ({
    source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION",
    withdrawal: { ...row, holdUntil: null },
  }) } as never);

  await expect(api.get("WD-1")).rejects.toThrow("WITHDRAWAL_RESPONSE_INVALID");
});

test("accepts the server strong-review receipt before mapping it to the client manual route", async () => {
  const api = createWithdrawalApi({ request: async () => ({
    source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION",
    withdrawals: [{ ...row, riskRoute: "strong-review" }],
    page: { pageNum: 1, pageSize: 50, total: 1, hasMore: false },
  }) } as never);

  await expect(api.list()).resolves.toMatchObject([{ withdrawalNo: "WD-1", riskRoute: "strong-review" }]);
});

test("accepts a legacy confirmed fast-pass history row without inventing a hold time", async () => {
  const api = createWithdrawalApi({ request: async () => ({
    source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION",
    withdrawals: [{ ...row, status: "CONFIRMED", riskRoute: "fast-pass", holdUntil: null,
      createdAt: "2026-09-07 00:30:00" }],
    page: { pageNum: 1, pageSize: 50, total: 1, hasMore: false },
  }) } as never);

  const [legacy] = await api.list();
  expect(legacy.holdUntil).toBeUndefined();
  expect(toCanonicalWithdrawal(legacy, row.targetAddress).estimatedCompletion)
    .toBe(Date.parse("2026-09-07T00:30:00+08:00"));
  expect(toCanonicalWithdrawal(legacy, row.targetAddress).riskRoute).toBe("pass");
});

test("keeps hold time mandatory for current non-terminal withdrawal receipts", async () => {
  const api = createWithdrawalApi({ request: async () => ({
    source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION",
    withdrawals: [{ ...row, riskRoute: "fast-pass", holdUntil: null }],
    page: { pageNum: 1, pageSize: 50, total: 1, hasMore: false },
  }) } as never);

  await expect(api.list()).rejects.toThrow("WITHDRAWAL_RESPONSE_INVALID");
});

test("abandons an ambiguous attempt through the server fence instead of deleting local proof first", async () => {
  let request: any;
  const api = createWithdrawalApi({ request: async (value: any) => {
    request = value;
    return { state: "ABANDONED", withdrawal: null };
  }} as never);

  await expect(api.abandonAttempt({
    idempotencyKey: "withdrawal:ambiguous-1", amount: 25, chain: "USDT-BEP20",
    address: row.targetAddress, policyVersion: "p1", useNexFeeOffset: false,
  })).resolves.toEqual({ state: "ABANDONED", withdrawal: null });
  expect(request).toMatchObject({
    method: "POST", path: "/api/withdrawals/attempts/withdrawal%3Aambiguous-1/abandon",
    body: { amount: 25, chain: "USDT-BEP20", address: row.targetAddress, policyVersion: "p1", useNexFeeOffset: false },
  });
});
