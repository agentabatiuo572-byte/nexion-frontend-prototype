import { describe, expect, it } from "vitest";

const page = (import.meta.glob("./binary.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./binary.vue"] ?? "") as string;
const locales = import.meta.glob("../../i18n/messages/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const zh = (locales["../../i18n/messages/zh.ts"] ?? "") as string;
const en = (locales["../../i18n/messages/en.ts"] ?? "") as string;
const vi = (locales["../../i18n/messages/vi.ts"] ?? "") as string;

describe("binary blocked guidance page contract", () => {
  it("uses the reason-gated invite guidance instead of treating incomplete assignment as a volume issue", () => {
    expect(page).toContain('binaryBlockedGuidance({');
    expect(page).toContain('blockedGuidance.value.showInviteOptions');
    expect(page).toContain('t.value.binary[blockedGuidance.value.titleKey]');
    expect(page).not.toContain('["BINARY_LEG_ASSIGNMENT_INCOMPLETE", "BINARY_THRESHOLD_NOT_MET"]');
  });

  it("keeps all visible invite guidance conditional and non-guaranteeing", () => {
    // The invite nudge names an action, never a payout outcome.
    expect(zh).toContain('邀请好友加入，尽快达标。');
    expect(en).toContain('Invite friends to get there sooner.');
    expect(vi).toContain('Mời thêm bạn bè để sớm đạt mức này.');
    expect(zh).not.toContain('本月奖励即可恢复');
    expect(en).not.toContain("lift this month's payout");
    expect(vi).not.toContain('nâng khoản thưởng tháng này');
  });

  it("describes group volume from confirmed orders without promising payment", () => {
    expect(zh).toContain('订单额按已确认订单统计，奖励以实际发放为准。');
    expect(en).toContain('Volume counts confirmed orders. Rewards are subject to actual payout.');
    expect(vi).toContain('Doanh số tính theo đơn hàng đã xác nhận. Thưởng thực nhận theo kết quả chi trả.');
    expect(zh).not.toContain('继续邀请较小一轨提升{freq}发放');
    expect(en).not.toContain('Grow the smaller track to lift your {freq} payout');
    expect(vi).not.toContain('Bồi thêm nhánh nhỏ để nâng khoản thưởng {freq} của bạn');
  });
});
