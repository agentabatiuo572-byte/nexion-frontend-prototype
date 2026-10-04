import type { ApiClient } from "./api-client";
import type { ApiEnvironment } from "./runtime-config";
import { ApiError } from "./errors";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export interface PrivacyPolicy {
  version: string;
  locale: string;
  hero: string;
  sections: Array<{ id: string; title: string; body: string; order: number }>;
}
function invalid(): never { throw new ApiError({ kind: "protocol", message: "PRIVACY_POLICY_RESPONSE_INVALID" }); }
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return invalid();
  return value.trim();
}
export function createPrivacyPolicyApi(client: ApiClient, environment: ApiEnvironment = "prod") {
  return { current: async (locale: string): Promise<PrivacyPolicy> => {
    const value = row(await client.request<unknown>({ method: "GET", authenticated: false,
      path: `/api/legal/privacy-policy/current?locale=${encodeURIComponent(locale)}` }));
    if (value.status !== "PUBLISHED" || !matchesRuntimeProvenance(value, environment, "server")
        || !Array.isArray(value.sections) || !value.sections.length || value.sections.length > 100) return invalid();
    const sections = value.sections.map((raw) => {
      const item = row(raw);
      if (typeof item.order !== "number" || !Number.isSafeInteger(item.order) || item.order < 0 || item.order > 100_000) return invalid();
      return { id: text(item.id, 64), title: text(item.title, 256), body: text(item.body, 10_000), order: item.order };
    });
    if (new Set(sections.map((item) => item.id)).size !== sections.length) return invalid();
    return { version: text(value.version, 64), locale: text(value.locale, 32), hero: text(value.hero, 500), sections: sections.sort((a, b) => a.order - b.order) };
  } };
}
