/**
 * Globe region mock — ported from Nexion-prototype/lib/mock/globe-regions.ts.
 *
 * MOCK-ONLY worldwide node distribution. Production: GET /api/network/regions.
 * Normalised 0–1 coords drive node positions on the 440×240 dotmap canvas.
 */

export interface RegionData {
  id: string;
  i18nKey:
    | "regionAsia"
    | "regionEurope"
    | "regionNorthAm"
    | "regionMiddleEast"
    | "regionSouthAm"
    | "regionAfrica";
  cx: number;
  cy: number;
  devices: number;
  jobsPerHour: number;
  avgLatencyMs: number;
  isYou?: boolean;
}

export const MOCK_GLOBE_FIXTURE_ID = "globe-regions-fixture-v1";

export const REGIONS: RegionData[] = [
  {
    id: "ap",
    i18nKey: "regionAsia",
    cx: 0.78,
    cy: 0.52,
    devices: 12_840,
    jobsPerHour: 21_460,
    avgLatencyMs: 24,
    isYou: true, // user is in Singapore in the demo
  },
  {
    id: "eu",
    i18nKey: "regionEurope",
    cx: 0.5,
    cy: 0.38,
    devices: 7_120,
    jobsPerHour: 14_280,
    avgLatencyMs: 38,
  },
  {
    id: "na",
    i18nKey: "regionNorthAm",
    cx: 0.22,
    cy: 0.42,
    devices: 6_580,
    jobsPerHour: 12_140,
    avgLatencyMs: 31,
  },
  {
    id: "me",
    i18nKey: "regionMiddleEast",
    cx: 0.6,
    cy: 0.52,
    devices: 1_240,
    jobsPerHour: 2_180,
    avgLatencyMs: 45,
  },
  {
    id: "sa",
    i18nKey: "regionSouthAm",
    cx: 0.3,
    cy: 0.72,
    devices: 480,
    jobsPerHour: 720,
    avgLatencyMs: 78,
  },
  {
    id: "af",
    i18nKey: "regionAfrica",
    cx: 0.54,
    cy: 0.66,
    devices: 280,
    jobsPerHour: 420,
    avgLatencyMs: 92,
  },
];
