import { defineStore } from "pinia";
import { ref } from "vue";
import { DEFAULT_LOCALE, LOCALES, type LocaleCode } from "@/i18n";

// Ported from Nexion-prototype/lib/store/locale.ts (zustand → Pinia).
// Persistence uses uni.* storage so it works on both H5 (localStorage) and App.
const STORAGE_KEY = "nexgrid-locale-v1";

interface Persisted {
  code: LocaleCode;
  userSet: boolean;
}

// Match the active locale to the device/browser language. uni.getSystemInfoSync
// returns navigator.language on H5 and the OS language on App; we also fold in
// navigator.languages on H5 for better matching.
function matchSystemLocale(): LocaleCode | null {
  const candidates: string[] = [];
  try {
    const sys = uni.getSystemInfoSync();
    if (sys.language) candidates.push(sys.language);
  } catch {
    // ignore — environment without uni system info
  }
  // #ifdef H5
  if (typeof navigator !== "undefined" && navigator.languages?.length) {
    candidates.push(...navigator.languages);
  }
  // #endif
  for (const raw of candidates) {
    const lc = raw.toLowerCase();
    const exact = LOCALES.find((l) => l.code === lc);
    if (exact) return exact.code;
    const base = lc.split("-")[0];
    const prefix = LOCALES.find((l) => l.code === base);
    if (prefix) return prefix.code;
  }
  return null;
}

function hydrate(): Persisted & { restored: boolean } {
  try {
    const saved = uni.getStorageSync(STORAGE_KEY) as Persisted | "";
    if (saved && saved.code && LOCALES.some((locale) => locale.code === saved.code)) {
      return { code: saved.code, userSet: !!saved.userSet, restored: true };
    }
  } catch {
    // ignore — first run
  }
  return { code: DEFAULT_LOCALE, userSet: false, restored: false };
}

export const useLocaleStore = defineStore("locale", () => {
  const init = hydrate();
  const code = ref<LocaleCode>(init.code);
  const userSet = ref<boolean>(init.userSet);
  let localeResolved = init.restored;
  // This changes only for a deliberate picker/onboarding selection. Server
  // hydration and device detection must never be mistaken for an account
  // preference that should be written back.
  const explicitRevision = ref(0);

  function persist() {
    try {
      uni.setStorageSync(STORAGE_KEY, { code: code.value, userSet: userSet.value });
    } catch {
      // ignore — storage unavailable
    }
  }

  function setLocale(next: LocaleCode) {
    code.value = LOCALES.some((locale) => locale.code === next) ? next : DEFAULT_LOCALE;
    userSet.value = true;
    explicitRevision.value += 1;
    persist();
  }

  function applyServerLocale(next: LocaleCode) {
    localeResolved = true;
    code.value = LOCALES.some((locale) => locale.code === next) ? next : DEFAULT_LOCALE;
    persist();
  }

  // Resolve before the first screen. Home must not replace an account language
  // after its legal document has already been presented and acknowledged.
  function ensureSystemDetected() {
    if (userSet.value || localeResolved) return;
    localeResolved = true;
    const match = matchSystemLocale();
    if (match && match !== code.value) {
      code.value = match;
      persist();
    }
  }

  ensureSystemDetected();
  return { code, userSet, explicitRevision, setLocale, applyServerLocale, ensureSystemDetected };
});
