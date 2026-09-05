import { describe, expect, it } from "vitest";
import { parseAppHomeOverview } from "./app-home-api";

const SOURCE = "server:nx_compute_receipt,nx_compute_task,nx_user_device,nx_product,nx_growth_promo_banner";

const valid = {
  serverCanonical: true,
  sourceEnvironment: "PRODUCTION",
  runId: "",
  generatedAt: "2026-08-15T00:00:00Z",
  accountScope: "authenticated-account",
  source: SOURCE,
  earnings: {
    today: { usdt: 1.2, nex: 4, jobCount: 3 },
    week: { usdt: 4, nex: 8, jobCount: 9 },
    month: { usdt: 5, nex: 10, jobCount: 12 },
    all: { usdt: 6, nex: 11, jobCount: 13 },
  },
  earningsLedgerMode: "SETTLED",
  earningsLedger: [{ id: "earning-1", client: "Pocket Studios", model: "SDXL Turbo", rewardUsdt: 0.00032, completedAt: "2026-08-15T00:00:00Z", synthetic: false }],
  marketBoard: { workloads: [], deviceRankings: [] },
  weeklyPromo: null,
  onboarding: { cumulativePaidUsdt: 99, activeDevices: 10 },
  onGrid: { clients: [], activeDevices: 10, activeJobs: 3, perSecUsdt: 0.1 },
};

describe("App Home authority provenance", () => {
  it("accepts only the authenticated production projection contract", () => {
    expect(parseAppHomeOverview(valid)).toMatchObject({
      sourceEnvironment: "PRODUCTION",
      runId: "",
      accountScope: "authenticated-account",
      source: SOURCE,
    });
  });

  it.each([
    ["sourceEnvironment", "SANDBOX"],
    ["sourceEnvironment", "production"],
    ["runId", "stale-sandbox-run"],
    ["accountScope", "user:42:SANDBOX"],
    ["source", "nx_app_home_projection"],
  ] as const)("rejects an invalid %s provenance field", (key, value) => {
    expect(() => parseAppHomeOverview({ ...valid, [key]: value })).toThrow("APP_HOME_OVERVIEW_INVALID");
  });

  it("rejects an envelope that omits provenance", () => {
    const { sourceEnvironment: _environment, runId: _runId, ...withoutProvenance } = valid;
    expect(() => parseAppHomeOverview(withoutProvenance)).toThrow("APP_HOME_OVERVIEW_INVALID");
  });
});
