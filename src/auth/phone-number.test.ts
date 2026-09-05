import { describe, expect, it } from "vitest";
import {
  SUPPORTED_PHONE_COUNTRIES,
  dialCodeForLocale,
  sanitizePhoneInput,
  validateNationalPhone,
} from "./phone-number";

describe("country-aware phone validation", () => {
  it("keeps Vietnam discoverable as the first supported market", () => {
    expect(SUPPORTED_PHONE_COUNTRIES[0]).toMatchObject({ iso: "VN", dialCode: "+84" });
    expect(dialCodeForLocale("vi")).toBe("+84");
  });

  it.each([
    ["+84", "0912345678"], ["+84", "912345678"],
    ["+1", "4155552671"], ["+1", "18708173772"],
    ["+44", "07123456789"], ["+49", "015123456789"],
    ["+33", "0612345678"], ["+34", "612345678"],
    ["+86", "13800138000"], ["+81", "09012345678"],
    ["+82", "01012345678"], ["+55", "11912345678"],
    ["+62", "081234567890"], ["+63", "09171234567"],
    ["+66", "0812345678"], ["+971", "0501234567"],
    ["+7", "9123456789"], ["+966", "0512345678"],
  ])("accepts a valid %s national format", (dialCode, phone) => {
    expect(validateNationalPhone(dialCode, phone)).toBe(true);
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
