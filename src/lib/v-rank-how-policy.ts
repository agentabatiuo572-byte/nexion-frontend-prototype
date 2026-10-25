import { computePointsCopy, formatComputePoints } from "@/i18n/compute-points";
export type RankHowRuntime = "dev" | "prod";

export type RankHowPresentation = "canonical-ladder" | "hold";

export interface RankHowConditions {
  selfComputePoints?: number;
  teamComputePoints?: number;
  selfBuyUSD?: number;
  directRefs?: number;
  teamVolumeUSD?: number;
  vDownlines?: Partial<Record<number, number>>;
}

export interface RankHowCanonicalRank {
  v: number;
  conditions: RankHowConditions;
}

export interface RankHowConditionLabels {
  selfBuy: string;
  directRefs: string;
  teamVol: string;
  register: string;
  vDownlines: string;
}

export function rankHowPresentation(runtime: RankHowRuntime, remoteReady: boolean): RankHowPresentation {
  return remoteReady ? "canonical-ladder" : "hold";
}

export function formatCanonicalRankConditions(
  rank: RankHowCanonicalRank,
  labels: RankHowConditionLabels,
  locale = "en",
): string[] {
  const conditions = rank.conditions;
  const parts: string[] = [];
  const interpolate = (label: string, value: string) => label
    .replace("${n}", value)
    .replace("{n}", value);
  const copy = computePointsCopy(locale);
  if (conditions.selfComputePoints !== undefined) parts.push(`${copy.self} ≥ ${formatComputePoints(conditions.selfComputePoints, locale)}`);
  else if (conditions.selfBuyUSD !== undefined) parts.push(`${copy.self} · ${copy.conditionsPending}`);
  if (conditions.directRefs !== undefined) parts.push(interpolate(labels.directRefs, String(conditions.directRefs)));
  if (conditions.teamComputePoints !== undefined) parts.push(`${copy.team} ≥ ${formatComputePoints(conditions.teamComputePoints, locale)}`);
  else if (conditions.teamVolumeUSD !== undefined) parts.push(`${copy.team} · ${copy.conditionsPending}`);
  if (conditions.vDownlines) {
    for (const [v, count] of Object.entries(conditions.vDownlines)) {
      parts.push(labels.vDownlines.replace("{n}", String(count)).replace("{v}", v));
    }
  }
  return parts.length ? parts : [labels.register];
}
