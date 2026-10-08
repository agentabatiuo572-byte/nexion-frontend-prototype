import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalPromoBanner, CanonicalQuest, QuestSnapshot } from "@/api/quest-api";
import conversionBannerSource from "../components/home/conversion-banner.vue?raw";
import weeklyQuestHeroSource from "../components/home/weekly-quest-hero.vue?raw";
import weeklyQuestListSource from "../components/home/weekly-quest-list.vue?raw";
import homePageSource from "../pages/index/index.vue?raw";
import {
  deriveHomeTaskCards,
  createHomeNewcomerContentResizer,
  HOME_TASK_CARD_COLLAPSED_HEIGHT,
  isHomeWeeklyCardReady,
  presentHomeWeeklyCard,
  resolveHomeTaskCarouselHeight,
  selectHomeWeeklySource,
  shouldMeasureHomeNewcomerContent,
} from "./home-task-carousel";

const weeklyQuest: CanonicalQuest = {
  questCode: "H3_LEARNING_COMPLETED",
  name: "Complete a learning course",
  layer: "WEEKLY_T1",
  rewardNex: 30,
  status: "PENDING",
  category: "explore",
  actionRoute: "/pages/learn/courses",
  instanceKey: "WEEK:2026-W36",
  eligibleFrom: "2026-08-31T00:00:00+08:00",
  eligibleUntil: "2026-09-07T00:00:00+08:00",
  eligible: true,
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
  dayOneRewardNex: 0,
  dayOneRequiredTaskCount: null,
  dayOneSnapshotStatus: "LEGACY_UNVERIFIED",
  promoBanner: pausedPromo,
  questBonusMultiplier: 1,
  rhythmMonth: 0,
  source: "mock",
  serverCanonical: true,
  sourceEnvironment: "SANDBOX",
  runId: "weekly-card-test-run",
};

describe("home task carousel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00+08:00"));
  });

  afterEach(() => vi.useRealTimers());

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

  it("adds distinct promotion slides to the existing carousel independently of weekly configuration", () => {
    const flags = { homeNewcomerTasksEnabled: true, homeWeeklyPromoEnabled: true };
    expect(deriveHomeTaskCards(false, flags, ["gift-A", "gift-A", "cash-B"]))
      .toEqual(["newcomer", "weekly", "promotion:gift-A", "promotion:cash-B"]);
    expect(deriveHomeTaskCards(true, flags, ["gift-A"]))
      .toEqual(["promotion:gift-A"]);
    const template = homePageSource.slice(homePageSource.indexOf("<template>"), homePageSource.indexOf("</template>"));
    const slide = template.slice(template.indexOf("<swiper-item"), template.indexOf("</swiper-item>"));
    expect(slide).toContain('<PromotionEntry v-else mode="home" :active="taskSlide === index"');
    expect(template.match(/<PromotionEntry\b/g)).toHaveLength(1);
    expect(template.match(/<QuickActionRow\b/g)).toHaveLength(1);
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

  it("keeps the high-fidelity countdown and daily-rate slots for a real weekly quest", () => {
    const source = selectHomeWeeklySource([weeklyQuest], pausedPromo);

    expect(presentHomeWeeklyCard(source, pausedPromo, 1, Date.parse("2026-09-05T00:00:00+08:00"))).toEqual({
      multiplier: 1,
      rewardNex: 30,
      countdownDays: 2,
      countdownHours: 0,
      subtitle: "Complete a learning course · UVELBox Pro",
      targetDevice: "UVELBox Pro",
      targetDaily: 1.5,
      category: "explore",
      actionRoute: "/pages/learn/courses",
    });
    expect(conversionBannerSource).not.toContain('v-if="!weeklyQuest"');
  });

  it("brands the weekly card's server name only in its visible subtitle", () => {
    const rawQuest = { ...weeklyQuest, name: "查看 NexGridBox S1 ROI" };
    const view = presentHomeWeeklyCard({ kind: "quest", quest: rawQuest }, null, 1, Date.parse("2026-09-05T00:00:00+08:00"));
    expect(view.subtitle).toBe("查看 UVELBox S1 ROI");
    expect(view.actionRoute).toBe(rawQuest.actionRoute);
    expect(view.rewardNex).toBe(rawQuest.rewardNex);
    expect(rawQuest.name).toBe("查看 NexGridBox S1 ROI");
  });

  it("shows the localized mission name and current SKU name without changing the quest", () => {
    const quest = { ...weeklyQuest, questCode: "weekly_t2_invite_friend", name: "邀请 1 位朋友注册" };
    const view = presentHomeWeeklyCard(
      { kind: "quest", quest }, pausedPromo, 1, Date.parse("2026-09-05T00:00:00+08:00"),
      "Mời 1 người bạn đăng ký",
    );
    expect(view.subtitle).toBe("Mời 1 người bạn đăng ký · UVELBox Pro");
    expect(view.targetDevice).toBe("UVELBox Pro");
    expect(quest.name).toBe("邀请 1 位朋友注册");
  });

  it("does not invent weekly display metadata when PC H3 has no presentation row", () => {
    expect(presentHomeWeeklyCard({ kind: "quest", quest: weeklyQuest }, null, 1.2, Date.parse("2026-09-05T00:00:00+08:00"))).toEqual({
      multiplier: 1.2,
      rewardNex: 36,
      countdownDays: 2,
      countdownHours: 0,
      subtitle: "Complete a learning course",
      targetDevice: null,
      targetDaily: null,
      category: "explore",
      actionRoute: "/pages/learn/courses",
    });
  });

  it("keeps the Share NEX task card while hiding an unavailable USD daily rate", () => {
    const sharePromo = { ...pausedPromo, targetDevice: "Cloud Share", targetDaily: null, status: "active" as const };
    const view = presentHomeWeeklyCard(selectHomeWeeklySource([], sharePromo), sharePromo, 1);
    expect(view.rewardNex).toBe(1200);
    expect(view.targetDaily).toBeNull();
    expect(conversionBannerSource).toContain('v-if="weeklyCard.targetDaily !== null"');
  });

  it("routes every pending weekly entry through the PC-configured actionRoute", () => {
    expect(conversionBannerSource).toContain("navTo(weeklyCard.value.actionRoute)");
    expect(conversionBannerSource).toContain("weeklyCard.value.category");
    expect(weeklyQuestHeroSource).toContain("navTo(q.actionRoute)");
    expect(weeklyQuestHeroSource).toContain("w.value.goComplete");
    expect(weeklyQuestListSource).toContain("navTo(q.actionRoute)");
    expect(conversionBannerSource).not.toContain('navTo("/pages/missions/missions")');
  });

  /**
   * Tier-1 hero 的停用态必须与首页周任务卡(conversion-banner)同形(zentao #127/#155)。
   *
   * 原缺陷形态:目标业务(质押/兑换/Genesis)已停售,列表行与首页卡都改成了「未开放」,
   * hero 却仍渲染「去完成」+ 琥珀色主操作 pill + role=button/tabindex=0,还挂着倒计时 ——
   * 点下去被 onClick 挡住什么也不发生。只守 onClick 是不够的:用户看到的就是一个
   * 可点的进行中任务。
   */
  it("hero withdraws the active CTA when the target business is paused", () => {
    expect(weeklyQuestHeroSource).toContain("const questTargetClosed = computed(");
    // 文案、可访问角色与焦点都必须随停用态一起收掉,不能只拦点击。
    expect(weeklyQuestHeroSource).toContain("questTargetClosed ? w.targetClosed : ctaText");
    expect(weeklyQuestHeroSource).toContain(":role=\"questTargetClosed ? undefined : 'button'\"");
    expect(weeklyQuestHeroSource).toContain(":tabindex=\"questTargetClosed ? -1 : 0\"");
    expect(weeklyQuestHeroSource).toContain(":aria-disabled=\"questTargetClosed ? 'true' : 'false'\"");
    expect(weeklyQuestHeroSource).toContain(":style=\"questTargetClosed ? closedCtaStyle : ctaStyle\"");
    // 停用态不得再用「可点的主操作」配色。
    expect(weeklyQuestHeroSource).toContain("const closedCtaStyle: CSSProperties = {");
  });

  it("keeps mock-only weekly values out of the formal UniApp component", () => {
    expect(conversionBannerSource).not.toContain("remoteApiEnabled");
    expect(conversionBannerSource).not.toContain("derivePromoUpgrade");
    expect(conversionBannerSource).not.toContain("const baseReward = 800");
    expect(conversionBannerSource).not.toContain("managedCopyText");
    expect(conversionBannerSource).toContain(':aria-label="subtitleText"');
    expect(conversionBannerSource).toContain(':title="subtitleText"');
  });

  it("resizes only the active newcomer slide for collapsed claim/error and localized content", () => {
    const cards = ["newcomer", "weekly"] as const;
    let viewportHeight = HOME_TASK_CARD_COLLAPSED_HEIGHT;
    let activeIndex = 0;
    const pendingMeasurements: Array<(height: unknown) => void> = [];
    const resizer = createHomeNewcomerContentResizer(
      () => ({ cards, activeIndex }),
      (height) => { viewportHeight = height; },
      (done) => pendingMeasurements.push(done),
    );

    // A collapsed card grows when the claim CTA or a claim error appears.
    expect(resizer.measure(0)).toBe(true);
    pendingMeasurements.shift()?.(232.1);
    expect(viewportHeight).toBe(233);
    expect(resizer.measure(0)).toBe(true);
    pendingMeasurements.shift()?.(260.8);
    expect(viewportHeight).toBe(261);
    // A wider viewport can shrink the card back to the baseline height.
    expect(resizer.measure(0)).toBe(true);
    pendingMeasurements.shift()?.(184);
    expect(viewportHeight).toBe(184);
    // A locale-change resize remains measurable, while a hidden or late card
    // notification cannot alter the weekly viewport.
    expect(resizer.measure(0)).toBe(true);
    activeIndex = 1;
    pendingMeasurements.shift()?.(320);
    expect(viewportHeight).toBe(184);
    expect(resolveHomeTaskCarouselHeight(0)).toBe(HOME_TASK_CARD_COLLAPSED_HEIGHT);
    expect(shouldMeasureHomeNewcomerContent(cards, 0, 1)).toBe(false);

    activeIndex = 0;
    expect(resizer.measure(0)).toBe(true);
    resizer.invalidate();
    pendingMeasurements.shift()?.(400);
    expect(viewportHeight).toBe(184);
    resizer.reset();
    expect(viewportHeight).toBe(HOME_TASK_CARD_COLLAPSED_HEIGHT);

    // The actual page binds the v-for index to the card event and invokes the
    // same active-slide gate; this is not a copy of the SFC measurement code.
    expect(homePageSource).toContain('@content-resize="onNewcomerContentResize(index)"');
    expect(homePageSource).toContain("createHomeNewcomerContentResizer");
    expect(homePageSource).toContain("newcomerContentResizer.measure(taskSlide.value)");
    expect(homePageSource).toContain("uni.onWindowResize(onTaskWindowResize)");
    expect(homePageSource).toContain("uni.offWindowResize(onTaskWindowResize)");
  });
});
