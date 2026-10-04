import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export interface RankHowPolicySection { id: string; title: string; body: string; order: number }
export interface RankHowRules {
  permanentProtection: boolean;
  qualifiedReferralSelfBuyUSD: number | null;
  leadershipConfigured: boolean;
}
export interface RankHowPolicy { version: string; locale: string; hero: string; sections: RankHowPolicySection[]; rules: RankHowRules; source: "server"; sourceEnvironment: "SANDBOX" | "PRODUCTION"; runId: string }
function invalid(message = "RANK_HOW_POLICY_RESPONSE_INVALID"): never { throw new ApiError({ kind: "protocol", message }); }
function parse(value: unknown, mode: ApiEnvironment): RankHowPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (row.status !== "PUBLISHED" || typeof row.version !== "string" || !row.version.trim() || typeof row.locale !== "string" || !row.locale.trim() || typeof row.hero !== "string" || !row.hero.trim() || !Array.isArray(row.sections) || row.sections.length > 100 || !matchesRuntimeProvenance(row, mode, "server")) return invalid();
  const sections = row.sections.map((item): RankHowPolicySection => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return invalid();
    const section = item as Record<string, unknown>;
    if (typeof section.id !== "string" || !section.id.trim() || typeof section.title !== "string" || !section.title.trim() || typeof section.body !== "string" || !section.body.trim() || !Number.isSafeInteger(section.order) || (section.order as number) < 0) return invalid();
    return { id: section.id, title: section.title, body: section.body, order: section.order as number };
  }).sort((a, b) => a.order - b.order);
  if (!sections.length) return invalid("RANK_HOW_POLICY_EMPTY");
  if (new Set(sections.map(section => section.id)).size !== sections.length) return invalid();
  let rules: RankHowRules;
  {
    if (!row.rules || typeof row.rules !== "object" || Array.isArray(row.rules)) return invalid();
    const snapshot = row.rules as Record<string, unknown>;
    const threshold = snapshot.qualifiedReferralSelfBuyUSD;
    if (typeof snapshot.permanentProtection !== "boolean" || typeof snapshot.leadershipConfigured !== "boolean"
        || (threshold !== null && (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0))) return invalid();
    rules = { permanentProtection: snapshot.permanentProtection, leadershipConfigured: snapshot.leadershipConfigured, qualifiedReferralSelfBuyUSD: threshold as number | null };
  }
  return { version: row.version, locale: row.locale, hero: row.hero, sections, rules, source: "server", sourceEnvironment: row.sourceEnvironment as "SANDBOX" | "PRODUCTION", runId: row.runId as string };
}
export interface RankHowPolicyApi { published(locale: string): Promise<RankHowPolicy> }
export function createRankHowPolicyApi(client: ApiClient, mode: ApiEnvironment = "prod"): RankHowPolicyApi {
  return { published: async (locale) => parse(await client.request<unknown>({ method: "GET", path: `/api/config/v-rank-policy?locale=${encodeURIComponent(locale)}`, authenticated: false }), mode) };
}
