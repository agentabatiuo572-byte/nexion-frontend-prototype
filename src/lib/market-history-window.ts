export type MarketTimeframe = "1H" | "24H" | "7D" | "1M" | "1Y";

export interface TimestampedMarketSample {
  price: number;
  sampledAt: string;
  sampledAtEpochMs?: number;
}

const WINDOW_MS: Partial<Record<MarketTimeframe, number>> = {
  "1H": 60 * 60 * 1000,
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
};

export function marketSampleTimestamp(sample: TimestampedMarketSample): number | null {
  if (Number.isFinite(sample.sampledAtEpochMs)) return sample.sampledAtEpochMs as number;
  const value = sample.sampledAt;
  // Legacy G3 DATETIME values are Asia/Shanghai local times. New payloads carry
  // sampledAtEpochMs, so browser parsing never has to infer a business zone.
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(value)
    ? `${value.replace(" ", "T")}+08:00`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Select only samples whose server timestamp belongs to the requested period.
 * No point is synthesized: callers get an empty result when the authority has
 * not supplied enough verified history to draw a chart.
 */
export function selectMarketHistoryWindow(
  samples: readonly TimestampedMarketSample[],
  timeframe: MarketTimeframe,
  now = Date.now(),
): TimestampedMarketSample[] {
  const cutoff = now - (WINDOW_MS[timeframe] ?? 0);
  const verified = samples
    .map((sample) => ({ sample, at: marketSampleTimestamp(sample) }))
    .filter((entry): entry is { sample: TimestampedMarketSample; at: number } =>
      entry.at !== null && Number.isFinite(entry.sample.price) && entry.sample.price > 0
        && entry.at <= now)
    .sort((left, right) => left.at - right.at);
  // A selected range is only honest when its samples actually cover its start.
  // Include the closest boundary point before the cutoff if the server provided
  // one; do not stretch a recent 24h curve across a 7d or 1M label.
  const boundary = [...verified].reverse().find((entry) => entry.at <= cutoff);
  const inWindow = verified.filter((entry) => entry.at > cutoff);
  const selected = boundary ? [boundary, ...inWindow] : inWindow;
  return selected.length >= 2 && selected[0].at <= cutoff
    ? selected.map((entry) => entry.sample)
    : [];
}
