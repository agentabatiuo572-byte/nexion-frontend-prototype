import { describe, expect, it, vi } from "vitest";
import { formatLegalEffectiveDate } from "./legal-effective-date";

describe("published legal effective date display", () => {
  it.each([
    ["zh-CN", "2026年10月25日"],
    ["en-US", "October 25, 2026"],
    ["vi-VN", "25 tháng 10, 2026"],
  ])("uses %s without changing the published calendar day", (locale, expected) => {
    for (const value of ["2026-10-25", "2026-10-25T00:00:00", "2026-10-25T00:00:00+14:00", "2026-10-25T23:59:59-12:00"])
      expect(formatLegalEffectiveDate(value, locale)).toBe(expected);
  });
  it.each([undefined, "", "unpublished", "2026-02-29", "2026-13-25", "2026-10-25T99:00:00Z"])("keeps missing or invalid dates unknown: %s", value => {
    expect(formatLegalEffectiveDate(value, "en-US")).toBe("—");
  });
  it("accepts a real leap day", () => expect(formatLegalEffectiveDate("2028-02-29T00:00:00.000Z", "en-US")).toBe("February 29, 2028"));
  it("also localizes on native runtimes without Intl", () => {
    vi.stubGlobal("Intl", undefined);
    try { expect(formatLegalEffectiveDate("2026-10-25", "vi-VN")).toBe("25 tháng 10, 2026"); }
    finally { vi.unstubAllGlobals(); }
  });
});
