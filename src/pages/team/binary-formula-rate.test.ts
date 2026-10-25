// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import * as Vue from "vue";
import { computed, ref } from "vue";
import { compile } from "@vue/compiler-dom";
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
const lowerStart = source.indexOf("const lowerComputePoints = computed(");
const lowerEnd = source.indexOf("const smallerPointSide", lowerStart);
if (lowerStart < 0 || lowerEnd < lowerStart) throw new Error("Missing lower point aggregate");
const lower = new Function("computed", "leftPoints", "rightPoints", `${source.slice(lowerStart, lowerEnd)}; return lowerComputePoints;`);

async function showBasis(points: [number | null, number | null], dict = en, locale = "en-US") {
  const period = dict.binary.settlePeriodLabel.weekly;
  return renderToString(Vue.createSSRApp({ render, setup: () => ({
    t: dict, locale: { code: locale }, formatComputePoints,
    lowerComputePoints: lower(computed, ref(points[0]), ref(points[1])),
    formulaText: build(computed, fmt, ref(dict), ref(.1375), ref(4321), ref(period), () => locale, formatFinanceAmount),
    gapHintText: fmt(dict.binary.gapHint, { freq: period }),
  }) }));
}

describe("visible binary calculation basis", () => {
  it.each([[en, "en-US"], [zh, "zh-CN"], [vi, "vi-VN"]] as const)("renders the authoritative rate, cycle and lower points (%s)", async (dict, locale) => {
    const html = await showBasis([1720, 1480], dict, locale);
    expect(html).toContain(formatComputePoints(1480, locale));
    expect(html).toContain(`${(13.75).toLocaleString(locale)}%`);
    expect(html).toContain(dict.binary.settlePeriodLabel.weekly);
    expect(html).toContain("4,321.00");
    expect(html).toContain(dict.binary.gapHint);
    expect(html).not.toContain("$1480");
    expect(html).not.toContain("10%");
  });
  it.each([[null, 1480], [1720, null], [null, null]] as [number | null, number | null][])("keeps a missing point aggregate unknown (%s, %s)", async (a, b) => {
    const html = await showBasis([a, b]);
    expect(html).toContain(`${en.binary.weak} · —`);
    expect(html).not.toContain("0 compute pts");
    expect(html).toContain("13.75%");
  });
  it("retains a known zero point total", async () => {
    expect(await showBasis([0, 1480])).toContain("0 compute pts");
  });
});
