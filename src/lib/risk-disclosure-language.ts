import type { RiskDisclosureChapter, RiskDisclosureCurrent } from "@/api/risk-disclosure-api";

export type RiskDisclosureDisplayLanguage = "zh" | "vi" | "en";

/**
 * Server disclosures always publish Chinese and Vietnamese. English is shown
 * only when the authoritative language scope explicitly includes it; otherwise
 * the page must show a real published source language and say that it did so.
 */
export function resolveRiskDisclosureDisplayLanguage(
  localeCode: string,
  languageScope: RiskDisclosureCurrent["languageScope"],
): { language: RiskDisclosureDisplayLanguage; fallback: boolean } {
  if (localeCode === "vi") return { language: "vi", fallback: false };
  if (localeCode === "en" && languageScope === "zh+vi+en") {
    return { language: "en", fallback: false };
  }
  return { language: "zh", fallback: localeCode === "en" };
}

export function riskDisclosureChapterCopy(
  chapter: Pick<RiskDisclosureChapter, "zh" | "vi" | "en" | "zhBody" | "viBody" | "enBody">,
  language: RiskDisclosureDisplayLanguage,
): { title: string; body: string } {
  if (language === "vi") return { title: chapter.vi, body: chapter.viBody };
  if (language === "en") return { title: chapter.en, body: chapter.enBody };
  return { title: chapter.zh, body: chapter.zhBody };
}
