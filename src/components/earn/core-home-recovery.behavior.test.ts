import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, expect, test, vi } from 'vitest';
import moneyRaw from '../home/tech-money-card.vue?raw';
import actionsRaw from '../home/action-list.vue?raw';
import actionRowRaw from '../home/home-action-row.vue?raw';
import dailyRaw from '../home/daily-check-in-row.vue?raw';
import marketRaw from './market-board.vue?raw';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { auditUiCopy } from '@/i18n/audit-ui';
import { homeActionsCopy } from '@/i18n/home-actions';
import { homeEarningsSubtitle } from '../home/home-real-copy';
import { homeTaskSummary } from '../home/home-task-summary';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { dailyBaseReward } from '@/pages/daily/daily-reward-view';
import { dailyCheckInSuccessCopy } from '@/pages/daily/daily-success-copy';
import * as workload from '@/lib/workload-label';
import { nexGridBrandText } from '@/lib/brand-copy';

type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ''): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: node, createComment: () => node(),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  patchProp: (n, key, _prev, value) => { n.props[key] = value; }, parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert: (n, parent, anchor) => {
    if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n);
    n.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(at < 0 ? parent.children.length : at, 0, n);
  }, remove: n => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const text = (n: Host): string => n.text + n.children.map(text).join('');
const classNode = (n: Host, cls: string) => all(n).find(x => String(x.props.class ?? '').split(/\s+/).includes(cls));
const sfc = (component: Vue.Component) => ({ __esModule: true, default: component });
const blank = sfc({ render: () => null });
const group = sfc(Vue.defineComponent({ setup: (_, ctx) => () => Vue.h('view', ctx.slots.default?.()) }));
const stops: Array<() => void> = [];
afterEach(() => stops.splice(0).forEach(stop => stop()));

function component(raw: string, deps: Record<string, unknown>): Vue.Component {
  const script = compileScript(parse(raw).descriptor, { id: 'core-home', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } } });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { default: {} as Vue.Component };
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in deps)) throw new Error(`Unexpected import: ${id}`);
    return deps[id];
  }, result);
  return result.default;
}
function mount(raw: string, deps: Record<string, unknown>) {
  const root = node(); const app = renderer.createApp(component(raw, deps));
  app.mount(root); stops.push(() => app.unmount()); return root;
}
function common(copy = zh) {
  return { vue: Vue, '@/lib/amount-display': { formatAmount }, '@/i18n/format': { fmt },
    '@/i18n/use-t': { useT: () => Vue.ref(copy) }, '@/api/runtime': { remoteApiEnabled: true } };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Vue.nextTick(); }

test.each([zh, en, vietnamese])('earnings retry reads the overview once, preserves unknown, and recovers', async copy => {
  const pending = deferred<void>();
  const app = Vue.reactive({ homeTruthStatus: 'error', homeTruth: { earnings: { today: { usdt: 9, jobCount: 2 }, todayVsYesterdayPct: 0 } },
    earnings: { today: 999 }, refreshHomeTruth: vi.fn(() => pending.promise) });
  const root = mount(moneyRaw, { ...common(copy), '@/store/app': { useApp: () => app },
    '@/store/commission': { useCommission: () => ({ todayUSDT: () => 0 }) },
    '@/store/staking': { useStaking: () => ({ todayAccruedUSDT: () => 0 }) },
    '@/composables/use-ticker': { useTicker: () => Vue.ref(999) }, './home-real-copy': { homeEarningsSubtitle } });
  expect(text(root)).toContain(copy.coreReview.earningsReadFailed);
  expect(text(root)).not.toContain('999');
  expect(text(root)).not.toContain('9.00');
  const retry = classNode(root, 'earnings-retry')!;
  retry.props.onClick(); retry.props.onClick(); await Vue.nextTick();
  expect(app.refreshHomeTruth).toHaveBeenCalledTimes(1);
  expect(retry.props['aria-disabled']).toBe('true');
  app.homeTruthStatus = 'ready'; pending.resolve(); await settle();
  expect(text(root)).toContain('9.00');
  expect(classNode(root, 'earnings-retry')).toBeUndefined();
});

test('a failed earnings retry remains recoverable', async () => {
  const app = { homeTruthStatus: 'error', homeTruth: null, earnings: { today: 0 }, refreshHomeTruth: vi.fn().mockRejectedValue(new Error('503')) };
  const root = mount(moneyRaw, { ...common(), '@/store/app': { useApp: () => app },
    '@/store/commission': { useCommission: () => ({ todayUSDT: () => 0 }) }, '@/store/staking': { useStaking: () => ({ todayAccruedUSDT: () => 0 }) },
    '@/composables/use-ticker': { useTicker: () => Vue.ref(0) }, './home-real-copy': { homeEarningsSubtitle } });
  await classNode(root, 'earnings-retry')!.props.onClick(); await settle();
  expect(text(root)).toContain(zh.coreReview.earningsReadFailed);
  expect(classNode(root, 'earnings-retry')!.props['aria-disabled']).toBe('false');
});

test('check-in reserves seven cells before its read, then replaces them in place', async () => {
  const faucet = Vue.reactive({ remoteReadState: 'loading', remoteCheckedInToday: false, signInStreak: 2, remoteRules: [], ensureRemote: vi.fn() });
  const root = mount(dailyRaw, { ...common(), '@/store/nex-faucet': { useNexFaucet: () => faucet }, '@/store/app': { useApp: () => ({}) },
    '@/composables/use-tab-page-lifecycle': { onShow: () => {}, onHide: () => {} }, '@/lib/route': { navTo: vi.fn() },
    '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref(auditUiCopy.zh) }, '@/store/ui': { toast: {} },
    '@/pages/daily/daily-success-copy': { dailyCheckInSuccessCopy }, '@/pages/daily/daily-reward-view': { dailyBaseReward }, '@/components/ui/nx-button.vue': blank });
  expect(classNode(root, 'daily-check-in-row__days')!.children).toHaveLength(9); // seven cells plus fragment anchors
  expect(classNode(root, 'daily-check-in-row__days')!.props['aria-busy']).toBe('true');
  faucet.remoteReadState = 'ready'; await Vue.nextTick();
  expect(classNode(root, 'daily-check-in-row__days')!.children).toHaveLength(9);
  expect(text(root)).toContain(auditUiCopy.zh.today);
});

test('to-do waits for its initial reads and trial progress opens the trial page', async () => {
  const pending = deferred<void>(); const navTo = vi.fn();
  const deps: Record<string, unknown> = { ...common(), '@/store/app': { useApp: () => ({ accountKey: 'A', accountBindingEpoch: 1 }) },
    '@/store/session': { useSession: () => ({}) }, '@/store/quest': { useQuest: () => ({ remoteStatus: 'ready', refreshRemote: () => pending.promise, remoteQuests: [] }) },
    '@/store/orders': { useOrders: () => ({ orders: [], refreshRemote: async () => true }) },
    '@/store/voucher': { useVoucher: () => ({ claimedUnused: [], refreshRemote: async () => true }) },
    '@/store/free-trial': { useFreeTrial: () => ({ status: 'active', refreshRemote: async () => true }) },
    '@/store/config': { useConfig: () => ({ isEnabled: () => false }) },
    '@/api/runtime': { remoteApiEnabled: true, accountApi: { securityOverview: async () => ({ twoFactorEnabled: true }) } },
    '@/lib/native-phone-runtime': { hasNativeAndroidPhoneRuntime: () => false }, '@/lib/route': { navTo },
    '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref(auditUiCopy.zh) }, '@/i18n/home-actions': { homeActionsCopy },
    '@/store/locale': { useLocaleStore: () => ({ code: 'zh' }) }, '@/composables/use-now': { useNow: () => Vue.ref(1) },
    './home-task-summary': { homeTaskSummary }, '@/components/ui/nx-section.vue': group, '@/components/ui/nx-list-group.vue': group,
    '@/components/ui/nx-button.vue': blank, '@/composables/use-tab-page-lifecycle': { onShow: () => {}, onHide: () => {} },
  };
  deps['./home-action-row.vue'] = sfc(component(actionRowRaw, deps));
  const root = mount(actionsRaw, deps);
  expect(classNode(root, 'home-actions-skeleton')).toBeDefined();
  expect(all(root).some(n => n.props.role === 'link')).toBe(false);
  pending.resolve(); await settle();
  expect(classNode(root, 'home-actions-skeleton')).toBeUndefined();
  const row = all(root).find(n => n.props.role === 'link')!;
  row.props.onClick(); expect(navTo).toHaveBeenCalledExactlyOnceWith('/pages/me/trial');
});

test('empty market disappears, while known values including zero remain', async () => {
  const app = Vue.reactive({ homeTruthStatus: 'ready', homeTruth: { marketBoard: { workloads: [], deviceRankings: [] as any[] } } });
  const root = mount(marketRaw, { ...common(), '@/lib/route': { navTo: vi.fn() }, '@/store/app': { useApp: () => app },
    '@/lib/brand-copy': { nexGridBrandText }, '@/lib/workload-label': workload });
  expect(classNode(root, 'nx-earn-market-board')).toBeUndefined();
  app.homeTruth.marketBoard.deviceRankings.push({ rank: 1, kind: 'phone', dailyUsdt: 0, bestFor: null }); await Vue.nextTick();
  expect(text(root)).toContain('$0.00/天');
  expect(text(root)).not.toContain(zh.market.priceIndex);
  app.homeTruthStatus = 'error'; await Vue.nextTick();
  expect(classNode(root, 'nx-earn-market-board')).toBeUndefined();
});
