import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createReferralRewardApi } from "./referral-reward-api";

const RUN = "catalog-run-20260816";
const productionFacts = ["nx_referral_reward_settlement", "nx_wallet_ledger", "nx_earnings_release_entry", "nx_user_wallet"];
const sandboxFacts = ["nx_h8_sandbox_referral_settlement", "nx_h8_sandbox_referral_ledger"];

function snapshot(sourceEnvironment: "PRODUCTION" | "SANDBOX", runId: string | null, source: "ledger" | "mock" = sourceEnvironment === "PRODUCTION" ? "ledger" : "mock") {
  const facts = sourceEnvironment === "PRODUCTION" ? productionFacts : sandboxFacts;
  return {
    referralCode: "NX-REF-1", rewardEnabled: true, inviterRewardNex: 10, invitedCount: 2, pendingCount: 1, settledCount: 1,
    lifetimeInviterNex: 10, walletNexAvailable: 20, limit: 10, source, sourceEnvironment, runId,
    factSources: facts, refreshedAt: "2026-08-16T00:00:00Z",
    recentRewards: [{ settlementNo: "SET-1", amountNex: 10, ledgerStatus: "SUCCESS", balanceAfter: 20,
      releaseBucket: "withdrawable", sourceEnvironment, settledAt: "2026-08-16T00:00:00Z" }],
  };
}

describe("referral reward provenance", () => {
  it("accepts production ledger facts only on the production rail", async () => {
    const request = vi.fn().mockResolvedValue(snapshot("PRODUCTION", null));
    await expect(createReferralRewardApi({ request } as unknown as ApiClient, "prod").snapshot()).resolves.toMatchObject({ source: "ledger", sourceEnvironment: "PRODUCTION", runId: null });
    await expect(createReferralRewardApi({ request: vi.fn().mockResolvedValue(snapshot("SANDBOX", RUN)) } as unknown as ApiClient, "prod").snapshot()).rejects.toMatchObject({ kind: "protocol" });
  });

  it("accepts canonical ledger facts on the development rail", async () => {
    await expect(createReferralRewardApi({ request: vi.fn().mockResolvedValue(snapshot("PRODUCTION", null)) } as unknown as ApiClient, "dev").snapshot())
      .resolves.toMatchObject({ source: "ledger", sourceEnvironment: "PRODUCTION", runId: null });
  });

  it("rejects mock or unscoped facts on every non-matching rail", async () => {
    await expect(createReferralRewardApi({ request: vi.fn().mockResolvedValue(snapshot("PRODUCTION", null, "mock")) } as unknown as ApiClient, "prod").snapshot()).rejects.toMatchObject({ kind: "protocol" });
    await expect(createReferralRewardApi({ request: vi.fn().mockResolvedValue(snapshot("SANDBOX", RUN)) } as unknown as ApiClient, "dev").snapshot()).rejects.toMatchObject({ kind: "protocol" });
  });

  it("accepts a disabled reward gate only when the advertised reward is zero", async () => {
    const disabled = { ...snapshot("PRODUCTION", null), rewardEnabled: false, inviterRewardNex: 0 };
    await expect(createReferralRewardApi({ request: vi.fn().mockResolvedValue(disabled) } as unknown as ApiClient, "prod").snapshot())
      .resolves.toMatchObject({ rewardEnabled: false, inviterRewardNex: 0 });

    const inconsistent = { ...disabled, inviterRewardNex: 10 };
    await expect(createReferralRewardApi({ request: vi.fn().mockResolvedValue(inconsistent) } as unknown as ApiClient, "prod").snapshot())
      .rejects.toMatchObject({ kind: "protocol" });
  });
});
