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
