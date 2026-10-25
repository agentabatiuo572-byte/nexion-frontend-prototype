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
import { compactNumber } from '@/lib/platform-stats';

const source = readFileSync(new URL('./network-pulse-card.vue', import.meta.url), 'utf8');
const start = source.indexOf('function placeholderCell(');
const end = source.indexOf('</script>', start);
if (start < 0 || end < 0) throw new Error('Actual metrics implementation not found');
const implementation = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const compile = new Function('computed', 'cfg', 'rank', 't', 'compact', 'showSkeleton',
  'remoteApiEnabled', 'remoteRank', 'explainRank', `${implementation}; return metrics;`);

function scenario(kind = 'ranked', status = 'ready') {
  const configRefresh = vi.fn();
  const rankRefresh = vi.fn();
  const explain = vi.fn();
  const messages = new Proxy({}, { get: (_, key) => String(key) });
  const metrics = compile((run: () => unknown) => run(),
    { syncFailed: true, config: {}, load: configRefresh }, { value: { kind, rank: 7 } },
    { value: { home: messages } }, String, { value: false }, true,
    { status, snapshot: null, refresh: rankRefresh }, explain);
  return { metrics, configRefresh, rankRefresh, explain };
}

describe('homepage estimated device rank', () => {
  it('keeps the independently fetched estimate when the public configuration fails', () => {
    const { metrics, configRefresh, explain } = scenario();
    expect(metrics.map((cell: { v: string }) => cell.v)).toEqual(['-', '-', '#7']);
    metrics[0].tap(); expect(configRefresh).toHaveBeenCalledOnce();
    metrics[2].tap(); expect(explain).toHaveBeenCalledOnce();
    expect(metrics[2].sub).toBe('networkRankExplanation');
  });
  it('explains an unranked phone without directing users to buy unrelated devices', () => {
    const { metrics, explain } = scenario('unranked');
    expect(metrics[2].v).toBe('networkRankUnranked');
    metrics[2].tap(); expect(explain).toHaveBeenCalledOnce();
    expect(metrics[2].subTap).toBeUndefined();
  });
  it('offers retry for unavailable estimates and explains disabled ones without a numeric fallback', () => {
    const result = scenario('unavailable', 'error');
    expect(result.metrics[2].v).toBe('-');
    result.metrics[2].subTap(); expect(result.rankRefresh).toHaveBeenCalledOnce();
    expect(result.configRefresh).not.toHaveBeenCalled();
    const disabled = scenario('disabled');
    expect(disabled.metrics[2].v).toBe('-');
    expect(disabled.metrics[2].subTap).toBeUndefined();
    disabled.metrics[2].tap(); expect(disabled.explain).toHaveBeenCalledOnce();
  });
  it('uses rank loading state for its own empty placeholder', () => {
    expect(scenario('unavailable', 'loading').metrics[2].skeleton).toBe(true);
  });
});

it.each([en, zh, vietnamese])('renders actual network metric slots through missing, failure, zero and recovery', async copy => {
  const cfg = Vue.reactive({ loading: false, syncFailed: false,
    publicStatsAuthority: null as null | object,
    config: { publicStats: { realUserCount: undefined as number | undefined }, networkPulse: null as null | { registeredUsers: number | null; onlineDevices: number | null } }, load: vi.fn() });
  const remoteRank = Vue.reactive({ status: 'error', snapshot: null as null | { currentRank: number | null; state: string }, refresh: vi.fn(), bindAccount: vi.fn() });
  const blank = { render: () => null };
  const dependencies: Record<string, unknown> = {
    '@/components/ui/nx-section.vue': {default:{setup:(_p:any,{slots}:any)=>()=>Vue.h('view',slots.default?.())}},
    '@/i18n/audit-ui': {useAuditUiCopy:()=>Vue.ref({network:'Network',details:'Details'})},
    vue: Vue, '@/i18n/use-t': { useT: () => Vue.ref(copy) },
    '@/store/app': { useApp: () => ({ accountKey: 'user:1' }) }, '@/store/config': { useConfig: () => cfg },
    '@/store/network-rank': { useNetworkRank: () => remoteRank },
    '@/api/runtime': { remoteApiEnabled: true },
    '@/lib/platform-stats': { compactNumber }, '@/store/ui': { confirm: vi.fn() },
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
  remoteRank.status = 'ready'; remoteRank.snapshot = { currentRank: 7, state: 'ranked' };
  expect(await values()).toEqual(['0', '0', '#7']);
  remoteRank.snapshot = { currentRank: null, state: 'unranked' }; expect(await values()).toEqual(['0', '0', copy.home.networkRankUnranked]);
  remoteRank.snapshot = { currentRank: null, state: 'disabled' }; expect(await values()).toEqual(['0', '0', '-']);
  remoteRank.snapshot = { currentRank: null, state: 'unavailable' }; expect(await values()).toEqual(['0', '0', '-']);
  remoteRank.snapshot = { currentRank: 7, state: 'ranked' }; remoteRank.status = 'error'; expect(await values()).toEqual(['0', '0', '-']);
  remoteRank.snapshot = null; remoteRank.status = 'loading'; expect(await values()).toEqual(['0', '0']);
  remoteRank.status = 'error'; expect(await values()).toEqual(['0', '0', '-']);
  cfg.config.networkPulse = { registeredUsers: 12345, onlineDevices: 28432 };
  cfg.config.publicStats.realUserCount = 999999;
  remoteRank.status = 'ready'; remoteRank.snapshot = { currentRank: 7, state: 'ranked' };
  expect(await values()).toEqual([compactNumber(12345), compactNumber(28432), '#7']);
  cfg.config.networkPulse.onlineDevices = null;
  expect(await values()).toEqual([compactNumber(12345), '-', '#7']);
  cfg.syncFailed = true;
  expect(await values()).toEqual(['-', '-', '#7']);
  const html = await renderToString(Vue.createSSRApp(exports.default));
  expect(html).not.toContain('2026-10');
  expect(source).not.toContain('verifiedStats');
  expect(source).not.toContain('setInterval');
  expect(source).not.toContain('rankChange24h');
  expect(source).not.toContain('myTotalHashrate');
  expect(html).toContain(copy.home.networkYourRank);
});

it.each([en, zh, vietnamese])('opens the localized explanation for every state', copy => {
  const start = source.indexOf('function explainRank()');
  const end = source.indexOf('interface Cell', start);
  const compiled = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  for (const [kind, status] of [['ranked', ''], ['unranked', copy.home.networkRankTipUnranked],
    ['disabled', copy.home.networkRankDisabled], ['unavailable', copy.home.networkRankUnavailable]]) {
    const confirm = vi.fn();
    new Function('rank', 't', 'confirm', `${compiled}; explainRank();`)(
      { value: { kind } }, { value: copy }, confirm);
    expect(confirm).toHaveBeenCalledWith({ title: copy.home.networkYourRank, hideCancel: true, icon: 'info',
      message: [status, copy.home.networkRankTipRanked].filter(Boolean).join('\n\n') });
  }
});
