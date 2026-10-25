import { computed, ref } from "vue";
import { expect, it } from "vitest";
import pageSource from "./risk-disclosure.vue?raw";
import { platformDisplayText } from "@/lib/brand-copy";
import { riskDisclosureChapterCopy } from "@/lib/risk-disclosure-language";
import { riskDisclosureDocumentIdentity } from "@/lib/risk-disclosure-reading-gate";
import type { RiskDisclosureCurrent } from "@/api/risk-disclosure-api";

it.each(["zh", "en", "vi"] as const)("converts remote %s chapter display without changing the legal snapshot", language => {
  const chapter = { no: "01", zh: "NEX 市场风险", zhBody: "NEX 的价格可能下跌。https://example.com/NEX", en: "NEX market risk", enBody: "NEX prices may fall. https://example.com/NEX", vi: "Rủi ro thị trường NEX", viBody: "Giá NEX có thể giảm. https://example.com/NEX" };
  const original = { source: "server", sourceEnvironment: "PRODUCTION", jurisdiction: "CN", jurisdictionName: "中国大陆", version: "NEX-v7", effectiveDate: "2026-10-25", languageScope: "zh+vi+en", acknowledged: true, acknowledgedAt: "2026-10-25T00:00:00Z", acknowledgmentToken: null, acknowledgmentTokenExpiresAt: null, minimumReadingSeconds: 30, chapters: [chapter] } as RiskDisclosureCurrent;
  const before = structuredClone(original), disclosure = ref(original), displayLanguage = ref({ language });
  const identity = riskDisclosureDocumentIdentity(original);
  const start = pageSource.indexOf("const blocks = computed"), end = pageSource.indexOf("function sectionSelectedLabel", start);
  const blocks = new Function("computed", "disclosure", "displayLanguage", "riskDisclosureChapterCopy", "platformDisplayText", pageSource.slice(start, end) + ";return blocks;")(computed, disclosure, displayLanguage, riskDisclosureChapterCopy, platformDisplayText);
  const authored = riskDisclosureChapterCopy(chapter, language);
  expect(blocks.value).toEqual([{ n: 1, title: authored.title.replace(/NEX/g, "UVT"), body: authored.body.replace("NEX", "UVT") }]);
  expect(original).toEqual(before); expect(disclosure.value).toEqual(before);
  expect(riskDisclosureDocumentIdentity(original)).toBe(identity);
  expect(pageSource).toContain('<SubPageHeader :back="returnTo" />');
});
