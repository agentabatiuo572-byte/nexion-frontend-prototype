export type LocaleCode =
  | "en"
  | "vi"
  | "zh"
  | "ja"
  | "ko"
  | "ru"
  | "es"
  | "pt"
  | "ar"
  | "de"
  | "fr";

export interface LocaleEntry {
  code: LocaleCode;
  nativeName: string;
  englishName: string;
  region: string;
  priority: 0 | 1 | 2 | 3;
  isRTL: boolean;
  flag: string;
}

export const LOCALES: LocaleEntry[] = [
  { code: "en", nativeName: "English",   englishName: "English",              region: "Global",              priority: 0, isRTL: false, flag: "🌐" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese",           region: "Vietnam",             priority: 0, isRTL: false, flag: "🇻🇳" },
  { code: "zh", nativeName: "简体中文",   englishName: "Chinese (Simplified)", region: "China · Singapore",   priority: 1, isRTL: false, flag: "🇨🇳" },
  { code: "ja", nativeName: "日本語",     englishName: "Japanese",             region: "Japan",               priority: 1, isRTL: false, flag: "🇯🇵" },
  { code: "ko", nativeName: "한국어",     englishName: "Korean",               region: "South Korea",         priority: 1, isRTL: false, flag: "🇰🇷" },
  { code: "ru", nativeName: "Русский",   englishName: "Russian",              region: "CIS",                 priority: 1, isRTL: false, flag: "🇷🇺" },
  { code: "es", nativeName: "Español",   englishName: "Spanish",              region: "Latin America",       priority: 2, isRTL: false, flag: "🇪🇸" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese",           region: "Brazil",              priority: 2, isRTL: false, flag: "🇧🇷" },
  { code: "ar", nativeName: "العربية",     englishName: "Arabic",               region: "Middle East",         priority: 2, isRTL: true,  flag: "🇸🇦" },
  { code: "de", nativeName: "Deutsch",   englishName: "German",               region: "Germany",             priority: 3, isRTL: false, flag: "🇩🇪" },
  { code: "fr", nativeName: "Français",  englishName: "French",               region: "France",              priority: 3, isRTL: false, flag: "🇫🇷" },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

export function getLocale(code: LocaleCode): LocaleEntry {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

export function localesByPriority(): Record<0 | 1 | 2 | 3, LocaleEntry[]> {
  return LOCALES.reduce(
    (acc, l) => {
      acc[l.priority].push(l);
      return acc;
    },
    { 0: [], 1: [], 2: [], 3: [] } as Record<0 | 1 | 2 | 3, LocaleEntry[]>
  );
}

export const PRIORITY_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: "Recommended",
  1: "Major markets",
  2: "Growing regions",
  3: "Europe",
};
