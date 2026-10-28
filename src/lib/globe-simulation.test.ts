import { describe, expect, test } from "vitest";
import { GLOBE_CENTERS, GLOBE_SIMULATION_INTERVAL_MS, globeSimulation } from "./globe-simulation.test-support";
import { globeSimulation as configured, parseGlobeDisplay } from "./globe-simulation";
import { TEST_GLOBE_CONFIG } from "./globe-simulation.test-support";

describe("eight-center presentation simulation", () => {
  test("keeps the approved fixed nodes, city identities and 5.4-second interval", () => {
    expect(GLOBE_SIMULATION_INTERVAL_MS).toBe(5400);
    expect(GLOBE_CENTERS.map(({ id, nodes }) => [id, nodes])).toEqual([
      ["sg", 236000], ["jp", 253000], ["vn", 163000], ["uk", 249000],
      ["fr", 208000], ["de", 217000], ["us-ny", 316000], ["us-sj", 284000],
    ]);
    expect(GLOBE_CENTERS.reduce((sum, c) => sum + c.nodes, 0)).toBe(1926000);
    expect(new Set(GLOBE_CENTERS.map(c => c.nameKey)).size).toBe(8);
    for (const c of GLOBE_CENTERS) {
      expect(c.lat).toBeGreaterThanOrEqual(-90); expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lon).toBeGreaterThanOrEqual(-180); expect(c.lon).toBeLessThanOrEqual(180);
    }
  });

  test("stays within PRD magnitude bands and exactly aggregates all eight centers over time", () => {
    // Include every side of many anchor boundaries and current wall-clock-scale steps.
    const steps = [...Array.from({ length: 241 }, (_, i) => i), 331990001, 331990011, 331990012, 331990013];
    for (const step of steps) {
      const snapshot = globeSimulation(step);
      expect(snapshot.regions).toHaveLength(8);
      expect(snapshot.nodes).toBe(snapshot.regions.reduce((sum, c) => sum + c.onlineNodes, 0));
      expect(snapshot.jobs).toBe(snapshot.regions.reduce((sum, c) => sum + c.activeJobs, 0));
      expect(snapshot.nodes).toBeGreaterThanOrEqual(1926000);
      expect(snapshot.nodes).toBeLessThanOrEqual(1933704);
      snapshot.regions.forEach((c, i) => {
        const base = GLOBE_CENTERS[i];
        expect(c.nodes).toBe(base.nodes);
        expect(c.onlineNodes).toBeGreaterThanOrEqual(c.nodes);
        expect(c.onlineNodes).toBeLessThanOrEqual(c.nodes * 1.004);
        expect(c.activeJobs).toBeGreaterThanOrEqual(c.onlineNodes * .08 - .5);
        expect(c.activeJobs).toBeLessThanOrEqual(c.onlineNodes * .14 + .5);
        expect(c.jobsPerHour).toBeGreaterThanOrEqual(c.activeJobs * 2.2 - .5);
        expect(c.jobsPerHour).toBeLessThanOrEqual(c.activeJobs * 3.8 + .5);
        expect(c.avgLatencyMs).toBeGreaterThanOrEqual(base.latency);
        expect(c.avgLatencyMs).toBeLessThanOrEqual(base.latency + 6);
        for (const value of [c.onlineNodes, c.activeJobs, c.jobsPerHour, c.avgLatencyMs]) {
          expect(Number.isSafeInteger(value)).toBe(true);
          expect(value).toBeGreaterThan(0);
        }
      });
    }
  });

  test("changes smoothly across anchor boundaries without sudden jumps", () => {
    // Product-level per-refresh tolerances, rather than copying the interpolation formula.
    for (const start of [0, 331990000]) {
      let previous = globeSimulation(start);
      for (let step = start + 1; step <= start + 240; step++) {
        const current = globeSimulation(step);
        current.regions.forEach((c, i) => {
          const old = previous.regions[i];
          expect(Math.abs(c.onlineNodes - old.onlineNodes)).toBeLessThanOrEqual(c.nodes * .0006 + 1);
          expect(Math.abs(c.activeJobs - old.activeJobs)).toBeLessThanOrEqual(c.nodes * .009 + 2);
          expect(Math.abs(c.jobsPerHour - old.jobsPerHour)).toBeLessThanOrEqual(c.nodes * .065 + 3);
          expect(Math.abs(c.avgLatencyMs - old.avgLatencyMs)).toBeLessThanOrEqual(1);
        });
        previous = current;
      }
    }
  });

  test("varies every center and metric with independent, non-lockstep samples", () => {
    const samples = Array.from({ length: 25 }, (_, i) => globeSimulation(i * 12));
    for (let i = 0; i < 8; i++) {
      for (const metric of ["onlineNodes", "activeJobs", "jobsPerHour", "avgLatencyMs"] as const) {
        expect(new Set(samples.map(s => s.regions[i][metric])).size).toBeGreaterThan(2);
      }
    }
    const trajectories = GLOBE_CENTERS.map((c, i) => samples.map(s => (s.regions[i].onlineNodes - c.nodes) / c.nodes).join(","));
    expect(new Set(trajectories).size).toBe(8);
  });

  test("is reproducible by time slot and leaves config and previous snapshots untouched", () => {
    const config = JSON.stringify(GLOBE_CENTERS);
    const first = globeSimulation(123), saved = JSON.stringify(first);
    globeSimulation(124);
    expect(globeSimulation(123)).toEqual(first);
    expect(JSON.stringify(first)).toBe(saved);
    expect(JSON.stringify(GLOBE_CENTERS)).toBe(config);
    first.regions[0].activeJobs = -1;
    expect(globeSimulation(123).regions[0].activeJobs).toBeGreaterThan(0);
  });

  test.each([NaN, Infinity, -Infinity, -1])("normalizes invalid or negative step %s", step => {
    expect(globeSimulation(step)).toEqual(globeSimulation(0));
  });

  test("uses one stable snapshot for fractional positions within a step", () => {
    expect(globeSimulation(12.99)).toEqual(globeSimulation(12));
  });
});


test("only validated H9 values supply simulation metrics", () => {
  expect(configured(0, undefined)).toBeNull();
  const zero = { ...TEST_GLOBE_CONFIG, centers: TEST_GLOBE_CONFIG.centers.map(row => ({ ...row, nodes: 0 })) };
  expect(configured(0, parseGlobeDisplay(zero))!.nodes).toBe(0);
  expect(configured(0, parseGlobeDisplay(zero))!.jobs).toBe(0);
  expect(parseGlobeDisplay({ ...zero, intervalMs: 1001 })?.intervalMs).toBe(1001);
  expect(parseGlobeDisplay({ ...zero, nodeJitterPct: .000001 })?.nodeJitterPct).toBe(.000001);
  for (const invalid of [null, {}, { ...zero, intervalMs: 1000.1 }, { ...zero, nodeJitterPct: .0000001 },
    { ...zero, activeJobsMinPct: 20 }, { ...zero, centers: [...zero.centers.slice(1), zero.centers[1]] }]) {
    expect(parseGlobeDisplay(invalid)).toBeUndefined();
  }
  const maximum = parseGlobeDisplay({ ...zero, nodeJitterPct: 100, activeJobsMinPct: 100, activeJobsMaxPct: 100,
    throughputMin: 10000, throughputMax: 10000, centers: zero.centers.map(row => ({ ...row, nodes: 100000000 })) })!;
  for (const row of configured(123, maximum)!.regions) expect(Number.isSafeInteger(row.jobsPerHour)).toBe(true);
});
