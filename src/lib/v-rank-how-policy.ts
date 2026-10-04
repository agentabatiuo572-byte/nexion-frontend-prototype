export type RankHowRuntime = "dev" | "prod";

export type RankHowPresentation = "canonical-ladder" | "hold";

export interface RankHowConditions {
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
): string[] {
  const conditions = rank.conditions;
  const parts: string[] = [];
  const money = (value: number) => `$${value.toLocaleString()}`;
  const interpolate = (label: string, value: string) => label
    .replace("${n}", value)
    .replace("{n}", value);
  if (conditions.selfBuyUSD !== undefined) parts.push(interpolate(labels.selfBuy, money(conditions.selfBuyUSD)));
  if (conditions.directRefs !== undefined) parts.push(interpolate(labels.directRefs, String(conditions.directRefs)));
  if (conditions.teamVolumeUSD !== undefined) parts.push(interpolate(labels.teamVol, money(conditions.teamVolumeUSD)));
  if (conditions.vDownlines) {
    for (const [v, count] of Object.entries(conditions.vDownlines)) {
      parts.push(labels.vDownlines.replace("{n}", String(count)).replace("{v}", v));
    }
  }
  return parts.length ? parts : [labels.register];
}
