import { describe, expect, it } from "vitest";
import source from "./device-card-pc.vue?raw";
import zh from "../../i18n/messages/zh.ts?raw";
import en from "../../i18n/messages/en.ts?raw";
import vi from "../../i18n/messages/vi.ts?raw";

describe("per-device today-completed section", () => {
  it("shows the real per-device count and every task returned for the Shanghai business day", () => {
    expect(source).toContain("todayCompletedTasks");
    expect(source).toMatch(/v-for="task in deviceTodayCompleted"/);
    expect(source).toContain("deviceTodayCompleted.length");
    expect(source).toContain("const liveTaskNow = computed");
    expect(source).toContain("props.device.taskServerNowReceivedAt");
    expect(source).toMatch(/elapsedRatio[\s\S]*liveTaskNow\.value/);
    expect(source).toMatch(/elapsedRemaining[\s\S]*liveTaskNow\.value/);
    expect(source).not.toContain("device.kind === 'phone'\" class=\"nx-phone-today-completed");
    expect(source).not.toContain("今日已完成（5）");
  });

  it("labels view-all as the account-wide receipt history and keeps it keyboard accessible", () => {
    expect(source).toContain("t.earn.todayRecentCompleted");
    expect(source).toContain("t.taskHistory.viewAllAccountReceipts");
    expect(source).toContain('@click.stop="goTaskHistory"');
    expect(source).toContain('@keydown.enter.stop.prevent="goTaskHistory"');
    expect(source).toContain('@keydown.space.stop.prevent="goTaskHistory"');
    expect(source).toContain('navTo("/pages/me/receipts")');
  });

  it("ships the new section label in all supported languages", () => {
    expect(zh).toContain('todayRecentCompleted: "今日最近完成"');
    expect(en).toContain('todayRecentCompleted: "Recent completions today"');
    expect(vi).toContain('todayRecentCompleted: "Hoàn thành gần đây hôm nay"');
  });

  it("identifies the destination as account-wide receipts in every supported language", () => {
    expect(zh).toContain('viewAllAccountReceipts: "查看全账户收据"');
    expect(en).toContain('viewAllAccountReceipts: "View account receipts"');
    expect(vi).toContain('viewAllAccountReceipts: "Xem biên nhận của tài khoản"');
  });
});
