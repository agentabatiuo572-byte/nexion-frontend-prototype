/** Presentation-only center samples; never write these into business telemetry. */
export const GLOBE_SIMULATION_INTERVAL_MS = 5400;
export const GLOBE_CENTERS = [
  { id: "sg", nameKey: "centerSingapore", nodes: 236000, lat: 1.35, lon: 103.82, latency: 18 },
  { id: "jp", nameKey: "centerTokyo", nodes: 253000, lat: 35.68, lon: 139.69, latency: 22 },
  { id: "vn", nameKey: "centerHoChiMinh", nodes: 163000, lat: 10.82, lon: 106.63, latency: 26 },
  { id: "uk", nameKey: "centerLondon", nodes: 249000, lat: 51.51, lon: -0.13, latency: 16 },
  { id: "fr", nameKey: "centerParis", nodes: 208000, lat: 48.86, lon: 2.35, latency: 20 },
  { id: "de", nameKey: "centerFrankfurt", nodes: 217000, lat: 50.11, lon: 8.68, latency: 14 },
  { id: "us-ny", nameKey: "centerNewYork", nodes: 316000, lat: 40.71, lon: -74.01, latency: 24 },
  { id: "us-sj", nameKey: "centerSanJose", nodes: 284000, lat: 37.34, lon: -121.89, latency: 17 },
] as const;
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
export function globeSimulation(step: number) {
  const tick = Number.isFinite(step) ? Math.max(0, Math.floor(step)) : 0;
  const regions = GLOBE_CENTERS.map((center, i) => {
    const seed = (i + 1) * 101;
    const onlineNodes = center.nodes + Math.round(center.nodes * .004 * drift(seed, tick));
    const activeJobs = Math.round(onlineNodes * (.08 + .06 * drift(seed + 17, tick)));
    return { ...center, onlineNodes, activeJobs,
      jobsPerHour: Math.round(activeJobs * (2.2 + 1.6 * drift(seed + 29, tick))),
      avgLatencyMs: Math.round(center.latency + 6 * drift(seed + 43, tick)),
    };
  });
  return { regions, nodes: regions.reduce((sum, row) => sum + row.onlineNodes, 0),
    jobs: regions.reduce((sum, row) => sum + row.activeJobs, 0) };
}
