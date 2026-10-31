import * as Vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import { afterEach, expect, it, vi } from 'vitest';
import source from './leaderboard.vue?raw';
import { mountEntry, all, text, flush, slot } from '@/lib/entry-review.test-support';
import { teamPrivacyFixture } from './team-privacy.test-support';
import { createTeamInsightsApi } from '@/api/team-insights-api';
import type { ApiClient } from '@/api/api-client';
import { leaderboardPointsCopy } from '@/i18n/leaderboard-points-copy';
import { formatComputePoints } from '@/i18n/compute-points';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';

const stops: Array<() => void> = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); });
function row(rank: number, computePoints: number | null) {
  return { rank, computePoints, earnedUSDT: 9111 + rank, handle: `Member ${rank}`, flag: '', cc: '', directs: 7, teamSize: 23, delta: 0, vRank: 6, hasDevice: true };
}
function snapshot(period = 'week') {
  return { source: 'server', sourceEnvironment: 'PRODUCTION', serverCanonical: true, runId: '', period,
    rankingMetric: 'COMPUTE_POINTS', rows: [row(1, 3421), row(2, 0), row(3, null)], myRank: 2,
    gapToNextComputePoints: 3421, gapToNext: 98765, page: 1, pageSize: 20, totalRows: 3, poolUsd: 765432, topN: 3,
    generatedAt: '2026-10-28T00:00:00Z', snapshotAt: '2026-10-28T00:00:00Z', snapshotVersion: 'a'.repeat(64),
  };
}
async function page(language: 'en' | 'zh' | 'vi', result: (url: URL) => unknown = url => snapshot(url.searchParams.get('period')!)) {
  const { visibility, dependency } = teamPrivacyFixture();
  const shown: Array<() => void> = [];
  const request = vi.fn(async ({ path }: { path: string }) => result(new URL(path, 'https://fixture.invalid')));
  const navTo = vi.fn(), locale = Vue.reactive({ code: language });
  const deps: Record<string, unknown> = {
    '@/store/data-visibility': dependency, '@/store/locale': { useLocaleStore: () => locale },
    '@/i18n/use-t': { useT: () => Vue.computed(() => ({ en, zh, vi: vietnamese })[locale.code]) },
    '@/store/auth': { useAuth: () => Vue.reactive({ isAuthenticated: true }) },
    '@/store/app': { useApp: () => Vue.reactive({ accountKey: 'one', accountBindingEpoch: 1 }) },
    '@/api/runtime': { remoteApiEnabled: true, apiRuntimeConfig: { environment: 'prod', baseUrl: 'https://fixture.invalid' }, teamInsightsApi: createTeamInsightsApi({ request } as unknown as ApiClient) },
    '@dcloudio/uni-app': { onShow: (fn: () => void) => shown.push(fn), onHide: vi.fn() },
    '@/lib/account-scope': { captureAccountScope: () => 'one', isCurrentAccountScope: () => true },
    '@/api/order-api': { captureRuntimeRevision: () => 1, isCurrentRuntimeRevision: () => true, subscribeRuntimeRevision: () => () => {} },
    '@/lib/route': { navTo },
  };
  for (const match of parse(source).descriptor.scriptSetup!.content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const id = match[1];
    if (id !== 'vue' && !(id in deps)) deps[id] = id.endsWith('.vue') ? slot : await vi.importActual(id);
  }
  const p = mountEntry(source, deps); stops.push(p.unmount);
  shown.forEach(fn => fn()); await flush();
  return { ...p, visibility, request, navTo, show: async () => { shown.forEach(fn => fn()); await flush(); } };
}
const presentation = (root: Parameters<typeof text>[0]) => text(root) + all(root).map(node =>
  ['aria-label', 'aria-valuetext', 'title'].map(key => String(node.props[key] ?? '')).join(' ')).join(' ');

for (const language of ['en', 'zh', 'vi'] as const) for (const period of ['today', 'week', 'month', 'all']) {
  it(`${language}/${period} displays independent points, zero, unknown and gap, then masks/restores them`, async () => {
    const p = await page(language);
    p.nodes('nx-leader-periods')[0].props.onSelect(period); await flush();
    expect(p.request.mock.calls.at(-1)![0].path).toContain(`period=${period}`);
    expect(presentation(p.root)).toContain(leaderboardPointsCopy(language).title);
    // Chinese podium points carry a short visual unit; unknown points never get one.
    const unit = language === 'zh' ? ' 点' : '';
    expect(p.nodes('leader-points').map(text)).toEqual([formatComputePoints(3421, language).split(' ')[0] + unit, '0' + unit, '—']);
    expect(p.nodes('leader-points').map(node => all(node).find(child => child.props['aria-label'])!.props['aria-label'])).toEqual([formatComputePoints(3421, language), formatComputePoints(0, language), '—']);
    expect(text(p.nodes('leader-gap')[0])).toContain(formatComputePoints(3421, language));
    expect(presentation(p.root)).not.toMatch(/\$|USDT|USD|98,765|98765|765432/);
    const before = presentation(p.root), reads = p.request.mock.calls.length;
    p.visibility.toggle(); await flush();
    expect(p.nodes('leader-points').map(text)).toEqual(['••••', '••••', '••••']);
    expect(text(p.nodes('leader-gap')[0])).toBe('••••');
    expect(p.nodes('leader-row').every(node => node.props['data-rank'] === undefined)).toBe(true);
    expect(presentation(p.root)).not.toContain(formatComputePoints(3421, language));
    expect(presentation(p.root)).not.toContain('V6'); expect(p.request).toHaveBeenCalledTimes(reads);
    p.visibility.toggle(); await flush(); expect(presentation(p.root)).toBe(before);
  });
}
it.each([undefined, null, 'USDT'])('does not reuse money ranks when the metric is %s, even with point values attached', async metric => {
  const p = await page('en', () => ({ ...snapshot(), rankingMetric: metric }));
  expect(text(p.root)).toContain(leaderboardPointsCopy('en').unavailable);
  expect(p.nodes('leader-row')).toHaveLength(0); expect(p.nodes('leader-more')).toHaveLength(0);
  expect(text(p.nodes('leader-my-rank')[0])).not.toContain('#2');
  expect(text(p.nodes('leader-gap')[0])).toBe('—'); expect(text(p.root)).not.toContain('98,765');
});
it('legacy formal fields alone remain unavailable, while a valid empty points board is not unavailable', async () => {
  const p = await page('en', () => {
    const data: any = snapshot(); delete data.rankingMetric; delete data.gapToNextComputePoints;
    data.rows.forEach((item: any) => delete item.computePoints); return data;
  });
  expect(p.nodes('leader-row')).toHaveLength(0); expect(text(p.root)).toContain(leaderboardPointsCopy('en').unavailable);
  const empty = await page('en', () => ({ ...snapshot(), rows: [], myRank: null, totalRows: 0, gapToNextComputePoints: null }));
  expect(text(empty.root)).not.toContain(leaderboardPointsCopy('en').unavailable);
  expect(text(empty.root)).toContain(en.leaderboard.myRank.notRanked);
});
it.each([null, 0])('a missing/zero point gap (%s) never falls back to the money gap', async gap => {
  const p = await page('en', () => ({ ...snapshot(), gapToNextComputePoints: gap }));
  expect(text(p.nodes('leader-gap')[0])).toBe(gap === null ? '—' : '0 compute pts behind the next rank');
});
it.each(['metric', 'order', 'version'])('rejects a %s change on a continuation without mixing rows', async mismatch => {
  const first = { ...snapshot(), rows: Array.from({ length: 20 }, (_, i) => row(i + 1, 200 - i)), totalRows: 21 };
  const next = { ...first, page: 2, rows: [row(21, mismatch === 'order' ? 500 : 180)],
    rankingMetric: mismatch === 'metric' ? 'USDT' : 'COMPUTE_POINTS', snapshotVersion: (mismatch === 'version' ? 'b' : 'a').repeat(64) };
  const p = await page('en', url => url.searchParams.get('page') === '2' ? next : first);
  p.nodes('leader-more')[0].props.onClick(); await flush();
  expect(p.nodes('leader-row')).toHaveLength(20); expect(text(p.nodes('leader-more')[0])).toContain(en.leaderboard.retry);
  expect(p.request.mock.calls[1][0].path).toContain('snapshotVersion=' + 'a'.repeat(64));
});
it('appends a coherent point page without sorting by money', async () => {
  const first = { ...snapshot(), rows: Array.from({ length: 20 }, (_, i) => row(i + 1, 200 - i)), totalRows: 21 };
  const p = await page('en', url => url.searchParams.get('page') === '2' ? { ...first, page: 2, rows: [row(21, 180)] } : first);
  p.nodes('leader-more')[0].props.onClick(); await flush();
  expect(p.nodes('leader-row').map(node => node.props['data-rank'])).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  expect(text(p.nodes('leader-points')[20])).toBe('180');
  expect(all(p.nodes('leader-points')[20]).find(node => node.props['aria-label'])!.props['aria-label']).toBe('180 compute pts');
  expect(p.nodes('leader-more')).toHaveLength(0);
});
