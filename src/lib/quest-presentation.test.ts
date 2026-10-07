import { describe, expect, it } from "vitest";
import { computed, ref } from "vue";

import { en, type Messages } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import { dayOneQuestDisplayName, normalizeQuestActionRoute, weeklyQuestDisplayName } from "./quest-presentation";

describe("normalizeQuestActionRoute", () => {
  it.each([
    ["/pages/me/profile", "/pages/me/profile"],
    [" /pages/store/detail?id=stellarbox-s1 ", "/pages/store/detail?id=stellarbox-s1"],
  ])("accepts a PC-configured internal page route", (route, expected) => {
    expect(normalizeQuestActionRoute(route)).toBe(expected);
  });

  it.each([
    "https://example.com/phish",
    "//example.com/phish",
    "/pages/me/profile\\evil",
    "/pages/me/profile\n/pages/wallet",
    "/other/profile",
  ])("rejects an unsafe or non-App route: %s", (route) => {
    expect(() => normalizeQuestActionRoute(route)).toThrow("QUEST_ACTION_ROUTE_INVALID");
  });
});

describe("weeklyQuestDisplayName", () => {
  const quest = { questCode: "weekly_t2_invite_friend", name: "邀请 1 位朋友注册" };

  it("uses the existing three-language title when a known mission falls back to Chinese", () => {
    expect(weeklyQuestDisplayName(quest, "vi", vi)).toBe("Mời 1 người bạn đăng ký");
    expect(weeklyQuestDisplayName(quest, "en", en)).toBe("Invite 1 friend who signs up");
    expect(weeklyQuestDisplayName(quest, "zh", zh)).toBe(quest.name);
    expect(weeklyQuestDisplayName({ questCode: "weekly_t2_ai_jobs_50", name: "完成 50 笔 AI 推理任务" }, "vi", vi))
      .toBe("Hoàn thành 50 tác vụ suy luận AI");
  });

  it("preserves server-authored titles even when they contain Chinese", () => {
    expect(weeklyQuestDisplayName({ ...quest, name: "Lời mời đặc biệt" }, "vi", vi))
      .toBe("Lời mời đặc biệt");
    expect(weeklyQuestDisplayName({ ...quest, name: "Special referral event" }, "vi", vi))
      .toBe("Special referral event");
    expect(weeklyQuestDisplayName({ ...quest, name: "邀请 3 位朋友注册" }, "vi", vi))
      .toBe("邀请 3 位朋友注册");
    expect(weeklyQuestDisplayName({ ...quest, name: "Ưu đãi 邀请 bạn bè" }, "vi", vi))
      .toBe("Ưu đãi 邀请 bạn bè");
    expect(weeklyQuestDisplayName({ questCode: "custom_quest", name: "自定义任务" }, "vi", vi))
      .toBe("自定义任务");
  });
});

describe("dayOneQuestDisplayName", () => {
  const defaults = [
    ["bind_bank_card", "绑定银行卡", "Link bank card", "Liên kết thẻ ngân hàng"],
    ["visit_earn", "访问收益页", "Visit Earn tab", "Vào tab Sinh lời"],
    ["visit_store", "访问商城", "Visit Store", "Vào Cửa hàng"],
    ["view_product_roi", "查看 UVELBox S1 ROI", "See UVELBox S1 ROI", "Xem ROI của UVELBox S1"],
    ["setup_profile", "设置个人资料", "Set up profile", "Thiết lập hồ sơ"],
    ["invite_friend", "邀请好友", "Invite a friend", "Mời bạn bè"],
  ] as const;

  it.each(defaults)("localizes only the known Chinese default for %s", (questCode, name, english, vietnamese) => {
    const quest = { questCode, name, layer: "DAY_ONE" as const };
    expect(dayOneQuestDisplayName(quest, "en", en)).toBe(english);
    expect(dayOneQuestDisplayName(quest, "vi", vi)).toBe(vietnamese);
    expect(dayOneQuestDisplayName(quest, "zh", zh)).toBe(name);
  });

  it.each(defaults)("preserves authored and already localized names for %s", (questCode, _, english, vietnamese) => {
    for (const name of ["特别的新手任务", "Ưu đãi 邀请朋友", english, vietnamese]) {
      const quest = { questCode, name, layer: "DAY_ONE" as const };
      expect(dayOneQuestDisplayName(quest, "en", en)).toBe(name);
      expect(dayOneQuestDisplayName(quest, "vi", vi)).toBe(name);
    }
  });

  it.each(["custom_quest", "__proto__", "constructor", "bind_bank_card "])("preserves unknown code %s even with a default name", (questCode) => {
    expect(dayOneQuestDisplayName({ questCode, name: "绑定银行卡", layer: "DAY_ONE" }, "vi", vi))
      .toBe("绑定银行卡");
  });

  it("preserves other ROI targets and non-Day-One rows", () => {
    expect(dayOneQuestDisplayName({ questCode: "view_product_roi", name: "查看 UVELBox Pro ROI", layer: "DAY_ONE" }, "en", en))
      .toBe("查看 UVELBox Pro ROI");
    expect(dayOneQuestDisplayName({ questCode: "visit_earn", name: "访问收益页", layer: "WEEKLY_T1" }, "vi", vi))
      .toBe("访问收益页");
  });

  it.each([undefined, null, 42, "", "   "])("preserves the server name when translation is missing or invalid: %s", (value) => {
    const messages = { ...en, home: { ...en.home, dayOneTaskVisitEarn: value } } as unknown as Messages;
    expect(dayOneQuestDisplayName({ questCode: "visit_earn", name: "访问收益页", layer: "DAY_ONE" }, "en", messages))
      .toBe("访问收益页");
  });

  it("uses current runtime copy for an exact default and retains display-only brand normalization", () => {
    const messages = { ...en, home: { ...en.home, dayOneTaskVisitEarn: "Explore earnings" } };
    expect(dayOneQuestDisplayName({ questCode: "visit_earn", name: "访问收益页", layer: "DAY_ONE" }, "en", messages))
      .toBe("Explore earnings");
    expect(dayOneQuestDisplayName({ questCode: "view_product_roi", name: "查看 Nex" + "GridBox S1 ROI", layer: "DAY_ONE" }, "vi", vi))
      .toBe("Xem ROI của UVELBox S1");
    expect(dayOneQuestDisplayName({ questCode: "custom_quest", name: "Nex" + "Grid 自定义任务", layer: "DAY_ONE" }, "vi", vi))
      .toBe("UVEL 自定义任务");
  });

  it("updates the label on locale changes without mutating frozen server facts", () => {
    const quest = Object.freeze({
      questCode: "visit_earn", name: "访问收益页", layer: "DAY_ONE" as const,
      instanceKey: "DAY_ONE:immutable", status: "COMPLETED", category: "explore",
      actionRoute: "/pages/earn/earn", rewardNex: 30, eligible: true,
      eligibleFrom: "2026-10-07T01:00:00Z", eligibleUntil: "2026-10-09T01:00:00Z",
    });
    const original = { ...quest };
    const locale = ref<"en" | "vi" | "zh">("en");
    const messages = { en, vi, zh };
    const label = computed(() => dayOneQuestDisplayName(quest, locale.value, messages[locale.value]));
    expect(label.value).toBe("Visit Earn tab");
    locale.value = "vi";
    expect(label.value).toBe("Vào tab Sinh lời");
    locale.value = "zh";
    expect(label.value).toBe(original.name);
    expect(quest).toEqual(original);
  });
});
