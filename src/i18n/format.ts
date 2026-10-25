import { useLocaleStore } from "@/store/locale";
import { DICTS } from "./use-t";
import type { LocaleCode } from "./index";

/**
 * Tiny string interpolator for i18n keys with placeholders.
 *
 *   fmt(t.staking.sheet.cta, { amount: "500.00", n: 90 })
 *     → "Lock $500.00 for 90d"
 *
 * Unknown placeholders are left as-is (e.g. "{foo}") so they surface in dev.
 */

export function fmt(
  s: string,
  params: Record<string, string | number>,
): string {
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`,
  );
}

export function openSlotsTemplate(s: string, open: number): string {
  return open === 1 ? s.replace("slots open", "slot open") : s;
}

/** Display-only formatting. Unknown values never become a zero balance. */
export function fmtMoney(value: number | null | undefined, detail = false): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (!detail && value !== 0 && Math.abs(value) < 0.01) return value < 0 ? "−<$0.01" : "<$0.01";
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: detail ? 4 : 2 })}`;
}

export function fmtRate(value: number | null | undefined, locale: string = "en"): string {
  return `${fmtMoney(value)}/${locale === "zh" ? "天" : locale === "vi" ? "ngày" : "day"}`;
}

export function fmtRelTime(timestamp: number, locale = "en", now = Date.now()): string {
  if (!Number.isFinite(timestamp)) return "-";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (!minutes) return locale === "zh" ? "刚刚" : locale === "vi" ? "Vừa xong" : "Just now";
  const unit = minutes < 60 ? "minute" : minutes < 1440 ? "hour" : "day";
  const count = unit === "minute" ? minutes : unit === "hour" ? Math.floor(minutes / 60) : Math.floor(minutes / 1440);
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-count, unit);
}

/**
 * BCP-47 tag for Date#toLocale{Date,Time}String / toLocaleString — must follow
 * the language the UI actually renders, never the device locale (`undefined`
 * showed "Member since 2026年7月" on an English page under a zh browser).
 * Whether a tag is ACTIVE is derived from DICTS — the same membership useT uses
 * for copy fallback — so shipping a new dictionary flips dates to that language
 * automatically; there is no second hand-maintained on/off list to forget
 * (wallet-bills' local localeTag already diverged once that way). The table is
 * typed against LocaleCode: adding a 12th locale fails to compile until it gets
 * a tag. Reads the locale store, so calls inside a computed re-run on switch.
 */
const DATE_LOCALE_TAGS: Record<LocaleCode, string> = {
  en: "en-US",
  vi: "vi-VN",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  ru: "ru-RU",
  es: "es-419",
  pt: "pt-BR",
  ar: "ar-SA",
  de: "de-DE",
  fr: "fr-FR",
};

export function dateLocale(): string {
  const code = useLocaleStore().code;
  return code in DICTS ? DATE_LOCALE_TAGS[code] : DATE_LOCALE_TAGS.en;
}
