import { describe, expect, it } from "vitest";
import { resolveRiskDisclosureDisplayLanguage, riskDisclosureChapterCopy } from "./risk-disclosure-language";

describe("risk disclosure language fallback", () => {
  it("shows a published Chinese source text and a fallback signal when English is unavailable", () => {
    const display = resolveRiskDisclosureDisplayLanguage("en", "zh+vi");
    const copy = riskDisclosureChapterCopy({
      zh: "中文标题",
      vi: "Tieu de tieng Viet",
      en: "",
      zhBody: "中文正文",
      viBody: "Noi dung tieng Viet",
      enBody: "",
    }, display.language);

    expect(display).toEqual({ language: "zh", fallback: true });
    expect(copy).toEqual({ title: "中文标题", body: "中文正文" });
  });

  it("uses English only when the server publishes English for this disclosure", () => {
    const display = resolveRiskDisclosureDisplayLanguage("en", "zh+vi+en");

    expect(display).toEqual({ language: "en", fallback: false });
  });
});
