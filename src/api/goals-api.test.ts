import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGoalsApi } from "./goals-api";
import { advanceRuntimeRevision } from "./order-api";

beforeEach(() => advanceRuntimeRevision(null));

describe("goals API", () => {
  it("uses authenticated server CRUD and preserves canonical progress", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true,
      source: "nx_earning_goal",
      lifetimeEarningsUsdt: 250,
      goals: [{ id: 7, targetUsdt: 1000, deadlineAt: 1890000000000, createdAt: 1880000000000,
        achieved: false, progressPct: 25, lifetimeEarningsUsdt: 250 }],
    });
    const api = createGoalsApi({ request } as never, "prod");

    await expect(api.list()).resolves.toMatchObject({ serverCanonical: true, goals: [{ id: 7, progressPct: 25 }] });
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/goals" });
  });

  it("creates and updates goals with an idempotency key and no local persistence", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ id: 8, targetUsdt: 500, deadlineAt: 1890000000000, createdAt: 1880000000000, achieved: false, progressPct: 0, lifetimeEarningsUsdt: 0 })
      .mockResolvedValueOnce({ id: 8, targetUsdt: 500, deadlineAt: 1890000000000, createdAt: 1880000000000, achieved: true, progressPct: 100, lifetimeEarningsUsdt: 600 });
    const api = createGoalsApi({ request } as never, "prod");

    await api.create({ targetUsdt: 500, deadlineAt: 1890000000000, idempotencyKey: "goal-save-1" });
    await api.setStatus(8, true);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "POST", path: "/api/goals", body: { targetUsdt: 500, deadlineAt: 1890000000000 }, idempotencyKey: "goal-save-1",
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST", path: "/api/goals/8/status", body: { achieved: true },
    });
  });

  it("rejects retired Sandbox recommendation payloads", async () => {
    advanceRuntimeRevision("sandbox-run-20260817");
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260817",
      purchaseRequired: true, productNo: "sandbox-sku", productName: "Sandbox SKU", dailyEarn: 1, price: 99,
      requiredDaily: 0.5, targetUsdt: 100, days: 200,
    });
    const api = createGoalsApi({ request } as never, "dev");

    await expect(api.recommendation(100, 1890000000000)).rejects.toMatchObject({ message: "GOALS_RESPONSE_INVALID" });
  });

  it("rejects mock recommendation payload in remote mode", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260817",
      purchaseRequired: true, productNo: "sandbox-sku", productName: "Sandbox SKU", dailyEarn: 1, price: 99,
      requiredDaily: 0.5, targetUsdt: 100, days: 200,
    });
    const api = createGoalsApi({ request } as never, "prod");

    await expect(api.recommendation(100, 1890000000000)).rejects.toMatchObject({ message: "GOALS_RESPONSE_INVALID" });
  });

  it("accepts the server's completed-goal result without a purchasable product", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "",
      purchaseRequired: false, productNo: null, productName: null, dailyEarn: null, price: null,
      requiredDaily: 0, targetUsdt: 1000, days: 90,
    });
    const api = createGoalsApi({ request } as never, "prod");

    await expect(api.recommendation(1000, 1890000000000)).resolves.toMatchObject({
      purchaseRequired: false, requiredDaily: 0, productNo: null,
    });
  });

  it("keeps a positive micro-shortfall as a purchasable recommendation", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "",
      purchaseRequired: true, productNo: "daily", productName: "Daily", dailyEarn: 1, price: 100,
      requiredDaily: 0.000001, targetUsdt: 1000, days: 90,
    });
    const api = createGoalsApi({ request } as never, "prod");

    await expect(api.recommendation(1000, 1890000000000)).resolves.toMatchObject({
      purchaseRequired: true, requiredDaily: 0.000001, productNo: "daily",
    });
  });

  it("normalizes a complete pre-purchaseRequired production response to a purchase requirement", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "",
      productNo: "daily", productName: "Daily", dailyEarn: 1, price: 100,
      requiredDaily: 0.5, targetUsdt: 1000, days: 90,
    });
    const api = createGoalsApi({ request } as never, "prod");

    await expect(api.recommendation(1000, 1890000000000)).resolves.toMatchObject({
      purchaseRequired: true, productNo: "daily", requiredDaily: 0.5,
    });
  });
  it("normalizes a complete pre-purchaseRequired free product response", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "",
      productNo: "daily", productName: "Daily", dailyEarn: 1, price: 0,
      requiredDaily: 0.5, targetUsdt: 1000, days: 90,
    });
    const api = createGoalsApi({ request } as never, "prod");

    await expect(api.recommendation(1000, 1890000000000)).resolves.toMatchObject({
      purchaseRequired: true, price: 0,
    });
  });

  it("rejects an incomplete pre-purchaseRequired response", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "nx_product", sourceEnvironment: "PRODUCTION", runId: "",
      productNo: null, productName: null, dailyEarn: null, price: null,
      requiredDaily: 0, targetUsdt: 1000, days: 90,
    });
    const api = createGoalsApi({ request } as never, "prod");

    await expect(api.recommendation(1000, 1890000000000)).rejects.toMatchObject({ message: "GOALS_RESPONSE_INVALID" });
  });

});
