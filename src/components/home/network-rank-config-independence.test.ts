// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { publicStatsHealth, compactNumber } from '@/lib/platform-stats';
import { computeRank } from '@/lib/network-rank';

const source = readFileSync(new URL('./network-pulse-card.vue', import.meta.url), 'utf8');
const start = source.indexOf('function placeholderCell(');
const end = source.indexOf('</script>', start);
if (start < 0 || end < 0) throw new Error('Actual metrics implementation not found');
const implementation = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const compile = new Function('computed', 'cfg', 'health', 'registered', 'app', 'rank',
  't', 'compact', 'fmt', 'ramp', 'toast', 'navTo', 'rankSnapshotStale', 'displayDelta',
  'showSkeleton', 'remoteApiEnabled', 'remoteRank', `${implementation}; return metrics;`);

function scenario({ remote = true, failed = false, rankOk = false, kind = 'ranked', status = 'ready' } = {}) {
  const configRefresh = vi.fn();
  const rankRefresh = vi.fn();
  const messages = new Proxy({}, { get: (_, key) => key === 'networkStatUnverified' ? '-' : String(key) });
  const metrics = compile((run: () => unknown) => run(),
    { syncFailed: failed, config: { publicStats: { registeredUsersMonthlyGrowthPct: 1 } }, load: configRefresh },
    { value: { membersOk: true, devicesOk: true, rankOk } }, { value: 100 },
    { global: { activeDevices: 20 } }, { value: { kind, rank: 7 } },
    { value: { home: messages } }, String, (text: string) => text, () => [],
    { info: vi.fn() }, vi.fn(), { value: false }, { value: null },
    { value: true }, remote, { status, refresh: rankRefresh });
  return { metrics, configRefresh, rankRefresh };
}

describe('actual homepage remote ranking is independent of H9 estimates', () => {
  it('keeps a successful real rank when legacy virtual population is invalid', () => {
    expect(scenario().metrics[2].v).toBe('#7');
  });
  it('keeps a successful real rank when public configuration fails', () => {
    const { metrics, configRefresh } = scenario({ failed: true, rankOk: true });
    expect(metrics[2].v).toBe('#7');
    // Missing H9 display values remain placeholders and retain the existing retry.
    expect(metrics[0].v).toBe('-');
    expect(metrics[1].v).toBe('-');
    metrics[0].tap(); expect(configRefresh).toHaveBeenCalledOnce();
  });
  it('keeps an authoritative unranked state when public configuration fails', () => {
    expect(scenario({ failed: true, kind: 'unranked' }).metrics[2].v).toBe('networkRankUnranked');
  });
  it('retries the rank endpoint rather than H9 when the rank is unavailable', () => {
    const result = scenario({ kind: 'unavailable', status: 'error' });
    result.metrics[2].tap();
    expect(result.rankRefresh).toHaveBeenCalledOnce();
    expect(result.configRefresh).not.toHaveBeenCalled();
    expect(result.metrics[2].skeleton).toBe(false);
  });
  it('uses rank loading state for its own placeholder', () => {
    expect(scenario({ kind: 'unavailable', status: 'loading' }).metrics[2].skeleton).toBe(true);
  });
  it('preserves the configuration guard and retry for local estimates', () => {
    const result = scenario({ remote: false });
    expect(result.metrics[2].v).toBe('-');
    result.metrics[2].tap();
    expect(result.configRefresh).toHaveBeenCalledOnce();
    expect(result.rankRefresh).not.toHaveBeenCalled();
  });
});

it.each([en, zh, vietnamese])('renders actual network metric slots through missing, failure, zero and recovery', async copy => {
  const cfg = Vue.reactive({ loading: false, syncFailed: false,
    publicStatsAuthority: null as null | object,
    config: { publicStats: { realUserCount: undefined as number | undefined }, networkPulse: null as null | { registeredUsers: number | null; onlineDevices: number | null } }, load: vi.fn() });
  const remoteRank = Vue.reactive({ status: 'error', snapshot: null as null | { currentRank: number | null; rankChange24h: number | null }, refresh: vi.fn(), bindAccount: vi.fn() });
  const blank = { render: () => null };
  const dependencies: Record<string, unknown> = {
    vue: Vue, '@/i18n/use-t': { useT: () => Vue.ref(copy) }, '@/i18n/format': { fmt },
    '@/store/app': { useApp: () => ({ accountKey: 'user:1' }) }, '@/store/config': { useConfig: () => cfg },
    '@/store/rank-snapshot': { useRankSnapshot: () => ({}) }, '@/store/network-rank': { useNetworkRank: () => remoteRank },
    '@/api/runtime': { remoteApiEnabled: true }, '@/lib/network-rank': { computeRank },
    '@/lib/platform-stats': { publicStatsHealth, compactNumber }, '@/store/ui': { toast: { info: vi.fn() } },
    '@/lib/route': { navTo: vi.fn() }, './pulse-dot.vue': { default: blank }, './home-sparkline.vue': { default: blank },
  };
  const script = compileScript(parse(source).descriptor, { id: 'network-slots', inlineTemplate: true });
  const exports = { default: {} as Vue.Component };
  new Function('require', 'exports', ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText)((id: string) => { if (!(id in dependencies)) throw new Error(`Unexpected network import: ${id}`); return dependencies[id]; }, exports);
  const values = async () => [...(await renderToString(Vue.createSSRApp(exports.default)))
    .matchAll(/class="block mt-0.5 tabular-nums"[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
  expect(await values()).toEqual(['-', '-', '-']);
  cfg.syncFailed = true; expect(await values()).toEqual(['-', '-', '-']);
  cfg.syncFailed = false; cfg.publicStatsAuthority = {}; cfg.config.publicStats.realUserCount = 0; cfg.config.networkPulse = { registeredUsers: 0, onlineDevices: 0 };
  remoteRank.status = 'ready'; remoteRank.snapshot = { currentRank: 7, rankChange24h: null };
  expect(await values()).toEqual(['0', '0', '#7']);
  remoteRank.snapshot.currentRank = null; expect(await values()).toEqual(['0', '0', copy.home.networkRankUnranked]);
  remoteRank.snapshot = null; remoteRank.status = 'loading'; expect(await values()).toEqual(['0', '0']);
  remoteRank.status = 'error'; expect(await values()).toEqual(['0', '0', '-']);
  cfg.config.networkPulse = { registeredUsers: 999999, onlineDevices: 28432 };
  cfg.config.publicStats.realUserCount = 12345;
  remoteRank.status = 'ready'; remoteRank.snapshot = { currentRank: 7, rankChange24h: null };
  expect(await values()).toEqual([compactNumber(12345), compactNumber(28432), '#7']);
  cfg.config.networkPulse.onlineDevices = null;
  expect(await values()).toEqual([compactNumber(12345), '-', '#7']);
  cfg.syncFailed = true;
  expect(await values()).toEqual(['-', '-', '#7']);
  const html = await renderToString(Vue.createSSRApp(exports.default));
  expect(html).not.toContain('2026-10');
  expect(source).not.toContain('verifiedStats');
  expect(source).not.toContain('setInterval');
});
