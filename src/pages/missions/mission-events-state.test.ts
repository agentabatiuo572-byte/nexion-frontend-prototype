import { describe, expect, it } from "vitest";
import type { CanonicalEvent } from "@/api/events-api";
import { projectMissionRemoteEvents } from "./mission-events-state";

const event = (state: CanonicalEvent["state"], userStatus: CanonicalEvent["userStatus"]): CanonicalEvent => ({
  eventCode: `${state}-${userStatus}`,
  state,
  userStatus,
} as CanonicalEvent);

describe("mission remote-event state", () => {
  it("does not turn an unread or refreshing event snapshot into zero counts", () => {
    const staleEvents = [event("ongoing", "CLAIMABLE")];
    expect(projectMissionRemoteEvents("initial", staleEvents)).toEqual({ state: "initial", stats: null, empty: false });
    expect(projectMissionRemoteEvents("refreshing", staleEvents)).toEqual({ state: "refreshing", stats: null, empty: false });
  });

  it("keeps a failed read distinct from a ready empty response", () => {
    expect(projectMissionRemoteEvents("error", [])).toEqual({ state: "error", stats: null, empty: false });
    expect(projectMissionRemoteEvents("ready", [])).toEqual({
      state: "ready", stats: { ongoing: 0, joined: 0, claimable: 0 }, empty: true,
    });
  });

  it("only derives counts from the current ready response", () => {
    expect(projectMissionRemoteEvents("ready", [
      event("ongoing", "AVAILABLE"),
      event("ongoing", "JOINED"),
      event("upcoming", "CLAIMABLE"),
      event("ended", "CLAIMED"),
    ])).toEqual({
      state: "ready", stats: { ongoing: 2, joined: 2, claimable: 1 }, empty: false,
    });
  });
});
