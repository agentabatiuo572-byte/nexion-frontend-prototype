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

function hydrate(): Persisted & { restored: boolean } {
  try {
    const saved = uni.getStorageSync(STORAGE_KEY) as Persisted | "";
    if (saved && saved.userSet && saved.code && LOCALES.some((locale) => locale.code === saved.code)) {
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

  // Keep the first screen in Chinese unless an explicit or account preference exists.
  // The legacy method name is retained for existing startup callers.
  function ensureSystemDetected() {
    if (userSet.value || localeResolved) return;
    localeResolved = true;
    persist();
  }

  ensureSystemDetected();
  return { code, userSet, explicitRevision, setLocale, applyServerLocale, ensureSystemDetected };
});
