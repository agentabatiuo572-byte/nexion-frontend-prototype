import { marketSampleTimestamp, selectMarketHistoryWindow, type TimestampedMarketSample } from "./market-history-window";

/** A sparse weekly curve, stale quote or incomplete day must never become a 24h return. */
export function market24hSummary(samples: readonly TimestampedMarketSample[], currentPrice: number, now = Date.now()) {
  const selected = selectMarketHistoryWindow(samples, "24H", now);
  if (selected.length < 2 || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const times = selected.map(point => marketSampleTimestamp(point)!);
  const cutoff = now - 86400000;
  // Real history is sampled every five minutes; allow one hour of sparse data,
  // never bridge an outage or use a months-old boundary as today's open.
  const maxGap = 3600000;
  if (cutoff - times[0] > maxGap || now - times[times.length - 1] > maxGap
      || times.some((time, index) => index > 0 && time - times[index - 1] > maxGap)) return null;
  const prices = selected.map(point => point.price);
  const open = prices[0];
  return { open, high: Math.max(...prices, currentPrice), low: Math.min(...prices, currentPrice),
    changePct: ((currentPrice - open) / open) * 100, prices };
}
