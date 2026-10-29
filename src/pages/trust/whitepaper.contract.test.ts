import { describe, expect, it } from "vitest";
import page from "./whitepaper.vue?raw";
import pages from "@/pages.json";
import { resolveHeaderTitle } from "@/lib/header-title";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { trustCenterCopy } from "@/i18n/trust-center";

describe("white paper page", () => {
  it("is a registered sub-page with a title in every language", () => {
    expect(pages.pages.some((entry) => entry.path === "pages/trust/whitepaper")).toBe(true);
    expect(resolveHeaderTitle("pages/trust/whitepaper")).toEqual({ key: "trustWhitepaper", howItWorks: false });
    expect([en, zh, vi].map((messages) => messages.headerTitles.trustWhitepaper)).toEqual(["Whitepaper", "白皮书", "Sách trắng"]);
  });

  it("reads the published file in the in-app viewer and never shows a date", () => {
    expect(page).toContain("useTrustDocuments()");
    expect(page).toContain('navTo("/pages/trust/document?slot=whitepaper")');
    for (const locale of ["zh", "en", "vi"]) {
      const copy = trustCenterCopy(locale);
      expect(copy.wpTopics).toHaveLength(6);
      expect(JSON.stringify(copy)).not.toMatch(/20\d\d[-./]\d\d/);
    }
  });
});
