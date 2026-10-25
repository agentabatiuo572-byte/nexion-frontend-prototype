import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, disposePinia, setActivePinia } from "pinia";
import { createVRankApi } from "@/api/v-rank-api";
import { advanceRuntimeRevision } from "@/api/order-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  vRankApi: { ladder: vi.fn(), current: vi.fn() },
}));
vi.mock("@/api/runtime", () => remote);
const { useVRank } = await import("./v-rank");

const proof = { source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" };
const ladder = {
  ...proof, prizeName: "Ranks", capabilities: { peer: false, genesis: false },
  ranks: Array.from({ length: 3 }, (_, v) => ({
    v, title: `V${v}`, cnTitle: `V${v}`, directBonus: 0.1, unilevelDepth: v + 1,
    peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [], visible: true,
  })),
};
const current = {
  ...proof, rankCode: "V2",
  progress: { selfBuyUSD: 250, directRefs: 2, teamVolumeUSD: 2300, vDownlineCounts: {} },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

let pinia: ReturnType<typeof createPinia>;
const request = vi.fn();
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  advanceRuntimeRevision();
  request.mockReset();
  request.mockImplementation(async ({ path }: { path: string }) => path === "/api/config/v-ranks" ? ladder : current);
  // Keep the real API validation between the transport payload and the store.
  const api = createVRankApi({ request } as never);
  remote.vRankApi.ladder.mockReset().mockImplementation(api.ladder);
  remote.vRankApi.current.mockReset().mockImplementation(api.current);
});
afterEach(() => { disposePinia(pinia); });

describe("V-rank runtime refresh recovery", () => {
  it.each(["/api/config/v-ranks", "/api/team/rank"])(
    "leaves loading after a revision change and malformed %s, then recovers on retry",
    async failedPath => {
      const held = deferred<unknown>();
      let failed = true;
      request.mockImplementation(({ path }: { path: string }) => path === failedPath && failed
        ? held.promise : Promise.resolve(path === "/api/config/v-ranks" ? ladder : current));
      const store = useVRank();
      const pending = store.refreshCanonicalVRank();
      expect(store.remoteReady).toBe(false);
      expect(store.remoteError).toBeNull();

      // Cold boot's product catalogue finishes while the rank response is held.
      advanceRuntimeRevision("catalogue-ready");
      held.resolve({});
      await pending;
      await vi.waitFor(() => expect(store.remoteError).toBe("V_RANK_REMOTE_AUTHORITY_UNAVAILABLE"));
      expect(store.remoteReady).toBe(false);
      expect(store.ladder).toEqual([]);
      expect(remote.vRankApi.ladder).toHaveBeenCalledTimes(2);
      expect(remote.vRankApi.current).toHaveBeenCalledTimes(2);

      failed = false;
      const retry = store.refreshCanonicalVRank();
      expect(store.remoteError).toBeNull();
      expect(store.remoteReady).toBe(false);
      await retry;
      expect(store.remoteReady).toBe(true);
      expect(store.myRank).toBe(2);
      expect(store.teamVolumeUSD).toBe(2300);
      expect(store.ladder).toHaveLength(3);
    },
  );

  it("re-reads the new revision and ignores a late malformed response", async () => {
    const old = deferred<unknown>();
    request.mockImplementationOnce(() => old.promise);
    const store = useVRank();
    const pending = store.refreshCanonicalVRank();

    advanceRuntimeRevision("catalogue-ready");
    await vi.waitFor(() => expect(store.remoteReady).toBe(true));
    old.resolve({});
    await pending;
    expect(store.remoteReady).toBe(true);
    expect(store.remoteError).toBeNull();
    expect(store.myRank).toBe(2);
  });

  it("does not let an old success hide the new revision's failure", async () => {
    const old = deferred<unknown>();
    request.mockImplementationOnce(() => old.promise);
    const store = useVRank();
    const pending = store.refreshCanonicalVRank();
    request.mockResolvedValue({});

    advanceRuntimeRevision("catalogue-ready");
    await vi.waitFor(() => expect(store.remoteError).toBe("V_RANK_REMOTE_AUTHORITY_UNAVAILABLE"));
    old.resolve(ladder);
    await pending;
    expect(store.remoteReady).toBe(false);
    expect(store.remoteError).toBe("V_RANK_REMOTE_AUTHORITY_UNAVAILABLE");
    expect(store.ladder).toEqual([]);
  });

  it("keeps a superseded account response from overwriting a recovered account", async () => {
    const old = deferred<unknown>();
    request.mockImplementationOnce(() => old.promise);
    const store = useVRank();
    const pending = store.refreshCanonicalVRank();
    advanceRuntimeRevision("account-change");
    store.bindAccount("user:2");
    await vi.waitFor(() => expect(store.remoteReady).toBe(true));
    old.resolve({});
    await pending;
    expect(store.remoteError).toBeNull();
    expect(store.myRank).toBe(2);
  });

  it("removes the runtime listener when the store is disposed", async () => {
    const store = useVRank();
    await store.refreshCanonicalVRank();
    store.$dispose();
    advanceRuntimeRevision("catalogue-ready");
    expect(remote.vRankApi.ladder).toHaveBeenCalledTimes(1);
    expect(remote.vRankApi.current).toHaveBeenCalledTimes(1);
  });
});
