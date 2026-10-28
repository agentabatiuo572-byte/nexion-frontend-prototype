import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { describe, expect, it, vi } from "vitest";
import { rankConditionsText, rankCultivationCopy, rankGapText, rankLabel, rankName } from "./v-rank-copy";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { VRankDef } from "@/store/v-rank";
import { HAN_SCRIPT_RE } from "./native-unicode-regex";
import { computePointsCopy, formatComputePoints } from "@/i18n/compute-points";
import { teamRedesignCopy } from "@/i18n/team-redesign";
import { fmt } from "@/i18n/format";

const published = [
  ["注册会员", "Registered Member", "Thành viên đã đăng ký"],
  ["活跃新星", "Rising Star", "Ngôi sao mới"],
  ["团队达人", "Team Expert", "Chuyên gia đội nhóm"],
  ["一星大使", "One-Star Ambassador", "Đại sứ 1 sao"],
  ["二星大使", "Two-Star Ambassador", "Đại sứ 2 sao"],
  ["三星大使", "Three-Star Ambassador", "Đại sứ 3 sao"],
  ["四星大使", "Four-Star Ambassador", "Đại sứ 4 sao"],
  ["五星大使", "Five-Star Ambassador", "Đại sứ 5 sao"],
  ["资深领袖", "Senior Leader", "Lãnh đạo kỳ cựu"],
  ["钻石领袖", "Diamond Leader", "Lãnh đạo Kim cương"],
  ["皇冠领袖", "Crown Leader", "Lãnh đạo Vương miện"],
  ["传奇大使", "Legendary Ambassador", "Đại sứ huyền thoại"],
  ["名誉董事", "Honorary Director", "Thành viên HĐQT danh dự"],
] as const;

describe("canonical V-rank title locale", () => {
  it.each([
    ['zh', '直接邀请的成员', '奖励发给晋升者的推荐人', '无推荐人时，由晋升者本人获得'],
    ['en', 'directly invited member', 'promoted member’s referrer', 'If there is no referrer, the promoted member receives it'],
    ['vi', 'thành viên được mời trực tiếp', 'người giới thiệu của thành viên thăng hạng', 'Nếu không có người giới thiệu, thành viên thăng hạng tự nhận thưởng'],
  ])('keeps the %s growth trigger, referrer recipient and no-referrer fallback explicit', (locale, direct, recipient, fallback) => {
    const copy = rankCultivationCopy(locale);
    expect(copy.title).toBe(teamRedesignCopy(locale).memberGrowthReward);
    const trigger = fmt(copy.trigger, { n: 4, amount: '321.12 UVT' });
    expect(trigger).toContain(direct);
    expect(trigger).toContain('V4');
    expect(trigger).toContain('321.12 UVT');
    expect(trigger).toMatch(/奖励记录|reward records|bản ghi thưởng/);
    expect(copy.recipient).toContain(recipient);
    expect(copy.recipient).toContain(fallback);
  });
  it("translates every published F1 name while preserving the server rank", () => {
    const ladder = published.map(([zh]) => ({ title: zh, cnTitle: zh })) as VRankDef[];
    published.forEach(([zh, en, vi], v) => {
      expect(rankLabel(v, "zh", ladder)).toBe(`V${v} ${zh}`);
      expect(rankLabel(v, "en", ladder)).toBe(`V${v} ${en}`);
      expect(rankLabel(v, "vi", ladder)).toBe(`V${v} ${vi}`);
    });
  });

  it("prefers a non-Chinese server title and does not guess custom Chinese titles", () => {
    expect(rankName({ title: "Server Rank", cnTitle: "运营自定义" }, "en")).toBe("Server Rank");
    expect(rankName({ title: "Server Rank", cnTitle: "运营自定义" }, "vi")).toBe("Server Rank");
    expect(rankName({ title: "Server Rank", cnTitle: "注册会员" }, "en")).toBe("Server Rank");
    expect(rankName({ title: "Server Rank", cnTitle: "注册会员" }, "vi")).toBe("Thành viên đã đăng ký");
    expect(rankName({ title: "运营自定义", cnTitle: "运营自定义" }, "zh")).toBe("运营自定义");
    expect(rankLabel(0, "en", [{ title: "运营自定义", cnTitle: "运营自定义" } as VRankDef])).toBe("V0");
    expect(rankLabel(0, "vi", [{ title: "运营自定义", cnTitle: "运营自定义" } as VRankDef])).toBe("V0");
  });
  it("keeps Han detection compatible with older Android render engines", () => {
    expect(HAN_SCRIPT_RE.source).not.toMatch(/\\[pP]\{/);
    expect(rankName({ title: "A股团队", cnTitle: "A股团队" }, "en")).toBe("");
    expect(rankName({ title: "𠮷田团队", cnTitle: "𠮷田团队" }, "en")).toBe("");
    expect(rankName({ title: "Server Rank", cnTitle: "注册会员" }, "en")).toBe("Server Rank");
  });
  it.each([
    ["en", en],
    ["zh", zh],
    ["vi", vietnamese],
  ] as const)("states %s rank thresholds in compute points only", (locale, copy) => {
    const text = rankConditionsText(copy, { selfComputePoints: 2000, teamComputePoints: 20000 }, locale);
    expect(text).toContain(formatComputePoints(2000, locale));
    expect(text).toContain(formatComputePoints(20000, locale));
    expect(text).not.toMatch(/USD|\$/);
  });
});

describe("platform point formatting and copy", () => {
  it.each([
    ["zh", zh, "1,280.125 算力点", "自购算力还差 720 算力点", "团队算力 ≥ 20,000 算力点"],
    ["en", en, "1,280.125 compute pts", "720 compute pts more own compute", "Team compute ≥ 20,000 compute pts"],
    ["vi", vietnamese, "1.280,125 điểm tính toán", "Còn thiếu 720 điểm tính toán tự mua", "Năng lực đội ≥ 20.000 điểm tính toán"],
  ] as const)("formats independent %s points without Intl, currency signs or money rounding", (locale, copy, formatted, gap, condition) => {
    vi.stubGlobal("Intl", undefined);
    try {
      expect(formatComputePoints(1280.125, locale)).toBe(formatted);
      expect(rankGapText(copy, { kind: "selfComputePoints", amount: 720 }, locale, [])).toBe(gap);
      expect(rankConditionsText(copy, { teamComputePoints: 20000 }, locale)).toBe(condition);
      expect(rankGapText(copy, { kind: "teamComputePoints", amount: undefined }, locale, [])).toBe(computePointsCopy(locale).conditionsPending);
      expect(formatComputePoints(0, locale)).toBe(`0 ${computePointsCopy(locale).unit}`);
    } finally { vi.unstubAllGlobals(); }
  });
  it("expands exponents, rounds decimal ties and preserves unknown values", () => {
    expect(formatComputePoints(1e21, "en")).toBe("1,000,000,000,000,000,000,000 compute pts");
    expect(formatComputePoints(0.0000005, "zh")).toBe("0.000001 算力点");
    expect(formatComputePoints(9.9999995, "vi")).toBe("10 điểm tính toán");
    for (const value of [undefined, null, -1, NaN, Infinity]) expect(formatComputePoints(value, "en")).toBe("—");
  });
});
