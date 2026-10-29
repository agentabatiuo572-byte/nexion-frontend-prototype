import ts from 'typescript';
import * as Vue from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import actionSource from '@/components/home/action-list.vue?raw';
import meSource from '@/pages/me/me.vue?raw';
import referralSource from '@/components/promotion/referral-progress.vue?raw';
import homeSource from '@/pages/index/index.vue?raw';
import earnSource from '@/pages/earn/earn.vue?raw';
import storeSource from '@/pages/store/store.vue?raw';
import teamSource from '@/pages/team/team.vue?raw';
import promotionSource from '@/composables/use-promotion-context.ts?raw';
import { createPassiveReadWindow } from '@/lib/passive-read-window';
import { settleRemoteMeLoaders } from '@/lib/remote-me-refresh';
import { runRemoteOrdersRefresh } from '@/lib/remote-orders-refresh';
import { createPromotionReadFence, isPromotionActive, canPreviewPromotion } from '@/lib/promotion-entry';
import { homeTaskSummary } from '@/components/home/home-task-summary';
import { homeActionsCopy } from '@/i18n/home-actions';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { zh } from '@/i18n/messages/zh';

vi.mock('@/services/native-push', () => ({ revokeNativePush: vi.fn(), resumeNativePush: vi.fn() }));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => vi.useRealTimers());
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); await Vue.nextTick(); };
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function evaluate(source: string, deps: Record<string, any>, result: string) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function('deps', `const {${Object.keys(deps).join(',')}}=deps;${code};return ${result};`)(deps);
}
function fixture() {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1, remotePhoneBindingInvalid: false, setTaskReadPageVisible: vi.fn() });
  const locale = Vue.reactive({ code: 'zh' });
  let revision = 0, environment = 'dev';
  const window = createPassiveReadWindow();
  const scope = () => JSON.stringify([app.accountKey, app.accountBindingEpoch, locale.code, environment, revision]);
  const helper = { runPassiveTabRead: <T>(resource: string, read: () => Promise<T>, query?: unknown, hasCache?: () => boolean) => window.run(scope(), resource, read, query, hasCache), invalidatePassiveTabRead: window.invalidate, passiveTabReadScope: scope };
  let visit = 0;
  const activate = () => window.notifyPageActivation(`/fixture/visit-${++visit}`);
  const protect = () => { for (let i = 0; i < 4; i++) window.notifyPageActivation(`/fixture/burst-${++visit}`, { tabSwitch: true }); };
  const reads: Record<string, number> = {};
  const read = <T>(key: string, value: T) => vi.fn(async () => { reads[key] = (reads[key] ?? 0) + 1; return value === undefined ? true : value; });
  const rawHome = read('home', undefined), rawFleet = read('fleet', true), rawWithdrawal = read('withdrawals', undefined);
  Object.assign(app, { ensureHomeTruth: () => helper.runPassiveTabRead('home-truth', rawHome), refreshRemoteFleet: rawFleet, refreshRemoteWithdrawalList: rawWithdrawal });
  const orderRead = read('orders', undefined), securityRead = vi.fn(async () => ({ twoFactorEnabled: false }));
  const quest = { remoteStatus: 'ready', dayOneRequiredTaskCount: 0, dayOneSnapshotStatus: 'SNAPSHOT', remoteQuests: [], refreshRemote: read('quest', undefined) };
  const trial = { status: 'none', refreshRemote: read('trial', true), refreshEligibilityRemote: read('trial-eligibility', true) };
  const voucherRead = read('voucher', undefined);
  const voucher = { claimedUnused: [], revalidateRemote: () => helper.runPassiveTabRead('voucher', voucherRead), refreshRemote: voucherRead };
  const orders = { orders: [{ status: 'placed' }], refreshRemote: orderRead };
  const hooks = () => ({ show: [] as Array<() => void>, hide: [] as Array<() => void>, mount: [] as Array<() => void> });
  function actions() {
    const lifecycle = hooks();
    const modules: Record<string, any> = {
      '@/store/data-visibility': { useDataVisibility: () => ({ hidden: false, mask: String }) },
      vue: { ...Vue, onMounted: (fn: () => void) => lifecycle.mount.push(fn), onUnmounted: () => {}, watch: () => {} },
      '@/lib/passive-tab-read': helper, '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => lifecycle.show.push(fn), onHide: (fn: () => void) => lifecycle.hide.push(fn) },
      '@/store/app': { useApp: () => app }, '@/store/session': { useSession: () => ({ isCurrentDeviceCalibrated: () => true }) }, '@/store/quest': { useQuest: () => quest },
      '@/store/orders': { useOrders: () => orders }, '@/store/voucher': { useVoucher: () => voucher }, '@/store/free-trial': { useFreeTrial: () => trial }, '@/store/config': { useConfig: () => ({ isEnabled: () => false }) },
      '@/api/runtime': { remoteApiEnabled: true, accountApi: { securityOverview: securityRead } }, '@/lib/native-phone-runtime': { hasNativePhoneRuntime: () => true }, '@/lib/route': { navTo: vi.fn() },
      '@/i18n/format': { fmt }, '@/i18n/use-t': { useT: () => Vue.ref(zh) }, '@/i18n/home-actions': { homeActionsCopy }, '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref({ unpaid: 'orders', orders: '{n}', security: 'security' }) },
      '@/store/locale': { useLocaleStore: () => locale }, '@/composables/use-now': { useNow: () => Vue.ref(100) }, '@/lib/amount-display': { formatAmount }, './home-task-summary': { homeTaskSummary },
    };
    const script = actionSource.split('<script setup lang="ts">')[1].split('</script>')[0];
    const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const view = new Function('require', 'exports', code + ';return {refresh,rows,initialPending};')((name: string) => name.endsWith('.vue') ? {} : modules[name], {});
    return { ...view, show: () => lifecycle.show.forEach(fn => fn()), hide: () => lifecycle.hide.forEach(fn => fn()), mount: () => lifecycle.mount.forEach(fn => fn()) };
  }
  function me() {
    const lifecycle = hooks();
    const okay = read('catalog', true), done = vi.fn(async () => {});
    const dependencies = { ...helper, app, orders, trial, voucher, auth: { isAuthenticated: true, accountId: 'user:7' }, remoteApiEnabled: true,
      profile: { refreshAvatar: read('profile-avatar', undefined) },
      accountApi: { securityOverview: securityRead }, sessionVault: { read: () => ({ user: { userId: 7 } }) },
      deposits: { remoteReceiptInitialStatus: 'ready', refreshRemoteVietQrDeposits: read('deposits', undefined) }, commission: { ensureCanonicalEvents: () => helper.runPassiveTabRead('commission-events', read('commission', undefined)) }, notifications: { hasRemoteSnapshot: true, refreshRemote: read('notifications', undefined) }, conversations: { refresh: read('conversations', undefined) },
      vrank: { ensureCanonicalVRank: () => helper.runPassiveTabRead('v-rank', read('rank', undefined)) }, genesis: { remotePublicReadState: 'ready', remoteAccountReadState: 'ready', syncRemote: read('genesis', true) }, bills: { summaryStatus: 'ready', refreshSummary: read('bills', undefined) }, market: { syncRemote: read('market', undefined) }, config: { revalidate: () => helper.runPassiveTabRead('config', read('config', undefined)) },
      revalidateProductCatalog: () => helper.runPassiveTabRead('product-catalog', okay), refreshEarningsReleaseStatus: read('release', true), settleRemoteMeLoaders, runRemoteOrdersRefresh,
      captureAccountScope: () => scope(), isCurrentAccountScope: (saved: string) => saved === scope(), binarySessionReady: () => true,
      watch: () => {}, onShow: (fn: () => void) => lifecycle.show.push(fn), onHide: (fn: () => void) => lifecycle.hide.push(fn), onUnmounted: () => {}, subscribeRuntimeRevision: () => () => {}, ref: Vue.ref,
    };
    const script = `let remoteMeActive=true,remoteOrdersRequest=0,remoteSecurityRequest=0;const remoteOrdersLoading=ref(false),remoteOrdersFailed=ref(false),remoteOrdersHasRead=ref(false),remoteSecurity=ref(null);` + meSource.slice(meSource.indexOf('async function refreshRemoteFunds()'), meSource.indexOf('function handleQuickItem('));
    const view = evaluate(script, dependencies, '{refreshRemoteMe,refreshRemoteSecurity,refreshRemoteOrders,remoteSecurity,remoteOrdersHasRead,remoteOrdersFailed,remoteOrdersLoading}');
    return { ...view, show: () => lifecycle.show.forEach(fn => fn()), hide: () => lifecycle.hide.forEach(fn => fn()) };
  }
  return { app, locale, helper, reads, read, activate, protect, trial, voucher, orderRead, securityRead, actions, me, revision: () => revision++, environment: () => { environment = 'production'; } };
}
it('actual Home mounted/show and My consumers share one pending security/orders read and both receive the result', async () => {
  const f = fixture(), security = deferred<{ twoFactorEnabled: boolean }>(); f.securityRead.mockReturnValueOnce(security.promise);
  const home = f.actions(), my = f.me(); home.mount(); home.show(); const personal = my.refreshRemoteSecurity(); await flush();
  expect(f.securityRead).toHaveBeenCalledTimes(1); expect(f.orderRead).toHaveBeenCalledTimes(1);
  security.resolve({ twoFactorEnabled: false }); await personal; await flush();
  expect(my.remoteSecurity.value.twoFactorEnabled).toBe(false); expect(home.rows.value.some((row: any) => row.key === 'security')).toBe(true);
  await my.refreshRemoteOrders(true); expect(my.remoteOrdersHasRead.value).toBe(true); expect(f.orderRead).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 4; i++) { home.hide(); home.show(); await my.refreshRemoteSecurity(); await my.refreshRemoteOrders(true); }
  expect(f.securityRead).toHaveBeenCalledTimes(1); expect(f.orderRead).toHaveBeenCalledTimes(1);
});
it('actual Home hide/pending/show reuses the read and completes local cold UI without a second GET', async () => {
  const f = fixture(), pending = deferred<{ twoFactorEnabled: boolean }>(); f.securityRead.mockReturnValueOnce(pending.promise); const home = f.actions();
  home.show(); home.hide(); pending.resolve({ twoFactorEnabled: false }); await flush(); expect(home.initialPending.value).toBe(true);
  home.show(); await flush(); expect(home.initialPending.value).toBe(false); expect(f.securityRead).toHaveBeenCalledTimes(1);
  expect(home.rows.value.some((row: any) => row.key === 'security')).toBe(true);
});
it('actual repeated failed My order reads stay failed without a request storm, and explicit manual retry clears the old rejection', async () => {
  const f = fixture(), my = f.me(); f.orderRead.mockRejectedValueOnce(new Error('offline'));
  await my.refreshRemoteOrders(true); expect(my.remoteOrdersFailed.value).toBe(true);
  const passive = my.refreshRemoteOrders(true); expect(my.remoteOrdersFailed.value).toBe(true); expect(my.remoteOrdersLoading.value).toBe(false); await passive; expect(f.orderRead).toHaveBeenCalledTimes(1); expect(my.remoteOrdersFailed.value).toBe(true);
  await my.refreshRemoteOrders(); expect(my.remoteOrdersFailed.value).toBe(false); expect(f.orderRead).toHaveBeenCalledTimes(2);
  await my.refreshRemoteOrders(true); expect(my.remoteOrdersFailed.value).toBe(false); expect(f.orderRead).toHaveBeenCalledTimes(3);
});
it('actual Home refreshes each normal visit, deduplicates same visit, and scope replacement rejects late old security state', async () => {
  const f = fixture(), home = f.actions(); await home.refresh(); vi.advanceTimersByTime(9999); await home.refresh(); expect(f.securityRead).toHaveBeenCalledTimes(1);
  f.activate(); await home.refresh(); expect(f.securityRead).toHaveBeenCalledTimes(2);
  const pending = deferred<{ twoFactorEnabled: boolean }>(); f.helper.invalidatePassiveTabRead('security-overview'); f.securityRead.mockReturnValueOnce(pending.promise); const old = home.refresh();
  f.app.accountBindingEpoch++; f.securityRead.mockResolvedValueOnce({ twoFactorEnabled: true }); await home.refresh(); pending.resolve({ twoFactorEnabled: false }); await old;
  expect(home.rows.value.some((row: any) => row.key === 'security')).toBe(false);
});
function promotion() {
  const f = fixture(), id = Vue.ref('A'), shown: Array<() => void> = [], hidden: Array<() => void> = [], mounted: Array<() => void> = [];
  const get = vi.fn(async (activityId: string) => ({ activityId, state: 'ACTIVE', eligibility: 'ELIGIBLE' }));
  const modules: Record<string, any> = { vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn), onBeforeUnmount: () => {} },
    '@/lib/passive-tab-read': f.helper, '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    '@/api/runtime': { promotionApi: { get }, remoteApiEnabled: true, apiRuntimeConfig: Vue.reactive({ environment: 'dev' }), sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    '@/store/app': { useApp: () => f.app }, '@/store/locale': { useLocaleStore: () => f.locale }, '@/lib/promotion-entry': { canPreviewPromotion, createPromotionReadFence, isPromotionActive } };
  const code = ts.transpileModule(promotionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, exports: any = {};
  new Function('require', 'exports', code)((key: string) => modules[key], exports);
  const effect = Vue.effectScope(); const view = effect.run(() => exports.usePromotionContext(id, true));
  return { ...f, id, get, view, effect, show: () => shown.forEach(fn => fn()), hide: () => hidden.forEach(fn => fn()), mount: () => mounted.forEach(fn => fn()) };
}
it('actual promotion composable keeps pending, query identities and manual recovery separate', async () => {
  const p = promotion(), first = deferred<any>(); p.get.mockReturnValueOnce(first.promise); p.mount(); p.show(); expect(p.get).toHaveBeenCalledTimes(1);
  p.hide(); first.resolve({ activityId: 'A', state: 'ACTIVE', eligibility: 'ELIGIBLE' }); await flush(); p.show(); await flush();
  expect(p.view.activity.value.activityId).toBe('A'); expect(p.get).toHaveBeenCalledTimes(1);
  p.id.value = 'B'; await flush(); expect(p.get).toHaveBeenCalledTimes(2); expect(p.view.activity.value.activityId).toBe('B');
  p.get.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 })); await p.view.refresh(); expect(p.view.status.value).toBe('error'); expect(p.view.activity.value).toBe(null);
  p.hide(); p.show(); await flush(); expect(p.get).toHaveBeenCalledTimes(4); expect(p.view.activity.value.activityId).toBe('B'); p.effect.stop();
});



// Execute the actual top-level show callbacks; mocked APIs count calls, while the real window owns timing.
function showCallback(source: string, index = 0) {
  const script = source.split('<script setup lang="ts">')[1].split('</script>')[0];
  const ast = ts.createSourceFile('tab.ts', script, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  return ast.statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'onShow')[index].getText(ast);
}
it('all five actual Tab show groups and Home child reuse protected warm reads and refresh after protection on a new visit', async () => {
  const f = fixture(), my = f.me(), actions = f.actions(), show: Array<() => void> = [];
  const ensure = (key: string, apiKey = key) => () => f.helper.runPassiveTabRead(key, f.read(apiKey, true));
  const common = { ...f.helper, remoteApiEnabled: true, app: f.app, onShow: (fn: () => void) => show.push(fn),
    freeTrial: f.trial, config: { revalidate: () => f.helper.runPassiveTabRead('config', f.read('config', undefined)) }, observeDayOneEarnPage: vi.fn(), observeDayOneStorePage: vi.fn(),
    takeNavigationQuery: () => '', publicOnly: Vue.ref(false), readPromotionQuery: vi.fn(), voucher: f.voucher,
    genesisCfg: { loaded: true, refresh: f.read('genesis-config', undefined) }, genesis: { remotePublicReadState: 'ready', remoteAccountReadState: 'ready', syncRemote: f.read('genesis', undefined) },
    refreshServerProductPhase: f.read('phase', true), revalidateProductCatalog: ensure('product-catalog', 'catalog'),
    vrank: { ensureCanonicalVRank: ensure('v-rank', 'rank') }, commission: { ensureCanonicalBinary: ensure('commission-binary', 'binary'), ensureCanonicalEvents: ensure('commission-events', 'commission') },
    network: { ensureCanonicalNetwork: ensure('network') }, refreshRemotePool: () => f.helper.runPassiveTabRead('leadership-pool', f.read('pool', undefined)),
  };
  evaluate('let earnPageVisible=false;' + showCallback(earnSource), common, 'null');
  evaluate('let storePageVisible=false;' + showCallback(storeSource), common, 'null');
  evaluate('let remotePoolVisible=false;' + showCallback(teamSource), common, 'null');
  const homeReads = ensure('home-promotions');
  const homeDeps = { ...common, ref: Vue.ref, watch: () => {}, onHide: () => {}, onUnmounted: () => {}, onLoad: () => {}, locale: f.locale,
    sessionVault: { read: () => ({ user: { userId: 7 } }) }, createPromotionReadFence, isPromotionActive,
    readHomePromotions: async () => { await homeReads(); return { items: [] }; } };
  evaluate(homeSource.slice(homeSource.indexOf('const homePromotions ='), homeSource.indexOf('</script>')), homeDeps, 'null');
  const cycle = async () => { for (const callback of show) { callback(); await flush(); } await actions.refresh(); await my.refreshRemoteMe(); await flush(); };
  await cycle(); const cold = { ...f.reads }, securityCalls = f.securityRead.mock.calls.length;
  expect(Object.keys(cold)).toEqual(expect.arrayContaining(['home', 'fleet', 'trial', 'quest', 'orders', 'withdrawals', 'release', 'deposits', 'notifications', 'conversations', 'voucher', 'rank', 'genesis', 'bills', 'market', 'config', 'catalog', 'binary', 'network', 'pool', 'phase', 'genesis-config', 'home-promotions']));
  f.protect(); for (let i = 0; i < 5; i++) await cycle(); vi.advanceTimersByTime(2999); await cycle();
  expect(f.reads).toEqual(cold); expect(f.securityRead).toHaveBeenCalledTimes(securityCalls);
  vi.advanceTimersByTime(1); f.activate(); await cycle();
  for (const [key, count] of Object.entries(cold)) expect(f.reads[key], key).toBe(count + 1);
  expect(f.securityRead).toHaveBeenCalledTimes(securityCalls + 1);
});

function referral() {
  const f = fixture(), shows: Array<() => void> = [], hides: Array<() => void> = [];
  const list = vi.fn(async () => ({ items: [{ activityId: 'A', template: 'DIRECT_REFERRAL', state: 'ACTIVE' }], nextCursor: null as string | null, hasMore: false }));
  const progress = vi.fn(async (id: string) => ({ activityId: id, qualifyingOrders: 1 }));
  const modules: Record<string, any> = { vue: { ...Vue, onBeforeUnmount: () => {} }, '@/lib/passive-tab-read': f.helper,
    '@/store/data-visibility': { useDataVisibility: () => ({ hidden: false, mask: String }) },
    '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => shows.push(fn), onHide: (fn: () => void) => hides.push(fn) },
    '@/api/runtime': { promotionApi: { list, referral: progress }, remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 7 } }) } },
    '@/store/app': { useApp: () => f.app }, '@/store/auth': { useAuth: () => ({ isAuthenticated: true }) }, '@/store/locale': { useLocaleStore: () => f.locale },
    '@/i18n/use-t': { useT: () => Vue.ref(zh) }, '@/i18n/team-redesign': { teamRedesignCopy: () => ({}) }, '@/lib/promotion-display': { localized: () => '' },
    '@/lib/promotion-entry': { isPromotionActive, promotionDisclosures: () => [] }, '@/components/catalog-machine-image': { promotionMachineSlots: () => [] },
    '@/mock/products': { getProduct: () => undefined }, '@/store/product-catalog': { productCatalogState: Vue.reactive({ status: 'ready' }), refreshProductCatalog: vi.fn(), revalidateProductCatalog: () => f.helper.runPassiveTabRead('product-catalog', f.read('catalog', true)) } };
  const script = referralSource.split('<script setup lang="ts">')[1].split('</script>')[0];
  const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const effect = Vue.effectScope();
  const view = effect.run(() => new Function('require', 'exports', 'defineEmits', code + ';return {activities,error,loading,loadActivities,loadProgress};')((id: string) => id.endsWith('.vue') ? {} : modules[id], {}, () => () => {}));
  return { ...f, list, progress, view, effect, show: () => shows.forEach(fn => fn()), hide: () => hides.forEach(fn => fn()) };
}
it('actual Team referral child shares immediate/show list and per-object progress and separates next-cursor reads', async () => {
  const r = referral(); r.show(); await flush(); expect(r.list).toHaveBeenCalledTimes(1); expect(r.progress).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 4; i++) { r.hide(); r.show(); await flush(); }
  expect(r.list).toHaveBeenCalledTimes(1); expect(r.progress).toHaveBeenCalledTimes(1);
  r.activate(); r.list.mockResolvedValueOnce({ items: [{ activityId: 'A', template: 'DIRECT_REFERRAL', state: 'ACTIVE' }], nextCursor: 'B', hasMore: true });
  r.hide(); r.show(); await flush(); expect(r.list).toHaveBeenCalledTimes(2); expect(r.progress).toHaveBeenCalledTimes(2);
  r.list.mockResolvedValueOnce({ items: [{ activityId: 'B', template: 'DIRECT_REFERRAL', state: 'ACTIVE' }], nextCursor: null, hasMore: false });
  await r.view.loadActivities(false, true); expect(r.list).toHaveBeenCalledTimes(3); expect(r.progress).toHaveBeenCalledTimes(3); expect(r.view.activities.value.map((a: any) => a.activityId)).toEqual(['A', 'B']);
  r.effect.stop();
});

it('actual referral passive cached failure keeps error feedback synchronously and manual recovery cannot replay the old rejection', async () => {
  const r = referral(); await flush();
  r.helper.invalidatePassiveTabRead('promotion-list'); r.list.mockRejectedValueOnce(new Error('offline')); await r.view.loadActivities(true, true); expect(r.view.error.value).toBe(true);
  const calls = r.list.mock.calls.length; r.hide(); r.show(); expect(r.view.error.value).toBe(true); await flush(); expect(r.list).toHaveBeenCalledTimes(calls);
  await r.view.loadActivities(true); expect(r.view.error.value).toBe(false); expect(r.list).toHaveBeenCalledTimes(calls + 1);
  r.hide(); r.show(); await flush(); expect(r.view.error.value).toBe(false); expect(r.list).toHaveBeenCalledTimes(calls + 2); r.effect.stop();
});
