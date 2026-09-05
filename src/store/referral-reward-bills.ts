import type { ReferralRewardSnapshot } from "@/api/referral-reward-api";

export interface ReferralRewardBillProjection {
  id: string;
  type: "refer";
  amount: number;
  symbol: "NEX";
  status: "posted";
  ts: number;
  memo: string;
  ref: string;
  balanceAfter: number;
  source: "mock";
  sourceEnvironment: "SANDBOX";
  entryRole: "H8_REFERRAL_REWARD";
}

/**
 * A referral reward is displayed only when its server snapshot explicitly
 * identifies the same SANDBOX/MOCK_REFERRAL fact chain.  The settlement number
 * is intentionally both the idempotency-visible bill id and the user-visible
 * reference, so reloading or relogging cannot duplicate a reward row.
 */
export function projectReferralRewardBills(snapshot: ReferralRewardSnapshot): ReferralRewardBillProjection[] {
  if (snapshot.source !== "mock" || snapshot.sourceEnvironment !== "SANDBOX") return [];
  return snapshot.recentRewards
    .filter((reward) => reward.sourceEnvironment === "SANDBOX" && reward.ledgerStatus === "SUCCESS")
    .map((reward) => ({
      id: `H8:${reward.settlementNo}`,
      type: "refer",
      amount: reward.amountNex,
      symbol: "NEX",
      status: "posted",
      ts: Date.parse(reward.settledAt),
      memo: "source=mock · SANDBOX · H8_REFERRAL_REWARD",
      ref: reward.settlementNo,
      balanceAfter: reward.balanceAfter,
      source: "mock",
      sourceEnvironment: "SANDBOX",
      entryRole: "H8_REFERRAL_REWARD",
    }));
}
