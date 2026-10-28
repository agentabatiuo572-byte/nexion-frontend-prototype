import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api-client';
import { createTeamInsightsApi } from './team-insights-api';
import { LEADERBOARD, MY_RANK } from '@/mock/leaderboard';
// @ts-expect-error The loopback demo source is plain JavaScript.
import { secondaryDemo } from '../../scripts/lib/prototype-demo-secondary.mjs';

const snapshot = () => ({
  source: 'server', sourceEnvironment: 'PRODUCTION', serverCanonical: true, runId: '',
  period: 'week', rankingMetric: 'COMPUTE_POINTS', page: 1, pageSize: 20, totalRows: 3,
  rows: [1200, 800, 0].map((computePoints, index) => ({ rank: index + 1, handle: `Member ${index}`,
    flag: '', cc: '', directs: 1, teamSize: 2, computePoints, earnedUSDT: [10, 500, 1000][index], delta: 0, vRank: 2, hasDevice: true })),
  myRank: 2, gapToNextComputePoints: 400, gapToNext: 999, poolUsd: 5000, topN: 3, generatedAt: '2026-10-28T00:00:00Z',
});
function read(data: unknown) {
  return createTeamInsightsApi({ request: vi.fn().mockResolvedValue(data) } as unknown as ApiClient).leaderboard('week');
}

describe('UI-OPT-026 independent leaderboard points contract', () => {
  it('keeps points and their gap independent from commission amounts', async () => {
    const data = snapshot(), before = JSON.stringify(data), result = await read(data);
    expect(result.rankingMetric).toBe('COMPUTE_POINTS');
    expect(result.rows.map(row => row.computePoints)).toEqual([1200, 800, 0]);
    expect(result.gapToNextComputePoints).toBe(400);
    expect(result.gapToNext).toBe(999); expect(JSON.stringify(data)).toBe(before);
  });
  it('accepts a points-only response without legacy amount/gap fields', async () => {
    const data: any = snapshot(); delete data.gapToNext;
    data.rows.forEach((row: any) => delete row.earnedUSDT);
    const result = await read(data);
    expect(result.rows[0]).toMatchObject({ computePoints: 1200, earnedUSDT: null });
    expect(result).toMatchObject({ gapToNext: null, gapToNextComputePoints: 400 });
  });
  it('leaves missing points and gap unknown even when money is present', async () => {
    const data: any = snapshot(); delete data.rankingMetric; delete data.gapToNextComputePoints;
    data.rows.forEach((row: any) => delete row.computePoints);
    const result = await read(data);
    expect(result.rankingMetric).toBeNull(); expect(result.gapToNextComputePoints).toBeNull();
    expect(result.rows.every(row => row.computePoints === null)).toBe(true);
  });
  it.each(['computePoints', 'gapToNextComputePoints'])('preserves explicit null for %s', async field => {
    const data: any = snapshot();
    if (field === 'computePoints') data.rows[1][field] = null; else data[field] = null;
    const result = await read(data);
    expect(field === 'computePoints' ? result.rows[1].computePoints : result.gapToNextComputePoints).toBeNull();
  });
  for (const field of ['computePoints', 'gapToNextComputePoints']) it.each([-1, 1.5, '12', Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    `rejects invalid ${field} (%s) at the API boundary`, async value => {
      const data: any = snapshot();
      if (field === 'computePoints') data.rows[0][field] = value; else data[field] = value;
      await expect(read(data)).rejects.toMatchObject({ message: 'TEAM_INSIGHTS_RESPONSE_INVALID' });
    },
  );
  it('rejects ascending point values under a declared descending ranking', async () => {
    const data = snapshot(); data.rows[1].computePoints = 1400;
    await expect(read(data)).rejects.toMatchObject({ message: 'TEAM_INSIGHTS_RESPONSE_INVALID' });
  });
  it('keeps zero gaps and stable server tie positions', async () => {
    const data = snapshot(); data.rows[1].computePoints = 1200; data.gapToNextComputePoints = 0;
    const result = await read(data);
    expect(result.gapToNextComputePoints).toBe(0); expect(result.rows.map(row => row.rank)).toEqual([1, 2, 3]);
  });
  it.each(['today', 'week', 'month', 'all'] as const)('%s mocks use independent point snapshots and actual point gaps', async period => {
    const rows = LEADERBOARD[period];
    expect(rows.every((row, index) => row.computePoints !== row.earnedUSDT && Number.isSafeInteger(row.computePoints)
      && row.rank === index + 1 && (index === 0 || row.computePoints! <= rows[index - 1].computePoints!))).toBe(true);
    const me = MY_RANK[period];
    expect(me.gapToNextComputePoints).toBe(rows[me.rank - 2].computePoints! - rows[me.rank - 1].computePoints!);
    const demo = secondaryDemo(new URL(`http://localhost/api/app/team/insights/leaderboard?period=${period}`), { dataState: 'normal' }, {});
    const result = await createTeamInsightsApi({ request: vi.fn().mockResolvedValue(demo) } as unknown as ApiClient).leaderboard(period);
    expect(result.rankingMetric).toBe('COMPUTE_POINTS');
    expect(result.gapToNextComputePoints).toBe(result.rows[1].computePoints! - result.rows[2].computePoints!);
    expect(result.rows[0].computePoints).toBeGreaterThan(result.rows[1].computePoints!);
    expect(result.rows[0].earnedUSDT).toBeLessThan(result.rows[1].earnedUSDT!);
  });
});
