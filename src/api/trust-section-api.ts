import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";

export type TrustLocale = "zh" | "vi" | "en";
export type TrustSectionKey =
  | "financials"
  | "leadership"
  | "nexNarrative"
  | "complianceBadges"
  | "auditsReserves"
  | "listings";

export interface PublishedTrustField {
  key: string;
  label: string;
  value: string;
}

export interface PublishedTrustSection {
  sectionKey: TrustSectionKey;
  version: string;
  description: string;
  structure: string;
  fields: PublishedTrustField[];
}

export interface TrustSectionApi {
  current(): Promise<PublishedTrustSection[]>;
  recordView(sectionKey: string, locale: TrustLocale): Promise<void>;
}

const SECTION_KEYS = new Set<TrustSectionKey>([
  "financials",
  "leadership",
  "nexNarrative",
  "complianceBadges",
  "auditsReserves",
  "listings",
]);
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;
const VERSION = /^v[1-9][0-9]{0,8}$/;

function invalid(message = "TRUST_SECTION_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string") return invalid();
  const normalized = value.trim();
  if (!allowEmpty && !normalized) return invalid();
  return normalized;
}

function field(value: unknown): PublishedTrustField {
  const row = record(value);
  const key = text(row.key);
  if (!FIELD_KEY.test(key)) return invalid("TRUST_SECTION_FIELD_KEY_INVALID");
  return {
    key,
    label: text(row.label),
    value: text(row.value, true),
  };
}

function section(value: unknown): PublishedTrustSection {
  const row = record(value);
  const sectionKey = text(row.sectionKey);
  const version = text(row.version);
  if (!SECTION_KEYS.has(sectionKey as TrustSectionKey)) return invalid("TRUST_SECTION_KEY_INVALID");
  if (!VERSION.test(version)) return invalid("TRUST_SECTION_VERSION_INVALID");
  if (!Array.isArray(row.fields) || row.fields.length === 0 || row.fields.length > 80) return invalid();
  const fields = row.fields.map(field);
  if (new Set(fields.map((item) => item.key.toLowerCase())).size !== fields.length) {
    return invalid("TRUST_SECTION_FIELD_DUPLICATE");
  }
  return {
    sectionKey: sectionKey as TrustSectionKey,
    version,
    description: text(row.description),
    structure: text(row.structure),
    fields,
  };
}

function response(value: unknown, mode: ApiEnvironment): PublishedTrustSection[] {
  const body = record(value);
  const expectedSource = "nx_trust_section_version:published";
  if (body.serverCanonical !== true || body.source !== expectedSource
      || !Array.isArray(body.sections) || body.sections.length !== SECTION_KEYS.size) return invalid();
  if (mode === "prod" || mode === "dev") {
    if (body.sourceEnvironment !== "PRODUCTION" || body.runId !== "") return invalid();
  } else return invalid();
  const sections = body.sections.map(section);
  const sectionKeys = new Set(sections.map((item) => item.sectionKey));
  if (sectionKeys.size !== sections.length || [...SECTION_KEYS].some((key) => !sectionKeys.has(key))) {
    return invalid("TRUST_SECTION_DUPLICATE");
  }
  return sections;
}

function validSectionKey(value: string): TrustSectionKey {
  const normalized = value.trim();
  if (!SECTION_KEYS.has(normalized as TrustSectionKey)) {
    throw new ApiError({ kind: "protocol", message: "TRUST_SECTION_KEY_INVALID" });
  }
  return normalized as TrustSectionKey;
}

export function createTrustSectionApi(client: ApiClient, mode: ApiEnvironment = "prod"): TrustSectionApi {
  return {
    current: async () => response(await client.request({
      method: "GET",
      path: "/api/content/trust/sections/current",
      authenticated: false,
    }), mode),
    recordView: async (sectionKey, locale) => {
      await client.request({
        method: "POST",
        path: `/api/content/trust/sections/${encodeURIComponent(validSectionKey(sectionKey))}/view`,
        authenticated: true,
        body: { locale },
      });
    },
  };
}
