import { describe, expect, it } from "vitest";
import {
  PHONE_COUNTRIES,
  dialCodeForLocale,
  phoneFormatHint,
  sanitizePhoneInput,
  validateNationalPhone,
} from "./phone-number";

describe("country-aware phone validation", () => {
  it("keeps only Vietnam and China selectable, ahead of disabled regions", () => {
    expect(PHONE_COUNTRIES.slice(0, 2)).toEqual([
      expect.objectContaining({ iso: "VN", dialCode: "+84", selectable: true }),
      expect.objectContaining({ iso: "CN", dialCode: "+86", selectable: true }),
    ]);
    expect(PHONE_COUNTRIES).toHaveLength(16);
    expect(PHONE_COUNTRIES.slice(2)).toHaveLength(14);
    expect(PHONE_COUNTRIES.slice(2).every((country) => !country.selectable)).toBe(true);
  });

  it("defaults formal builds to +84 and local development to +86", () => {
    expect(dialCodeForLocale("vi", false)).toBe("+84");
    expect(dialCodeForLocale("zh", false)).toBe("+84");
    expect(dialCodeForLocale("vi", true)).toBe("+86");
  });

  it("does not expose an input hint for disabled or unknown country codes", () => {
    expect(phoneFormatHint("+84")).toBe("0912 345 678");
    expect(phoneFormatHint("+86")).toBe("138 0013 8000");
    expect(phoneFormatHint("+81")).toBe("");
    expect(phoneFormatHint("+999")).toBe("");
  });

  it.each([
    ["+84", "0912345678"], ["+84", "912345678"],
    ["+86", "13800138000"],
  ])("accepts a valid %s national format", (dialCode, phone) => {
    expect(validateNationalPhone(dialCode, phone)).toBe(true);
  });

  it.each([
    ["+1", "4155552671"], ["+44", "07123456789"],
    ["+49", "015123456789"], ["+33", "0612345678"],
    ["+34", "612345678"], ["+81", "09012345678"],
    ["+82", "01012345678"], ["+55", "11912345678"],
    ["+62", "081234567890"], ["+63", "09171234567"],
    ["+66", "0812345678"], ["+971", "0501234567"],
    ["+7", "9123456789"], ["+966", "0512345678"],
  ])("rejects a valid-format phone for disabled %s regions", (dialCode, phone) => {
    expect(validateNationalPhone(dialCode, phone)).toBe(false);
  });

  it.each([
    ["+84", "0212345678"], ["+84", "091234567"],
    ["+1", "123"], ["+44", "02123456789"],
    ["+49", "123456"], ["+33", "0512345678"],
    ["+34", "512345678"], ["+86", "12800138000"],
    ["+81", "06012345678"], ["+82", "02012345678"],
    ["+55", "1112345678"], ["+62", "07123456789"],
    ["+63", "08171234567"], ["+66", "0712345678"],
    ["+971", "0401234567"], ["+7", "8123456789"],
    ["+966", "0412345678"], ["+999", "123456789"],
  ])("rejects an invalid %s national format", (dialCode, phone) => {
    expect(validateNationalPhone(dialCode, phone)).toBe(false);
  });

  it("normalizes pasted spacing and punctuation before validation", () => {
    expect(sanitizePhoneInput(" 0912-345-678 ")).toBe("0912345678");
    expect(validateNationalPhone("+84", "0912 345 678")).toBe(true);
  });
});
