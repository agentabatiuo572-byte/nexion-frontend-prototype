import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { describe, expect, it, vi } from "vitest";
import { rankConditionsText, rankCultivationCopy, rankGapText, rankLabel, rankName } from "./v-rank-copy";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { VRankDef } from "@/store/v-rank";
import { computePointsCopy, formatComputePoints } from "@/i18n/compute-points";
import { teamRedesignCopy } from "@/i18n/team-redesign";
import { fmt } from "@/i18n/format";

describe("canonical V-rank title locale", () => {
  it.each([
    ['zh', '好友升到 V4', '邀请这位好友的人'],
    ['en', 'When a friend reaches V4', 'the person who invited that friend'],
    ['vi', 'Khi bạn bè đạt V4', 'người đã mời người bạn đó'],
  ])('keeps the %s growth trigger and recipient explicit', (locale, trigger, recipient) => {
    const copy = rankCultivationCopy(locale);
    expect(copy.title).toBe(teamRedesignCopy(locale).memberGrowthReward);
    const text = fmt(copy.trigger, { n: 4, amount: '321.12 UVT' });
    expect(text).toContain(trigger);
    expect(text).toContain('321.12 UVT');
    expect(copy.recipient).toContain(recipient);
  });
  // APP-COPY-AUDIT D6: the App shows V levels only; configured titles (e.g. 名誉董事) stay internal.
  it.each(["zh", "en", "vi"] as const)("shows only the V level in %s, whatever the configured title", (locale) => {
    const ladder = [{ title: "名誉董事", cnTitle: "名誉董事" }, { title: "Server Rank", cnTitle: "运营自定义" }] as VRankDef[];
    expect(rankLabel(0, locale, ladder)).toBe("V0");
    expect(rankLabel(1, locale, ladder)).toBe("V1");
    expect(rankName(ladder[0], locale)).toBe("");
    expect(rankName(ladder[1], locale)).toBe("");
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
    ["vi", vietnamese, "1.280,125 điểm tính toán", "Còn thiếu 720 điểm tính toán (cá nhân)", "Điểm của nhóm ≥ 20.000 điểm tính toán"],
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
