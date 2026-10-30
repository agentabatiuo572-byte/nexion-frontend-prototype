import * as Vue from 'vue';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import source from './team.vue?raw';
import { formatUsd, formatUsdOverviewParts } from '@/lib/usd-display';

beforeEach(() => {
  vi.stubGlobal('uni', { getStorageSync: () => undefined, setStorageSync: vi.fn() });
  setActivePinia(createPinia());
});
afterEach(() => { vi.unstubAllGlobals(); });

// Execute the actual pool predicates and its actual label/amount template.
const stateSource = source.slice(source.indexOf('const remotePool = ref'), source.indexOf('let remotePoolRequest'));
const valuesSource = source.slice(source.indexOf('const myVotes = computed'), source.indexOf('const leadershipPoolLineA = computed'));
const template = source.match(/<view class="team-estimate"><text v-if="leadershipPoolUnlocked[^]*?<\/view>/)![0];
const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true, isCustomElement: tag => ['view', 'text'].includes(tag) }).code)(Vue);
function page(votes = 2) {
  const code = ts.transpileModule(stateSource + valuesSource + ';return {remotePool,remotePoolState,remotePoolReadable,leadershipPoolUnlocked,leadershipPoolPrimary,poolAmountParts};',
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
  const state = new Function('ref', 'computed', 'remoteApiEnabled', 'pool', 'vrank', 'formatUsd', 'formatUsdOverviewParts', code)(Vue.ref, Vue.computed, true, {}, {}, formatUsd, formatUsdOverviewParts);
  const snapshot = { myVotes: votes, currentWeekPoolUSDT: 5000, projectedPayoutUSDT: 17.25 };
  state.remotePool.value = snapshot; state.remotePoolState.value = 'ready';
  const html = async () => (await renderToString(Vue.createSSRApp({ render, setup: () => ({ ...state, visibility: useDataVisibility(), remoteApiEnabled: true, designCopy: { estimated: 'Estimated' }, quickRowValueStyle: {} }) }))).replace(/<[^>]+>/g, '');
  return { state, snapshot, html };
}

it('keeps the estimate qualification and amount together from ready into same-scope loading', async () => {
  const screen = page();
  expect(await screen.html()).toContain('Estimated'); expect(await screen.html()).toContain(formatUsd(17.25));
  screen.state.remotePoolState.value = 'loading';
  expect(await screen.html()).toContain('Estimated'); expect(await screen.html()).toContain(formatUsd(17.25));
});

it.each(['error', 'hold'])('does not expose an old projected amount or estimate label after %s', async status => {
  const screen = page(); screen.state.remotePoolState.value = status;
  const html = await screen.html();
  expect(html).toContain('—'); expect(html).not.toContain('Estimated'); expect(html).not.toContain(formatUsd(17.25));
});

it('removes prior-account amount and qualification through the actual account-clear watch', async () => {
  const screen = page(), app = Vue.reactive({ accountKey: 'user:1' }), refresh = vi.fn();
  screen.state.remotePoolState.value = 'loading';
  const scope = Vue.effectScope();
  try {
    const watcher = source.match(/watch\(\(\) => app.accountKey,[^\n]+/)![0];
    scope.run(() => new Function('watch', 'app', 'remoteApiEnabled', 'remotePool', 'refreshRemotePool', watcher)(Vue.watch, app, true, screen.state.remotePool, refresh));
    app.accountKey = 'user:2'; await Vue.nextTick();
    expect(screen.state.remotePool.value).toBeNull(); expect(refresh).toHaveBeenCalledOnce();
    const html = await screen.html(); expect(html).toContain('—'); expect(html).not.toContain('Estimated'); expect(html).not.toContain(formatUsd(17.25));
    expect(screen.snapshot.projectedPayoutUSDT).toBe(17.25);
  } finally { scope.stop(); }
});

it('shows the total pool without a personal estimate qualification while locked, including loading', async () => {
  const screen = page(0);
  for (const state of ['ready', 'loading']) {
    screen.state.remotePoolState.value = state;
    const html = await screen.html();
    expect(html).toContain(formatUsd(5000)); expect(html).not.toContain('Estimated'); expect(html).not.toContain(formatUsd(17.25));
  }
});
