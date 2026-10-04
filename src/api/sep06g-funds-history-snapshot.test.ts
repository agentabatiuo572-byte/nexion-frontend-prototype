import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createRepurchaseApi } from "./repurchase-api";
import { createStakingApi } from "./staking-api";
import { createWithdrawalApi } from "./withdrawal-api";

const STAKING_SOURCE = "nx_staking_product + nx_config_item + nx_emergency_control_setting";
const REPURCHASE_SOURCE = "nx_repurchase_product + nx_config_item + nx_emergency_control_setting";
const SERVER_TIME = "2026-09-06T12:34:56+08:00";

function client(responses: unknown[]): ApiClient {
  return { request: vi.fn(async () => responses.shift()) } as unknown as ApiClient;
}

function withdrawal(index: number) {
  return {
    withdrawalNo: `WD-${index}`, targetAddress: "0x1234567890123456789012345678901234567890",
    amount: 25, chain: "USDT-BEP20", status: "REVIEW_PENDING", holdUntil: SERVER_TIME,
    createdAt: SERVER_TIME, networkConfirmUsd: 1, networkFee: 1, penaltyFee: 0, grossFee: 1,
    nexBurned: 0, feeWaived: 0, actualFee: 1, netReceive: 24, policyVersion: "p1",
    useNexFeeOffset: false, riskRoute: "delay", idSource: "server",
  };
}

function withdrawalPage(pageNum: number, withdrawals: unknown[], total: number, snapshotId?: unknown) {
  return {
    source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION", withdrawals,
    page: { pageNum, pageSize: 50, total, ...(snapshotId === undefined ? {} : { snapshotId }) },
  };
}

function position(index: number) {
  return {
    positionNo: `STK-${index}`, tierKey: "usdt30d", productCode: "USDT30D", productName: "USDT 30D",
    amountUsdt: 25, termDays: 30, apyPct: 10, penaltyPct: 2, lockedAt: SERVER_TIME,
    unlockAt: "2026-10-06T12:34:56+08:00", estimatedInterestUsdt: 1, status: "ACTIVE",
  };
}

function stakingPage(pageNum: number, positions: unknown[], total: number, snapshotId?: unknown) {
  return {
    serverCanonical: true, source: STAKING_SOURCE, sourceEnvironment: "PRODUCTION", runId: "",
    walletBalanceUsdt: 100, serverTime: SERVER_TIME, positions,
    positionsPage: { pageNum, pageSize: 50, total, ...(snapshotId === undefined ? {} : { snapshotId }) },
  };
}

function order(index: number) {
  return {
    orderNo: `RPS-ORDER${String(index).padStart(4, "0")}`, amountUsdt: 25, apyPct: 10,
    earlyPenaltyPct: 2, lockDays: 30, lockedAt: SERVER_TIME,
    unlockAt: "2026-10-06T12:34:56+08:00", estimatedInterestUsdt: 1, status: "ACTIVE",
  };
}

function repurchasePage(pageNum: number, orders: unknown[], total: number, snapshotId?: unknown) {
  return {
    serverCanonical: true, source: REPURCHASE_SOURCE, sourceEnvironment: "PRODUCTION", runId: "",
    walletBalanceUsdt: 100, serverTime: SERVER_TIME, orders,
    ordersPage: { pageNum, pageSize: 50, total, ...(snapshotId === undefined ? {} : { snapshotId }) },
  };
}

describe("Sep-06 funds-history snapshot pagination", () => {
  it("keeps rolling-deploy responses without snapshotId compatible", async () => {
    await expect(createWithdrawalApi(client([
      withdrawalPage(1, [withdrawal(1)], 1),
    ])).list()).resolves.toHaveLength(1);
    await expect(createStakingApi(client([
      stakingPage(1, [position(1)], 1),
    ])).fetchStakingPositions()).resolves.toMatchObject({ positions: [expect.any(Object)] });
    await expect(createRepurchaseApi(client([
      repurchasePage(1, [order(1)], 1),
    ])).fetchOrders()).resolves.toMatchObject({ orders: [expect.any(Object)] });
  });

  it("pins withdrawal pagination to the first server snapshot and returns every row", async () => {
    const apiClient = client([
      withdrawalPage(1, Array.from({ length: 50 }, (_, index) => withdrawal(index + 1)), 51, "9001"),
      withdrawalPage(2, [withdrawal(51)], 51, "9001"),
    ]);

    const result = await createWithdrawalApi(apiClient).list();

    expect(result).toHaveLength(51);
    expect((apiClient.request as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]?.path)
      .toBe("/api/withdrawals?pageNum=2&pageSize=50&snapshotId=9001");
  });

  it("rejects malformed or changed withdrawal snapshot ids", async () => {
    await expect(createWithdrawalApi(client([
      withdrawalPage(1, [withdrawal(1)], 1, "not-a-decimal-id"),
    ])).list()).rejects.toThrow();
    await expect(createWithdrawalApi(client([
      withdrawalPage(1, Array.from({ length: 50 }, (_, index) => withdrawal(index + 1)), 51, "9001"),
      withdrawalPage(2, [withdrawal(51)], 51, "9002"),
    ])).list()).rejects.toThrow();
  });

  it("pins staking pagination to the first server snapshot and returns every row", async () => {
    const apiClient = client([
      stakingPage(1, Array.from({ length: 50 }, (_, index) => position(index + 1)), 51, "9001"),
      stakingPage(2, [position(51)], 51, "9001"),
    ]);

    const result = await createStakingApi(apiClient).fetchStakingPositions();

    expect(result.positions).toHaveLength(51);
    expect((apiClient.request as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]?.path)
      .toBe("/api/stakes?pageNum=2&pageSize=50&snapshotId=9001");
  });

  it("rejects malformed or changed staking snapshot ids", async () => {
    await expect(createStakingApi(client([
      stakingPage(1, [position(1)], 1, "not-a-decimal-id"),
    ])).fetchStakingPositions()).rejects.toThrow();
    await expect(createStakingApi(client([
      stakingPage(1, Array.from({ length: 50 }, (_, index) => position(index + 1)), 51, "9001"),
      stakingPage(2, [position(51)], 51, "9002"),
    ])).fetchStakingPositions()).rejects.toThrow();
  });

  it("pins repurchase pagination to the first server snapshot and returns every row", async () => {
    const apiClient = client([
      repurchasePage(1, Array.from({ length: 50 }, (_, index) => order(index + 1)), 51, "9001"),
      repurchasePage(2, [order(51)], 51, "9001"),
    ]);

    const result = await createRepurchaseApi(apiClient).fetchOrders();

    expect(result.orders).toHaveLength(51);
    expect((apiClient.request as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]?.path)
      .toBe("/api/repurchase/orders?pageNum=2&pageSize=50&snapshotId=9001");
  });

  it("rejects malformed or changed repurchase snapshot ids", async () => {
    await expect(createRepurchaseApi(client([
      repurchasePage(1, [order(1)], 1, "not-a-decimal-id"),
    ])).fetchOrders()).rejects.toThrow();
    await expect(createRepurchaseApi(client([
      repurchasePage(1, Array.from({ length: 50 }, (_, index) => order(index + 1)), 51, "9001"),
      repurchasePage(2, [order(51)], 51, "9002"),
    ])).fetchOrders()).rejects.toThrow();
  });
});
