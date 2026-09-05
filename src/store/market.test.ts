import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchNex, runListeners } = vi.hoisted(() => ({
  fetchNex: vi.fn(),
  runListeners: new Set<(scope: { runId: string | null; epoch: number }) => void>(),
}));

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  marketApi: { fetch: fetchNex },
}));

vi.mock("@/api/order-api", () => ({
  subscribeCurrentCommerceSandboxRun: vi.fn((listener) => {
    runListeners.add(listener);
    return () => runListeners.delete(listener);
  }),
}));

import { useMarket } from "./market";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const nexSnapshot = {
  currentPrice: 0.125,
  costBasis: 0.085,
  sparkline: [0.1, 0.11, 0.12, 0.13, 0.12, 0.124, 0.125],
  history24h: [],
  source: "mock",
  sourceEnvironment: "SANDBOX" as const,
  runId: "market-concurrency-run-20260819",
};

describe("NEX market refresh concurrency", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchNex.mockReset();
    runListeners.clear();
  });

  it("joins concurrent NEX refreshes into one server request", async () => {
    const nex = deferred<typeof nexSnapshot>();
    fetchNex.mockReturnValue(nex.promise);
    const market = useMarket();

    const first = market.syncRemote();
    const second = market.syncRemote();
    nex.resolve(nexSnapshot);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(fetchNex).toHaveBeenCalledTimes(1);
    expect(market.remoteReady).toBe(true);
    expect(market.nexPriceUSDT).toBe(0.125);
  });

  it("starts a fresh NEX refresh when the commerce Run changes during an old request", async () => {
    const oldNex = deferred<typeof nexSnapshot>();
    fetchNex.mockReturnValueOnce(oldNex.promise);
    const market = useMarket();

    const staleRefresh = market.syncRemote();
    fetchNex.mockResolvedValueOnce({ ...nexSnapshot, runId: "next-market-run-20260819", currentPrice: 0.2 });
    runListeners.forEach((listener) => listener({ runId: "next-market-run-20260819", epoch: 2 }));
    oldNex.resolve(nexSnapshot);

    await expect(staleRefresh).resolves.toBe(false);
    await vi.waitFor(() => expect(market.remoteReady).toBe(true));
    expect(fetchNex).toHaveBeenCalledTimes(2);
    expect(market.marketRunId).toBe("next-market-run-20260819");
    expect(market.nexPriceUSDT).toBe(0.2);
  });

  it("fails closed when the NEX authority is unavailable", async () => {
    fetchNex.mockRejectedValue(new Error("NEX timeout"));
    const market = useMarket();

    await expect(market.syncRemote()).resolves.toBe(false);

    expect(market.remoteReady).toBe(false);
    expect(market.nexPriceUSDT).toBe(0);
    expect(market.remoteError).toBe("G3_REMOTE_AUTHORITY_UNAVAILABLE");
  });
});
