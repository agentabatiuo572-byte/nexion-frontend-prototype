import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type TeamQuotaEnvironment = "PRODUCTION" | "SANDBOX";
export interface TeamQuotaFacts { rank: number; directRefs: number; activeDirect: number; teamVolumeUSD: number }
export interface TeamQuotaCondition { kind: "rank" | "directRefs" | "teamVolume"; required: number; current: number }
export interface TeamQuotaTier {
  productId: string; quotaCode: string; name: string; price: number; monthlyStock: number; soldThisMonth: number;
  unlockKind: "ALL" | "EITHER"; conditions: TeamQuotaCondition[]; perks: string[]; available: boolean;
}
export interface TeamQuotaSnapshot {
  source: "server"; sourceEnvironment: TeamQuotaEnvironment; runId: string;
  generatedAt: string; facts: TeamQuotaFacts; tiers: TeamQuotaTier[];
}

function invalid(): never { throw new ApiError({ kind: "protocol", message: "TEAM_QUOTA_RESPONSE_INVALID" }); }
function row(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function text(value: unknown, required = true): string { if (typeof value !== "string" || (required && !value.trim())) return invalid(); return value.trim(); }
function num(value: unknown, integer = false): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) return invalid(); return value; }

function parse(value: unknown): TeamQuotaSnapshot {
  const source = row(value); const environment = source.sourceEnvironment;
  if (source.source !== "server" || (environment !== "PRODUCTION" && environment !== "SANDBOX")) return invalid();
  const runId = text(source.runId, environment === "SANDBOX");
  if (environment === "PRODUCTION" && runId !== "") return invalid();
  const facts = row(source.facts);
  const parsedFacts = { rank: num(facts.rank, true), directRefs: num(facts.directRefs, true), activeDirect: num(facts.activeDirect, true), teamVolumeUSD: num(facts.teamVolumeUSD) };
  if (!Array.isArray(source.tiers)) return invalid();
  const tiers = source.tiers.map((value): TeamQuotaTier => {
    const item = row(value); const unlockKind = item.unlockKind;
    if (unlockKind !== "ALL" && unlockKind !== "EITHER" || typeof item.available !== "boolean" || !Array.isArray(item.conditions) || !Array.isArray(item.perks)) return invalid();
    const conditions = item.conditions.map((raw): TeamQuotaCondition => {
      const condition = row(raw); const kind = condition.kind;
      if (kind !== "rank" && kind !== "directRefs" && kind !== "teamVolume") return invalid();
      return { kind, required: num(condition.required), current: num(condition.current) };
    });
    return { productId: text(item.productId), quotaCode: text(item.quotaCode), name: text(item.name), price: num(item.price),
      monthlyStock: num(item.monthlyStock, true), soldThisMonth: num(item.soldThisMonth, true), unlockKind,
      conditions, perks: item.perks.map((perk) => text(perk)), available: item.available };
  });
  const generatedAt = text(source.generatedAt);
  if (!Number.isFinite(Date.parse(generatedAt)) || new Set(tiers.map((tier) => tier.productId)).size !== tiers.length) return invalid();
  return { source: "server", sourceEnvironment: environment, runId, generatedAt, facts: parsedFacts, tiers };
}

export function createTeamQuotaApi(client: ApiClient) {
  return { snapshot: async (): Promise<TeamQuotaSnapshot> => parse(await client.request({ method: "GET", path: "/api/app/team/quota" })) };
}
