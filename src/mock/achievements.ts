// Ported verbatim from Nexion-prototype/lib/mock/achievements.ts (zero React
// deps, backend-replaceable). Achievement definitions; unlock conditions are
// evaluated inline on the achievements page against live store state.

export type AchievementCategory = "firsts" | "earnings" | "social" | "loyalty" | "hardware";

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  /** i18n key suffix — `a_<id>` for label, `a_<id>_d` for description */
  i18nKey: string;
  rewardNex?: number;
  rewardUsdt?: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_contribution", category: "firsts", i18nKey: "first_contribution", rewardNex: 10 },
  { id: "first_dollar", category: "earnings", i18nKey: "first_dollar", rewardNex: 20 },
  { id: "power_user", category: "loyalty", i18nKey: "power_user", rewardUsdt: 1 },
  { id: "social_star", category: "social", i18nKey: "social_star", rewardUsdt: 50 },
  { id: "hardware_owner", category: "hardware", i18nKey: "hardware_owner", rewardNex: 50 },
  { id: "diamond_miner", category: "earnings", i18nKey: "diamond_miner", rewardNex: 100 },
];
