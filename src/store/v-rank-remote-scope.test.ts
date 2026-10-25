import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, disposePinia, setActivePinia } from "pinia";
import { advanceRuntimeRevision } from "@/api/order-api";
import type { VRankData, VRankDef } from "./v-rank";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  vRankApi: { ladder: vi.fn(), current: vi.fn() },
}));

vi.mock("@/api/runtime", () => remote);

const { useVRank, nextRankGap, nextRankProgress } = await import("./v-rank");

let pinia: ReturnType<typeof createPinia>;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  advanceRuntimeRevision(null);
  remote.vRankApi.ladder.mockReset();
  remote.vRankApi.current.mockReset();
});
afterEach(() => { disposePinia(pinia); });

const pointLadder = () => ({ prizeName: "Ranks", capabilities: { peer: false, genesis: false }, ranks: [
  { v: 0, title: "Base", cnTitle: "基础", directBonus: .05, unilevelDepth: 1, peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [], visible: true },
  { v: 1, title: "Next", cnTitle: "下级", selfBuyUSD: 299, teamVolumeUSD: 5000, selfComputePoints: 2000, teamComputePoints: 20000, directBonus: .1, unilevelDepth: 2, peerBonus: 0, leadershipVotes: 0, cultivationBonus: 500, rewards: [], visible: true },
] });
const pointCurrent = (points: Record<string, number> = {}) => ({ rankCode: "V0", progress: {
  selfBuyUSD: 9000, directRefs: 3, teamVolumeUSD: 90000, vDownlineCounts: {}, ...points,
} });

describe("point projection and account lifecycle", () => {
  it("uses independent point thresholds and gaps without changing rank or financial fields", async () => {
    remote.vRankApi.ladder.mockResolvedValue(pointLadder());
    remote.vRankApi.current.mockResolvedValue(pointCurrent({ selfComputePoints: 1280, teamComputePoints: 12800 }));
    const store = useVRank(); await store.refreshCanonicalVRank();
    expect(store.ladder[1].conditions).toMatchObject({ selfComputePoints: 2000, teamComputePoints: 20000, selfBuyUSD: 299, teamVolumeUSD: 5000 });
    const progress = nextRankProgress(store, store.ladder, "compute-points");
    expect(progress.progressKnown).toBe(true); expect(progress.progressPct).toBeCloseTo(.64);
    expect(progress.missing).toEqual([{ kind: "selfComputePoints", amount: 720 }, { kind: "teamComputePoints", amount: 7200 }]);
    expect(nextRankGap(store, store.ladder, "compute-points").primaryGap).toMatchObject({ kind: "selfComputePoints", remaining: 720 });
    expect(store.myRank).toBe(0); expect(store.selfBuyUSD).toBe(9000); expect(store.teamVolumeUSD).toBe(90000);
  });
  it("clears omitted points on refresh and all point facts after a failed request", async () => {
    remote.vRankApi.ladder.mockResolvedValue(pointLadder());
    remote.vRankApi.current.mockResolvedValueOnce(pointCurrent({ selfComputePoints: 1280, teamComputePoints: 12800 }))
      .mockResolvedValueOnce(pointCurrent()).mockRejectedValueOnce(new Error("offline"));
    const store = useVRank(); await store.refreshCanonicalVRank(); await store.refreshCanonicalVRank();
    expect(store.selfComputePoints).toBeUndefined(); expect(store.teamComputePoints).toBeUndefined();
    const unknown = nextRankProgress(store, store.ladder, "compute-points");
    expect(unknown.progressKnown).toBe(false); expect(unknown.missing).toContainEqual({ kind: "teamComputePoints", amount: undefined });
    await store.refreshCanonicalVRank();
    expect(store.remoteReady).toBe(false); expect(store.ladder).toEqual([]);
    expect(store.selfComputePoints).toBeUndefined(); expect(store.teamComputePoints).toBeUndefined();
  });
  it("cannot import the old account's late point response into a rebound account", async () => {
    let finishA!: (value: unknown) => void;
    remote.vRankApi.ladder.mockResolvedValue(pointLadder());
    remote.vRankApi.current.mockReturnValueOnce(new Promise(resolve => { finishA = resolve; }))
      .mockResolvedValueOnce(pointCurrent({ selfComputePoints: 20, teamComputePoints: 200 }));
    const store = useVRank(); store.bindAccount("point-account-A"); store.bindAccount("point-account-B");
    expect(store.selfComputePoints).toBeUndefined(); expect(store.teamComputePoints).toBeUndefined();
    await vi.waitFor(() => expect(store.remoteReady).toBe(true));
    finishA(pointCurrent({ selfComputePoints: 9999, teamComputePoints: 99999 }));
    await Promise.resolve(); await Promise.resolve();
    expect(store.selfComputePoints).toBe(20); expect(store.teamComputePoints).toBe(200);
  });
  it("shows unknown for legacy USD-only conditions in point mode while retaining monetary gap compatibility", () => {
    const ladder = pointLadder().ranks.map(row => ({ ...row, conditions: row.v ? { selfBuyUSD: 10000, teamVolumeUSD: 100000 } : {} })) as VRankDef[];
    const state = { myRank: 0, ...pointCurrent().progress };
    expect(nextRankProgress(state, ladder).missing).toEqual([{ kind: "selfBuy", amount: 1000 }, { kind: "teamVolume", amount: 10000 }]);
    const points = nextRankProgress(state, ladder, "compute-points");
    expect(points.progressKnown).toBe(false);
    expect(points.missing).toEqual([{ kind: "selfComputePoints", amount: undefined }, { kind: "teamComputePoints", amount: undefined }]);
  });
  it("handles a canonical zero threshold without NaN and clamps surplus progress without promotion", () => {
    const ladder = pointLadder().ranks.map(row => ({ ...row, conditions: row.v ? { selfComputePoints: 0, teamComputePoints: 20000 } : {} })) as VRankDef[];
    const state = { myRank: 0, ...pointCurrent({ selfComputePoints: 0, teamComputePoints: 25000 }).progress };
    expect(nextRankProgress(state, ladder, "compute-points")).toMatchObject({ progressPct: 1, progressKnown: true, missing: [] });
    expect(state.myRank).toBe(0);
  });
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
    remote.vRankApi.ladder.mockReturnValueOnce(new Promise((resolve) => { resolveLadder = resolve; }))
      .mockReturnValue(new Promise(() => {}));
    remote.vRankApi.current.mockReturnValueOnce(new Promise((resolve) => { resolveCurrent = resolve; }))
      .mockReturnValue(new Promise(() => {}));
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
