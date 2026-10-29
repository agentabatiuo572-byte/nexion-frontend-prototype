vi.mock("@/services/native-push", () => ({ revokeNativePush: vi.fn(), resumeNativePush: vi.fn() }));
import * as progress from "@/lib/task-progress";
import * as deadline from "@/lib/server-deadline-clock";
import * as confirmation from "@/lib/task-result-confirmation";
import { formatConversationTime } from '@/components/support/conversation-time';
import { parseServerTimestamp } from '@/api/server-time';
import * as Vue from 'vue';
import { createPinia } from 'pinia';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDataVisibility } from '@/store/data-visibility';
import { createPassiveTabReadFixture } from '@/lib/passive-tab-read.test-support';
import { formatAmount } from '@/lib/amount-display';
import { formatUsd, formatUsdOverviewParts } from '@/lib/usd-display';
import { fmt, fmtMoney } from '@/i18n/format';
import { homeEarningsSubtitle } from './home-real-copy';
import { formatHomeFeedTime, buildCanonicalHomeFeed } from './home-live-feed';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import moneyRaw from './tech-money-card.vue?raw';
import ledgerRaw from './earnings-ledger-card.vue?raw';
import liveFeedRaw from './live-feed-card.vue?raw';
import rowRaw from './home-action-row.vue?raw';
import deviceRowRaw from './device-row.vue?raw';
import earnRaw from '@/pages/earn/earn.vue?raw';
import toggleRaw from '@/components/ui/data-visibility-toggle.vue?raw';

type Host = { tag: string; text: string; style: Record<string, string>; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = '', tag = ''): Host => ({ tag, text, style: {}, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node('', tag), createText: node, createComment: () => node(),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  patchProp: (n, key, _previous, value) => { n.props[key] = value; }, parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert: (n, parent, anchor) => {
    if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n);
    n.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(at < 0 ? parent.children.length : at, 0, n);
  }, remove: n => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const text = (n: Host): string => n.text + n.children.map(text).join('');
const byClass = (root: Host, cls: string) => all(root).find(n => String(n.props.class ?? '').split(/\s+/).includes(cls))!;
const stops: Array<() => void> = [];
beforeEach(() => vi.stubGlobal('uni', { getStorageSync: () => false, setStorageSync: vi.fn() }));
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); });
const group = { __esModule: true, default: Vue.defineComponent({ setup: (_p, ctx) => () => Vue.h('view', ctx.slots.default?.()) }) };
function component(raw: string, dependencies: Record<string, unknown>): Vue.Component {
  const script = compileScript(parse(raw).descriptor, { id: 'privacy-behavior', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text', 'image'].includes(tag) } } });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { default: {} as Vue.Component };
  new Function('require', 'exports', code)((id: string) => {
    if (id in dependencies) return dependencies[id];
    if (id.endsWith('.vue')) return group;
    throw new Error('Unexpected privacy import: ' + id);
  }, result);
  return result.default;
}
function fixture(copy = zh) {
  const visibility = useDataVisibility(createPinia());
  const period = (usdt: number, nex: number, jobCount: number) => ({ usdt, nex, jobCount });
  const app = Vue.reactive({ accountKey: 'privacy-fixture', accountBindingEpoch: 1, activeSlotCount: 2, slotCap: 6,
    homeTruthStatus: 'ready', remoteFleetStatus: 'ready', remoteFleetHasSnapshot: true, visibleDevices: [],
    earnings: { today: 125.67, todayNEX: 9.8, thisWeek: 765.43, thisMonth: 1234.56, total: 9876.54 },
    homeTruth: { earnings: { today: period(125.67, 9.8, 321), week: period(765.43, 41, 654),
      month: period(1234.56, 82, 987), all: period(9876.54, 328, 2468), todayVsYesterdayPct: 12.3 },
      earningsLedgerMode: 'SETTLED', earningsLedger: [{ id: 'ledger-1', client: 'Client', model: 'Model',
        rewardUsdt: 0.00032, completedAt: '2026-10-27T16:05:00Z', synthetic: false }] },
    refreshHomeTruth: vi.fn(), refreshRemoteFleet: vi.fn() });
  const open = vi.fn();
  const navTo = vi.fn();
  const passiveReads = createPassiveTabReadFixture(() => JSON.stringify([app.accountKey, app.accountBindingEpoch]));
  const dependencies: Record<string, unknown> = {
    '@/lib/passive-tab-read': passiveReads,
    vue: Vue, '@/components/support/conversation-time': { formatConversationTime }, '@/api/server-time': { parseServerTimestamp }, '@/store/data-visibility': { useDataVisibility: () => visibility },
    '@/i18n/use-t': { useT: () => Vue.ref(copy) }, '@/i18n/format': { fmt, fmtMoney },
    '@/store/locale': { useLocaleStore: () => ({ code: copy === zh ? 'zh' : copy === vietnamese ? 'vi' : 'en' }) },
    '@/api/runtime': { remoteApiEnabled: true }, '@/store/app': { useApp: () => app },
    '@/store/commission': { useCommission: () => ({ todayUSDT: () => 0 }) },
    '@/store/staking': { useStaking: () => ({ todayAccruedUSDT: () => 0 }) },
    '@/composables/use-ticker': { useTicker: () => Vue.ref(0) }, './home-real-copy': { homeEarningsSubtitle },
    '@/lib/amount-display': { formatAmount }, '@/lib/usd-display': { formatUsd, formatUsdOverviewParts },
    './home-live-feed': { formatHomeFeedTime, buildCanonicalHomeFeed }, '@/lib/route': { navTo },
    '@/i18n/remainder-ui': { useRemainderUiCopy: () => Vue.ref({ earnWays: {} }) },
    '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref({ deviceRevenue: 'Revenue', revenueScope: 'Devices' }) },
    '@/store/config': { useConfig: () => ({ configStatus: 'ready', isEnabled: () => false }) },
    '@/lib/native-phone-runtime': { hasNativePhoneRuntime: () => true },
    '@/composables/use-trial-presentation': { useTrialPresentation: () => ({ active: Vue.ref(false), reservedSlots: Vue.ref(0) }) },
    '@/store/free-trial': { useFreeTrial: () => ({ refreshRemote: vi.fn() }) },
    '@/composables/use-capacity-explainer': { useCapacityExplainer: () => ({ open }) },
    '@/composables/use-tab-page-lifecycle': { onShow() {}, onHide() {}, useVisibleInterval() {} },
    '@/lib/device-slot-policy': {}, '@/lib/account-scope': {}, '@/lib/day-one-page-observation': {},
    '@/lib/task-progress': progress, '@/lib/server-deadline-clock': deadline, '@/lib/task-result-confirmation': confirmation,
    '@/lib/device-copy': { deviceName: () => 'Device' }, '@/lib/hashpower': { deviceOnlineState: () => 'online' },
  };
  dependencies['@/components/ui/data-visibility-toggle.vue'] = { __esModule: true, default: component(toggleRaw, dependencies) };
  dependencies['@/components/glass-segments.vue'] = { __esModule: true, default: Vue.defineComponent({
    props: ['modelValue', 'options'], emits: ['update:modelValue'],
    setup: (_props, ctx) => () => Vue.h('view', { 'data-select-week': true, onClick: () => ctx.emit('update:modelValue', 'Week') }),
  }) };
  function mount(raw: string, props = {}) {
    const root = node(); const instance = renderer.createApp(component(raw, dependencies), props);
    instance.mount(root); stops.push(() => instance.unmount()); return root;
  }
  return { visibility, app, open, navTo, mount };
}
const event = (key = '', repeat = false) => ({ key, repeat, preventDefault() {}, stopPropagation() {} });
function invoke(handler: Function | Function[], value = event()) {
  for (const fn of Array.isArray(handler) ? handler : [handler]) fn(value);
}

it.each([zh, en, vietnamese])('links both title toggles, masks period totals/counts/ledger, and restores the unchanged data', async copy => {
  const f = fixture(copy), before = JSON.stringify(f.app);
  const home = f.mount(moneyRaw), earn = f.mount(earnRaw), ledger = f.mount(ledgerRaw), feed = f.mount(liveFeedRaw);
  expect(text(home)).toContain('125.67');
  expect(text(earn)).toContain(fmt(copy.earn.jobsCount, { n: '321' }));
  expect(text(ledger)).toContain('+$0.0003');
  const ledgerDate = text(all(ledger).find(n => n.props['data-home-ledger-time'])!);
  invoke(byClass(home, 'data-visibility-toggle').props.onClick); await Vue.nextTick();
  expect(f.visibility.hidden).toBe(true);
  for (const root of [home, earn, ledger, feed]) {
    expect(text(root)).toContain('••••');
    expect(text(root)).not.toContain('125.67');
    expect(text(root)).not.toContain('+$0.0003');
  }
  expect(text(earn)).toContain(fmt(copy.earn.jobsCount, { n: '••••' }));
  expect(text(home)).toContain(fmt(copy.home.techSettledJobs, { arrow: '', delta: '••••', count: '••••' }).trim());
  expect(text(home)).not.toContain('12.3%');
  expect(text(all(ledger).find(n => n.props['data-home-ledger-time'])!)).toBe(ledgerDate);
  expect(byClass(earn, 'data-visibility-toggle').props['aria-pressed']).toBe('true');
  invoke(all(earn).find(n => n.props['data-select-week'])!.props.onClick); await Vue.nextTick();
  expect(text(earn)).not.toContain('654');
  invoke(byClass(earn, 'data-visibility-toggle').props.onKeydown, event('Enter')); await Vue.nextTick();
  expect(text(home)).toContain('125.67');
  expect(text(earn)).toContain(fmt(copy.earn.jobsCount, { n: '654' }));
  expect(text(earn)).toContain('765.43');
  expect(text(ledger)).toContain('+$0.0003');
  expect(text(feed)).toContain('0.0003');
  expect(JSON.stringify(f.app)).toBe(before);
});

it('removes personal ring geometry and accessible counters, while reward rules and countdown stay visible', async () => {
  const f = fixture();
  const row = f.mount(rowRaw, { row: { key: 'quest', title: 'Tasks', href: '/tasks',
    progress: { done: 7, total: 19 }, progressLabel: '7 of 19', reward: '78', rewardLabel: 'Rule', remaining: '2h' } });
  expect(all(row).some(n => 'stroke-dasharray' in n.props)).toBe(true);
  f.visibility.toggle(); await Vue.nextTick();
  expect(all(row).some(n => 'stroke-dasharray' in n.props)).toBe(false);
  expect(byClass(row, 'home-action-ring').props['aria-label']).toBe('Tasks · ••••');
  expect(text(row)).not.toContain('7/19'); expect(text(row)).toContain('78 UVT'); expect(text(row)).toContain('2h');
  f.visibility.toggle(); await Vue.nextTick(); expect(text(row)).toContain('7/19');
});

it('masks per-device home income without changing device navigation', async () => {
  const f = fixture(), device = { id: 'personal-device', todayEarnings: 93.21 };
  const root = f.mount(deviceRowRaw, { device, runtimeConfirmed: true });
  expect(text(root)).toContain('93.21');
  f.visibility.toggle(); await Vue.nextTick(); expect(text(root)).not.toContain('93.21');
  expect(text(root)).toContain('••••'); invoke(all(root).find(n => n.props.role === 'button')!.props.onClick);
  expect(f.navTo).toHaveBeenCalledWith('/pages/earn/device-detail?id=personal-device&from=home');
  expect(device.todayEarnings).toBe(93.21);
});

it('opens the existing explanation directly by click/Enter/Space and ignores held keys', () => {
  const f = fixture(), root = f.mount(earnRaw), info = byClass(root, 'earn-capacity-info');
  expect(info.props['aria-haspopup']).toBe('dialog');
  invoke(info.props.onClick); invoke(info.props.onKeydown, event('Enter')); invoke(info.props.onKeydown, event(' '));
  expect(f.open).toHaveBeenCalledTimes(3);
  invoke(info.props.onKeydown, event('Enter', true)); expect(f.open).toHaveBeenCalledTimes(3);
  expect(all(root).some(n => n.props['aria-expanded'] === false)).toBe(false);
});


it.each([zh, en, vietnamese])('shows the actual Home queue task and progress before navigating, with frozen pause and privacy', async copy => {
  const f = fixture(copy), snapshotNow = Date.now();
  const task = Vue.reactive({ id: 'home-job-41', model: 'BGE-M3', totalSec: 120, startedAt: snapshotNow - 60_000,
    status: 'RUNNING', completableAt: snapshotNow + 60_000, pausedAt: null as number | null, pausedSeconds: 0 });
  const device = Vue.reactive({ id: 'home-job-device', todayEarnings: 0, taskServerNow: snapshotNow,
    taskServerNowReceivedAt: Number.MAX_SAFE_INTEGER, currentTask: task as typeof task | null });
  const root = f.mount(deviceRowRaw, { device, runtimeConfirmed: true });
  expect(text(root)).toContain('BGE-M3'); expect(text(root)).toContain('#home-job-41');
  expect(text(root)).toContain('50%');
  expect(byClass(root, 'hf-device-task__fill').props.style.width).toBe('50%');
  device.taskServerNow += 60_000; await Vue.nextTick();
  expect(text(root)).toContain('100%'); expect(text(root)).toContain(copy.earn.taskAwaitingExecutionResultConfirmation);
  task.status = 'PAUSED'; task.pausedAt = snapshotNow; await Vue.nextTick();
  expect(text(root)).toContain('50%');
  device.taskServerNow += 30_000; await Vue.nextTick(); expect(text(root)).toContain('50%');
  task.status = 'RUNNING'; task.pausedAt = null; task.pausedSeconds = 90;
  await Vue.nextTick(); expect(text(root)).toContain('50%');
  f.visibility.toggle(); await Vue.nextTick();
  expect(text(root)).not.toContain('BGE-M3'); expect(text(root)).not.toContain('home-job-41');
  expect(all(root).some(node => String(node.props.class ?? '').includes('hf-device-task__fill'))).toBe(false);
  expect(all(root).find(node => node.props.role === 'progressbar')!.props['aria-valuenow']).toBeUndefined();
  invoke(byClass(root, 'nx-device-row').props.onClick);
  expect(f.navTo).toHaveBeenCalledWith('/pages/earn/device-detail?id=home-job-device&from=home');
  device.currentTask = null; await Vue.nextTick();
  expect(all(root).some(node => String(node.props.class ?? '').split(/\s+/).includes('hf-device-task'))).toBe(false);
});
