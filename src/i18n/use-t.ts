import { computed } from "vue";
import { en, type Messages } from "./messages/en";
import { vi } from "./messages/vi";
import { zh } from "./messages/zh";
import type { LocaleCode } from "./index";
import { useLocaleStore } from "@/store/locale";
import { useI18nRuntime } from "@/store/i18n-runtime";

// Ported from Nexion-prototype/lib/i18n/use-t.ts (zustand → Pinia).
// Only locales with real dictionaries are listed; everything else falls back
// to English (the source-of-truth).
export const DICTS: Partial<Record<LocaleCode, Messages>> = {
  en,
  vi,
  zh,
};

function applyRuntimeMessages<T>(bundled: T, runtime: Readonly<Record<string, string>>, path = ""): T {
  if (!bundled || typeof bundled !== "object") return bundled;
  return new Proxy(bundled as object, {
    get(target, key, receiver) {
      if (typeof key !== "string") return Reflect.get(target, key, receiver);
      const currentPath = path ? `${path}.${key}` : key;
      const remote = runtime[currentPath];
      if (typeof remote === "string") return remote;
      const value = Reflect.get(target, key, receiver);
      return value && typeof value === "object" ? applyRuntimeMessages(value, runtime, currentPath) : value;
    },
  }) as T;
}

// Reactive translation tree for the active locale.
//   Template:  const t = useT()  →  {{ t.tabs.home }}   (Vue unwraps the ref)
//   Script:    t.value.tabs.home
export function useT() {
  const locale = useLocaleStore();
  const runtime = useI18nRuntime();
  return computed<Messages>(() => {
    const bundled = DICTS[locale.code] ?? en;
    // bundled fallback is intentional: stale/failed remote bundles are never presented as current.
    return applyRuntimeMessages(bundled, runtime.messages(locale.code));
  });
}

// Non-reactive accessor for store actions / callbacks (pinia must be active).
export function getT(): Messages {
  const locale = useLocaleStore();
  const runtime = useI18nRuntime();
  return applyRuntimeMessages(DICTS[locale.code] ?? en, runtime.messages(locale.code));
}

// True when the active locale has a real translation (for "in progress" badges).
export function useHasTranslation() {
  const locale = useLocaleStore();
  return computed<boolean>(() => locale.code in DICTS);
}
