import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { vi as viMessages } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import { dailyCheckInSuccessCopy } from "./daily-success-copy";

describe("remote Daily success presentation", () => {
  it.each([
    [en.daily, "+8 NEX", "12-day streak"],
    [zh.daily, "+8 NEX", "连续 12 天"],
    [viMessages.daily, "+8 NEX", "Chuỗi 12 ngày"],
  ] as const)("uses the active locale templates", (messages, title, body) => {
    expect(dailyCheckInSuccessCopy({ gained: 8, streak: 12 }, messages)).toEqual({ title, body });
  });
});
