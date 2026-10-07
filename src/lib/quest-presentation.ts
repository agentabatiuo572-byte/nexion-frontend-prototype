import type { CanonicalQuest } from "@/api/quest-api";
import type { LocaleCode } from "@/i18n";
import type { Messages } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { nexGridBrandText } from "./brand-copy";

const APP_QUEST_ROUTES = new Set([
  "/pages/missions/missions",
  "/pages/me/profile",
  "/pages/me/wallet-cards-new",
  "/pages/me/wallet-topup",
  "/pages/me/wallet-exchange",
  "/pages/me/wallet-repurchase",
  "/pages/me/devices",
  "/pages/earn/earn",
  "/pages/store/store",
  "/pages/store/detail?id=stellarbox-s1",
  "/pages/team/team",
  "/pages/team/commissions",
  "/pages/learn/courses",
  "/pages/staking/staking",
  "/pages/genesis/genesis",
  "/pages/genesis/marketplace",
]);

export function normalizeQuestActionRoute(value: string): string {
  const route = value.trim();
  if (!/^\/pages\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\?[A-Za-z0-9._~%=&-]+)?$/.test(route)
      || !APP_QUEST_ROUTES.has(route)) {
    throw new Error("QUEST_ACTION_ROUTE_INVALID");
  }
  return route;
}

const DAY_ONE_TITLE_KEYS = new Map<string, keyof Messages["home"]>([
  ["bind_bank_card", "dayOneTaskBindCard"],
  ["visit_earn", "dayOneTaskVisitEarn"],
  ["visit_store", "dayOneTaskVisitStore"],
  ["view_product_roi", "dayOneTaskSeeRoi"],
  ["setup_profile", "dayOneTaskSetupProfile"],
  ["invite_friend", "dayOneTaskInviteFriend"],
]);

/** Localize exact frozen defaults at display time, preserving authored snapshot names. */
export function dayOneQuestDisplayName(
  quest: Pick<CanonicalQuest, "questCode" | "name" | "layer">,
  locale: LocaleCode,
  t: Messages,
): string {
  const name = nexGridBrandText(quest.name);
  if (locale === "zh" || quest.layer !== "DAY_ONE") return name;
  const key = DAY_ONE_TITLE_KEYS.get(quest.questCode);
  if (!key) return name;
  const translated = t.home[key];
  const fallback = zh.home[key];
  return typeof translated === "string" && translated.trim().length > 0
    && typeof fallback === "string"
    && name === nexGridBrandText(fallback)
    ? translated
    : name;
}

/** Use bundled copy only for the exact old server default, preserving configured titles. */
export function weeklyQuestDisplayName(
  quest: Pick<CanonicalQuest, "questCode" | "name">,
  locale: LocaleCode,
  t: Messages,
): string {
  const name = nexGridBrandText(quest.name);
  if (locale === "zh") return name;
  const match = /^weekly_t([12])_([a-z0-9_]+)$/.exec(quest.questCode);
  if (!match) return name;
  const key = `tier${match[1]}_${match[2]}_title` as keyof Messages["weeklyQuest"];
  const translated = t.weeklyQuest[key];
  const fallback = zh.weeklyQuest[key];
  return typeof translated === "string"
    && typeof fallback === "string"
    && name === nexGridBrandText(fallback)
    ? translated
    : name;
}
