import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createAppHomeApi } from "./app-home-api";
import { parseAppHomeOverview } from "./app-home-api";
import { advanceRuntimeRevision } from "./order-api";

const valid = {
  serverCanonical: true,
  sourceEnvironment: "PRODUCTION",
  runId: "",
  generatedAt: "2026-08-15T00:00:00Z",
  accountScope: "authenticated-account",
  source: "server:nx_compute_receipt,nx_compute_task,nx_user_device,nx_compute_datacenter,nx_product,nx_growth_promo_banner",
  earnings: {
    todayVsYesterdayPct: 5.2,
    today: { usdt: 1.2, nex: 4, jobCount: 3 }, week: { usdt: 4, nex: 8, jobCount: 9 },
    month: { usdt: 5, nex: 10, jobCount: 12 }, all: { usdt: 6, nex: 11, jobCount: 13 },
  },
  earningsLedgerMode: "SETTLED",
  earningsLedger: [{ id: "earning-1", client: "Pocket Studios", model: "SDXL Turbo", rewardUsdt: 0.00032, completedAt: "2026-08-15T00:00:00Z", synthetic: false }],
  marketBoard: { workloads: [{ code: "IG", name: "Image", unit: "image", price: 0.1, deltaPct: 1, sparkline: [1, 2], flagshipDeltaPct: null }], deviceRankings: [{ rank: 1, name: "S1", kind: "stellarbox-s1", bestFor: "images", dailyUsdt: 2 }] },
  doTheMath: {
    basis: "OWNED_DEVICE_TO_NEXT_CATALOG_PRODUCT",
    base: { kind: "phone", name: "Your phone", dailyUsdt: 0.06 },
    target: { productNo: "stellarbox-s1", kind: "stellarbox-s1", name: "NexionBox S1", dailyUsdt: 1, priceUsdt: 1299 },
    multiplier: 17,
    paybackDays: 1299,
  },
  weeklyPromo: { status: "active", rewardNex: 10, multiplier: 1.5, endAt: "2026-08-20T00:00:00Z", product: { kind: "stellarbox-s1", name: "S1", dailyUsdt: 2, priceUsdt: 100 } },
  onboarding: { cumulativePaidUsdt: 99, activeDevices: 10 },
  onGrid: { clients: [{ id: "P", name: "Client", model: "Model", city: "Tokyo", gpus: 2 }], activeDevices: 10, activeJobs: 3, perSecUsdt: 0.1 },
};

describe("parseAppHomeOverview", () => {
  afterEach(() => advanceRuntimeRevision(null));
  it("accepts a complete server projection", () => {
    expect(parseAppHomeOverview(valid).earnings.week.jobCount).toBe(9);
    expect(parseAppHomeOverview(valid).earnings.todayVsYesterdayPct).toBe(5.2);
    expect(parseAppHomeOverview(valid).doTheMath?.target.productNo).toBe("stellarbox-s1");
    expect(parseAppHomeOverview(valid).doTheMath?.paybackDays).toBe(1299);
  });
  it("keeps unavailable facts explicit instead of inventing zero", () => {
    const parsed = parseAppHomeOverview({ ...valid, onboarding: { cumulativePaidUsdt: null, activeDevices: null }, onGrid: { ...valid.onGrid, activeJobs: null }, weeklyPromo: null });
    expect(parsed.onboarding.cumulativePaidUsdt).toBeNull();
    expect(parsed.onGrid.activeJobs).toBeNull();
    expect(parsed.weeklyPromo).toBeNull();
  });
  it("rejects an untrusted or malformed response", () => {
    expect(() => parseAppHomeOverview({ ...valid, serverCanonical: false })).toThrow("APP_HOME_OVERVIEW_INVALID");
    expect(() => parseAppHomeOverview({ ...valid, earnings: { ...valid.earnings, today: { usdt: -1, nex: 0, jobCount: 0 } } })).toThrow("APP_HOME_OVERVIEW_INVALID");
    expect(() => parseAppHomeOverview({ ...valid, earnings: { ...valid.earnings, todayVsYesterdayPct: "5.2" } })).toThrow("APP_HOME_OVERVIEW_INVALID");
    expect(() => parseAppHomeOverview({ ...valid, doTheMath: { ...valid.doTheMath, multiplier: 0 } })).toThrow("APP_HOME_OVERVIEW_INVALID");
  });

  it("rejects the removed sandbox quote projection", () => {
    advanceRuntimeRevision("home-run-20260819");
    const sandbox = {
      ...valid,
      sourceEnvironment: "SANDBOX",
      runId: "home-run-20260819",
      source: "server:sandbox-run-projection:nx_config_item,nx_admin_device_task,nx_product",
      weeklyPromo: null,
      earningsLedgerMode: "SANDBOX_QUOTE_EXAMPLES",
      earningsLedger: [{ ...valid.earningsLedger[0], synthetic: true }],
    };
    expect(() => parseAppHomeOverview(sandbox, "dev")).toThrow("APP_HOME_OVERVIEW_INVALID");
    expect(() => parseAppHomeOverview({ ...sandbox, earningsLedger: valid.earningsLedger }, "dev"))
      .toThrow("APP_HOME_OVERVIEW_INVALID");
    expect(() => parseAppHomeOverview({ ...sandbox, earningsLedgerMode: "SETTLED", earningsLedger: valid.earningsLedger }, "dev"))
      .toThrow("APP_HOME_OVERVIEW_INVALID");
    expect(() => parseAppHomeOverview({ ...valid, earningsLedgerMode: "SANDBOX_QUOTE_EXAMPLES" }))
      .toThrow("APP_HOME_OVERVIEW_INVALID");
  });

  it("does not revive a Sandbox projection even when an old run is selected", () => {
    advanceRuntimeRevision("home-run-20260819");
    const sandbox = {
      ...valid,
      sourceEnvironment: "SANDBOX",
      runId: "home-run-20260819",
      source: "server:sandbox-run-projection:nx_config_item,nx_admin_device_task,nx_product",
      weeklyPromo: null,
      earningsLedgerMode: "SANDBOX_QUOTE_EXAMPLES",
      earningsLedger: [{ ...valid.earningsLedger[0], synthetic: true }],
    };
    expect(() => parseAppHomeOverview(sandbox, "dev")).toThrow("APP_HOME_OVERVIEW_INVALID");
    advanceRuntimeRevision("home-run-20260820");
    expect(() => parseAppHomeOverview(sandbox, "dev")).toThrow("APP_HOME_OVERVIEW_INVALID");
  });

  it("rejects a fetched Sandbox projection", async () => {
    advanceRuntimeRevision("home-run-20260819");
    const payload = {
      ...valid,
      sourceEnvironment: "SANDBOX",
      runId: "home-run-20260819",
      source: "server:sandbox-run-projection:nx_config_item,nx_admin_device_task,nx_product",
      weeklyPromo: null,
      earningsLedgerMode: "SANDBOX_QUOTE_EXAMPLES",
      earningsLedger: [{ ...valid.earningsLedger[0], synthetic: true }],
    };
    const request = vi.fn().mockResolvedValue(payload);
    const api = createAppHomeApi({ request } as unknown as ApiClient, "dev");

    await expect(api.fetch()).rejects.toMatchObject({ message: "APP_HOME_OVERVIEW_INVALID" });
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/app/home/overview" });
  });

  it("development fetches the canonical PC-backed projection without a sandbox run", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    const api = createAppHomeApi({ request } as unknown as ApiClient, "dev");

    await expect(api.fetch()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
  });
});
