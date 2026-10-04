import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  networkRankApi: { snapshot: vi.fn() },
}));
vi.mock("@/api/runtime", () => remote);

const { useNetworkRank } = await import("./network-rank");
const { advanceRuntimeRevision } = await import("@/api/order-api");

beforeEach(() => {
  setActivePinia(createPinia());
  remote.networkRankApi.snapshot.mockReset();
  advanceRuntimeRevision(null);
});

afterEach(() => {
  useNetworkRank().$dispose();
  advanceRuntimeRevision(null);
});

describe("network rank refresh single-flight", () => {
  it("coalesces duplicate lifecycle refreshes and keeps a short healthy snapshot window", async () => {
    advanceRuntimeRevision("rank-run-a-20260819");
    let release!: (value: unknown) => void;
    remote.networkRankApi.snapshot.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const store = useNetworkRank();
    store.bindAccount("user:7");

    const first = store.refresh();
    const duplicate = store.refresh();
    expect(remote.networkRankApi.snapshot).toHaveBeenCalledTimes(1);
    release({ currentRank: 4, rankChange24h: null });
    await expect(Promise.all([first, duplicate])).resolves.toEqual([true, true]);

    await expect(store.refresh()).resolves.toBe(true);
    expect(remote.networkRankApi.snapshot).toHaveBeenCalledTimes(1);
  });

  it("invalidates a healthy snapshot and force-refreshes when the commerce Run changes", async () => {
    remote.networkRankApi.snapshot
      .mockResolvedValueOnce({ currentRank: 4, rankChange24h: null })
      .mockResolvedValueOnce({ currentRank: 9, rankChange24h: null });
    advanceRuntimeRevision("rank-run-a-20260819");
    const store = useNetworkRank();
    store.bindAccount("user:7");
    await expect(store.refresh()).resolves.toBe(true);
    expect(store.snapshot?.currentRank).toBe(4);

    advanceRuntimeRevision("rank-run-b-20260819");

    expect(store.snapshot).toBeNull();
    await vi.waitFor(() => expect(remote.networkRankApi.snapshot).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(store.snapshot?.currentRank).toBe(9));
    expect(store.status).toBe("ready");
  });

  it("keeps the last successful rank visible and reports a retryable error when a later read is offline", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    remote.networkRankApi.snapshot
      .mockResolvedValueOnce({ currentRank: 4, rankChange24h: null })
      .mockRejectedValueOnce(new Error("NETWORK_OFFLINE"));
    const store = useNetworkRank();
    store.bindAccount("user:7");

    await expect(store.refresh()).resolves.toBe(true);
    clock.mockReturnValue(now + 10_001);
    await expect(store.refresh()).resolves.toBe(false);

    expect(store.snapshot).toEqual({ currentRank: 4, rankChange24h: null });
    expect(store.status).toBe("error");
    clock.mockRestore();
  });
});
