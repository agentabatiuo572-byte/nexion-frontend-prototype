import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface TeamNetworkMember {
  id: string; name: string; avatarUrl: string | null; vRank: number; layer: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  leg: "A" | "B" | null; joinedAt: string;
  monthVolumeUsdt: number; lifetimeVolumeUsdt: number | null; status: "ACTIVE" | "IDLE" | "OFFLINE"; region: string | null;
}
export interface TeamNetworkSnapshot {
  totalMembers: number; directMembers: number; activeMembers: number;
  monthVolumeUsdt: number; lifetimeVolumeUsdt: number | null; members: TeamNetworkMember[];
  source: "server"; generatedAt: string;
}
export interface TeamNetworkApi { snapshot(): Promise<TeamNetworkSnapshot> }

function invalid(): never { throw new ApiError({ kind: "protocol", message: "TEAM_NETWORK_RESPONSE_INVALID" }); }
function row(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function text(value: unknown, nullable = false): string | null { if (nullable && value === null) return null; if (typeof value !== "string" || !value.trim()) return invalid(); return value.trim(); }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid(); return value; }
function amount(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return invalid(); return value; }
function optionalAmount(value: unknown): number | null { return value === null ? null : amount(value); }

function member(value: unknown): TeamNetworkMember {
  const source = row(value); const layer = count(source.layer); const vRank = count(source.vRank);
  if (Object.prototype.hasOwnProperty.call(source, "sponsorId")) return invalid();
  const leg = source.leg === null ? null : source.leg === "A" || source.leg === "B" ? source.leg : invalid();
  const status = source.status === "ACTIVE" || source.status === "IDLE" || source.status === "OFFLINE" ? source.status : invalid();
  const joinedAt = text(source.joinedAt) as string;
  if (layer < 1 || layer > 7 || vRank > 12 || !Number.isFinite(Date.parse(joinedAt))) return invalid();
  return { id: text(source.id) as string, name: text(source.name) as string,
    avatarUrl: text(source.avatarUrl, true), vRank, layer: layer as TeamNetworkMember["layer"], leg,
    joinedAt, monthVolumeUsdt: amount(source.monthVolumeUsdt),
    lifetimeVolumeUsdt: optionalAmount(source.lifetimeVolumeUsdt), status, region: text(source.region, true) };
}

function snapshot(value: unknown): TeamNetworkSnapshot {
  const source = row(value); if (source.source !== "server" || !Array.isArray(source.members)) return invalid();
  const members = source.members.map(member); const totalMembers = count(source.totalMembers);
  const directMembers = count(source.directMembers); const activeMembers = count(source.activeMembers);
  const generatedAt = text(source.generatedAt) as string;
  if (totalMembers !== members.length || directMembers !== members.filter((item) => item.layer === 1).length
      || activeMembers !== members.filter((item) => item.status === "ACTIVE").length
      || new Set(members.map((item) => item.id)).size !== members.length || !Number.isFinite(Date.parse(generatedAt))) return invalid();
  return { totalMembers, directMembers, activeMembers, monthVolumeUsdt: amount(source.monthVolumeUsdt),
    lifetimeVolumeUsdt: optionalAmount(source.lifetimeVolumeUsdt), members, source: "server", generatedAt };
}

export function createTeamNetworkApi(client: ApiClient): TeamNetworkApi {
  return { async snapshot() { return snapshot(await client.request<unknown>({ path: "/api/app/team/network" })); } };
}
