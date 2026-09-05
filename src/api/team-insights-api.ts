import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { CommissionEvent } from "@/store/commission";
import type { LeaderEntry, LeaderPeriod } from "@/mock/leaderboard";
import type { ApiResponseEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export interface TeamProvenance {
  source: "server"; sourceEnvironment: "PRODUCTION" | "SANDBOX"; runId: string; serverCanonical: true;
}
export interface TeamLeaderboardSnapshot extends TeamProvenance {
  period: LeaderPeriod; rows: LeaderEntry[]; myRank: number | null; gapToNext: number;
  poolUsd: number; topN: number; generatedAt: string;
}
export interface TeamCommissionSnapshot extends TeamProvenance { events: CommissionEvent[]; generatedAt: string }
export interface TeamUnilevelEvent {
  id: string; source: string; sourceUserName: string; cycle: string; layer: number;
  orderId: string | null; orderAmountUSD: number; amountUSDT: number; amountNEX: number;
  currency: string; status: CommissionEvent["status"]; ts: number; unlockAt: number;
}
export interface TeamUnilevelSplit { amountUSDT: number; amountNEX: number; count: number }
export interface TeamUnilevelSnapshot extends TeamProvenance {
  period: LeaderPeriod; events: TeamUnilevelEvent[];
  split: { direct: TeamUnilevelSplit; extended: TeamUnilevelSplit }; generatedAt: string;
}
export interface TeamPoolDistribution { vRank: number; people: number; votes: number }
export interface TeamLeadershipHistory { weekId: string; payoutUSDT: number }
export interface TeamLeadershipPoolSnapshot extends TeamProvenance {
  currentWeekPoolUSDT: number; myRank: number; myVotes: number; totalVotes: number;
  mySharePct: number; projectedPayoutUSDT: number; distribution: TeamPoolDistribution[];
  history: TeamLeadershipHistory[]; nextPayoutAt: string;
}
export interface TeamInsightsApi {
  leaderboard(period: LeaderPeriod): Promise<TeamLeaderboardSnapshot>;
  commissions(): Promise<TeamCommissionSnapshot>;
  unilevel(period: LeaderPeriod): Promise<TeamUnilevelSnapshot>;
  leadershipPool(): Promise<TeamLeadershipPoolSnapshot>;
}

function invalid(): never { throw new ApiError({ kind: "protocol", message: "TEAM_INSIGHTS_RESPONSE_INVALID" }); }
function row(value: unknown): Record<string, unknown> { if(!value||typeof value!=="object"||Array.isArray(value)) return invalid(); return value as Record<string,unknown>; }
function num(value: unknown, integer=false): number { if(typeof value!=="number"||!Number.isFinite(value)||value<0||(integer&&!Number.isSafeInteger(value))) return invalid(); return value; }
function text(value: unknown): string { if(typeof value!=="string"||!value.trim()) return invalid(); return value.trim(); }
function provenance(source: Record<string,unknown>, mode: ApiResponseEnvironment): TeamProvenance {
  if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "server")) return invalid();
  return {source:"server",sourceEnvironment:source.sourceEnvironment,runId:source.runId,serverCanonical:true};
}

function leaderboard(value: unknown, mode: ApiResponseEnvironment): TeamLeaderboardSnapshot {
  const source=row(value); const proof=provenance(source, mode); const period=source.period;
  if((period!=="today"&&period!=="week"&&period!=="month"&&period!=="all")||!Array.isArray(source.rows)) return invalid();
  const rows=source.rows.map((item):LeaderEntry=>{const v=row(item);const rank=num(v.rank,true);const vRank=num(v.vRank,true);if(rank<1||vRank>12||typeof v.handle!=="string"||typeof v.flag!=="string"||typeof v.cc!=="string"||typeof v.hasDevice!=="boolean") return invalid();return {rank,handle:v.handle,flag:v.flag,cc:v.cc,directs:num(v.directs,true),teamSize:num(v.teamSize,true),earnedUSDT:num(v.earnedUSDT),delta:typeof v.delta==="number"&&Number.isSafeInteger(v.delta)?v.delta:invalid(),vRank,hasDevice:v.hasDevice};});
  const generatedAt=text(source.generatedAt);if(!Number.isFinite(Date.parse(generatedAt))) return invalid();
  const myRank=source.myRank===null?null:num(source.myRank,true);return {...proof,period,rows,myRank,gapToNext:num(source.gapToNext),poolUsd:num(source.poolUsd),topN:num(source.topN,true),generatedAt};
}

const KINDS=new Set(["unilevel","binary","peer","cultivation","leadership","genesis"]);
const STATUSES=new Set(["cooling","unlocked","withdrawn"]);
function commissions(value: unknown, mode: ApiResponseEnvironment): TeamCommissionSnapshot { const source=row(value);const proof=provenance(source, mode);if(!Array.isArray(source.events)) return invalid();const events=source.events.map((item):CommissionEvent=>{const v=row(item);if(Object.prototype.hasOwnProperty.call(v,"sourceUserId")||!KINDS.has(String(v.kind))||!STATUSES.has(String(v.status))) return invalid();const ts=num(v.ts,true),unlockAt=num(v.unlockAt,true);return {id:text(v.id),kind:v.kind as CommissionEvent["kind"],sourceUserName:text(v.sourceUserName),layer:v.layer===null||v.layer===undefined?undefined:num(v.layer,true),orderId:v.orderId===null||v.orderId===undefined?undefined:text(v.orderId),orderAmountUSD:v.orderAmountUSD===null||v.orderAmountUSD===undefined?undefined:num(v.orderAmountUSD),amountUSDT:num(v.amountUSDT),amountNEX:num(v.amountNEX),ts,unlockAt,status:v.status as CommissionEvent["status"]};});const generatedAt=text(source.generatedAt);if(!Number.isFinite(Date.parse(generatedAt)))return invalid();return {...proof,events,generatedAt}; }

function split(value: unknown): TeamUnilevelSplit { const source=row(value); return { amountUSDT:num(source.amountUSDT), amountNEX:num(source.amountNEX), count:num(source.count,true) }; }
function unilevel(value: unknown, mode: ApiResponseEnvironment): TeamUnilevelSnapshot { const source=row(value);const proof=provenance(source, mode);const period=source.period;if(period!=="today"&&period!=="week"&&period!=="month"&&period!=="all")return invalid();if(!Array.isArray(source.events))return invalid();const events=source.events.map((item):TeamUnilevelEvent=>{const v=row(item);if(Object.prototype.hasOwnProperty.call(v,"sourceUserId"))return invalid();const layer=num(v.layer,true);if(layer<1||layer>7)return invalid();const status=String(v.status);if(!STATUSES.has(status))return invalid();const ts=num(v.ts,true),unlockAt=num(v.unlockAt,true);return {id:text(v.id),source:text(v.source),sourceUserName:text(v.sourceUserName),cycle:text(v.cycle),layer,orderId:v.orderId===null||v.orderId===undefined?null:text(v.orderId),orderAmountUSD:num(v.orderAmountUSD),amountUSDT:num(v.amountUSDT),amountNEX:num(v.amountNEX),currency:text(v.currency),status:status as CommissionEvent["status"],ts,unlockAt};});const rawSplit=row(source.split);const generatedAt=text(source.generatedAt);if(!Number.isFinite(Date.parse(generatedAt)))return invalid();return {...proof,period,events,split:{direct:split(rawSplit.direct),extended:split(rawSplit.extended)},generatedAt}; }

function almostEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
}

function pool(value: unknown, mode: ApiResponseEnvironment): TeamLeadershipPoolSnapshot {
  const source = row(value);
  const proof = provenance(source, mode);
  if (!Array.isArray(source.distribution) || !Array.isArray(source.history)) return invalid();

  const seenRanks = new Set<number>();
  const distribution = source.distribution.map((item) => {
    const fact = row(item);
    const vRank = num(fact.vRank, true);
    if (vRank > 12 || seenRanks.has(vRank)) return invalid();
    seenRanks.add(vRank);
    return { vRank, people: num(fact.people, true), votes: num(fact.votes, true) };
  });
  const history = source.history.map((item) => {
    const fact = row(item);
    return { weekId: text(fact.weekId), payoutUSDT: num(fact.payoutUSDT) };
  });
  const nextPayoutAt = text(source.nextPayoutAt);
  if (!Number.isFinite(Date.parse(nextPayoutAt))) return invalid();

  const currentWeekPoolUSDT = num(source.currentWeekPoolUSDT);
  const myRank = num(source.myRank, true);
  if (myRank > 12) return invalid();
  const myVotes = num(source.myVotes, true);
  const totalVotes = num(source.totalVotes, true);
  const mySharePct = num(source.mySharePct);
  const projectedPayoutUSDT = num(source.projectedPayoutUSDT);
  const calculatedTotalVotes = distribution.reduce((sum, fact) => sum + fact.people * fact.votes, 0);
  const calculatedMyVotes = distribution.find((fact) => fact.vRank === myRank)?.votes ?? 0;
  const calculatedShare = totalVotes === 0 ? 0 : myVotes / totalVotes;
  if (totalVotes !== calculatedTotalVotes
      || myVotes !== calculatedMyVotes
      || !almostEqual(mySharePct, calculatedShare)
      || !almostEqual(projectedPayoutUSDT, currentWeekPoolUSDT * mySharePct)) return invalid();

  return {
    ...proof,
    currentWeekPoolUSDT,
    myRank,
    myVotes,
    totalVotes,
    mySharePct,
    projectedPayoutUSDT,
    distribution,
    history,
    nextPayoutAt,
  };
}

export function createTeamInsightsApi(client: ApiClient, mode: ApiResponseEnvironment = "prod"): TeamInsightsApi {const root="/api/app/team/insights";return {leaderboard:async period=>leaderboard(await client.request<unknown>({path:`${root}/leaderboard?period=${encodeURIComponent(period)}`}), mode),commissions:async()=>commissions(await client.request<unknown>({path:`${root}/commissions`}), mode),unilevel:async period=>unilevel(await client.request<unknown>({path:`${root}/unilevel?period=${encodeURIComponent(period)}`}), mode),leadershipPool:async()=>pool(await client.request<unknown>({path:`${root}/leadership-pool`}), mode)};}
