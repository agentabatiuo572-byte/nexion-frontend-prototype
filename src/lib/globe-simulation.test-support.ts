import { GLOBE_CENTERS as metadata, globeSimulation as configured, type GlobeDisplayConfig } from "./globe-simulation";

// Server response fixture; production clients intentionally contain no numeric fallback.
export const TEST_GLOBE_CONFIG: GlobeDisplayConfig = {
  intervalMs: 5400, nodeJitterPct: .4, activeJobsMinPct: 8, activeJobsMaxPct: 14,
  throughputMin: 2.2, throughputMax: 3.8, latencyJitterMs: 6,
  centers: [
    { id: "sg", nodes: 236000, latencyMs: 18 }, { id: "jp", nodes: 253000, latencyMs: 22 },
    { id: "vn", nodes: 163000, latencyMs: 26 }, { id: "uk", nodes: 249000, latencyMs: 16 },
    { id: "fr", nodes: 208000, latencyMs: 20 }, { id: "de", nodes: 217000, latencyMs: 14 },
    { id: "us-ny", nodes: 316000, latencyMs: 24 }, { id: "us-sj", nodes: 284000, latencyMs: 17 },
  ],
};
export const GLOBE_SIMULATION_INTERVAL_MS = TEST_GLOBE_CONFIG.intervalMs;
export const GLOBE_CENTERS = metadata.map(center => {
  const values = TEST_GLOBE_CONFIG.centers.find(row => row.id === center.id)!;
  return { ...center, nodes: values.nodes, latency: values.latencyMs };
});
export const globeSimulation = (step: number) => configured(step, TEST_GLOBE_CONFIG)!;
