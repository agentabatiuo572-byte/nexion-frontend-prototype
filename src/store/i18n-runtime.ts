import { defineStore } from "pinia";
import { ref } from "vue";
import type { LocaleCode } from "@/i18n";
import { i18nApi, remoteApiEnabled } from "@/api/runtime";

export type I18nRuntimeStatus = "fallback" | "loading" | "ready" | "stale";

type CachedBundle = {
  locale: LocaleCode;
  messages: Record<string, string>;
  fetchedAt: number;
};

const CACHE_KEY = "nexgrid-i18n-runtime-v1";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function loadCache(): Partial<Record<LocaleCode, CachedBundle>> {
  try {
    const value = uni.getStorageSync(CACHE_KEY) as Partial<Record<LocaleCode, CachedBundle>> | "";
    if (!value || typeof value !== "object") return {};
    const valid: Partial<Record<LocaleCode, CachedBundle>> = {};
    for (const locale of ["en", "vi", "zh"] as const) {
      const row = value[locale];
      if (row && row.locale === locale && Number.isFinite(row.fetchedAt)
          && row.messages && typeof row.messages === "object") {
        valid[locale] = row;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function saveCache(value: Partial<Record<LocaleCode, CachedBundle>>): void {
  try {
    uni.setStorageSync(CACHE_KEY, value);
  } catch {
    // The bundled dictionaries remain the safe offline fallback.
  }
}

export const useI18nRuntime = defineStore("i18n-runtime", () => {
  const bundles = ref<Partial<Record<LocaleCode, Record<string, string>>>>({});
  const fetchedAt = ref<Partial<Record<LocaleCode, number>>>({});
  const status = ref<Partial<Record<LocaleCode, I18nRuntimeStatus>>>({});
  const error = ref<Partial<Record<LocaleCode, string>>>({});
  const inFlight = new Map<LocaleCode, Promise<void>>();
  let prepared = false;

  function prepare(): void {
    if (prepared) return;
    prepared = true;
    const cached = loadCache();
    for (const locale of ["en", "vi", "zh"] as const) {
      const row = cached[locale];
      if (!row) continue;
      bundles.value[locale] = row.messages;
      fetchedAt.value[locale] = row.fetchedAt;
      status.value[locale] = "stale";
    }
  }

  async function refresh(locale: LocaleCode, force = false): Promise<void> {
    prepare();
    if (!remoteApiEnabled) {
      status.value[locale] = "fallback";
      return;
    }
    const age = Date.now() - (fetchedAt.value[locale] ?? 0);
    if (!force && status.value[locale] === "ready" && age < CACHE_MAX_AGE_MS) return;
    const pending = inFlight.get(locale);
    if (pending) return pending;
    status.value[locale] = "loading";
    const request = i18nApi.all(locale)
      .then((bundle) => {
        const now = Date.now();
        bundles.value[locale] = { ...bundle.messages };
        fetchedAt.value[locale] = now;
        error.value[locale] = "";
        status.value[locale] = "ready";
        const cached = loadCache();
        cached[locale] = { locale, messages: { ...bundle.messages }, fetchedAt: now };
        saveCache(cached);
      })
      .catch((cause: unknown) => {
        error.value[locale] = cause instanceof Error ? cause.message : "I18N_BUNDLE_UNAVAILABLE";
        status.value[locale] = bundles.value[locale] ? "stale" : "fallback";
      })
      .finally(() => {
        if (inFlight.get(locale) === request) inFlight.delete(locale);
      });
    inFlight.set(locale, request);
    return request;
  }

  function messages(locale: LocaleCode): Readonly<Record<string, string>> {
    prepare();
    // A cache is only an optimization. Until this locale is freshly confirmed by
    // the service, callers must use the bundled dictionary rather than present
    // stale remote wording as current policy content.
    return status.value[locale] === "ready" ? bundles.value[locale] ?? {} : {};
  }

  return { bundles, fetchedAt, status, error, prepare, refresh, messages };
});
