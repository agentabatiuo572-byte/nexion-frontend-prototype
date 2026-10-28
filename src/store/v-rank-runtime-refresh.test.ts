import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, disposePinia, setActivePinia } from "pinia";
import { ApiError } from "@/api/errors";
import { createVRankApi } from "@/api/v-rank-api";
import { advanceRuntimeRevision, captureRuntimeRevision } from "@/api/order-api";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true, apiRuntimeConfig: { environment: "dev", baseUrl: "https://test.invalid" },
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
afterEach(() => { disposePinia(pinia); vi.useRealTimers(); });

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

it('keeps one 500ms local-session retry and honors its subsequent 429 deadline',async()=>{
 vi.useFakeTimers();const store=useVRank();remote.vRankApi.current.mockRejectedValueOnce(new ApiError({kind:'auth',message:'AUTH_SESSION_REQUIRED'})).mockRejectedValueOnce(new ApiError({kind:'http',status:429,message:'limited after restore',retryAfterMs:2_000}));
 const reading=store.refreshCanonicalVRank();await vi.advanceTimersByTimeAsync(499);expect(remote.vRankApi.current).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1);await reading;expect(remote.vRankApi.current).toHaveBeenCalledTimes(2);expect(store.remoteReady).toBe(false);expect(store.remoteRateLimited).toBe(true);
 await store.ensureCanonicalVRank();await store.refreshCanonicalVRank();advanceRuntimeRevision();expect(remote.vRankApi.current).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(1_999);await store.refreshCanonicalVRank();expect(remote.vRankApi.current).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(1);await store.refreshCanonicalVRank();expect(remote.vRankApi.current).toHaveBeenCalledTimes(3);expect(store.remoteReady).toBe(true);
});

it('does not retry a role denial and does not let an old actor session timer issue new reads',async()=>{
 vi.useFakeTimers();const store=useVRank();remote.vRankApi.current.mockRejectedValueOnce(new ApiError({kind:'auth',status:403,message:'role denied'}));await store.refreshCanonicalVRank();expect(remote.vRankApi.current).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);expect(store.remoteReady).toBe(false);
 remote.vRankApi.current.mockRejectedValueOnce(new ApiError({kind:'auth',message:'AUTH_SESSION_REQUIRED'}));const old=store.refreshCanonicalVRank();await vi.advanceTimersByTimeAsync(1);store.bindAccount('user:new');await Promise.resolve();await vi.advanceTimersByTimeAsync(499);await old;expect(remote.vRankApi.current).toHaveBeenCalledTimes(3);expect(store.remoteReady).toBe(true);expect(store.myRank).toBe(2);
});

it('does not let the local-session 500ms retry overtake429 from the other current GET',async()=>{
 vi.useFakeTimers();const store=useVRank();let deny!:(reason:unknown)=>void;remote.vRankApi.ladder.mockReturnValueOnce(new Promise((_,reject)=>{deny=reject}));remote.vRankApi.current.mockRejectedValueOnce(new ApiError({kind:'auth',message:'AUTH_SESSION_REQUIRED'}));
 const pending=store.refreshCanonicalVRank();await vi.advanceTimersByTimeAsync(1);deny(new ApiError({kind:'http',status:429,message:'limited sibling',retryAfterMs:2_000}));await vi.advanceTimersByTimeAsync(499);await pending;
 expect(remote.vRankApi.current).toHaveBeenCalledTimes(1);expect(store.remoteReady).toBe(false);expect(store.remoteRateLimited).toBe(true);
});

it('ignores a denied old first-attempt GET after the bounded second pair succeeds',async()=>{
 vi.useFakeTimers();const store=useVRank();let deny!:(reason:unknown)=>void;remote.vRankApi.ladder.mockReturnValueOnce(new Promise((_,reject)=>{deny=reject}));remote.vRankApi.current.mockRejectedValueOnce(new ApiError({kind:'auth',message:'AUTH_SESSION_REQUIRED'}));
 const pending=store.refreshCanonicalVRank();await vi.advanceTimersByTimeAsync(500);await pending;expect(store.remoteReady).toBe(true);deny(new ApiError({kind:'auth',status:403,message:'old first attempt denied'}));await Promise.resolve();await Promise.resolve();expect(store.remoteReady).toBe(true);expect(store.remoteError).toBeNull();expect(store.myRank).toBe(2);
});

it('never treats a server403 carrying the local-precondition message as session restore',async()=>{
 vi.useFakeTimers();const store=useVRank();remote.vRankApi.current.mockRejectedValue(new ApiError({kind:'auth',status:403,message:'AUTH_SESSION_REQUIRED'}));await store.refreshCanonicalVRank();expect(vi.getTimerCount()).toBe(0);expect(remote.vRankApi.current).toHaveBeenCalledTimes(1);expect(store.remoteReady).toBe(false);expect(store.ladder).toEqual([]);
});

it('does not let an old actor initiate a pair or supersede a pending new-owner read',async()=>{
 const store=useVRank(),held=deferred<unknown>();store.bindAccount('user:A');await Promise.resolve();await Promise.resolve();const oldRuntime=captureRuntimeRevision();
 remote.vRankApi.current.mockReturnValueOnce(held.promise);store.bindAccount('user:B');const count=remote.vRankApi.current.mock.calls.length;
 await store.refreshCanonicalVRank({accountKey:'user:A',epoch:1},oldRuntime);expect(remote.vRankApi.current).toHaveBeenCalledTimes(count);
 held.resolve(current);await vi.waitFor(()=>expect(store.remoteReady).toBe(true));expect(store.myRank).toBe(2);
});
