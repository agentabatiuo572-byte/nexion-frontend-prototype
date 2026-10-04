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
