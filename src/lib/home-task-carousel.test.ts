import { describe, expect, it } from "vitest";
import type { CanonicalPromoBanner, CanonicalQuest, QuestSnapshot } from "@/api/quest-api";
import conversionBannerSource from "../components/home/conversion-banner.vue?raw";
import {
  deriveHomeTaskCards,
  isHomeWeeklyCardReady,
  selectHomeWeeklySource,
} from "./home-task-carousel";

const weeklyQuest: CanonicalQuest = {
  questCode: "H3_LEARNING_COMPLETED",
  name: "Complete a learning course",
  layer: "WEEKLY_T1",
  rewardNex: 30,
  status: "PENDING",
};

const pausedPromo: CanonicalPromoBanner = {
  bannerCode: "HOME_WEEKLY_UPSELL",
  baseReward: 800,
  multiplier: 1.5,
  countdownDays: 4,
  countdownHours: 12,
  targetDevice: "StellarBox Pro",
  targetDaily: 1.5,
  status: "paused",
};

const weeklySnapshot: QuestSnapshot = {
  quests: [weeklyQuest],
  promoBanner: pausedPromo,
  questBonusMultiplier: 1,
  rhythmMonth: 0,
  source: "mock",
  serverCanonical: true,
  sourceEnvironment: "SANDBOX",
  runId: "weekly-card-test-run",
};

describe("home task carousel", () => {
  it("keeps the weekly slide when the server projects active weekly missions", () => {
    expect(deriveHomeTaskCards(false, {
      homeNewcomerTasksEnabled: true,
      homeWeeklyPromoEnabled: true,
    })).toEqual(["newcomer", "weekly"]);
  });

  it("fails closed when platform configuration is unavailable", () => {
    expect(deriveHomeTaskCards(true, {
      homeNewcomerTasksEnabled: true,
      homeWeeklyPromoEnabled: true,
    })).toEqual([]);
  });

  it("renders the configured weekly mission instead of a paused upsell banner", () => {
    expect(selectHomeWeeklySource([weeklyQuest], pausedPromo)).toEqual({
      kind: "quest",
      quest: weeklyQuest,
    });
  });

  it("falls back to an active promo only when no weekly mission exists", () => {
    expect(selectHomeWeeklySource([], { ...pausedPromo, status: "active" })).toEqual({
      kind: "promo",
      promo: { ...pausedPromo, status: "active" },
    });
    expect(selectHomeWeeklySource([], pausedPromo)).toBeNull();
  });

  it("does not keep an already claimed weekly mission on the home card", () => {
    expect(selectHomeWeeklySource([{ ...weeklyQuest, status: "CLAIMED" }], pausedPromo)).toBeNull();
    expect(selectHomeWeeklySource(
      [{ ...weeklyQuest, status: "CLAIMED" }],
      { ...pausedPromo, status: "active" },
    )).toEqual({
      kind: "promo",
      promo: { ...pausedPromo, status: "active" },
    });
  });

  it("hides stale weekly data until the current refresh succeeds", () => {
    expect(isHomeWeeklyCardReady(true, true, null, weeklySnapshot)).toBe(false);
    expect(isHomeWeeklyCardReady(true, false, "WEEKLY_QUEST_LOAD_FAILED", weeklySnapshot)).toBe(false);
    expect(isHomeWeeklyCardReady(true, false, null, weeklySnapshot)).toBe(true);
    expect(isHomeWeeklyCardReady(false, true, "ignored-in-mock-mode", null)).toBe(true);
  });

  it("keeps the weekly card independent from the non-authoritative home truth promo", () => {
    expect(conversionBannerSource).not.toContain("homeTruth");
    expect(conversionBannerSource).not.toContain("serverPromo");
  });
});
