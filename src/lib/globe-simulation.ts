/** Geographic metadata only; every displayed metric and its variation comes from H9. */
export const GLOBE_CENTERS = [
  { id: "sg", nameKey: "centerSingapore", lat: 1.35, lon: 103.82 },
  { id: "jp", nameKey: "centerTokyo", lat: 35.68, lon: 139.69 },
  { id: "vn", nameKey: "centerHoChiMinh", lat: 10.82, lon: 106.63 },
  { id: "uk", nameKey: "centerLondon", lat: 51.51, lon: -0.13 },
  { id: "fr", nameKey: "centerParis", lat: 48.86, lon: 2.35 },
  { id: "de", nameKey: "centerFrankfurt", lat: 50.11, lon: 8.68 },
  { id: "us-ny", nameKey: "centerNewYork", lat: 40.71, lon: -74.01 },
  { id: "us-sj", nameKey: "centerSanJose", lat: 37.34, lon: -121.89 },
] as const;
export type GlobeDisplayConfig = {
  intervalMs: number; nodeJitterPct: number; activeJobsMinPct: number; activeJobsMaxPct: number;
  throughputMin: number; throughputMax: number; latencyJitterMs: number;
  centers: { id: string; nodes: number; latencyMs: number }[];
};

/** One boundary for the optional H9 projection. Invalid input leaves this module unavailable. */
export function parseGlobeDisplay(value: unknown): GlobeDisplayConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const limits = { intervalMs: [1000, 86400000], nodeJitterPct: [0, 100], activeJobsMinPct: [0, 100],
    activeJobsMaxPct: [0, 100], throughputMin: [0, 10000], throughputMax: [0, 10000], latencyJitterMs: [0, 60000] };
  for (const [key, [min, max]] of Object.entries(limits)) {
    const number = raw[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max) return undefined;
    const [mantissa, exponent = '0'] = String(number).split('e');
    if ((mantissa.split('.')[1]?.length ?? 0) - Number(exponent) > 6) return undefined;
  }
  if (!Number.isInteger(raw.intervalMs) || !Number.isInteger(raw.latencyJitterMs)
      || (raw.activeJobsMinPct as number) > (raw.activeJobsMaxPct as number)
      || (raw.throughputMin as number) > (raw.throughputMax as number)
      || !Array.isArray(raw.centers) || raw.centers.length !== GLOBE_CENTERS.length) return undefined;
  const seen = new Set<string>();
  for (const row of raw.centers) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
    const center = row as Record<string, unknown>;
    if (typeof center.id !== "string" || !GLOBE_CENTERS.some(meta => meta.id === center.id) || seen.has(center.id)
        || typeof center.nodes !== "number" || !Number.isInteger(center.nodes) || center.nodes < 0 || center.nodes > 100000000
        || typeof center.latencyMs !== "number" || !Number.isInteger(center.latencyMs) || center.latencyMs < 0 || center.latencyMs > 60000) return undefined;
    seen.add(center.id);
  }
  return raw as GlobeDisplayConfig;
}
function noise(seed: number, slot: number): number {
  let value = Math.imul((slot | 0) ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
// Interpolate independent random anchors: no rerender randomness or abrupt jumps.
function drift(seed: number, step: number): number {
  const slot = Math.floor(step / 12), fraction = (step % 12) / 12;
  const weight = fraction * fraction * (3 - 2 * fraction);
  return noise(seed, slot) * (1 - weight) + noise(seed, slot + 1) * weight;
}
export function globeSimulation(step: number, config: GlobeDisplayConfig | undefined) {
  if (!config) return null;
  const tick = Number.isFinite(step) ? Math.max(0, Math.floor(step)) : 0;
  const regions = GLOBE_CENTERS.map((center, i) => {
    const seed = (i + 1) * 101;
    const configured = config.centers.find(row => row.id === center.id)!;
    const onlineNodes = configured.nodes + Math.round(configured.nodes * config.nodeJitterPct / 100 * drift(seed, tick));
    const activeJobs = Math.round(onlineNodes * (config.activeJobsMinPct + (config.activeJobsMaxPct - config.activeJobsMinPct) * drift(seed + 17, tick)) / 100);
    return { ...center, nodes: configured.nodes, onlineNodes, activeJobs,
      jobsPerHour: Math.round(activeJobs * (config.throughputMin + (config.throughputMax - config.throughputMin) * drift(seed + 29, tick))),
      avgLatencyMs: Math.round(configured.latencyMs + config.latencyJitterMs * drift(seed + 43, tick)),
    };
  });
  return { regions, nodes: regions.reduce((sum, row) => sum + row.onlineNodes, 0),
    jobs: regions.reduce((sum, row) => sum + row.activeJobs, 0) };
}
