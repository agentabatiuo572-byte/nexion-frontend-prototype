import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";

export interface TeamNetworkMember {
  id: string; name: string; avatarUrl: string | null; vRank: number; layer: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  leg: "A" | "B" | null; joinedAt: string;
  monthVolumeUsdt: number; lifetimeVolumeUsdt: number | null; status: "ACTIVE" | "IDLE" | "OFFLINE"; region: string | null;
}
export interface TeamNetworkSnapshot {
  totalMembers: number; directMembers: number; activeMembers: number;
  monthVolumeUsdt: number; lifetimeVolumeUsdt: number | null; members: TeamNetworkMember[];
  source: "server"; sourceEnvironment: "PRODUCTION" | "SANDBOX"; runId: string;
  serverCanonical: true; generatedAt: string;
  nextCursor?: string | null;
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

function provenance(source: Record<string, unknown>, mode: ApiEnvironment): { sourceEnvironment: TeamNetworkSnapshot["sourceEnvironment"]; runId: string } {
  if (source.source !== "server" || source.serverCanonical !== true
      || (source.sourceEnvironment !== "PRODUCTION" && source.sourceEnvironment !== "SANDBOX")
      || typeof source.runId !== "string") return invalid();
  if ((mode !== "prod" && mode !== "dev") || source.sourceEnvironment !== "PRODUCTION" || source.runId !== "") return invalid();
  return { sourceEnvironment: source.sourceEnvironment, runId: source.runId };
}

function snapshot(value: unknown, mode: ApiEnvironment): TeamNetworkSnapshot {
  const source = row(value); const proof = provenance(source, mode);
  if (!Array.isArray(source.members)) return invalid();
  const members = source.members.map(member); const totalMembers = count(source.totalMembers);
  const directMembers = count(source.directMembers); const activeMembers = count(source.activeMembers);
  const generatedAt = text(source.generatedAt) as string;
  if (totalMembers !== members.length || directMembers !== members.filter((item) => item.layer === 1).length
      || activeMembers !== members.filter((item) => item.status === "ACTIVE").length
      || new Set(members.map((item) => item.id)).size !== members.length || !Number.isFinite(Date.parse(generatedAt))) return invalid();
  return { totalMembers, directMembers, activeMembers, monthVolumeUsdt: amount(source.monthVolumeUsdt),
    lifetimeVolumeUsdt: optionalAmount(source.lifetimeVolumeUsdt), members, source: "server", ...proof,
    serverCanonical: true, generatedAt, nextCursor: source.nextCursor === undefined || source.nextCursor === null ? null : text(source.nextCursor) };
}

export function createTeamNetworkApi(client: ApiClient, mode: ApiEnvironment = "prod"): TeamNetworkApi {
  return { async snapshot() {
    let result: TeamNetworkSnapshot | null = null;
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page: TeamNetworkSnapshot = snapshot(await client.request<unknown>({
        path: cursor === null ? "/api/app/team/network" : `/api/app/team/network?afterId=${encodeURIComponent(cursor)}`,
      }), mode);
      if (result && (page.runId !== result.runId || page.sourceEnvironment !== result.sourceEnvironment)) return invalid();
      for (const member of page.members) {
        if (seen.has(member.id)) return invalid();
        seen.add(member.id);
      }
      if (page.nextCursor && (!/^[1-9][0-9]*$/.test(page.nextCursor) || page.members.length === 0
          || page.nextCursor !== page.members[page.members.length - 1]?.id
          || (cursor !== null && BigInt(page.nextCursor) <= BigInt(cursor)))) return invalid();
      result = result === null ? page : {
        ...page, members: [...result.members, ...page.members],
        totalMembers: result.totalMembers + page.totalMembers,
        directMembers: result.directMembers + page.directMembers,
        activeMembers: result.activeMembers + page.activeMembers,
        monthVolumeUsdt: result.monthVolumeUsdt + page.monthVolumeUsdt,
        lifetimeVolumeUsdt: result.lifetimeVolumeUsdt === null || page.lifetimeVolumeUsdt === null ? null
          : result.lifetimeVolumeUsdt + page.lifetimeVolumeUsdt,
      };
      cursor = page.nextCursor ?? null;
    } while (cursor !== null);
    return result;
  } };

}
