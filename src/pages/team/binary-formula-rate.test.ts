// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { computed, ref } from "vue";
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";

const source = readFileSync(new URL("./binary.vue", import.meta.url), "utf8");
const start = source.indexOf("const formulaText = computed(");
const end = source.indexOf("const blockedDetailText", start);
if (start < 0 || end <= start) throw new Error("Binary formula binding not found");
const build = new Function("computed", "fmt", "t", "MATCH_RATE", "DAILY_CAP", "periodFreqLabel", "dateLocale", `${source.slice(start, end)}; return formulaText;`);
describe("Binary formula follows the PC projection rate", () => {
  for (const [locale, dict] of [["en-US", en], ["zh-CN", zh], ["vi-VN", vi]] as const) {
    it(`renders updated fractional rates in ${locale}`, () => {
      const rate = ref(0.075);
      const formula = build(computed, fmt, ref(dict), rate, ref(5000), ref("monthly"), () => locale);
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
