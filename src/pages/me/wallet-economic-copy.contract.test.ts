import { describe, expect, it } from "vitest";

const pages = import.meta.glob("./wallet.vue", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const messages = import.meta.glob("../../i18n/messages/{zh,en,vi}.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("wallet economic copy", () => {
  it("does not present an unsupported NEX holding entitlement", () => {
    const wallet = pages["./wallet.vue"] ?? "";

    expect(wallet).not.toContain("nexBoost");
    expect(wallet).not.toContain("nexCallout");
  });

  it.each([
    ["zh", "dailyCheckinSub: \"奖励以当日签到页为准\""],
    ["en", "dailyCheckinSub: \"See today's check-in for the current reward.\""],
    ["vi", "dailyCheckinSub: \"Xem trang điểm danh hôm nay để biết phần thưởng hiện tại.\""],
  ])("uses current-reward guidance for %s", (locale, expected) => {
    expect(messages[`../../i18n/messages/${locale}.ts`]).toContain(expected);
  });
});
