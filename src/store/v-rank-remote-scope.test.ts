import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { advanceRuntimeRevision } from "@/api/order-api";
import type { VRankData, VRankDef } from "./v-rank";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  vRankApi: { ladder: vi.fn(), current: vi.fn() },
}));

vi.mock("@/api/runtime", () => remote);

const { useVRank, nextRankGap, nextRankProgress } = await import("./v-rank");

beforeEach(() => {
  setActivePinia(createPinia());
  advanceRuntimeRevision(null);
  remote.vRankApi.ladder.mockReset();
  remote.vRankApi.current.mockReset();
});

describe("V-rank remote authority state", () => {
  it("never presents zero as a loaded rank when either canonical request fails", async () => {
    remote.vRankApi.ladder.mockRejectedValue(new Error("offline"));
    remote.vRankApi.current.mockRejectedValue(new Error("offline"));
    const store = useVRank();

    await store.refreshCanonicalVRank();

    expect(store.remoteReady).toBe(false);
    expect(store.remoteError).toBe("V_RANK_REMOTE_AUTHORITY_UNAVAILABLE");
    expect(store.ladder).toEqual([]);
  });

  it("derives preview labels from the supplied canonical ladder", () => {
    const store = useVRank();
    const canonicalLadder: VRankDef[] = [
    { v: 0, title: "Remote Base", cnTitle: "Remote Base CN", conditions: {}, directBonus: 0, unilevelDepth: 1, peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [] },
    { v: 1, title: "Remote Apex", cnTitle: "Remote Apex CN", conditions: { teamVolumeUSD: 100 }, directBonus: 0, unilevelDepth: 2, peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [] },
    ];

    const state: VRankData = {
      myRank: 0,
      selfBuyUSD: 0,
      directRefs: 0,
      teamVolumeUSD: 0,
      vDownlineCounts: {},
    };
    const progress = nextRankProgress(state, canonicalLadder);
    const gap = nextRankGap(state, canonicalLadder);

    expect(progress.next?.title).toBe("Remote Apex");
    expect(progress.missing[0]).toMatchObject({ kind: "teamVolume", amount: 100 });
    expect(gap.next?.title).toBe("Remote Apex");
  });

  it("hydrates the server-authoritative development response without a retired run fence", async () => {
    let resolveLadder!: (value: unknown) => void;
    let resolveCurrent!: (value: unknown) => void;
    remote.vRankApi.ladder.mockReturnValue(new Promise((resolve) => { resolveLadder = resolve; }));
    remote.vRankApi.current.mockReturnValue(new Promise((resolve) => { resolveCurrent = resolve; }));
    const store = useVRank();
    const pending = store.refreshCanonicalVRank();

    resolveLadder({ source: "server", ranks: Array.from({ length: 13 }, (_, v) => ({
      v, title: `V${v}`, cnTitle: `V${v}`, directBonus: 0, unilevelDepth: 1,
      peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [], visible: true,
    })) });
    resolveCurrent({ source: "server", rankCode: "V2", progress: {
      selfBuyUSD: 0, directRefs: 0, teamVolumeUSD: 0, vDownlineCounts: {},
    } });
    await pending;

    expect(store.remoteReady).toBe(true);
    expect(store.ladder).toHaveLength(13);
  });
});

  it("discards a late canonical response after its runtime revision changes", async () => {
    let resolveLadder!: (value: unknown) => void;
    let resolveCurrent!: (value: unknown) => void;
    remote.vRankApi.ladder.mockReturnValue(new Promise((resolve) => { resolveLadder = resolve; }));
    remote.vRankApi.current.mockReturnValue(new Promise((resolve) => { resolveCurrent = resolve; }));
    const store = useVRank();

    const pending = store.refreshCanonicalVRank();
    advanceRuntimeRevision("account-refresh");
    resolveLadder({ source: "stale", ranks: Array.from({ length: 13 }, (_, v) => ({
      v, title: `V${v}`, cnTitle: `V${v}`, directBonus: 0, unilevelDepth: 1,
      peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [], visible: true,
    })) });
    resolveCurrent({ source: "stale", rankCode: "V5", progress: {
      selfBuyUSD: 0, directRefs: 0, teamVolumeUSD: 0, vDownlineCounts: {},
    } });
    await pending;

    expect(store.remoteReady).toBe(false);
    expect(store.myRank).toBe(0);
    expect(store.ladder).toEqual([]);
  });
