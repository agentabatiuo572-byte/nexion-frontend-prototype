import { describe, expect, it } from "vitest";
import { LOCALES, getLocale } from "./index";

describe("supported locale catalogue", () => {
  it("advertises only locales backed by complete dictionaries", () => {
    expect(LOCALES.map((locale) => locale.code)).toEqual(["zh", "en", "vi"]);
    expect(LOCALES.every((locale) => !locale.isRTL)).toBe(true);
  });

  it("falls back to the shipped Chinese locale for future locale codes", () => {
    expect(getLocale("ja").code).toBe("zh");
  });
});
