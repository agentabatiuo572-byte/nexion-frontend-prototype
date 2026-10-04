import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { market24hSummary } from "@/lib/market-24h-summary";
import { marketSampleTimestamp, type TimestampedMarketSample } from "@/lib/market-history-window";

const { fetchNex } = vi.hoisted(() => ({
  fetchNex: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  marketApi: { fetch: fetchNex },
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
  history: [],
  historyMaxDays: 365,
  source: "G3 weekly_curve + nx_price_index sampled history",
  sourceEnvironment: "PRODUCTION" as const,
  runId: "",
};

const NOW = Date.UTC(2026, 7, 31, 0, 0, 0);
const HOUR = 60 * 60 * 1000;

function sample(price: number, at: number): TimestampedMarketSample {
  return { price, sampledAt: new Date(at).toISOString(), sampledAtEpochMs: at };
}

function continuous24hSamples(): TimestampedMarketSample[] {
  return Array.from({ length: 49 }, (_, index) => sample(0.1 + index / 10000, NOW - 24 * HOUR + index * 30 * 60 * 1000));
}

function legacyBusinessTimestamp(at: number): string {
  return new Date(at + 8 * HOUR).toISOString().replace("T", " ").slice(0, 19);
}

describe("NEX market refresh concurrency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchNex.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
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

  it("keeps the current quote but rejects the weekly curve and a stale sample as a 24h return", async () => {
    fetchNex.mockResolvedValue({
      ...nexSnapshot,
      history: [{ price: 0.125, sampledAt: "2026-08-20 12:08:11" }],
    });
    const market = useMarket();

    await expect(market.syncRemote()).resolves.toBe(true);

    expect(market.remoteReady).toBe(true);
    expect(market.nexPriceUSDT).toBe(0.125);
    expect(market.change24hAvailable).toBe(false);
    expect(market.klineHourly).toEqual([]);
    expect(market.open24h).toBe(0);
  });

  it("uses only a continuous real 24h history when publishing the return", async () => {
    const history = continuous24hSamples();
    fetchNex.mockResolvedValue({ ...nexSnapshot, currentPrice: 0.11, history });
    const market = useMarket();

    await expect(market.syncRemote()).resolves.toBe(true);

    expect(market.change24hAvailable).toBe(true);
    expect(market.open24h).toBe(history[0].price);
    expect(market.klineHourly).toEqual(history.map((point) => point.price));
    expect(market.change24hPct).toBeCloseTo(10, 5);
  });

  it("does not refetch the complete market history on each three-second wallet tick", async () => {
    fetchNex.mockResolvedValue(nexSnapshot);
    const market = useMarket();

    await market.syncRemote();
    await market.tickPrice();
    await market.tickPrice();

    expect(fetchNex).toHaveBeenCalledTimes(1);
  });

  it("keeps one canonical request in flight without a sandbox-run reset", async () => {
    const oldNex = deferred<typeof nexSnapshot>();
    fetchNex.mockReturnValue(oldNex.promise);
    const market = useMarket();

    const first = market.syncRemote();
    const second = market.syncRemote();
    oldNex.resolve(nexSnapshot);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(fetchNex).toHaveBeenCalledTimes(1);
    expect(market.marketRunId).toBe("");
    expect(market.nexPriceUSDT).toBe(0.125);
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

describe("NEX 24h market summary", () => {
  it("accepts an exact 24h boundary and last quote when no gap exceeds one hour", () => {
    const summary = market24hSummary(continuous24hSamples(), 0.11, NOW);

    expect(summary).toMatchObject({ open: 0.1, high: 0.11, low: 0.1 });
    expect(summary?.changePct).toBeCloseTo(10, 8);
  });

  it("rejects a cross-day boundary, a stale last sample, and an internal outage", () => {
    expect(market24hSummary([
      sample(0.1, NOW - 30 * HOUR),
      sample(0.11, NOW),
    ], 0.11, NOW)).toBeNull();
    expect(market24hSummary([
      sample(0.1, NOW - 24 * HOUR),
      sample(0.11, NOW - 2 * HOUR),
    ], 0.11, NOW)).toBeNull();
    expect(market24hSummary([
      sample(0.1, NOW - 24 * HOUR),
      sample(0.105, NOW - 3 * HOUR),
      sample(0.11, NOW),
    ], 0.11, NOW)).toBeNull();
  });

  it("parses legacy business-zone timestamps without changing their instant", () => {
    expect(marketSampleTimestamp({ price: 0.1, sampledAt: "2026-08-31 08:00:00" }))
      .toBe(Date.UTC(2026, 7, 31, 0, 0, 0));
    const history = Array.from({ length: 25 }, (_, index) => ({
      price: 0.1 + index / 2400,
      sampledAt: legacyBusinessTimestamp(NOW - 24 * HOUR + index * HOUR),
    }));
    const summary = market24hSummary(history, 0.11, NOW);
    expect(summary?.open).toBe(0.1);
    expect(summary?.changePct).toBeCloseTo(10, 8);
  });
});
