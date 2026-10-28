import ts from 'typescript';
import * as vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { compile } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import snapshotSource from './network-snapshot.vue?raw';
import pulseSource from './network-pulse-card.vue?raw';
import gridSource from './on-grid-section.vue?raw';
import * as stats from '@/lib/platform-stats';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';

const scopes: vue.EffectScope[] = [];
beforeEach(() => vi.stubGlobal('uni', { getStorageSync: () => false, setStorageSync: vi.fn() }));
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });
const renderPulse = new Function('Vue', compile(parse(pulseSource).descriptor.template!.content, {
  mode: 'function', prefixIdentifiers: true, isCustomElement: tag => ['view', 'text'].includes(tag),
}).code)(vue);
function mount(copy = zh) {
  const visibility = useDataVisibility(createPinia());
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:09Z'));
  const cfg = vue.reactive({ loading: false, syncFailed: false, load: vi.fn(), config: {
    publicStats: { registeredUsersBase: 100, registeredUsersAnchorAt: Date.now() - 9000, registeredUsersTickIntervalSec: 10, registeredUsersTickStepMin:1,registeredUsersTickStepMax:1 },
    networkPulse: { registeredUsers: 99999, onlineDevices: 200 },
  } });
  const rank = vue.reactive({ status: 'ready', snapshot: { state: 'ranked', currentRank: 12 } as { state: string; currentRank: number | null } | null, bindAccount: vi.fn(), ensure: vi.fn(), refresh: vi.fn() });
  const props = vue.reactive({ compactView: true, estimated: true, registeredDisplay: 100 as number | null });
  const app = vue.reactive({ accountKey: 'a', homeTruth: { onGrid: { activeDevices: 3206 as number | null, perSecUsdt: 0.03, clients: [] } } });
  const hooks = { show: [] as Array<() => void>, hide: [] as Array<() => void>, unmount: [] as Array<() => void> };
  const modules: Record<string, unknown> = {
    '@/store/data-visibility': { useDataVisibility: () => visibility },
    vue: { ...vue, onMounted: vi.fn(), onUnmounted: (fn: () => void) => hooks.unmount.push(fn) },
    '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn) },
    '@/store/config': { useConfig: () => cfg }, '@/lib/platform-stats': stats,
    '@/store/app': { useApp: () => app }, '@/store/network-rank': { useNetworkRank: () => rank },
    '@/lib/amount-display': { formatAmount: String }, '@/i18n/format': { fmt: vi.fn() },
    '@/api/runtime': { remoteApiEnabled: true }, '@/i18n/use-t': { useT: () => vue.ref(copy) },
    '@/i18n/audit-ui': { useAuditUiCopy: () => vue.ref({}) }, '@/store/ui': { confirm: vi.fn() }, '@/lib/route': { navTo: vi.fn() },
  };
  function run(source: string, exposed: string) {
    const script = source.split('<script setup lang="ts">')[1].split('</script>')[0];
    const js = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const scope = vue.effectScope(); scopes.push(scope);
    return scope.run(() => new Function('require', 'exports', 'defineProps', js + `;return ${exposed};`)(
      (name: string) => name.endsWith('.vue') ? {} : modules[name], {}, () => props,
    ));
  }
  const pulse = run(pulseSource, '{ compactAvailable, metrics, copy, t, activate }');
  const html = () => {
    const app = vue.createSSRApp({ render: renderPulse, setup: () => vue.proxyRefs({ ...props, ...pulse }) });
    app.component('NxSection', { setup: (_props: unknown, context: { slots: vue.Slots }) => () => vue.h('view', context.slots.default?.()) });
    return renderToString(app);
  };
  return { cfg, rank, props, hooks, visibility, html, app, grid: run(gridSource, '{ activeDevicesText }'), snapshot: run(snapshotSource, '{ available, memberCount }'), pulse };
}

describe('optional compact network summary', () => {
  it('uses the validated tick estimate and stops/restarts timers with visibility', async () => {
    const h = mount();
    expect(h.snapshot.available.value).toBe(true); expect(h.snapshot.memberCount.value).toBe(100);
    await vi.advanceTimersByTimeAsync(1000); expect(h.snapshot.memberCount.value).toBe(101);
    h.hooks.hide.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(0);
    h.hooks.show.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(1);
    h.hooks.unmount.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([0, -1, 0.5, 86401, NaN, undefined])('hides an invalid tick interval (%s) without substituting a published count', async interval => {
    const h = mount(); Object.assign(h.cfg.config.publicStats, { registeredUsersTickIntervalSec: interval });
    await vue.nextTick();
    expect(h.snapshot.available.value).toBe(false); expect(h.snapshot.memberCount.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    h.cfg.config.publicStats.registeredUsersTickIntervalSec = 10; await vue.nextTick();
    expect(h.snapshot.available.value).toBe(true); expect(vi.getTimerCount()).toBe(1);
  });
  it('keeps confirmed summary during warm loading, hides errors and partial data, then restores healthy data', async () => {
    const h = mount();
    h.cfg.loading = true; await vue.nextTick();
    expect(h.snapshot.available.value).toBe(true); expect(h.pulse.compactAvailable.value).toBe(true); expect(vi.getTimerCount()).toBe(1);
    h.cfg.loading = false; await vue.nextTick();
    for (const field of ['syncFailed'] as const) {
      h.cfg[field] = true; await vue.nextTick();
      expect(h.snapshot.available.value).toBe(false); expect(h.pulse.compactAvailable.value).toBe(false);
      expect(vi.getTimerCount()).toBe(0); h.cfg[field] = false; await vue.nextTick();
    }
    for (const value of [null, undefined, -1, NaN, 1.5]) {
      Object.assign(h.cfg.config.networkPulse, { onlineDevices: value });
      expect(h.snapshot.available.value).toBe(false); expect(h.pulse.compactAvailable.value).toBe(false);
    }
    h.cfg.config.networkPulse.onlineDevices = 0;
    expect(h.snapshot.available.value).toBe(true); expect(h.pulse.compactAvailable.value).toBe(true);
    h.rank.snapshot = null; expect(h.pulse.compactAvailable.value).toBe(false);
    h.rank.snapshot = { state: 'ranked', currentRank: NaN }; expect(h.pulse.compactAvailable.value).toBe(false);
    h.rank.snapshot = { state: 'unranked', currentRank: null }; expect(h.pulse.compactAvailable.value).toBe(true);
    h.rank.snapshot = { state: 'disabled', currentRank: null }; expect(h.pulse.compactAvailable.value).toBe(false);
    h.rank.snapshot = { state: 'unavailable', currentRank: null }; expect(h.pulse.compactAvailable.value).toBe(false);
    h.rank.snapshot = { state: 'ranked', currentRank: 7 }; expect(h.pulse.compactAvailable.value).toBe(true);
    h.props.registeredDisplay = null; expect(h.pulse.compactAvailable.value).toBe(false);
    expect(snapshotSource).toContain('v-if="available"');
    expect(pulseSource).toContain('v-if="compactView && compactAvailable"');
    expect(pulseSource).toContain('v-else-if="!compactView"');
  });
  it('does not show a retry placeholder for a valid estimate when the independent published member count is absent', () => {
    const h = mount(); Object.assign(h.cfg.config.networkPulse, { registeredUsers: null });
    expect(h.pulse.compactAvailable.value).toBe(true);
    expect(h.pulse.metrics.value[0]).toMatchObject({ v: '100+', sub: '' });
    expect(h.pulse.metrics.value[0].tap).toBeUndefined();
    h.props.estimated = false;
    expect(h.pulse.compactAvailable.value).toBe(false);
  });
});

it.each([zh, en, vietnamese].flatMap(copy => [true, false].map(compactView => ({ copy, compactView }))))(
  'renders and restores only the private rank in compact=$compactView', async ({ copy, compactView }) => {
    const h = mount(copy); h.props.compactView = compactView;
    h.cfg.config.networkPulse = { registeredUsers: 23841, onlineDevices: 4876 };
    h.props.registeredDisplay = 19755;
    h.rank.snapshot = { state: 'ranked', currentRank: 184 };
    const originalRank = JSON.stringify(h.rank.snapshot), originalCounts = JSON.stringify(h.cfg.config.networkPulse);
    const values = (html: string) => [...html.matchAll(compactView
      ? /class="network-compact__value"[^>]*>([^<]*)<\/text>/g
      : /class="block mt-0.5 tabular-nums"[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
    const publicValues = compactView ? ['1.9W+', '4.8K+'] : [stats.compactNumber(23841), stats.compactNumber(4876)];
    expect(values(await h.html())).toEqual([...publicValues, '#184']);
    h.visibility.toggle();
    const hidden = await h.html();
    expect(values(hidden)).toEqual([...publicValues, '••••']);
    expect(hidden).not.toContain('#184');
    expect(hidden).toContain(copy.home.networkYourRank);
    h.visibility.toggle();
    expect(values(await h.html())).toEqual([...publicValues, '#184']);
    expect(JSON.stringify(h.rank.snapshot)).toBe(originalRank);
    expect(JSON.stringify(h.cfg.config.networkPulse)).toBe(originalCounts);
  },
);

it.each([zh, en, vietnamese])('renders population bands without exposing exact counts or changing rank', async copy => {
  const h = mount(copy);
  h.props.registeredDisplay = 13045;
  h.cfg.config.networkPulse.onlineDevices = 3206;
  h.rank.snapshot = { state: 'ranked', currentRank: 184 };
  const html = await h.html();
  expect(h.pulse.metrics.value.map((cell: { v: string }) => cell.v)).toEqual(['1.3W+', '3.2K+', '#184']);
  expect(html).toContain('1.3W+'); expect(html).toContain('3.2K+');
  expect(html).not.toMatch(/13,?045|3,?206/);
  expect(h.grid.activeDevicesText.value).toBe(h.pulse.metrics.value[1].v);
  h.app.homeTruth.onGrid.activeDevices = h.cfg.config.networkPulse.onlineDevices = 9999;
  expect(h.grid.activeDevicesText.value).toBe('9.9K+');
  expect(h.grid.activeDevicesText.value).toBe(h.pulse.metrics.value[1].v);
  h.app.homeTruth.onGrid.activeDevices = null;
  expect(h.grid.activeDevicesText.value).toBe('—');
  h.props.registeredDisplay = 12999;
  expect(h.pulse.metrics.value[0].v).toBe('1.2W+');
  h.props.registeredDisplay = null;
  expect(h.pulse.compactAvailable.value).toBe(false);
  expect(h.pulse.metrics.value[0].v).toBe('-');
});

it.each([0, 99, 100, 999, 1000, 9999, 10000])('uses a coarse lower band for %s', value => {
  const h = mount(); h.props.registeredDisplay = value;
  const expected = new Map([[0, '<100'], [99, '<100'], [100, '100+'], [999, '900+'], [1000, '1K+'], [9999, '9.9K+'], [10000, '1W+']]);
  expect(h.pulse.metrics.value[0].v).toBe(expected.get(value));
});

it.each([zh, en, vietnamese])('retains unranked and unknown explanations with privacy enabled', async copy => {
  const h = mount(copy); h.props.compactView = false; h.visibility.toggle();
  h.rank.snapshot = { state: 'unranked', currentRank: null };
  const unranked = await h.html();
  expect(unranked).toContain(copy.home.networkRankUnranked);
  expect(unranked).toContain(copy.home.networkRankExplanation);
  expect(unranked).not.toContain('••••');
  h.rank.snapshot = null; h.rank.status = 'error';
  const unknown = await h.html();
  expect(unknown).toContain(copy.home.networkStatRetry);
  expect(h.pulse.metrics.value[2].v).toBe('-');
  expect(unknown).not.toContain('#0');
  expect(unknown).not.toContain('••••');
});
