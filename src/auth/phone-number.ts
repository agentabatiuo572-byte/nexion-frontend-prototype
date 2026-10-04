export interface PhoneCountryProfile {
  iso: "VN" | "US" | "GB" | "DE" | "FR" | "ES" | "CN" | "JP" | "KR" | "BR" | "ID" | "PH" | "TH" | "AE" | "RU" | "SA";
  dialCode: string;
  example: string;
  pattern: RegExp;
  selectable: boolean;
}

/**
 * The order is also the selector order. Vietnam is the formal market and
 * China is retained for local development; the remaining rows stay visible
 * to explain coverage but cannot be selected or submitted.
 */
export const PHONE_COUNTRIES: readonly PhoneCountryProfile[] = [
  { iso: "VN", dialCode: "+84", example: "0912 345 678", pattern: /^0?[35789]\d{8}$/, selectable: true },
  { iso: "CN", dialCode: "+86", example: "138 0013 8000", pattern: /^1[3-9]\d{9}$/, selectable: true },
  { iso: "US", dialCode: "+1", example: "415 555 2671", pattern: /^(?:1)?[2-9]\d{2}[2-9]\d{6}$/, selectable: false },
  { iso: "GB", dialCode: "+44", example: "07123 456789", pattern: /^0?7\d{9}$/, selectable: false },
  { iso: "DE", dialCode: "+49", example: "0151 23456789", pattern: /^0?1[5-7]\d{8,9}$/, selectable: false },
  { iso: "FR", dialCode: "+33", example: "06 12 34 56 78", pattern: /^0?[67]\d{8}$/, selectable: false },
  { iso: "ES", dialCode: "+34", example: "612 345 678", pattern: /^[67]\d{8}$/, selectable: false },
  { iso: "JP", dialCode: "+81", example: "090 1234 5678", pattern: /^0?(?:70|80|90)\d{8}$/, selectable: false },
  { iso: "KR", dialCode: "+82", example: "010 1234 5678", pattern: /^0?10\d{8}$/, selectable: false },
  { iso: "BR", dialCode: "+55", example: "11 91234 5678", pattern: /^[1-9]\d9\d{8}$/, selectable: false },
  { iso: "ID", dialCode: "+62", example: "0812 3456 7890", pattern: /^0?8\d{8,11}$/, selectable: false },
  { iso: "PH", dialCode: "+63", example: "0917 123 4567", pattern: /^0?9\d{9}$/, selectable: false },
  { iso: "TH", dialCode: "+66", example: "081 234 5678", pattern: /^0?[689]\d{8}$/, selectable: false },
  { iso: "AE", dialCode: "+971", example: "050 123 4567", pattern: /^0?5[024568]\d{7}$/, selectable: false },
  { iso: "RU", dialCode: "+7", example: "912 345 6789", pattern: /^(?:8)?9\d{9}$/, selectable: false },
  { iso: "SA", dialCode: "+966", example: "051 234 5678", pattern: /^0?5\d{8}$/, selectable: false },
] as const;

const COUNTRY_BY_DIAL = new Map(PHONE_COUNTRIES.map((country) => [country.dialCode, country]));

export function isSelectablePhoneDialCode(dialCode: string): boolean {
  return COUNTRY_BY_DIAL.get(dialCode)?.selectable === true;
}

export function sanitizePhoneInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

export function validateNationalPhone(dialCode: string, value: string): boolean {
  const profile = COUNTRY_BY_DIAL.get(dialCode);
  return !!profile?.selectable && profile.pattern.test(sanitizePhoneInput(value));
}

export function phoneFormatHint(dialCode: string): string {
  const profile = COUNTRY_BY_DIAL.get(dialCode);
  return profile?.selectable ? profile.example : "";
}

export function dialCodeForLocale(_locale: string, development = import.meta.env.DEV): string {
  return development ? "+86" : "+84";
}
