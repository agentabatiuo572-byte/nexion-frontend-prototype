import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { createPassiveReadWindow, capturePassiveWriteRevision } from '@/lib/passive-read-window';
import passiveSource from '@/lib/passive-tab-read.ts?raw';
import * as runtimeRevision from '@/api/order-api';
import homeSource from './promotion-entry.vue?raw';
import teamSource from './referral-progress.vue?raw';
import catalogSource from '@/store/product-catalog.ts?raw';
import homeReadSource from '@/store/home-promotions.ts?raw';
import homePageSource from '@/pages/index/index.vue?raw';
import type { PublicPromotion, PublicPromotionPage } from '@/api/promotion-contracts';
import type { ProductCatalogSnapshot } from '@/api/product-catalog-api';
import * as promotionEntry from '@/lib/promotion-entry';
import * as display from '@/lib/promotion-display';
import { promotionMachineSlots } from '@/components/catalog-machine-image';
import { promotionZH } from '@/i18n/messages/promotion';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { fmt } from '@/i18n/format';
import { ApiError } from '@/api/errors';
import summarySource from '@/components/team/team-summary-card.vue?raw';
import recordsSource from '@/components/team/invite-detail-sheet.vue?raw';
import teamPageSource from '@/pages/team/team.vue?raw';
import { mountEntry, text, slot } from '@/lib/entry-review.test-support';
import { en } from '@/i18n/messages/en';
import { referralSettlementStatus } from '@/i18n/team-redesign';
import { formatAmount } from '@/lib/amount-display';
import { formatDisplayDate } from '@/lib/display-date';

const transpile = (text: string) => ts.transpileModule(text, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
function evaluate(text: string, modules: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  new Function('require', 'exports', transpile(text))((id: string) => {
    if (id in modules) return modules[id];
    if (id.endsWith('.vue')) return { default: { render: () => null } };
    throw new Error('Unexpected refresh dependency ' + id);
  }, exports);
  return exports;
}
const flush = async () => { await Vue.nextTick(); for (let i = 0; i < 16; i++) await Promise.resolve(); await Vue.nextTick(); };
const cleanups: Array<() => void> = [];
function expirePassiveRead() { const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+15_001);cleanups.push(()=>clock.mockRestore()); }
beforeEach(() => {
  vi.stubGlobal('uni', { getStorageSync: () => undefined, setStorageSync: vi.fn() });
  setActivePinia(createPinia());
});
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function activity(sku = 'old-sku', extra: Partial<PublicPromotion> = {}): PublicPromotion {
  return {
    activityId: 'A', version: 1, template: 'DIRECT_REFERRAL', state: 'ACTIVE', startsAt: '2026-10-01T00:00:00Z',
    endsAt: '2026-11-01T00:00:00Z', serverTime: '2026-10-26T00:00:00Z', title: { zh: '活动', en: 'Offer', vi: 'Ưu đãi' },
    terms: { zh: '规则', en: 'Terms', vi: 'Điều khoản' }, placement: 'home.purchase-promotion', target: 'STORE',
    productNos: [sku], minimumClientCapabilities: [], eligibility: 'ESTIMATE_ELIGIBLE', eligibilityMessage: null,
    rewardRules: [{ ruleId: 'rule', productNo: sku, minBuyQty: 1, repeatMode: 'PER_GROUP', maxGroups: { mode: 'UNLIMITED' },
      maxGroupsPerPerson: { mode: 'UNLIMITED' }, inviterReward: null, buyerReward: { rewardRuleId: 'reward', type: 'DEVICE',
        beneficiaryRole: 'BUYER', giftProductNo: 'gift-sku', quantity: 1, disclosure: { title: {}, terms: {}, refundTerms: {},
          benefitDescription: {}, deviceRights: null, deviceName: 'Gift' } } }] as PublicPromotion['rewardRules'], ...extra,
  };
}
const page = (items: PublicPromotion[], more = false): PublicPromotionPage => ({ items, hasMore: more, nextCursor: more ? 'page-2' : null });
const snapshot = (sku = 'old-sku', url = 'https://images.example/old'): ProductCatalogSnapshot => ({
  products: [{ id: sku, name: sku, imageUrl: url }], source: 'catalog', sourceEnvironment: 'PRODUCTION', runId: '',
  serverCanonical: true, revision: url,
} as ProductCatalogSnapshot);
function find(node: Vue.VNode, predicate: (node: Vue.VNode) => boolean): Vue.VNode | undefined {
  if (predicate(node)) return node;
  if (Array.isArray(node.children)) for (const child of node.children) if (Vue.isVNode(child)) {
    const match = find(child, predicate); if (match) return match;
  }
}

function platform(signedIn = true) {
  // Home reports its visibility to the task-read scheduler on show/hide.
  const signed = Vue.ref(signedIn), app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1, setTaskReadPageVisible: vi.fn() });
  const list = vi.fn<(...args: unknown[]) => Promise<PublicPromotionPage>>().mockResolvedValue(page([activity()]));
  const referral = vi.fn().mockImplementation(async (id: string) => ({ activityId: id, qualifyingOrders: 1, ownRewards: [] }));
  const catalogApi = vi.fn<() => Promise<ProductCatalogSnapshot>>().mockResolvedValue(snapshot());
  const runtime = { remoteApiEnabled: true, apiRuntimeConfig: { baseUrl: 'https://api.example/' },
    sessionVault: { read: () => signed.value ? { user: { userId: 7 } } : null },
    promotionApi: { list, referral }, productCatalogApi: { catalog: catalogApi } };
  const window = createPassiveReadWindow();
  const passive = evaluate(passiveSource, {
    pinia: { getActivePinia }, '@/api/runtime': runtime, '@/api/order-api': runtimeRevision,
    '@/store/locale': { useLocaleStore: () => ({ code: 'zh' }) },
    './remote-account-epoch': { remoteAccountScope: { snapshot: () => ({ accountKey: app.accountKey, epoch: app.accountBindingEpoch }) } },
    './passive-read-window': { capturePassiveWriteRevision, passiveTabReadWindow: window,
      invalidateBeforePassiveTabRead: (resource: string) => window.invalidate(resource, true), notifyPageActivation: window.notifyPageActivation },
  });
  // Run the real shared catalog store against API-boundary mocks, including its request epochs.
  let products: ProductCatalogSnapshot['products'] = [];
  const catalog = evaluate(catalogSource, {
    vue: Vue, '@/api/runtime': runtime, '@/lib/passive-tab-read': passive,
    '@/api/order-api': { ...runtimeRevision, subscribeRuntimeRevision: (listener: Parameters<typeof runtimeRevision.subscribeRuntimeRevision>[0]) => {
      const stop = runtimeRevision.subscribeRuntimeRevision(listener); cleanups.push(stop); return stop;
    } },
    '@/lib/brand-copy': { nexGridBrandText: (text: string) => text },
    '@/api/errors': { ApiError },
    '@/mock/products': { clearProductCatalog() { products = []; }, replaceProductCatalog(rows: typeof products) { products = rows; } },
  });
  const homeRead = evaluate(homeReadSource, { '@/api/runtime': runtime, '@/api/errors': { ApiError }, '@/lib/passive-tab-read': passive });
  function mount(kind: 'home' | 'team', supplied?: PublicPromotion[]) {
    const shown: Array<() => void> = [], hidden: Array<() => void> = [], mounted: Array<() => void> = [], unmounted: Array<() => void> = [];
    const source = kind === 'home' ? homeSource : teamSource;
    const route = kind === 'home' ? '/pages/index/index' : '/pages/team/team';
    window.notifyPageActivation(route);
    const props = Vue.reactive({ mode: 'home', active: true, activities: supplied });
    const component = evaluate(compileScript(parse(source).descriptor, { id: 'refresh-' + kind }).content, {
      vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn), onBeforeUnmount: (fn: () => void) => unmounted.push(fn) },
      '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
      '@/api/runtime': runtime, '@/store/app': { useApp: () => app }, '@/store/auth': { useAuth: () => ({ get isAuthenticated() { return signed.value; } }) },
      '@/store/home-promotions': homeRead,
      '@/store/data-visibility': { useDataVisibility },
      '@/lib/passive-tab-read': passive,
      '@/store/locale': { useLocaleStore: () => ({ code: 'zh' }) }, '@/i18n/use-t': { useT: () => Vue.ref({ promotion: promotionZH }) },
      '@/store/theme': { useTheme: () => ({ resolved: 'dark' }) },
      '@/i18n/team-redesign': { teamRedesignCopy }, '@/i18n/format': { fmt }, '@/lib/route': { navTo() {} },
      '@/mock/products': { getProduct: (id: string) => products.find(p => p.id === id) }, '@/store/product-catalog': catalog,
      '@/lib/promotion-entry': promotionEntry, '@/lib/promotion-display': display, '@/components/catalog-machine-image': { promotionMachineSlots },
    }).default;
    const scope = Vue.effectScope();
    const view = scope.run(() => component.setup(props, { emit() {}, expose() {} }))!;
    mounted.forEach(fn => fn());
    const render = new Function('Vue', compile(parse(source).descriptor.template!.content, { mode: 'function', prefixIdentifiers: true,
      isCustomElement: tag => ['view', 'text', 'image'].includes(tag) }).code)(Vue);
    const hide = () => { window.notifyPageActivation('/pages/me/preferences'); hidden.forEach(fn => fn()); };
    const show = () => { window.notifyPageActivation(route); shown.forEach(fn => fn()); };
    const stop = () => { unmounted.forEach(fn => fn()); scope.stop(); };
    cleanups.push(stop);
    return { view, props, show, hide, stop,
      async node() {
        let node!: Vue.VNode;
        const empty = { render: () => null };
        await renderToString(Vue.createSSRApp({ components: { NxButton: empty, CatalogMachineImage: empty, PromotionTerms: empty, TeamArt: empty, RewardRows: empty },
          render: () => { node = render(Vue.proxyRefs({ ...Vue.toRefs(props), ...view }), []); return node; } }));
        return node;
      },
    };
  }
  function mountHomePage(){
    window.notifyPageActivation('/pages/index/index');
    const hooks={show:[] as Array<()=>void>,hide:[] as Array<()=>void>};
    const deps={ref:Vue.ref,watch:Vue.watch,app,locale:{code:'zh',ensureSystemDetected(){}},config:{load:async()=>{},revalidate:async()=>{}},remoteApiEnabled:true,promotionApi:runtime.promotionApi,sessionVault:runtime.sessionVault,...homeRead,
      createPromotionReadFence:promotionEntry.createPromotionReadFence,isPromotionActive:promotionEntry.isPromotionActive,onShow:(fn:()=>void)=>hooks.show.push(fn),onHide:(fn:()=>void)=>hooks.hide.push(fn),onUnmounted:()=>{},onLoad:()=>{}};
    const script=homePageSource.slice(homePageSource.indexOf('const homePromotions ='),homePageSource.indexOf('</script>'));
    const scope=Vue.effectScope();cleanups.push(()=>scope.stop());
    const view=scope.run(()=>new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;${ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return {homePromotions,homePromotionStatus};`)(deps));
    return{view,show:()=>{window.notifyPageActivation('/pages/index/index');hooks.show.forEach(fn=>fn());},hide:()=>{window.notifyPageActivation('/pages/me/preferences');hooks.hide.forEach(fn=>fn());}};
  }
  return { app, signed, list, referral, catalogApi, catalog, mount, mountHomePage, activate: window.notifyPageActivation };
}

it('the actual Home page and Store advert share one placement read while hidden and during protected Tab returns',async()=>{
  const p=platform(),pending=deferred<PublicPromotionPage>();p.list.mockReturnValueOnce(pending.promise);
  const home=p.mountHomePage();home.show();const store=p.mount('home');expect(p.list).toHaveBeenCalledTimes(1);
  home.hide();store.hide();pending.resolve(page([activity()]));await flush();
  expect(home.view.homePromotions.value).toHaveLength(1);expect(store.view.items.value).toHaveLength(1);
  for (const route of ['/pages/index/index', '/pages/earn/earn', '/pages/store/store']) p.activate(route, { tabSwitch: true });
  for(let round=0;round<3;round++){home.show();store.show();home.hide();store.hide();}await flush();
  expect(p.list).toHaveBeenCalledTimes(1);expect(p.catalogApi).toHaveBeenCalledTimes(1);
});

it('team automatically refreshes progress while visible without resetting rules, catalog or expansion', async () => {
  vi.useFakeTimers();
  const p = platform(), team = p.mount('team'); await flush();
  team.show(); await flush();
  team.view.expandedActivity.value = 'A';
  expect(team.view.referralImageProps(team.view.activities.value[0])).toMatchObject({ sku: 'old-sku', imageUrl: 'https://images.example/old' });
  p.referral.mockResolvedValueOnce({ activityId: 'A', qualifyingOrders: 2, ownRewards: [] });
  expect(find(await team.node(), node => node.props?.label === promotionZH.refresh)).toBeUndefined();
  await vi.advanceTimersByTimeAsync(30_000); await flush();
  expect(p.list).toHaveBeenCalledTimes(1);
  expect(p.catalogApi).toHaveBeenCalledTimes(1); expect(p.referral).toHaveBeenCalledTimes(2);
  expect(team.view.qualifyingCount('A')).toBe(2);
  expect(team.view.referralImageProps(team.view.activities.value[0])).toMatchObject({ sku: 'old-sku', imageUrl: 'https://images.example/old' });
  expect(team.view.expandedActivity.value).toBe('A');
});

it('team first-purchase progress masks the actual count and own rewards without changing reads or the underlying result', async () => {
  vi.useFakeTimers();
  const p = platform(), team = p.mount('team'), visibility = useDataVisibility();
  const ownRewards = [{ obligationId: 'personal-reward', reward: { type: 'UVT', amount: '123.450000' }, state: 'ISSUED' }];
  p.referral.mockResolvedValue({ activityId: 'A', qualifyingOrders: 271, ownRewards });
  await flush();
  team.show(); await flush();
  const open = find(await team.node(), node => node.props?.label === teamRedesignCopy('zh').viewProgress)!;
  open.props!.onClick(); await flush();
  const count = (node: Vue.VNode) => find(node, item => item.props?.class === 'referral-number')!;
  const rewards = (node: Vue.VNode) => find(node, item => Array.isArray(item.props?.rewards))!;
  const before = await team.node();
  expect(count(before).children).toBe('271');
  expect(rewards(before).props?.['value-mask']).toBeUndefined();
  const calls = p.referral.mock.calls.length;

  visibility.toggle(); await Vue.nextTick();
  const hidden = await team.node();
  expect(count(hidden).children).toBe('••••');
  expect(rewards(hidden).props?.['value-mask']).toBe('••••');
  expect(rewards(hidden).props?.rewards).toEqual(ownRewards);
  expect(team.view.qualifyingCount('A')).toBe(271);
  expect(team.view.progress.value.A.ownRewards).toEqual(ownRewards);
  expect(p.referral).toHaveBeenCalledTimes(calls);
  expect(find(hidden, node => node.props?.label === teamRedesignCopy('zh').viewProgress)?.props?.disabled).toBe(false);

  p.referral.mockResolvedValueOnce({ activityId: 'A', qualifyingOrders: 282, ownRewards });
  await vi.advanceTimersByTimeAsync(30_000); await flush();
  expect(count(await team.node()).children).toBe('••••');
  visibility.toggle(); await Vue.nextTick();
  const revealed = await team.node();
  expect(count(revealed).children).toBe('282');
  expect(rewards(revealed).props?.['value-mask']).toBeUndefined();
});

it('team reset replaces paginated rules and drops removed or paused activities', async () => {
  const p = platform(); p.list.mockResolvedValueOnce(page([activity(), activity('b', { activityId: 'B' })], true));
  const team = p.mount('team'); await flush(); team.view.expandedActivity.value = 'A';
  p.list.mockResolvedValueOnce(page([activity('c', { activityId: 'C' })])); await team.view.loadActivities(false);
  expect(p.list).toHaveBeenLastCalledWith({ cursor: 'page-2', limit: 20 }, true);
  p.list.mockResolvedValueOnce(page([activity('paused', { state: 'PAUSED' }), activity('d', { activityId: 'D' })]));
  await team.view.loadActivities(true);
  expect(team.view.activities.value.map((row: PublicPromotion) => row.activityId)).toEqual(['D']);
  expect(team.view.expandedActivity.value).toBeNull(); expect(team.view.progress.value.A).toBeUndefined();
  expect(p.list).toHaveBeenLastCalledWith({ cursor: null, limit: 20 }, true);
});

it.each(['home', 'team'] as const)('%s return re-reads changed SKU rules and recovers a failed catalog through the APIs', async kind => {
  const p = platform(); p.catalogApi.mockRejectedValueOnce(new Error('catalog offline'));
  const screen = p.mount(kind); await flush(); expect(p.catalog.productCatalogState.status).toBe('error');
  expirePassiveRead();
  screen.hide();
  p.list.mockResolvedValueOnce(page([activity('new-sku', { version: 2 })]));
  p.catalogApi.mockResolvedValueOnce(snapshot('new-sku', 'https://images.example/recovered'));
  screen.show(); await flush();
  expect(p.list).toHaveBeenCalledTimes(2); expect(p.catalogApi).toHaveBeenCalledTimes(2);
  const row = kind === 'home' ? screen.view.items.value[0] : screen.view.activities.value[0];
  const image = kind === 'home' ? screen.view.promoSlots(row)[0] : screen.view.referralImageProps(row);
  expect(image).toMatchObject({ sku: 'new-sku', imageUrl: 'https://images.example/recovered' });
  expect(p.catalog.productCatalogState.status).toBe('ready');
});

it.each(['home', 'team'] as const)('%s refresh recovers an unchanged SKU with a new catalog image URL', async kind => {
  const p = platform(), screen = p.mount(kind); await flush();
  p.catalogApi.mockRejectedValueOnce(new Error('offline'));
  await (kind === 'home' ? screen.view.load(true) : screen.view.loadActivities(true));
  expect(p.catalog.productCatalogState.status).toBe('error');
  p.catalogApi.mockResolvedValueOnce(snapshot('old-sku', 'https://images.example/replacement'));
  await (kind === 'home' ? screen.view.load(true) : screen.view.loadActivities(true));
  const row = kind === 'home' ? screen.view.items.value[0] : screen.view.activities.value[0];
  const image = kind === 'home' ? screen.view.promoSlots(row)[0] : screen.view.referralImageProps(row);
  expect(image.imageUrl).toBe('https://images.example/replacement'); expect(p.catalogApi).toHaveBeenCalledTimes(3);
});

it('home supplied activity updates reuse the visit read until an explicit catalog retry', async () => {
  const p = platform(); p.catalogApi.mockRejectedValueOnce(new Error('offline'));
  const home = p.mount('home', [activity()]); await flush(); expect(p.catalog.productCatalogState.status).toBe('error');
  p.list.mockResolvedValueOnce(page([activity('new-sku')])); p.catalogApi.mockResolvedValueOnce(snapshot('new-sku', 'https://images.example/new'));
  home.props.activities = (await p.list()).items; await flush();
  expect(p.catalogApi).toHaveBeenCalledTimes(1);
  expect(home.view.promoSlots(home.view.items.value[0])[0].imageUrl).toBeUndefined();
  await home.view.load(true); await flush();
  expect(home.view.promoSlots(home.view.items.value[0])[0]).toMatchObject({ sku: 'new-sku', imageUrl: 'https://images.example/new' });
  expect(p.catalogApi).toHaveBeenCalledTimes(2);
});

it('home and team join an existing shared catalog request instead of superseding it', async () => {
  const p = platform(), pending = deferred<ProductCatalogSnapshot>(); p.catalogApi.mockReturnValueOnce(pending.promise);
  const home = p.mount('home'), team = p.mount('team');
  expect(p.catalogApi).toHaveBeenCalledTimes(1);
  pending.resolve(snapshot()); await flush();
  expect(home.view.items.value).toHaveLength(1); expect(team.view.activities.value).toHaveLength(1);
});

it('home retains the confirmed card through a warm read and ordinary failure, then accepts an empty publication', async () => {
  const p = platform(), screen = p.mount('home'); await flush();
  const confirmed = screen.view.items.value[0];
  expirePassiveRead();
  screen.hide(); const pending = deferred<PublicPromotionPage>(); p.list.mockReturnValueOnce(pending.promise); screen.show();
  expect(screen.view.items.value[0]).toBe(confirmed);
  pending.resolve(page([activity('new-sku')])); await flush();
  p.list.mockRejectedValueOnce(new Error('offline')); await screen.view.load(true);
  expect(screen.view.items.value[0].productNos).toEqual(['new-sku']); expect(screen.view.status.value).toBe('error');
  p.list.mockResolvedValueOnce(page([])); await screen.view.load(true); expect(screen.view.items.value).toEqual([]);
});

it('an already empty Home placement stays absent through its next passive read',async()=>{
  const p=platform();p.list.mockResolvedValueOnce(page([]));const screen=p.mount('home');await flush();expect(screen.view.listRead.value).toBe(true);
  expirePassiveRead();const pending=deferred<PublicPromotionPage>();p.list.mockReturnValueOnce(pending.promise);screen.hide();screen.show();
  expect(find(await screen.node(),n=>String(n.props?.class??'').includes('entry-placeholder'))).toBeUndefined();
  pending.resolve(page([]));await flush();expect(screen.view.items.value).toEqual([]);
});
it.each([401,403])('the actual advert clears old promotion presentation on exact HTTP %s',async status=>{
 const p=platform(),screen=p.mount('home');await flush();p.list.mockRejectedValueOnce(new ApiError({kind:'http',status,message:'denied'}));await screen.view.load(true);expect(screen.view.items.value).toEqual([]);expect(screen.view.status.value).toBe('error');
});

it.each(['home', 'team'] as const)('%s does not request a private catalog anonymously or while hidden', async kind => {
  const p = platform(false), screen = p.mount(kind); await flush(); expect(p.catalogApi).not.toHaveBeenCalled();
  expect(p.list).toHaveBeenLastCalledWith(expect.any(Object), false);
  screen.hide(); const reads = p.list.mock.calls.length; p.signed.value = true; await flush();
  await (kind === 'home' ? screen.view.load(true) : screen.view.loadActivities(true));
  expect(p.list).toHaveBeenCalledTimes(reads); expect(p.catalogApi).not.toHaveBeenCalled();
  screen.show(); await flush(); expect(p.catalogApi).toHaveBeenCalledTimes(1);
});

it.each(['hide', 'account', 'reset', 'logout'] as const)('team fences old list and progress responses after %s', async boundary => {
  const p = platform(), screen = p.mount('team'); await flush();
  const oldProgress = deferred<any>(); p.referral.mockReturnValueOnce(oldProgress.promise);
  const progressRead = screen.view.loadProgress('A');
  const oldPage = deferred<PublicPromotionPage>(); p.list.mockReturnValueOnce(oldPage.promise);
  const listRead = screen.view.loadActivities(false);
  p.list.mockResolvedValue(page([activity('new-sku', { activityId: 'NEW' })]));
  p.catalogApi.mockResolvedValue(snapshot('new-sku', 'https://images.example/new'));
  if (boundary === 'hide') { screen.hide(); screen.show(); }
  if (boundary === 'account') { p.catalog.prepareProductCatalog(); p.app.accountKey = 'user:8'; p.app.accountBindingEpoch++; }
  if (boundary === 'logout') p.signed.value = false;
  if (boundary === 'reset') await screen.view.loadActivities(true);
  await flush(); oldPage.resolve(page([activity('stale', { activityId: 'STALE' })]));
  oldProgress.resolve({ activityId: 'A', qualifyingOrders: 999, ownRewards: [] }); await Promise.all([listRead, progressRead]);
  expect(screen.view.activities.value.map((row: PublicPromotion) => row.activityId)).toEqual(['NEW']);
  expect(screen.view.progress.value.A).toBeUndefined(); expect(screen.view.error.value).toBe(false);
});

it('a previous account catalog cannot overwrite the new account shared catalog', async () => {
  const p = platform(), pending = deferred<ProductCatalogSnapshot>(); p.catalogApi.mockReturnValueOnce(pending.promise);
  const team = p.mount('team'); p.catalog.prepareProductCatalog();
  p.catalogApi.mockResolvedValue(snapshot('new-sku', 'https://images.example/new'));
  p.list.mockResolvedValue(page([activity('new-sku')])); p.app.accountKey = 'user:8'; p.app.accountBindingEpoch++;
  await flush(); pending.resolve(snapshot('old-sku', 'https://images.example/stale')); await flush();
  expect(team.view.referralImageProps(team.view.activities.value[0])).toMatchObject({ sku: 'new-sku', imageUrl: 'https://images.example/new' });
  expect(p.catalog.productCatalogState.revision).toBe('https://images.example/new');
});

// Merge coverage: privacy must apply to retained display snapshots as well as live authority.
function displayFixture(source: string, props: Record<string, unknown>) {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 });
  const locale = Vue.reactive({ code: 'en' });
  const runtime = Vue.reactive({ environment: 'dev' });
  const rewards = Vue.reactive({ loading: false, error: null as string | null, refresh: vi.fn(),
    snapshot: { lifetimeInviterNex: 876.54, settledCount: 34, pendingCount: 21,
      recentRewards: [{ settlementNo: 'record', amountNex: 123.45, settledAt: '2026-10-22T00:00:00Z', releaseBucket: 'AVAILABLE' }] } as null | {
        lifetimeInviterNex: number; settledCount: number; pendingCount: number;
        recentRewards: Array<{ settlementNo: string; amountNex: number; settledAt: string; releaseBucket: string }>;
      } });
  const button = { default: Vue.defineComponent({ props: ['label'], emits: ['click'], setup: (p, { emit }) => () => Vue.h('button', { role: 'button', onClick: () => emit('click') }, p.label) }) };
  const entry = mountEntry(source, {
    '@/store/data-visibility': { useDataVisibility }, '@/store/app': { useApp: () => app },
    '@/store/locale': { useLocaleStore: () => locale }, '@/api/runtime': { apiRuntimeConfig: runtime },
    '@/store/referral-reward': { useReferralReward: () => rewards }, '@/i18n/use-t': { useT: () => Vue.ref(en) },
    '@/i18n/team-redesign': { teamRedesignCopy, referralSettlementStatus }, '@/i18n/format': { dateLocale: () => 'en' },
    '@/lib/amount-display': { formatAmount }, '@/lib/display-date': { formatDisplayDate },
    '@/lib/route': { navTo: vi.fn() }, '@/composables/use-dialog-a11y': { useDialogA11y() {} },
    './team-art.vue': slot, './invite-rule-content.vue': slot, '@/components/liquid-glass.vue': slot,
    '@/components/ui/nx-button.vue': button,
  }, props);
  cleanups.push(entry.unmount);
  return { ...entry, app, locale, runtime, rewards, visibility: useDataVisibility() };
}

it.each(['loading', 'transient', 'strict', 'unproved'] as const)('summary masks %s display without granting live navigation', async state => {
  const onOpen = vi.fn(), onRetry = vi.fn();
  const view = displayFixture(summarySource, { status: state === 'loading' ? 'loading' : 'error',
    hasSnapshot: state !== 'unproved', transientFailure: state === 'transient' || state === 'unproved',
    total: 987654321, direct: 345, onOpen, onRetry });
  await flush();
  const numeral = view.nodes('team-summary__number')[0];
  const expected = state === 'loading' || state === 'transient' ? '987654321' : '—';
  expect(text(numeral)).toBe(expected);
  view.visibility.toggle(); await flush();
  expect(text(numeral)).toBe('••••');
  expect(text(view.nodes('team-summary__direct')[0])).not.toContain('345');
  expect(view.nodes('team-summary__body')[0].props.class).not.toContain('team-summary__body--long-count');
  const card = view.nodes('team-summary')[0];
  expect(card.props.role).toBeUndefined(); card.props.onClick(); expect(onOpen).not.toHaveBeenCalled();
  if (state !== 'loading') { view.control(en.network.retry)!.props.onClick(); expect(onRetry).toHaveBeenCalledOnce(); }
  view.visibility.toggle(); await flush(); expect(text(numeral)).toBe(expected);
});

it.each(['denial', 'account', 'binding', 'environment', 'locale'] as const)('retained invitation records remain masked through refresh and are revoked on %s', async boundary => {
  const view = displayFixture(recordsSource, { open: true, mode: 'records' }); await flush();
  const row = view.nodes('invite-detail__record')[0]; expect(text(row)).toContain('123.45');
  view.rewards.loading = true; view.rewards.snapshot = null; await flush();
  expect(view.nodes('invite-detail__record')[0]).toBe(row);
  view.visibility.toggle(); await flush();
  expect(text(view.nodes('invite-detail__total')[0])).not.toContain('876.54');
  expect(text(view.nodes('invite-detail__counts')[0])).not.toMatch(/34|21/);
  expect(text(row)).not.toContain('123.45'); expect(text(row)).toContain('2026');
  if (boundary === 'denial') view.rewards.error = '401';
  if (boundary === 'account') view.app.accountKey = 'user:8';
  if (boundary === 'binding') view.app.accountBindingEpoch++;
  if (boundary === 'environment') view.runtime.environment = 'prod';
  if (boundary === 'locale') view.locale.code = 'vi';
  await flush(); view.visibility.toggle(); await flush();
  expect(view.nodes('invite-detail__record')).toHaveLength(0);
  expect(text(view.nodes('invite-detail__total')[0])).toContain('—');
  expect(text(view.root)).not.toMatch(/876\.54|123\.45/);
});

it('the real rank template masks its retained presentation and respects its cleared placeholder', async () => {
  const template = parse(teamPageSource).descriptor.template!.content.match(/<text class="team-rank__level">[\s\S]*?<\/text>/)![0];
  const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true, isCustomElement: tag => tag === 'text' }).code)(Vue);
  const state = { visibility: useDataVisibility(), myRankDisplay: 'V2', remoteApiEnabled: true, vrank: { remoteReady: false }, myRank: 0 };
  const html = () => renderToString(Vue.createSSRApp({ render: () => render(state, []) }));
  expect(await html()).toContain('V2');
  state.visibility.toggle(); expect(await html()).toContain('••••'); expect(await html()).not.toContain('V2');
  state.myRankDisplay = 'V—'; state.visibility.toggle(); expect(await html()).toContain('V—');
});
