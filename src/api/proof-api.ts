import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export interface ProofSnapshot {
  source: "server"; sourceEnvironment: "PRODUCTION" | "SANDBOX"; runId: string; serverCanonical: true; generatedAt: string;
  serverTime: string; asOf: string;
  provenance: { source: "server"; environment: "PRODUCTION" | "SANDBOX"; runId: string; timeZone: string; streakRule: string; percentileRule: string };
  joinedAt: string; activeDays: number | null; onlineDevices: number | null; currentStreak: number | null; longestStreak: number | null; topPercentile: number | null;
  earningsTotalUsdt: number | null; referralCode: string; referral: { invitedCount: number; lifetimeInviterNex: number };
  team: { totalMembers: number | null; activeMembers: number | null };
  availability: { status: "READY" | "PARTIAL" | "EMPTY" | string; earnings?: string; team?: string };
}
function invalid(): never { throw new ApiError({ kind: "protocol", message: "PROOF_RESPONSE_INVALID" }); }
function row(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function text(value: unknown): string { if (typeof value !== "string" || !value.trim()) return invalid(); return value.trim(); }
function optionalNum(value: unknown, integer = false): number | null { if (value === null) return null; if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || integer && !Number.isSafeInteger(value)) return invalid(); return value; }
export function parseProofSnapshot(value: unknown, mode: ApiEnvironment = "prod"): ProofSnapshot {
  const source = row(value);
  if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "server")) return invalid();
  const environment = source.sourceEnvironment;
  if (Object.prototype.hasOwnProperty.call(source, "topPct")) return invalid();
  const runIdValue = source.runId;
  const generatedAt = text(source.generatedAt); const joinedAt = text(source.joinedAt);
  const serverTime = text(source.serverTime); const asOf = text(source.asOf);
  if (!Number.isFinite(Date.parse(generatedAt)) || !Number.isFinite(Date.parse(joinedAt))
    || !Number.isFinite(Date.parse(serverTime)) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return invalid();
  const serverDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(serverTime));
  if (serverDate !== asOf) return invalid();
  const provenance = row(source.provenance);
  if (provenance.source !== "server" || provenance.environment !== environment || provenance.runId !== runIdValue
    || text(provenance.timeZone) !== "Asia/Ho_Chi_Minh" || !text(provenance.streakRule) || !text(provenance.percentileRule)) return invalid();
  const referral = row(source.referral); const team = row(source.team);
  const availability = row(source.availability);
  const invitedCount = optionalNum(referral.invitedCount, true); const lifetimeInviterNex = optionalNum(referral.lifetimeInviterNex);
  const totalMembers = optionalNum(team.totalMembers, true); const activeMembers = optionalNum(team.activeMembers, true);
  if (invitedCount === null || lifetimeInviterNex === null
    || activeMembers !== null && totalMembers === null
    || activeMembers !== null && totalMembers !== null && activeMembers > totalMembers) return invalid();
  const status = text(availability.status);
  const currentStreak = optionalNum(source.currentStreak, true);
  const longestStreak = optionalNum(source.longestStreak, true);
  if (currentStreak !== null && longestStreak !== null && longestStreak < currentStreak) return invalid();
  return { source: "server", sourceEnvironment: environment, runId: runIdValue, serverCanonical: true, generatedAt, joinedAt,
    serverTime, asOf, provenance: {
      source: "server", environment, runId: runIdValue, timeZone: "Asia/Ho_Chi_Minh",
      streakRule: text(provenance.streakRule), percentileRule: text(provenance.percentileRule),
    }, activeDays: optionalNum(source.activeDays, true), onlineDevices: optionalNum(source.onlineDevices, true),
    currentStreak, longestStreak,
    topPercentile: optionalNum(source.topPercentile), earningsTotalUsdt: optionalNum(source.earningsTotalUsdt),
    referralCode: text(source.referralCode), referral: { invitedCount, lifetimeInviterNex }, team: { totalMembers, activeMembers },
    availability: { status, ...(availability.earnings === undefined ? {} : { earnings: text(availability.earnings) }), ...(availability.team === undefined ? {} : { team: text(availability.team) }) } };
}
export function createProofApi(client: ApiClient, mode: ApiEnvironment = "prod") {
  return { snapshot: async (): Promise<ProofSnapshot> => parseProofSnapshot(await client.request({ method: "GET", path: "/api/app/proof" }), mode) };
}
