import type { CanonicalPromoBanner, CanonicalQuest, QuestSnapshot, QuestTaskCategory } from "@/api/quest-api";
import { isCurrentQuest } from "./actionable-quest";
import { nexGridBrandText } from "./brand-copy";

export type HomeTaskCardId = "newcomer" | "weekly" | `promotion:${string}`;

export const HOME_TASK_CARD_COLLAPSED_HEIGHT = 184;

export interface HomeTaskFeatureFlags {
  homeNewcomerTasksEnabled: boolean;
  homeWeeklyPromoEnabled: boolean;
}

export type HomeWeeklySource =
  | { kind: "quest"; quest: CanonicalQuest }
  | { kind: "promo"; promo: CanonicalPromoBanner };

export interface HomeWeeklyCardView {
  multiplier: number | null;
  rewardNex: number | null;
  countdownDays: number | null;
  countdownHours: number | null;
  subtitle: string | null;
  targetDevice: string | null;
  targetDaily: number | null;
  category: QuestTaskCategory | null;
  actionRoute: string | null;
}

export function deriveHomeTaskCards(
  syncFailed: boolean,
  flags: HomeTaskFeatureFlags,
  promotionIds: readonly string[] = [],
): HomeTaskCardId[] {
  const cards: HomeTaskCardId[] = [];
  if (!syncFailed && flags.homeNewcomerTasksEnabled) cards.push("newcomer");
  if (!syncFailed && flags.homeWeeklyPromoEnabled) cards.push("weekly");
  for (const id of new Set(promotionIds)) cards.push(`promotion:${id}`);
  return cards;
}

/**
 * Only the visible card may change the carousel viewport. A card's own
 * content-resize notification is indexed by the parent v-for so a hidden
 * slide, including a late callback after navigation, cannot resize the
 * active slide.
 */
export function shouldMeasureHomeNewcomerContent(
  cards: readonly HomeTaskCardId[],
  activeIndex: number,
  resizedIndex: number,
): boolean {
  return activeIndex === resizedIndex && cards[activeIndex] === "newcomer";
}

/** Converts a measured active-card height to the safe carousel viewport. */
export function resolveHomeTaskCarouselHeight(measuredHeight: unknown): number {
  return typeof measuredHeight === "number" && Number.isFinite(measuredHeight) && measuredHeight > 0
    ? Math.max(HOME_TASK_CARD_COLLAPSED_HEIGHT, Math.ceil(measuredHeight))
    : HOME_TASK_CARD_COLLAPSED_HEIGHT;
}

/**
 * Keeps delayed selector-query callbacks scoped to the slide that requested
 * them. The page supplies the real Uni selector query while this controller
 * owns the cancellation fence so a swipe, card removal or unmount cannot
 * apply an old card's measurement.
 */
export function createHomeNewcomerContentResizer(
  current: () => { cards: readonly HomeTaskCardId[]; activeIndex: number },
  setHeight: (height: number) => void,
  scheduleMeasurement: (done: (height: unknown) => void) => void,
) {
  let measurementEpoch = 0;

  const reset = () => {
    measurementEpoch += 1;
    setHeight(HOME_TASK_CARD_COLLAPSED_HEIGHT);
  };

  const invalidate = () => {
    measurementEpoch += 1;
  };

  const measure = (resizedIndex: number): boolean => {
    const initial = current();
    const epoch = ++measurementEpoch;
    if (!shouldMeasureHomeNewcomerContent(initial.cards, initial.activeIndex, resizedIndex)) return false;
    scheduleMeasurement((height) => {
      const latest = current();
      if (epoch !== measurementEpoch
          || !shouldMeasureHomeNewcomerContent(latest.cards, latest.activeIndex, resizedIndex)) return;
      setHeight(resolveHomeTaskCarouselHeight(height));
    });
    return true;
  };

  return { measure, reset, invalidate };
}

export function selectHomeWeeklySource(
  quests: CanonicalQuest[],
  promo: CanonicalPromoBanner | null,
): HomeWeeklySource | null {
  const weeklyQuests = quests.filter(
    (quest) => (quest.layer === "WEEKLY_T1" || quest.layer === "WEEKLY_T2") && isCurrentQuest(quest),
  );
  const quest = weeklyQuests.find((candidate) => candidate.status !== "CLAIMED");
  if (quest) return { kind: "quest", quest };
  if (promo?.status === "active") return { kind: "promo", promo };
  return null;
}

/**
 * Keeps the 5174 weekly-card slot structure while preserving server authority.
 * Mission countdown follows its actual eligibility deadline; product-yield
 * presentation metadata comes from PC H3's nx_growth_promo_banner row.
 */
export function presentHomeWeeklyCard(
  source: HomeWeeklySource | null,
  presentation: CanonicalPromoBanner | null,
  questBonusMultiplier: number,
  now = Date.now(),
  displayQuestName?: string,
): HomeWeeklyCardView {
  if (!source) {
    return {
      multiplier: null,
      rewardNex: null,
      countdownDays: null,
      countdownHours: null,
      subtitle: null,
      targetDevice: null,
      targetDaily: null,
      category: null,
      actionRoute: null,
    };
  }

  const metadata = source.kind === "promo" ? source.promo : presentation;
  const targetDevice = metadata?.targetDevice === "StellarBox Pro"
    ? "UVELBox Pro" : metadata?.targetDevice ?? null;
  if (source.kind === "quest") {
    const remaining = Math.max(0, Date.parse(source.quest.eligibleUntil) - now);
    const hours = Number.isFinite(remaining) ? Math.floor(remaining / 3600000) : null;
    const multiplier = Number.isFinite(questBonusMultiplier) && questBonusMultiplier > 0
      ? questBonusMultiplier
      : 1;
    return {
      multiplier,
      rewardNex: Math.round(source.quest.rewardNex * multiplier),
      countdownDays: hours === null ? null : Math.floor(hours / 24),
      countdownHours: hours === null ? null : hours % 24,
      subtitle: nexGridBrandText(targetDevice
        ? `${displayQuestName ?? source.quest.name} · ${targetDevice}`
        : displayQuestName ?? source.quest.name),
      targetDevice,
      targetDaily: metadata?.targetDaily ?? null,
      category: source.quest.category,
      actionRoute: source.quest.actionRoute,
    };
  }

  return {
    multiplier: source.promo.multiplier,
    rewardNex: Math.round(source.promo.baseReward * source.promo.multiplier),
    countdownDays: source.promo.countdownDays,
    countdownHours: source.promo.countdownHours,
    subtitle: targetDevice,
    targetDevice,
    targetDaily: source.promo.targetDaily,
    category: null,
    actionRoute: "/pages/store/store",
  };
}

export function isHomeWeeklyCardReady(
  remote: boolean,
  loading: boolean,
  error: string | null,
  snapshot: QuestSnapshot | null,
): boolean {
  if (!remote) return true;
  if (loading || error || !snapshot) return false;
  return selectHomeWeeklySource(snapshot.quests, snapshot.promoBanner) !== null;
}
