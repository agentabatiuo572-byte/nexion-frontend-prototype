import type { LocaleCode } from "@/i18n";
import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface RuntimeI18nBundle {
  namespace: "*";
  locale: "en-US" | "vi-VN" | "zh-CN";
  messages: Readonly<Record<string, string>>;
  serverCanonical: true;
}

export interface I18nApi {
  all(locale: LocaleCode): Promise<RuntimeI18nBundle>;
}

/** 服务端运行时文案包只下发这三种 locale;前端 LocaleCode 比它多(ja/ko/ru/es/pt/ar/de/fr)。
 *  故意用 Partial:未覆盖的语言取到 undefined,parseBundle 的 locale 比对必然不等 → 判 invalid,
 *  即「后端不支持该语言的运行时文案包」。不要为了补齐类型给它们编一个假 locale 标签。 */
const LOCALE_TAG: Partial<Record<LocaleCode, RuntimeI18nBundle["locale"]>> = {
  en: "en-US",
  vi: "vi-VN",
  zh: "zh-CN",
};

function invalid(message = "I18N_BUNDLE_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function parseBundle(value: unknown, requested: LocaleCode): RuntimeI18nBundle {
  const expectedTag = LOCALE_TAG[requested];
  if (!expectedTag) return invalid("I18N_LOCALE_UNSUPPORTED");
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (row.namespace !== "*" || row.locale !== expectedTag || row.serverCanonical !== true) {
    return invalid();
  }
  if (!row.messages || typeof row.messages !== "object" || Array.isArray(row.messages)) return invalid();
  const messages: Record<string, string> = {};
  for (const [key, raw] of Object.entries(row.messages as Record<string, unknown>)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/.test(key)
        || typeof raw !== "string"
        || raw.length === 0
        || raw.length > 1024
        || /<\s*\/?\s*[a-z][^>]*>/i.test(raw)) {
      return invalid();
    }
    messages[key] = raw;
  }
  return {
    namespace: "*",
    locale: expectedTag,
    messages: Object.freeze(messages),
    serverCanonical: true,
  };
}

export function createI18nApi(client: ApiClient): I18nApi {
  return {
    all: async (locale) => parseBundle(await client.request({
      method: "GET",
      path: `/api/content/i18n?locale=${encodeURIComponent(locale)}`,
      authenticated: false,
    }), locale),
  };
}
