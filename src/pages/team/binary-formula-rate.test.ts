import { teamPrivacyFixture } from './team-privacy.test-support';
// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import * as Vue from "vue";
import { computed, ref } from "vue";
import { baseParse, compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import { formatComputePoints } from "@/i18n/compute-points";

const source = readFileSync(new URL("./binary.vue", import.meta.url), "utf8");
const start = source.indexOf("const formulaText = computed(");
const end = source.indexOf("const blockedDetailText", start);
if (start < 0 || end <= start) throw new Error("Binary formula binding not found");
const build = new Function("computed", "fmt", "t", "MATCH_RATE", "DAILY_CAP", "periodFreqLabel", "dateLocale", "formatFinanceAmount", `${source.slice(start, end)}; return formulaText;`);
describe("Binary formula follows the PC projection rate", () => {
  for (const [locale, dict] of [["en-US", en], ["zh-CN", zh], ["vi-VN", vi]] as const) {
    it(`renders updated fractional rates in ${locale}`, () => {
      const rate = ref(0.075);
      const formula = build(computed, fmt, ref(dict), rate, ref(5000), ref("monthly"), () => locale, formatFinanceAmount);
      expect(formula.value).toContain("5,000.00");
      expect(formula.value).toContain(`${(7.5).toLocaleString(locale)}%`);
      expect(formula.value).not.toContain("10%");
      rate.value = 0.123456;
      expect(formula.value).toContain(`${(12.3456).toLocaleString(locale, { maximumFractionDigits: 8 })}%`);
      expect(formula.value).not.toContain("{rate}");
      rate.value = 0.0000001;
      expect(formula.value).toContain(`${(0.00001).toLocaleString(locale, { maximumFractionDigits: 8 })}%`);
      rate.value = 1;
      expect(formula.value).toContain("100%");
    });
  }
});

// Exercise the production presentation as well as its computed rate: a correct
// computed value alone did not guarantee that the rule was visible on the page.
const template = parse(source).descriptor.template!.content;
const basis = template.match(/<view class="reward-binary-basis">[\s\S]*?<\/view>/)?.[0];
if (!basis) throw new Error("Missing visible binary calculation basis");
const render = new Function("Vue", compile(basis, { mode: "function", prefixIdentifiers: true }).code)(Vue);
async function showBasis(weakVol: number, dict = en, locale = "en-US", hidden = false) {
  const period = dict.binary.settlePeriodLabel.weekly;
  const { visibility } = teamPrivacyFixture();
  visibility.hidden = hidden;
  return renderToString(Vue.createSSRApp({ render, setup: () => ({
    visibility, t: dict, locale: { code: locale }, formatFinanceAmount, weakVol,
    formulaText: build(computed, fmt, ref(dict), ref(.1375), ref(4321), ref(period), () => locale, formatFinanceAmount),
    gapHintText: fmt(dict.binary.gapHint, { freq: period }),
  }) }));
}

describe("visible binary calculation basis", () => {
  it.each([[en, "en-US"], [zh, "zh-CN"], [vi, "vi-VN"]] as const)("renders the authoritative rate, cycle and weaker group volume in USDT (%s)", async (dict, locale) => {
    const html = await showBasis(1480, dict, locale);
    expect(html).toContain(`${dict.binary.weak} · $${formatFinanceAmount(1480)}`);
    expect(html).toContain(`${(13.75).toLocaleString(locale)}%`);
    expect(html).toContain(dict.binary.settlePeriodLabel.weekly);
    expect(html).toContain("4,321.00");
    expect(html).toContain(dict.binary.gapHint);
    expect(html).not.toContain(formatComputePoints(1480, locale));
    expect(html).not.toContain("10%");
  });
  it("shows a zero weaker group as zero dollars", async () => {
    expect(await showBasis(0)).toContain(`${en.binary.weak} · $${formatFinanceAmount(0)}`);
  });
  it.each([[en, "en-US"], [zh, "zh-CN"], [vi, "vi-VN"]] as const)("hides the personal volume but keeps the published rule visible (%s)", async (dict, locale) => {
    const html = await showBasis(1480.25, dict, locale, true);
    expect(html).toContain(`${dict.binary.weak} · ••••`);
    expect(html).not.toContain("1,480.25");
    expect(html).toContain(`${(13.75).toLocaleString(locale)}%`);
    expect(html).toContain("4,321.00");
    expect(html).toContain(dict.binary.gapHint);
  });
});


describe("binary contribution presentation", () => {
  it("scales raw group volume and follows refund deductions without changing either amount", () => {
    const code = source.slice(source.indexOf("const contributionWidths ="), source.indexOf("const weakSide ="));
    const left = ref(80), right = ref(160);
    const widths = new Function("computed", "leftMonthVol", "rightMonthVol", code + "; return contributionWidths;")(computed, left, right);
    expect(widths.value).toEqual([50, 100]);
    right.value = 40; expect(widths.value).toEqual([100, 50]);
    expect(left.value).toBe(80); expect(right.value).toBe(40);
    left.value = 0; right.value = 0; expect(widths.value).toEqual([0, 0]);
    right.value = 160; expect(widths.value).toEqual([0, 100]);
    expect(left.value).toBe(0); expect(right.value).toBe(160);
  });

  it("falls back to English for every supported locale without local page copy", () => {
    const code = source.slice(source.indexOf("const binaryCopy ="), source.indexOf("const displayEnvironment ="));
    const locale = { code: "zh" };
    const copy = new Function("computed", "locale", code + "; return binaryCopy;");
    expect(copy(computed, locale).value.rules).toBe("规则");
    locale.code = "vi"; expect(copy(computed, locale).value.rules).toBe("Quy tắc");
    for (const language of ["en", "ja", "ko", "ru", "es", "fr", "de", "pt", "ar"]) {
      locale.code = language;
      expect(copy(computed, locale).value.rules).toBe("Rules");
      expect(copy(computed, locale).value.leadingMembers).toBe("Leading contributors");
    }
  });
});

function findComparison(node: any): string | undefined {
  if (node.props?.some((prop: any) => prop.name === "class" && prop.value?.content === "binary-comparison-section")) return node.loc.source;
  for (const child of node.children ?? []) {
    const found = findComparison(child);
    if (found) return found;
  }
}
const comparison = findComparison(baseParse(template));
if (!comparison) throw new Error("Missing binary group comparison");
const renderComparison = new Function("Vue", compile(comparison, { mode: "function", prefixIdentifiers: true }).code)(Vue);

describe("binary group volume and privacy", () => {
  it.each([[en, "en-US"], [zh, "zh-CN"], [vi, "vi-VN"]] as const)("renders monetary volume independently of member points and restores it after masking (%s)", async (dict, locale) => {
    const { visibility } = teamPrivacyFixture();
    const wings = [
      { key: "left", name: dict.binary.leftWing, count: 3, monthVol: 2800.25, computePoints: 17, isWeak: false },
      { key: "right", name: dict.binary.rightWing, count: 2, monthVol: 1400.125, computePoints: 9200, isWeak: true },
    ];
    const original = JSON.stringify(wings);
    const draw = () => renderToString(Vue.createSSRApp({ render: renderComparison, setup: () => ({
      visibility, wings, t: dict, locale: { code: locale }, formatFinanceAmount, formatComputePoints,
      binaryCopy: { contributions: "A / B" }, contributionWidths: [100, 50], weakVol: 1400.125,
      wingMembersText: (n: number) => fmt(dict.binary.monthVolMembers, { n: visibility.mask(n) }),
      formulaText: "13.75% · $4,321.00", gapHintText: dict.binary.gapHint,
    }) }));
    const shown = await draw();
    expect(shown).toContain(`$${formatFinanceAmount(2800.25)}`);
    expect(shown).toContain(`$${formatFinanceAmount(1400.125)}`);
    expect(shown).not.toContain(formatComputePoints(17, locale));
    expect(shown).not.toContain(formatComputePoints(9200, locale));
    expect(shown).toContain("width:100%");
    expect(shown).toContain("width:50%");

    visibility.hidden = true;
    const hidden = await draw();
    expect(hidden).toContain("••••");
    expect(hidden).not.toContain(formatFinanceAmount(2800.25));
    expect(hidden).not.toContain(formatFinanceAmount(1400.125));
    expect(hidden).not.toContain("binary-contribution-fill");
    expect(hidden).not.toContain("binary-weak");
    expect(hidden).toContain("4,321.00");
    expect(hidden).toContain(dict.binary.gapHint);
    expect(JSON.stringify(wings)).toBe(original);
    visibility.hidden = false;
    expect(await draw()).toBe(shown);
  });
});
