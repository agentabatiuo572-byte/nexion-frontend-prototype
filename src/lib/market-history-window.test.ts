import { describe, expect, it } from "vitest";

import { selectMarketHistoryWindow } from "./market-history-window";

const NOW = Date.parse("2026-08-31T12:00:00Z");
const samples = [
  { price: 0.09, sampledAt: "2025-08-30T12:00:00Z" },
  { price: 0.10, sampledAt: "2026-07-01T12:00:00Z" },
  { price: 0.11, sampledAt: "2026-08-01T12:00:00Z" },
  { price: 0.12, sampledAt: "2026-08-24T12:00:00Z" },
  { price: 0.13, sampledAt: "2026-08-30T12:00:00Z" },
  { price: 0.14, sampledAt: "2026-08-31T11:00:00Z" },
  { price: 0.15, sampledAt: "2026-08-31T11:30:00Z" },
  { price: 0.16, sampledAt: "2026-08-31T11:50:00Z" },
];

describe("market history timeframe selection", () => {
  it("uses the server sample timestamps for each advertised window", () => {
    expect(selectMarketHistoryWindow(samples, "1H", NOW).map((row) => row.price)).toEqual([0.14, 0.15, 0.16]);
    expect(selectMarketHistoryWindow(samples, "24H", NOW).map((row) => row.price)).toEqual([0.13, 0.14, 0.15, 0.16]);
    expect(selectMarketHistoryWindow(samples, "7D", NOW).map((row) => row.price)).toEqual([0.12, 0.13, 0.14, 0.15, 0.16]);
    expect(selectMarketHistoryWindow(samples, "1M", NOW).map((row) => row.price)).toEqual([0.11, 0.12, 0.13, 0.14, 0.15, 0.16]);
    expect(selectMarketHistoryWindow(samples, "1Y", NOW).map((row) => row.price)).toEqual([0.09, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16]);
  });

  it("does not fabricate a curve when a timeframe has fewer than two verified samples", () => {
    expect(selectMarketHistoryWindow(samples.slice(6), "1H", NOW)).toEqual([]);
  });

  it("uses a server epoch when present and treats legacy zone-less G3 timestamps as Asia/Shanghai", () => {
    const zoned = selectMarketHistoryWindow([
      { price: 0.11, sampledAt: "2026-08-31 19:00:00" },
      { price: 0.12, sampledAt: "2026-08-31 19:30:00" },
      { price: 0.13, sampledAt: "2026-08-31 19:50:00" },
    ], "1H", NOW);
    expect(zoned.map((point) => point.price)).toEqual([0.11, 0.12, 0.13]);

    const epoch = selectMarketHistoryWindow([
      { price: 0.11, sampledAt: "invalid", sampledAtEpochMs: NOW - 70 * 60 * 1000 },
      { price: 0.12, sampledAt: "invalid", sampledAtEpochMs: NOW - 10 * 60 * 1000 },
    ], "1H", NOW);
    expect(epoch.map((point) => point.price)).toEqual([0.11, 0.12]);
  });
});
