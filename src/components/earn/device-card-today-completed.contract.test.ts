import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import source from "./device-card-pc.vue?raw";
import zh from "../../i18n/messages/zh.ts?raw";
import en from "../../i18n/messages/en.ts?raw";
import viSource from "../../i18n/messages/vi.ts?raw";

import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { createPinia, setActivePinia } from 'pinia';
import { createDeviceE3Api } from '@/api/device-e3-api';
import { createTaskAssignmentApi } from '@/api/task-assignment-api';
import type { ApiClient } from '@/api/api-client';
import { useConfig } from '@/store/config';
import { useSession } from '@/store/session';
import { useCapacityExplainer } from '@/composables/use-capacity-explainer';
import * as deadline from '@/lib/server-deadline-clock';
import * as native from '@/lib/native-phone-runtime';
import * as guidance from '@/lib/phone-activation-guidance';
import * as deviceTypes from '@/store/device-types';
import * as workload from '@/lib/workload-label';
import * as confirmation from '@/lib/task-result-confirmation';
import * as deviceCopy from '@/lib/device-copy';
import * as lifecycle from '@/store/device-lifecycle';
import * as interrupt from '@/store/interrupt';
import * as hashpower from '@/lib/hashpower';
import * as capability from '@/lib/device-capability';
import * as completions from '@/lib/today-completed-tasks';
import * as navigation from '@/lib/device-detail-navigation';
import { fmt } from '@/i18n/format';
import { zh as taskHistoryCopy } from '@/i18n/messages/zh';
import detailSource from '../../pages/earn/device-detail.vue?raw';


describe("per-device today-completed section", () => {
  it("shows the real per-device count and every task returned for the Shanghai business day", () => {
    expect(source).toContain("todayCompletedTasks");
    expect(source).toMatch(/v-for="task in deviceTodayCompleted"/);
    expect(source).toContain("deviceTodayCompleted.length");
    expect(source).toContain("const liveTaskNow = computed");
    expect(source).toContain("props.device.taskServerNowReceivedAt");
    expect(source).toMatch(/elapsedRatio[\s\S]*liveTaskNow\.value/);
    expect(source).toMatch(/elapsedRemaining[\s\S]*liveTaskNow\.value/);
    expect(source).not.toContain("device.kind === 'phone'\" class=\"nx-phone-today-completed");
    expect(source).not.toContain("今日已完成（5）");
  });

  it("labels view-all as the account-wide receipt history and keeps it keyboard accessible", () => {
    expect(source).toContain("t.earn.todayRecentCompleted");
    expect(source).toContain("t.taskHistory.viewAllAccountReceipts");
    expect(source).toContain('@click.stop="goTaskHistory"');
    expect(source).toContain('@keydown.enter.stop.prevent="goTaskHistory"');
    expect(source).toContain('@keydown.space.stop.prevent="goTaskHistory"');
    expect(source).toContain('navTo("/pages/me/receipts")');
  });

  it("ships the new section label in all supported languages", () => {
    expect(zh).toContain('todayRecentCompleted: "今日最近完成"');
    expect(en).toContain('todayRecentCompleted: "Recent completions today"');
    expect(viSource).toContain('todayRecentCompleted: "Hoàn thành gần đây hôm nay"');
  });

  it("identifies the destination as account-wide receipts in every supported language", () => {
    expect(zh).toContain('viewAllAccountReceipts: "查看全账户收据"');
    expect(en).toContain('viewAllAccountReceipts: "View account receipts"');
    expect(viSource).toContain('viewAllAccountReceipts: "Xem biên nhận của tài khoản"');
  });
});


// Full production SFCs + real App store and wire parsers; RAM GET boundary only.
const remote = vi.hoisted(() => ({
  remoteApiEnabled: true, fundsServerEnabled: true, expectedApiEnvironment: 'dev',
  sessionVault: { read: vi.fn() }, deviceE3Api: { fleet: vi.fn() },
  taskAssignmentApi: { state: vi.fn() }, appHomeApi: { fetch: vi.fn() },
  withdrawalApi: { submit: vi.fn(), list: vi.fn(), get: vi.fn() },
}));
vi.mock('@/api/runtime', () => remote);
const { useApp } = await import('@/store/app');
const { useUI } = await import('@/store/ui');
const now = 1_800_000_000_000;
const stopped: Array<() => void> = [];
const observations: unknown[] = [];
const requests: unknown[] = [];
let activeCase = '';
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); await Vue.nextTick(); }
const proof = { source: 'server', sourceEnvironment: 'PRODUCTION', runId: '', serverCanonical: true };
function fleetPayload() {
  return {
    dailyUsdt: 1, dailyNex: 1, realizedTodayUsdt: 0, realizedTodayNex: 0,
    walletUsdt: 0, walletNex: 0, userJoinedAt: 1, serverNow: now,
    timezone: 'Asia/Shanghai', slotCap: 6,
    source: 'nx_user_device + nx_compute_receipt + nx_compute_e3_config',
    sourceEnvironment: 'PRODUCTION', runId: '', serverCanonical: true,
    capacitySchedule: { stageEarlyEnd: '3', stageMidEnd: '8', capacityFloorPct: '22',
      capacitySubsidyDays: '30', capacityBand1DeltaPct: '-4', capacityBand2DeltaPct: '-6',
      capacityBand3DeltaPct: '-23.7', capacityApplyToPhone: 'false', capacityApplyToCloudShare: 'false',
      capacityApplyToPcGpu: 'false', capacityApplyToS1: 'true', capacityApplyToPro: 'true',
      capacityApplyToProV2: 'true', capacityApplyToRackP1: 'true', capacityApplyToRackP2: 'true' },
    devices: [{ id: 1, rowVersion: 1, instanceNo: 'SYNTHETIC-E3-1', name: 'Box',
      deviceType: 'BOX', productCode: 'STELLARBOX-S1', status: 'ACTIVE', runtimeStatus: 'OFFLINE',
      pendingDeactivate: false, activatedAt: 1, purchasedAt: 1, deactivatedAt: null,
      dailyUsdt: 1, dailyNex: 1, todayEarningsUsdt: 0, todayEarningsNex: 0, gpuModel: 'GPU',
      vramTotalGb: 1, basePowerW: 1, location: 'Synthetic', capacityPct: 66.5, capacityAgeMonths: 1,
      capacityConfigKey: 'capacityApplyToS1', capacitySubsidized: false, capacitySubsidyDays: 30,
      capacitySubsidyRemainingDays: 0, capacitySubsidyEndsAt: 1_702_592_000_000,
      actualPaidUsdt: 1, cumulativeOutputUsdt: 0 }],
  };
}
function taskState(nonempty = false) {
  const completed = { ...proof, taskNo: 'SYNTHETIC-TASK-1', deviceId: 1, taskId: 'SYNTHETIC-IG',
    taskName: 'Synthetic task', taskClass: 'IG', model: 'Synthetic model', client: 'Synthetic client',
    status: 'COMPLETED', rewardUsdt: 0.25, requiredSeconds: 60,
    startedAt: now - 120_000, completableAt: now - 60_000, completedAt: now - 30_000,
    receiptNo: 'SYNTHETIC-RECEIPT-1', proofNonce: null, proofExpiresAt: null };
  return { ...proof, serverNow: now, devices: [{ deviceId: 1, instanceNo: 'SYNTHETIC-E3-1',
    deviceType: 'BOX', lockUntil: null, currentTask: null, recentTasks: nonempty ? [completed] : [] }] };
}
let assignment: () => Promise<unknown>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); setActivePinia(createPinia());
  Object.values(remote).forEach(v => { if (v && typeof v === 'object') Object.values(v).forEach(m => {
    if (typeof (m as any)?.mockReset === 'function') (m as any).mockReset();
  }); });
  remote.sessionVault.read.mockReturnValue(null);
  vi.stubGlobal('fetch', () => { throw new Error('NETWORK_FORBIDDEN'); });
  assignment = () => Promise.resolve(taskState());
  const boundary = { request: vi.fn(async (options: any) => {
    const method = options.method ?? 'GET';
    requests.push({ case: activeCase, method, path: options.path });
    if (method !== 'GET') throw new Error('WRITE_FORBIDDEN');
    if (options.path === '/api/devices/earnings') return fleetPayload();
    if (options.path === '/api/tasks/assignments') return assignment();
    throw new Error('UNEXPECTED_GET ' + options.path);
  }) } as unknown as ApiClient;
  const e3 = createDeviceE3Api(boundary, 'dev');
  const tasks = createTaskAssignmentApi(boundary, 'dev');
  remote.deviceE3Api.fleet.mockImplementation(() => e3.fleet());
  remote.taskAssignmentApi.state.mockImplementation(() => tasks.state());
});
afterEach(() => { stopped.splice(0).forEach(stop => stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });
type Host = { tag?: string; text?: string; props: Record<string, any>; parent?: Host; children: Host[] };
const host = (tag?: string, text?: string): Host => ({ tag, text, props: {}, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => host(tag), createText: text => host(undefined, text), createComment: () => host(),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  patchProp: (n, key, _before, after) => { n.props[key] = after; }, parentNode: n => n.parent ?? null,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert: (n, parent, anchor) => {
    if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n);
    n.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1;
    if (at < 0) parent.children.push(n); else parent.children.splice(at, 0, n);
  },
  remove: n => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const text = (n?: Host): string => n ? (n.text ?? '') + n.children.map(text).join('') : '';
const find = (n: Host, cls: string) => all(n).find(x => String(x.props.class ?? '').split(/\s+/).includes(cls));
function component(rel: string, imports: (id: string) => unknown): Vue.Component {
  const raw = rel === 'pages/earn/device-detail.vue' ? detailSource : source;
  const script = compileScript(parse(raw, { filename: rel }).descriptor, { id: 'earn-history-' + rel,
    inlineTemplate: true, templateOptions: { compilerOptions: {
      hoistStatic: false, isCustomElement: tag => ['view', 'text', 'scroll-view'].includes(tag),
    } } });
  const code = ts.transpileModule(script.content, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)(imports, module, module.exports);
  return module.exports.default;
}
async function setup(name: string) {
  activeCase = name;
  const app = useApp(); app.bindAccount('user:7001');
  remote.sessionVault.read.mockReturnValue({ user: { userId: 7001 } });
  const loads: Function[] = []; const shows: Function[] = [];
  const blank = { render: () => null };
  const chassis = Vue.defineComponent({ setup: (_p, ctx) => () => Vue.h('view', ctx.slots.default?.()) });
  const deps: Record<string, unknown> = {
    vue: Vue, '@/store/app': { useApp: () => app }, '@/store/session': { useSession },
    '@/store/config': { useConfig }, '@/lib/native-phone-runtime': native,
    '@/lib/phone-activation-guidance': guidance, '@/store/device-types': deviceTypes,
    '@/lib/workload-label': workload, '@/lib/task-result-confirmation': confirmation,
    '@/lib/device-copy': deviceCopy, '@/store/device-lifecycle': lifecycle,
    '@/store/interrupt': interrupt, '@/lib/hashpower': hashpower, '@/lib/device-capability': capability,
    '@/lib/today-completed-tasks': completions, '@/lib/device-detail-navigation': navigation,
    '@/lib/server-deadline-clock': deadline, '@/composables/use-capacity-explainer': { useCapacityExplainer },
    '@/i18n/format': { fmt }, '@/i18n/use-t': { useT: () => Vue.ref(taskHistoryCopy) }, '@/api/runtime': remote,
    '@/lib/route': { navTo: vi.fn(), navBack: vi.fn(), takeNavigationQuery: () => '' },
    '@/store/earn-config': { prepareEarnConfig: () => {}, useEarnConfig: () => ({ lockedTeasers: () => [], averageEligibleReward: () => 0 }) },
    '@dcloudio/uni-app': { onLoad: (f: Function) => loads.push(f), onShow: (f: Function) => shows.push(f) },
    '@/components/app-chassis.vue': { __esModule: true, default: chassis },
    '@/components/empty-state.vue': { __esModule: true, default: blank },
    '@/components/sub-page-header.vue': { __esModule: true, default: blank },
    '@/components/earn/capacity-explainer-sheet.vue': { __esModule: true, default: blank },
    '@/components/home/device-slot.vue': { __esModule: true, default: blank },
  };
  const imports = (id: string) => {
    if (!(id in deps)) throw new Error('UNEXPECTED_IMPORT ' + id);
    return deps[id];
  };
  deps['@/components/earn/device-card-pc.vue'] = { __esModule: true, default: component('components/earn/device-card-pc.vue', imports) };
  const root = host(); const instance = renderer.createApp(component('pages/earn/device-detail.vue', imports));
  instance.mount(root); let live = true;
  const stop = () => { if (live) { live = false; instance.unmount(); } }; stopped.push(stop);
  loads.forEach(f => f({ id: '1', from: 'earn' }));
  shows.forEach(f => f()); await flush();
  const show = async () => { shows.forEach(f => f()); await flush(); };
  const observe = (phase: string) => {
    const result = { case: name, phase, fleetStatus: app.remoteFleetStatus,
      assignmentStatus: app.remoteAssignmentStatus, assignmentHasSnapshot: app.remoteAssignmentHasSnapshot,
      fleetHasSnapshot: app.remoteFleetHasSnapshot, deviceCount: app.devices.length,
      recentCount: app.devices[0]?.recentTasks.length ?? null,
      detailSurfaceVisible: Boolean(find(root, 'nx-device-detail__surface')),
      taskHistoryText: text(find(root, 'nx-device-today-completed')), pageText: text(root),
      uiToasts: useUI().toasts.map(x => x.title), live };
    observations.push(result); return result;
  };
  const mountHistoryConsumer = async () => {
    const historyRoot = host();
    const card = (deps['@/components/earn/device-card-pc.vue'] as { default: Vue.Component }).default;
    const history = renderer.createApp({ render: () => app.devices[0]
      ? Vue.h(card, { device: app.devices[0], expanded: true }) : null });
    history.mount(historyRoot); stopped.push(() => history.unmount()); await flush();
    return () => text(find(historyRoot, 'nx-device-today-completed'));
  };
  return { app, root, stop, show, observe, mountHistoryConsumer };
}

it('initial independent task GET failure must not present confirmed zero/empty history', async () => {
  assignment = () => Promise.reject(new Error('SYNTHETIC_TASK_READ_UNAVAILABLE'));
  const s = await setup('initial-task-failure'); const o = s.observe('both GETs settled');
  expect(o.fleetStatus).toBe('ready'); expect(o.fleetHasSnapshot).toBe(true);
  expect(o.assignmentStatus).toBe('error'); expect(o.assignmentHasSnapshot).toBe(false);
  expect(o.detailSurfaceVisible).toBe(true);
  expect(o.taskHistoryText).not.toContain(taskHistoryCopy.taskHistory.historyEmpty);
  expect(o.taskHistoryText).not.toContain('(0)');
});
it('canonical successful empty state remains a legitimate zero and empty history', async () => {
  const s = await setup('confirmed-empty'); const o = s.observe('ready');
  expect(o.assignmentStatus).toBe('ready'); expect(o.assignmentHasSnapshot).toBe(true);
  expect(o.taskHistoryText).toContain('(0)'); expect(o.taskHistoryText).toContain(taskHistoryCopy.taskHistory.historyEmpty);
});
it('ordinary page show retry recovers error into parser-confirmed per-device history', async () => {
  assignment = () => Promise.reject(new Error('SYNTHETIC_TASK_READ_UNAVAILABLE'));
  const s = await setup('error-recovery'); s.observe('failed');
  assignment = () => Promise.resolve(taskState(true)); await s.show(); const o = s.observe('retry ready');
  expect(o.assignmentStatus).toBe('ready'); expect(o.assignmentHasSnapshot).toBe(true);
  expect(o.recentCount).toBe(1); expect(o.taskHistoryText).toContain('(1)');
  expect(o.taskHistoryText).toContain('Synthetic model'); expect(o.taskHistoryText).not.toContain(taskHistoryCopy.taskHistory.historyEmpty);
});
it.each(['account-switch', 'same-account-rebind'])('late task read cannot restore prior history after %s', async boundary => {
  const late = deferred<unknown>(); assignment = () => late.promise;
  const s = await setup(boundary); s.observe('pending');
  remote.sessionVault.read.mockReturnValue(null);
  s.app.bindAccount(boundary === 'account-switch' ? 'user:7002' : 'user:7001');
  await flush(); late.resolve(taskState(true)); await flush(); const o = s.observe('old resolved');
  expect(o.assignmentHasSnapshot).toBe(false); expect(o.deviceCount).toBe(0);
  expect(o.taskHistoryText).not.toContain('Synthetic model'); expect(o.uiToasts).toEqual([]);
});
it('unmounted detail does not render late read data or produce global feedback', async () => {
  const late = deferred<unknown>(); assignment = () => late.promise;
  const s = await setup('unmount'); s.observe('pending'); s.stop();
  late.resolve(taskState(true)); await flush(); const o = s.observe('late settled after unmount');
  expect(o.live).toBe(false); expect(o.detailSurfaceVisible).toBe(false);
  expect(o.taskHistoryText).toBe(''); expect(o.uiToasts).toEqual([]);
});


it('history loading after the first read failure cannot turn missing authority into zero', async () => {
  assignment = () => Promise.reject(new Error('SYNTHETIC_TASK_READ_UNAVAILABLE'));
  const s = await setup('loading-no-authority');
  const historyText = await s.mountHistoryConsumer();
  const pending = deferred<unknown>(); assignment = () => pending.promise;
  const read = s.app.refreshRemoteFleet(); await flush();
  expect(s.app.remoteAssignmentStatus).toBe('loading');
  expect(s.app.remoteAssignmentHasSnapshot).toBe(false);
  expect(historyText()).toContain(taskHistoryCopy.taskHistory.loading);
  expect(historyText()).not.toContain('(0)');
  expect(historyText()).not.toContain(taskHistoryCopy.taskHistory.historyEmpty);
  pending.resolve(taskState()); await expect(read).resolves.toBe(true); await flush();
  expect(historyText()).toContain('(0)');
  expect(historyText()).toContain(taskHistoryCopy.taskHistory.historyEmpty);
});

it('loading preserves confirmed history, error discloses failure, and ready empty recovers normally', async () => {
  assignment = () => Promise.resolve(taskState(true));
  const s = await setup('confirmed-snapshot-transitions');
  const historyText = await s.mountHistoryConsumer();
  expect(historyText()).toContain('(1)');
  await vi.advanceTimersByTimeAsync(5001); // Let the existing store cache expire normally.
  const pending = deferred<unknown>(); assignment = () => pending.promise;
  const read = s.app.refreshRemoteFleet(); await flush();
  expect(s.app.remoteAssignmentStatus).toBe('loading');
  expect(s.app.remoteAssignmentHasSnapshot).toBe(true);
  expect(historyText()).toContain('(1)');
  expect(historyText()).toContain('Synthetic model');
  pending.reject(new Error('SYNTHETIC_TASK_READ_UNAVAILABLE'));
  await expect(read).resolves.toBe(true); await flush();
  expect(s.app.remoteAssignmentStatus).toBe('error');
  expect(s.app.remoteAssignmentHasSnapshot).toBe(true);
  expect(s.app.devices[0].recentTasks).toHaveLength(1); // Existing store facts remain unchanged.
  expect(historyText()).toContain(taskHistoryCopy.wallet.assignmentsUnavailableTitle);
  expect(historyText()).not.toContain('(1)');
  expect(historyText()).not.toContain(taskHistoryCopy.taskHistory.historyEmpty);
  assignment = () => Promise.resolve(taskState());
  await expect(s.app.refreshRemoteFleet()).resolves.toBe(true); await flush();
  expect(s.app.remoteAssignmentStatus).toBe('ready');
  expect(historyText()).toContain('(0)');
  expect(historyText()).toContain(taskHistoryCopy.taskHistory.historyEmpty);
});
