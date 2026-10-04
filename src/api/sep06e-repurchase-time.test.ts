import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createRepurchaseApi } from "./repurchase-api";

const SOURCE = "nx_repurchase_product + nx_config_item + nx_emergency_control_setting";
const SHANGHAI_LOCAL = "2026-09-06T12:34:56";
const SHANGHAI_INSTANT = Date.parse("2026-09-06T12:34:56+08:00");

function snapshot(timestamp: string) {
  return {
    serverCanonical: true,
    source: SOURCE,
    sourceEnvironment: "PRODUCTION",
    runId: "",
    walletBalanceUsdt: 100,
    serverTime: timestamp,
    ordersPage: { total: 1, pageNum: 1, pageSize: 50 },
    orders: [{
      orderNo: "RPS-ABCDEF12",
      amountUsdt: 100,
      apyPct: 35,
      earlyPenaltyPct: 15,
      lockDays: 90,
      lockedAt: timestamp,
      unlockAt: "2026-12-05T12:34:56",
      estimatedInterestUsdt: 8.63,
      status: "ACTIVE",
    }],
  };
}

function client(payload: unknown): ApiClient {
  return { request: vi.fn().mockResolvedValue(payload) } as unknown as ApiClient;
}

describe("repurchase server-time contract", () => {
  it("treats timezone-less Java LocalDateTime values as Asia/Shanghai, including the maturity displayed in My re-investments", async () => {
    const result = await createRepurchaseApi(client(snapshot(SHANGHAI_LOCAL))).fetchOrders();

    expect(result.serverTime).toBe(SHANGHAI_INSTANT);
    expect(result.orders[0]).toMatchObject({
      lockedAt: SHANGHAI_INSTANT,
      unlockAt: Date.parse("2026-12-05T12:34:56+08:00"),
    });
  });

  it("does not shift an explicit-offset instant", async () => {
    const explicit = "2026-09-06T12:34:56+09:00";
    const result = await createRepurchaseApi(client(snapshot(explicit))).fetchOrders();

    expect(result.serverTime).toBe(Date.parse(explicit));
    expect(result.orders[0]?.lockedAt).toBe(Date.parse(explicit));
  });
});
