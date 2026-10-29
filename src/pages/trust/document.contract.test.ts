import { describe, expect, it } from "vitest";
import page from "./document.vue?raw";
import pages from "@/pages.json";
import { resolveHeaderTitle } from "@/lib/header-title";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { trustCenterCopy } from "@/i18n/trust-center";

describe("trust document viewer", () => {
  it("is a registered sub-page with a title in every language", () => {
    expect(pages.pages.some((entry) => entry.path === "pages/trust/document")).toBe(true);
    expect(resolveHeaderTitle("pages/trust/document")).toEqual({ key: "trustDocument", howItWorks: false });
    expect([en, zh, vi].map((messages) => messages.headerTitles.trustDocument)).toEqual(["Document", "资料原件", "Tài liệu"]);
  });

  it("shows every rendered page, zooms in place and offers the PDF only for registrations", () => {
    expect(page).toContain('v-for="(url, index) in document.pageUrls"');
    expect(page).toContain("uni.previewImage({ urls: value.pageUrls, current: value.pageUrls[index] })");
    expect(page).toContain('v-if="document.fileUrl" class="doc-download"');
    expect(page).toMatch(/requested === "whitepaper" \|\| requested === "incorporation" \|\| requested === "msb" \|\| requested === "ein"/);
    for (const locale of ["zh", "en", "vi"]) {
      expect(Object.keys(trustCenterCopy(locale).docTitles)).toEqual(["whitepaper", "incorporation", "msb", "ein"]);
    }
  });
});
