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
    expect(zh).toContain('结算能否恢复以资格确认结果为准');
    expect(en).toContain('Settlement can resume only if eligibility is confirmed');
    expect(vi).toContain('Việc khôi phục quyết toán phụ thuộc vào kết quả xác nhận điều kiện');
    expect(zh).not.toContain('本月奖励即可恢复');
    expect(en).not.toContain("lift this month's payout");
    expect(vi).not.toContain('nâng khoản thưởng tháng này');
  });

  it("describes comparison without converting points into money or promising payment", () => {
    expect(zh).toContain('算力点仅用于比较 A/B 两组贡献，不用于直接换算奖励金额');
    expect(en).toContain('they do not directly convert into a reward amount');
    expect(vi).toContain('không quy đổi trực tiếp thành tiền thưởng');
    expect(zh).toContain('奖励金额以结算预估为准，实际到账以最终结算为准');
    expect(en).toContain('Rewards shown are settlement estimates; actual payments depend on final settlement');
    expect(vi).toContain('Số tiền hiển thị là ước tính quyết toán; khoản thực nhận theo quyết toán cuối cùng');
    expect(zh).not.toContain('继续邀请较小一轨提升{freq}发放');
    expect(en).not.toContain('Grow the smaller track to lift your {freq} payout');
    expect(vi).not.toContain('Bồi thêm nhánh nhỏ để nâng khoản thưởng {freq} của bạn');
  });
});
