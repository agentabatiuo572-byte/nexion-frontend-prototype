import type { CanonicalEvent } from "@/api/events-api";

export type MissionRemoteEventsReadState = "initial" | "refreshing" | "ready" | "error";

export interface MissionEventStats {
  ongoing: number;
  joined: number;
  claimable: number;
}

export interface MissionRemoteEventsProjection {
  state: MissionRemoteEventsReadState;
  stats: MissionEventStats | null;
  empty: boolean;
}

function eventStats(events: readonly CanonicalEvent[]): MissionEventStats {
  return {
    ongoing: events.filter((event) => event.state === "ongoing").length,
    joined: events.filter((event) => event.state !== "ended" && ["JOINED", "CLAIMABLE", "CLAIMED"].includes(event.userStatus)).length,
    claimable: events.filter((event) => event.userStatus === "CLAIMABLE").length,
  };
}

/**
 * Mission counts only describe a response that is current and ready. Loading,
 * refreshing, and failed reads deliberately have no count projection.
 */
export function projectMissionRemoteEvents(
  state: MissionRemoteEventsReadState,
  events: readonly CanonicalEvent[],
): MissionRemoteEventsProjection {
  if (state !== "ready") return { state, stats: null, empty: false };
  return { state, stats: eventStats(events), empty: events.length === 0 };
}
