import { describe, expect, it, vi } from "vitest";
import { createAmbassadorApplicationApi, parseAmbassadorPolicy } from "./ambassador-application-api";

const valid = {
  policyVersion: "ambassador-v1", revision: 1, defaultBudgetUsdt: 3000,
  buckets: [
    { id: "venue", title: "Event venue", range: "$1,000 — $10,000", rule: "Host", minBudgetUsdt: 1000, maxBudgetUsdt: 10000 },
    { id: "kol", title: "KOL", range: "$500 — $5,000", rule: "Creator", minBudgetUsdt: 500, maxBudgetUsdt: 5000 },
    { id: "print", title: "Print", range: "$1,000 — $8,000", rule: "Visibility", minBudgetUsdt: 1000, maxBudgetUsdt: 8000 },
    { id: "dev", title: "Developer", range: "$300 — $3,000", rule: "Workshop", minBudgetUsdt: 300, maxBudgetUsdt: 3000 },
  ],
  source: "server", sourceEnvironment: "PRODUCTION", runId: "",
};

describe("ambassador policy API", () => {
  it("accepts only a production server policy with empty run", () => {
    expect(parseAmbassadorPolicy(valid, "PRODUCTION")).toMatchObject({ source: "server", defaultBudgetUsdt: 3000 });
  });

  it("rejects retired sandbox policy and non-empty run ids", () => {
    expect(() => parseAmbassadorPolicy({ ...valid, sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260816" } as never)).toThrow();
    expect(() => parseAmbassadorPolicy({ ...valid, runId: "development-run-stale" })).toThrow();
  });

  it("loads policy before remote form use", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    const api = createAmbassadorApplicationApi({ request } as never, "PRODUCTION");
    await api.policy();
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/app/team/ambassador-applications/policy" }));
  });
});
