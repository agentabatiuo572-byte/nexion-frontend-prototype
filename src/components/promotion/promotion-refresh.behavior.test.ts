import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import homeSource from './promotion-entry.vue?raw';
import teamSource from './referral-progress.vue?raw';
import catalogSource from '@/store/product-catalog.ts?raw';
import type { PublicPromotion, PublicPromotionPage } from '@/api/promotion-contracts';
import type { ProductCatalogSnapshot } from '@/api/product-catalog-api';
import * as promotionEntry from '@/lib/promotion-entry';
import * as display from '@/lib/promotion-display';
import { promotionMachineSlots } from '@/components/catalog-machine-image';
import { promotionZH } from '@/i18n/messages/promotion';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { fmt } from '@/i18n/format';

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
afterEach(() => cleanups.splice(0).forEach(fn => fn()));
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
  const signed = Vue.ref(signedIn), app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 });
  const list = vi.fn<(...args: unknown[]) => Promise<PublicPromotionPage>>().mockResolvedValue(page([activity()]));
  const referral = vi.fn().mockImplementation(async (id: string) => ({ activityId: id, qualifyingOrders: 1, ownRewards: [] }));
  const catalogApi = vi.fn<() => Promise<ProductCatalogSnapshot>>().mockResolvedValue(snapshot());
  const runtime = { remoteApiEnabled: true, apiRuntimeConfig: { baseUrl: 'https://api.example/' },
    sessionVault: { read: () => signed.value ? { user: { userId: 7 } } : null },
    promotionApi: { list, referral }, productCatalogApi: { catalog: catalogApi } };
  // Run the real shared catalog store against API-boundary mocks, including its request epochs.
  let products: ProductCatalogSnapshot['products'] = [];
  const catalog = evaluate(catalogSource, {
    vue: Vue, '@/api/runtime': runtime, '@/api/order-api': { advanceRuntimeRevision() {} },
    '@/lib/brand-copy': { nexGridBrandText: (text: string) => text },
    '@/mock/products': { clearProductCatalog() { products = []; }, replaceProductCatalog(rows: typeof products) { products = rows; } },
  });
  function mount(kind: 'home' | 'team', supplied?: PublicPromotion[]) {
    const shown: Array<() => void> = [], hidden: Array<() => void> = [], mounted: Array<() => void> = [], unmounted: Array<() => void> = [];
    const source = kind === 'home' ? homeSource : teamSource;
    const props = Vue.reactive({ mode: 'home', active: true, activities: supplied });
    const component = evaluate(compileScript(parse(source).descriptor, { id: 'refresh-' + kind }).content, {
      vue: { ...Vue, onMounted: (fn: () => void) => mounted.push(fn), onBeforeUnmount: (fn: () => void) => unmounted.push(fn) },
      '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
      '@/api/runtime': runtime, '@/store/app': { useApp: () => app }, '@/store/auth': { useAuth: () => ({ get isAuthenticated() { return signed.value; } }) },
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
    const hide = () => hidden.forEach(fn => fn()), show = () => shown.forEach(fn => fn());
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
  return { app, signed, list, referral, catalogApi, catalog, mount };
}

it('the actual team refresh button re-reads list rules, catalog and progress and preserves expansion', async () => {
  const p = platform(), team = p.mount('team'); await flush();
  team.view.expandedActivity.value = 'A';
  expect(team.view.referralImageProps(team.view.activities.value[0])).toMatchObject({ sku: 'old-sku', imageUrl: 'https://images.example/old' });
  p.list.mockResolvedValueOnce(page([activity('new-sku', { version: 2 })]));
  p.catalogApi.mockResolvedValueOnce(snapshot('new-sku', 'https://images.example/new'));
  const refresh = find(await team.node(), node => node.props?.label === promotionZH.refresh)!;
  await refresh.props!.onClick(); await flush();
  expect(p.list).toHaveBeenCalledTimes(2); expect(p.list).toHaveBeenLastCalledWith({ cursor: null, limit: 20 }, true);
  expect(p.catalogApi).toHaveBeenCalledTimes(2); expect(p.referral).toHaveBeenCalledTimes(2);
  expect(team.view.referralImageProps(team.view.activities.value[0])).toMatchObject({ sku: 'new-sku', imageUrl: 'https://images.example/new' });
  expect(team.view.expandedActivity.value).toBe('A');
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

it('home supplied activity refresh also recovers the real shared catalog', async () => {
  const p = platform(); p.catalogApi.mockRejectedValueOnce(new Error('offline'));
  const home = p.mount('home', [activity()]); await flush(); expect(p.catalog.productCatalogState.status).toBe('error');
  p.list.mockResolvedValueOnce(page([activity('new-sku')])); p.catalogApi.mockResolvedValueOnce(snapshot('new-sku', 'https://images.example/new'));
  home.props.activities = (await p.list()).items; await flush();
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
