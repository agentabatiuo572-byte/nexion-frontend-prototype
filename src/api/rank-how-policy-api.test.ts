import { describe, expect, it, vi } from "vitest";
import { createRankHowPolicyApi } from "./rank-how-policy-api";

const policy = { status: "PUBLISHED", version: "r3", locale: "en", hero: "Rank policy", sections: [{ id: "qualification", title: "Qualification", body: "Server rules", order: 1 }], rules: { permanentProtection: false, qualifiedReferralSelfBuyUSD: null, leadershipConfigured: false }, source: "server", sourceEnvironment: "PRODUCTION", runId: "" };
describe("rank how policy API", () => {
  it("reads localized published policy from the server", async () => {
    const request = vi.fn().mockResolvedValue(policy);
    const result = await createRankHowPolicyApi({ request } as never).published("en");
    expect(result.sections[0].body).toBe("Server rules");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/config/v-rank-policy?locale=en" }));
  });
  it("rejects draft, empty, or malformed policy instead of falling back", async () => {
    const request = vi.fn().mockResolvedValue({ ...policy, status: "DRAFT" });
    await expect(createRankHowPolicyApi({ request } as never).published("en")).rejects.toThrow("RANK_HOW_POLICY_RESPONSE_INVALID");
  });
  it("retains only the allowlisted server rule projection", async () => {
    const request = vi.fn().mockResolvedValue({ ...policy, rules: { permanentProtection: false, qualifiedReferralSelfBuyUSD: 876.123456, leadershipConfigured: false, privateExtra: "not for app" } });
    const result = await createRankHowPolicyApi({ request } as never).published("zh");
    expect(result.rules).toEqual({ permanentProtection: false, qualifiedReferralSelfBuyUSD: 876.123456, leadershipConfigured: false });
  });
  it("accepts a configured zero minimum, distinct from a missing threshold", async () => {
    const request = vi.fn().mockResolvedValue({ ...policy, rules: { ...policy.rules, qualifiedReferralSelfBuyUSD: 0 } });
    expect((await createRankHowPolicyApi({ request } as never).published("en")).rules.qualifiedReferralSelfBuyUSD).toBe(0);
  });
  it.each([
    { permanentProtection: "on", qualifiedReferralSelfBuyUSD: 12, leadershipConfigured: true },
    { permanentProtection: true, qualifiedReferralSelfBuyUSD: -1, leadershipConfigured: true },
    { permanentProtection: true, qualifiedReferralSelfBuyUSD: Infinity, leadershipConfigured: true },
    { permanentProtection: true, qualifiedReferralSelfBuyUSD: 12, leadershipConfigured: 1 },
    null,
    undefined,
  ])("rejects malformed rule snapshots %#", async rules => {
    const request = vi.fn().mockResolvedValue({ ...policy, rules });
    await expect(createRankHowPolicyApi({ request } as never).published("en")).rejects.toThrow("RANK_HOW_POLICY_RESPONSE_INVALID");
  });
  it.each([
    { sections: [] },
    { sections: [policy.sections[0], policy.sections[0]] },
    { sections: [{ ...policy.sections[0], order: -1 }] },
    { sections: [{ ...policy.sections[0], body: " " }] },
    { sections: [{ ...policy.sections[0], id: "" }] },
  ])("rejects ambiguous or empty published slots %#", async ({ sections }) => {
    const request = vi.fn().mockResolvedValue({ ...policy, sections });
    await expect(createRankHowPolicyApi({ request } as never).published("en")).rejects.toThrow();
  });
});
