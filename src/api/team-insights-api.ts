import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { CommissionEvent } from "@/store/commission";
import type { LeaderEntry, LeaderPeriod } from "@/mock/leaderboard";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export interface TeamProvenance {
  source: "server"; sourceEnvironment: "PRODUCTION" | "SANDBOX"; runId: string; serverCanonical: true;
}
export interface TeamLeaderboardSnapshot extends TeamProvenance {
  period: LeaderPeriod; rows: LeaderEntry[]; myRank: number | null; gapToNext: number;
  poolUsd: number; topN: number; page: number; pageSize: number; totalRows: number; generatedAt: string; snapshotAt: string | null; snapshotVersion: string | null;
}
export interface TeamCommissionSnapshot extends TeamProvenance {
  events: CommissionEvent[]; page: number; pageSize: number; totalRows: number; generatedAt: string; snapshotAt: string | null;
  aggregate: { totalUSDT: number; totalNEX: number; directUSDT: number; extendedUSDT: number; contributorCount: number;
    monthUSDT: number; monthNEX: number; todayUSDT: number; unlockedUSDT: number; unlockedNEX: number; coolingUSDT: number;
    eventCount: number; nextUnlockAt: number | null;
    byKind: Record<CommissionEvent["kind"], { usdt: number; nex: number; count: number }> };
  factStatus?: "SIMULATED" | "CANONICAL";
  withdrawable?: boolean;
  payoutStatus?: "NON_WITHDRAWABLE" | "CANONICAL";
}
export interface TeamUnilevelEvent {
  id: string; source: string; sourceUserName: string; cycle: string; layer: number;
  orderId: string | null; orderAmountUSD: number; amountUSDT: number; amountNEX: number;
  currency: string; status: CommissionEvent["status"]; ts: number; unlockAt: number;
  settlementState?: "SIMULATED" | "CANONICAL"; withdrawable?: boolean;
}
export interface TeamUnilevelSplit { amountUSDT: number; amountNEX: number; count: number }
export interface TeamUnilevelSnapshot extends TeamProvenance {
  period: LeaderPeriod; events: TeamUnilevelEvent[];
  split: { direct: TeamUnilevelSplit; extended: TeamUnilevelSplit };
  page: number; pageSize: number; totalRows: number; generatedAt: string; snapshotAt: string | null;
}
export interface TeamPoolDistribution { vRank: number; people: number; votes: number }
export interface TeamLeadershipHistory { weekId: string; payoutUSDT: number }
export interface TeamLeadershipPoolSnapshot extends TeamProvenance {
  currentWeekPoolUSDT: number; myRank: number; myVotes: number; totalVotes: number;
  mySharePct: number; projectedPayoutUSDT: number; distribution: TeamPoolDistribution[];
  history: TeamLeadershipHistory[]; nextPayoutAt: string;
  unlockRank: number; injectRate: number; topN: number;
}
export interface TeamInsightsApi {
  leaderboard(period: LeaderPeriod, page?: number, pageSize?: number, snapshotAt?: string | null, snapshotVersion?: string | null): Promise<TeamLeaderboardSnapshot>;
  commissions(page?: number, pageSize?: number, snapshotAt?: string | null): Promise<TeamCommissionSnapshot>;
  unilevel(period: LeaderPeriod, page?: number, pageSize?: number, snapshotAt?: string | null): Promise<TeamUnilevelSnapshot>;
  leadershipPool(): Promise<TeamLeadershipPoolSnapshot>;
}

function invalid(): never { throw new ApiError({ kind: "protocol", message: "TEAM_INSIGHTS_RESPONSE_INVALID" }); }
function row(value: unknown): Record<string, unknown> { if(!value||typeof value!=="object"||Array.isArray(value)) return invalid(); return value as Record<string,unknown>; }
function num(value: unknown, integer=false): number { if(typeof value!=="number"||!Number.isFinite(value)||value<0||(integer&&!Number.isSafeInteger(value))) return invalid(); return value; }
function text(value: unknown): string { if(typeof value!=="string"||!value.trim()) return invalid(); return value.trim(); }
function provenance(source: Record<string,unknown>, mode: ApiEnvironment): TeamProvenance {
  if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "server")) return invalid();
  return {source:"server",sourceEnvironment:source.sourceEnvironment,runId:source.runId,serverCanonical:true};
}
function snapshotAt(source: Record<string, unknown>): string | null { if (source.snapshotAt === undefined || source.snapshotAt === null) return null; const value = text(source.snapshotAt); return Number.isFinite(Date.parse(value)) ? value : invalid(); }
function snapshotVersion(source: Record<string, unknown>): string | null { if (source.snapshotVersion === undefined || source.snapshotVersion === null) return null; const value = text(source.snapshotVersion); return /^[a-f0-9]{64}$/.test(value) ? value : invalid(); }

function leaderboard(value: unknown, mode: ApiEnvironment): TeamLeaderboardSnapshot {
  const source=row(value); const proof=provenance(source, mode); const period=source.period;
  if((period!=="today"&&period!=="week"&&period!=="month"&&period!=="all")||!Array.isArray(source.rows)) return invalid();
  const page=num(source.page,true);const pageSize=num(source.pageSize,true);const totalRows=num(source.totalRows,true);
  if(page<1||pageSize<1||pageSize>100||source.rows.length>pageSize||totalRows<source.rows.length) return invalid();
  const firstRank=(page-1)*pageSize+1;const seenRanks=new Set<number>();
  const rows=source.rows.map((item,index):LeaderEntry=>{const v=row(item);const rank=num(v.rank,true);const vRank=num(v.vRank,true);if(rank!==firstRank+index||rank>totalRows||seenRanks.has(rank)||vRank>12||typeof v.handle!=="string"||typeof v.flag!=="string"||typeof v.cc!=="string"||typeof v.hasDevice!=="boolean") return invalid();seenRanks.add(rank);return {rank,handle:v.handle,flag:v.flag,cc:v.cc,directs:num(v.directs,true),teamSize:num(v.teamSize,true),earnedUSDT:num(v.earnedUSDT),delta:typeof v.delta==="number"&&Number.isSafeInteger(v.delta)?v.delta:invalid(),vRank,hasDevice:v.hasDevice};});
  if((firstRank>totalRows&&rows.length!==0)||(firstRank<=totalRows&&rows.length!==Math.min(pageSize,totalRows-firstRank+1))) return invalid();
  const generatedAt=text(source.generatedAt);if(!Number.isFinite(Date.parse(generatedAt))) return invalid();
  const myRank=source.myRank===null?null:num(source.myRank,true);if(myRank!==null&&(myRank<1||myRank>totalRows)) return invalid();return {...proof,period,rows,myRank,gapToNext:num(source.gapToNext),poolUsd:num(source.poolUsd),topN:num(source.topN,true),page,pageSize,totalRows,generatedAt,snapshotAt:snapshotAt(source),snapshotVersion:snapshotVersion(source)};
}

const KINDS=new Set(["unilevel","binary","peer","cultivation","leadership","genesis"]);
const STATUSES=new Set(["cooling","unlocked","withdrawn","frozen","reversed","rejected"]);
function settlement(v: Record<string, unknown>): { settlementState?: "CANONICAL"; withdrawable?: boolean } {
  if (v.settlementState !== undefined && v.settlementState !== "CANONICAL") return invalid();
  if (v.withdrawable !== undefined && typeof v.withdrawable !== "boolean") return invalid();
  return {
    ...(v.settlementState === undefined ? {} : { settlementState: "CANONICAL" as const }),
    ...(v.withdrawable === undefined ? {} : { withdrawable: v.withdrawable as boolean }),
  };
}
function paging(source: Record<string, unknown>, eventLength: number) {
  const page=num(source.page,true), pageSize=num(source.pageSize,true), totalRows=num(source.totalRows,true);
  if(page<1||pageSize<1||pageSize>100||eventLength>pageSize||totalRows<eventLength)return invalid();
  const first=(page-1)*pageSize;
  const expected=first>=totalRows?0:Math.min(pageSize,totalRows-first);
  if(eventLength!==expected)return invalid();
  return {page,pageSize,totalRows};
}
function commissions(value: unknown, mode: ApiEnvironment): TeamCommissionSnapshot {
  const source=row(value); const proof=provenance(source, mode);
  if(!Array.isArray(source.events)) return invalid();
  if (source.factStatus !== undefined && source.factStatus !== "CANONICAL") return invalid();
  if (source.withdrawable !== undefined && typeof source.withdrawable !== "boolean") return invalid();
  if (source.payoutStatus !== undefined && source.payoutStatus !== "CANONICAL") return invalid();
  const events=source.events.map((item):CommissionEvent=>{const v=row(item);const rawStatus=String(v.status);if(Object.prototype.hasOwnProperty.call(v,"sourceUserId")||!KINDS.has(String(v.kind))||!STATUSES.has(rawStatus)) return invalid();const ts=num(v.ts,true),unlockAt=num(v.unlockAt,true);const state=settlement(v);return {id:text(v.id),kind:v.kind as CommissionEvent["kind"],sourceUserName:text(v.sourceUserName),layer:v.layer===null||v.layer===undefined?undefined:num(v.layer,true),orderId:v.orderId===null||v.orderId===undefined?undefined:text(v.orderId),orderAmountUSD:v.orderAmountUSD===null||v.orderAmountUSD===undefined?undefined:num(v.orderAmountUSD),amountUSDT:num(v.amountUSDT),amountNEX:num(v.amountNEX),ts,unlockAt,status:rawStatus as CommissionEvent["status"],...state};});
  const aggregate=row(source.aggregate);
  const rawKinds=row(aggregate.byKind);
  const byKind = {} as TeamCommissionSnapshot["aggregate"]["byKind"];
  for (const key of KINDS) {
    const bucket=row(rawKinds[key]);
    byKind[key as CommissionEvent["kind"]] = {usdt:num(bucket.usdt),nex:num(bucket.nex),count:num(bucket.count,true)};
  }
  const totals = { monthUSDT:num(aggregate.monthUSDT), monthNEX:num(aggregate.monthNEX), todayUSDT:num(aggregate.todayUSDT),
    unlockedUSDT:num(aggregate.unlockedUSDT), unlockedNEX:num(aggregate.unlockedNEX), coolingUSDT:num(aggregate.coolingUSDT),
    eventCount:num(aggregate.eventCount,true), nextUnlockAt:aggregate.nextUnlockAt===null?null:num(aggregate.nextUnlockAt,true), byKind };
  const totalUSDT=num(aggregate.totalUSDT), totalNEX=num(aggregate.totalNEX), directUSDT=num(aggregate.directUSDT), extendedUSDT=num(aggregate.extendedUSDT), contributorCount=num(aggregate.contributorCount,true);
  if (!almostEqual(totalUSDT, directUSDT + extendedUSDT)) return invalid();
  const kindTotals = Object.values(byKind).reduce((sum, bucket) => ({
    usdt: sum.usdt + bucket.usdt, nex: sum.nex + bucket.nex, count: sum.count + bucket.count,
  }), {usdt: 0, nex: 0, count: 0});
  if (!almostEqual(totalUSDT, kindTotals.usdt) || !almostEqual(totalNEX, kindTotals.nex) || totals.eventCount !== kindTotals.count) return invalid();
  const generatedAt=text(source.generatedAt);if(!Number.isFinite(Date.parse(generatedAt)))return invalid();
  return {...proof,events,...paging(source,events.length),aggregate:{totalUSDT,totalNEX,directUSDT,extendedUSDT,contributorCount,...totals},generatedAt,snapshotAt:snapshotAt(source),...(source.factStatus === undefined ? {} : {factStatus: source.factStatus as "SIMULATED" | "CANONICAL"}),...(source.withdrawable === undefined ? {} : {withdrawable: source.withdrawable as boolean}),...(source.payoutStatus === undefined ? {} : {payoutStatus: source.payoutStatus as "NON_WITHDRAWABLE" | "CANONICAL"})};
}

function split(value: unknown): TeamUnilevelSplit { const source=row(value); return { amountUSDT:num(source.amountUSDT), amountNEX:num(source.amountNEX), count:num(source.count,true) }; }
function unilevel(value: unknown, mode: ApiEnvironment): TeamUnilevelSnapshot { const source=row(value);const proof=provenance(source, mode);const period=source.period;if(period!=="today"&&period!=="week"&&period!=="month"&&period!=="all")return invalid();if(!Array.isArray(source.events))return invalid();const events=source.events.map((item):TeamUnilevelEvent=>{const v=row(item);if(Object.prototype.hasOwnProperty.call(v,"sourceUserId"))return invalid();const layer=num(v.layer,true);if(layer<1||layer>7)return invalid();const rawStatus=String(v.status);if(!STATUSES.has(rawStatus))return invalid();const ts=num(v.ts,true),unlockAt=num(v.unlockAt,true);const state=settlement(v);return {id:text(v.id),source:text(v.source),sourceUserName:text(v.sourceUserName),cycle:text(v.cycle),layer,orderId:v.orderId===null||v.orderId===undefined?null:text(v.orderId),orderAmountUSD:num(v.orderAmountUSD),amountUSDT:num(v.amountUSDT),amountNEX:num(v.amountNEX),currency:text(v.currency),status:rawStatus as CommissionEvent["status"],ts,unlockAt,...state};});const rawSplit=row(source.split);const generatedAt=text(source.generatedAt);if(!Number.isFinite(Date.parse(generatedAt)))return invalid();return {...proof,period,events,...paging(source,events.length),split:{direct:split(rawSplit.direct),extended:split(rawSplit.extended)},generatedAt,snapshotAt:snapshotAt(source)}; }

function almostEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
}

function pool(value: unknown, mode: ApiEnvironment): TeamLeadershipPoolSnapshot {
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
  const unlockRank = num(source.unlockRank, true);
  const injectRate = num(source.injectRate);
  const topN = num(source.topN, true);
  if (unlockRank < 1 || unlockRank > 12 || injectRate > 0.3) return invalid();
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
    unlockRank,
    injectRate,
    topN,
  };
}

function validPaging(page:number,pageSize:number){return Number.isSafeInteger(page)&&page>=1&&Number.isSafeInteger(pageSize)&&pageSize>=1&&pageSize<=100;}
export function createTeamInsightsApi(client: ApiClient, mode: ApiEnvironment = "prod"): TeamInsightsApi {const root="/api/app/team/insights";const snap=(value:string|null|undefined)=>value?`&snapshotAt=${encodeURIComponent(value)}`:"";const version=(value:string|null|undefined)=>value?`&snapshotVersion=${encodeURIComponent(value)}`:"";return {leaderboard:async(period,page=1,pageSize=100,snapshotAt=null,snapshotVersion=null)=>{if(!validPaging(page,pageSize))return invalid();return leaderboard(await client.request<unknown>({path:`${root}/leaderboard?period=${encodeURIComponent(period)}&page=${page}&pageSize=${pageSize}${snap(snapshotAt)}${version(snapshotVersion)}`}), mode);},commissions:async(page=1,pageSize=20,snapshotAt=null)=>{if(!validPaging(page,pageSize))return invalid();return commissions(await client.request<unknown>({path:`${root}/commissions?page=${page}&pageSize=${pageSize}${snap(snapshotAt)}`}), mode);},unilevel:async(period,page=1,pageSize=20,snapshotAt=null)=>{if(!validPaging(page,pageSize))return invalid();return unilevel(await client.request<unknown>({path:`${root}/unilevel?period=${encodeURIComponent(period)}&page=${page}&pageSize=${pageSize}${snap(snapshotAt)}`}), mode);},leadershipPool:async()=>pool(await client.request<unknown>({path:`${root}/leadership-pool`}), mode)};}
