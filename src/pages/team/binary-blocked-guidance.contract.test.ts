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
    expect(page).toContain('}).showInviteOptions');
    expect(page).not.toContain('["BINARY_LEG_ASSIGNMENT_INCOMPLETE", "BINARY_THRESHOLD_NOT_MET"]');
  });

  it("keeps all visible invite guidance conditional and non-guaranteeing", () => {
    expect(zh).toContain('是否恢复结算以服务端后续资格判定为准');
    expect(en).toContain('server will determine whether settlement becomes eligible');
    expect(vi).toContain('máy chủ sẽ xác định liệu kết toán có đủ điều kiện hay không');
    expect(zh).not.toContain('本月奖励即可恢复');
    expect(en).not.toContain("lift this month's payout");
    expect(vi).not.toContain('nâng khoản thưởng tháng này');
  });

  it("describes the smaller-track formula without implying that a member can choose a track or increase payout", () => {
    expect(zh).toContain('成员按安置规则分配，是否结算以服务端状态为准');
    expect(en).toContain('Members are placed by the placement rules; server status determines settlement eligibility');
    expect(vi).toContain('Thành viên được phân theo quy tắc sắp xếp; trạng thái máy chủ quyết định điều kiện kết toán');
    expect(zh).not.toContain('继续邀请较小一轨提升{freq}发放');
    expect(en).not.toContain('Grow the smaller track to lift your {freq} payout');
    expect(vi).not.toContain('Bồi thêm nhánh nhỏ để nâng khoản thưởng {freq} của bạn');
  });
});
