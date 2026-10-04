import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createExchangeApi } from "./exchange-api";
import { advanceRuntimeRevision } from "./order-api";

const caps = {
  asset: "NEX",
  currency: "USDT",
  currentPrice: 0.125,
  userDailyCapUsdt: 50,
  platformDailyCapUsdt: 20000,
  feePct: 0,
  feeMinUsdt: 0.5,
  minUsdt: 3,
  minNex: 42,
  queueMode: "QUEUE",
  swapEnabled: true,
  serverCanonical: true,
  source: "G2/G3 server configuration",
  sourceEnvironment: "PRODUCTION",
  runId: "",
};

function client(response: unknown): ApiClient {
  return { request: vi.fn().mockResolvedValue(response) } as unknown as ApiClient;
}

describe("exchange server minimums", () => {
  beforeEach(() => advanceRuntimeRevision(null));
  it("keeps a failed queue order readable alongside completed orders", async () => {
    const orders = ["FAILED", "COMPLETED"].map((status, index) => ({
      exchangeNo: `EX-REGRESSION-000${index}`, fromAsset: "NEX", toAsset: "USDT",
      fromAmount: 10, toAmount: 1, rate: 0.1, status,
    }));
    const snapshot = { ...caps, caps, wallet: { usdtAvailable: 20, nexAvailable: 10 },
      todayUserUsedUsdt: 0, todayPlatformUsedUsdt: 0, lifetimeExchangedUsdt: 0,
      orders, ordersPage: { total: 2, pageNum: 1, pageSize: 20 } };
    await expect(createExchangeApi(client(snapshot)).fetchState()).resolves.toMatchObject({ orders });
    snapshot.orders[0].status = "UNRECOGNIZED";
    await expect(createExchangeApi(client(snapshot)).fetchState()).rejects.toMatchObject({ message: "EXCHANGE_STATE_RESPONSE_INVALID" });
  });
  it("reads direction-specific minimums from the canonical caps response", async () => {
    await expect(createExchangeApi(client(caps)).fetchCaps()).resolves.toMatchObject({ minUsdt: 3, minNex: 42 });
  });

  it("rejects older caps responses without explicit environment/run provenance", async () => {
    const { minUsdt: _minUsdt, minNex: _minNex, sourceEnvironment: _sourceEnvironment, runId: _runId, ...legacy } = caps;
    await expect(createExchangeApi(client(legacy)).fetchCaps()).rejects.toMatchObject({ message: "EXCHANGE_CAPS_RESPONSE_INVALID" });
  });

  it("rejects a sandbox caps response from a previous run", async () => {
    advanceRuntimeRevision("sandbox-run-2");
    const sandbox = { ...caps, sourceEnvironment: "SANDBOX", runId: "sandbox-run-1", swapEnabled: false };
    await expect(createExchangeApi(client(sandbox), "dev").fetchCaps())
      .rejects.toMatchObject({ message: "EXCHANGE_CAPS_RESPONSE_INVALID" });
  });

  it("pins later exchange history pages to the first server snapshot", async () => {
    const orders = [0, 1].map((index) => ({
      exchangeNo: `EX-SNAPSHOT-000${index}`, fromAsset: "USDT", toAsset: "NEX",
      fromAmount: 10, toAmount: 10, rate: 1, status: "COMPLETED",
    }));
    const snapshot = { ...caps, caps, wallet: { usdtAvailable: 20, nexAvailable: 10 },
      todayUserUsedUsdt: 0, todayPlatformUsedUsdt: 0, lifetimeExchangedUsdt: 0,
      orders: [orders[1]], ordersPage: { total: 2, pageNum: 2, pageSize: 1, snapshotId: "9001" } };
    const apiClient = client(snapshot);

    await expect(createExchangeApi(apiClient).fetchState(2, 1, "9001"))
      .resolves.toMatchObject({ ordersPage: { snapshotId: "9001" } });

    expect((apiClient.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.path)
      .toBe("/api/exchange?pageNum=2&pageSize=1&snapshotId=9001");
  });

  it("rejects malformed exchange history snapshots before a later page can shift", async () => {
    const snapshot = { ...caps, caps, wallet: { usdtAvailable: 20, nexAvailable: 10 },
      todayUserUsedUsdt: 0, todayPlatformUsedUsdt: 0, lifetimeExchangedUsdt: 0,
      orders: [], ordersPage: { total: 0, pageNum: 1, pageSize: 20, snapshotId: "01" } };

    await expect(createExchangeApi(client(snapshot)).fetchState()).rejects
      .toMatchObject({ message: "HISTORY_SNAPSHOT_INVALID" });
  });
});
