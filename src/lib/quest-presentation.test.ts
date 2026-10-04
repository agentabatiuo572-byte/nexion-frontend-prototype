import { describe, expect, it } from "vitest";

import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import { normalizeQuestActionRoute, weeklyQuestDisplayName } from "./quest-presentation";

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
