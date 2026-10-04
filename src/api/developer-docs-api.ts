import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export interface DeveloperDocsEndpoint { method: string; path: string; description?: string }
export interface DeveloperDocs { version: string; locale: string; example: { request: string; response: string }; endpoints: DeveloperDocsEndpoint[]; events: string[]; source: "server"; sourceEnvironment: "SANDBOX" | "PRODUCTION"; runId: string }
function invalid(): never { throw new ApiError({ kind: "protocol", message: "DEVELOPER_DOCS_RESPONSE_INVALID" }); }
function parse(value: unknown, mode: ApiEnvironment): DeveloperDocs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>; const example = row.example as Record<string, unknown> | null;
  if (row.status !== "PUBLISHED" || typeof row.version !== "string" || typeof row.locale !== "string" || !example || typeof example.request !== "string" || typeof example.response !== "string" || !Array.isArray(row.endpoints) || !Array.isArray(row.events) || !matchesRuntimeProvenance(row, mode, "server")) return invalid();
  const endpoints = row.endpoints.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid(); const item = raw as Record<string, unknown>;
    if (typeof item.method !== "string" || typeof item.path !== "string") return invalid(); return { method: item.method, path: item.path, description: typeof item.description === "string" ? item.description : undefined };
  });
  if (!endpoints.length || !row.events.every((event) => typeof event === "string")) return invalid();
  return { version: row.version, locale: row.locale, example: { request: example.request, response: example.response }, endpoints, events: row.events as string[], source: "server", sourceEnvironment: row.sourceEnvironment as "SANDBOX" | "PRODUCTION", runId: row.runId };
}
export function createDeveloperDocsApi(client: ApiClient, mode: ApiEnvironment = "prod") { return { published: async (locale: string) => parse(await client.request<unknown>({ method: "GET", path: `/api/developer/docs?locale=${encodeURIComponent(locale)}`, authenticated: false }), mode) }; }
