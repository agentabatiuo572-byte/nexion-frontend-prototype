import * as Vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import source from './quota.vue?raw';
import tierSource from '@/components/team/quota-tier-card.vue?raw';
import buttonSource from '@/components/ui/nx-button.vue?raw';
import conditionSource from '@/components/team/quota-condition-bar.vue?raw';
import { mountEntry, all, text, flush, slot } from '@/lib/entry-review.test-support';
import { formatFinanceAmount } from '@/lib/finance-amount-display';
import { formatAmount } from '@/lib/amount-display';
import { formatComputePoints } from '@/i18n/compute-points';
import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { networkReauditCopy } from '@/i18n/network-reaudit';
import { fmt } from '@/i18n/format';
import { getProductMedia } from '@/lib/product-media';
import { nexGridBrandText } from '@/lib/brand-copy';
import { isAnnualizedQuotaPerk } from '@/lib/quota-perk';
import * as requestScope from '@/lib/team-p3-17-18-request-scope';
import { ApiError } from '@/api/errors';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';

const transport = vi.hoisted(() => ({ catalog: vi.fn(), config: null as any, clear: vi.fn(), replace: vi.fn() }));
vi.mock('@/api/runtime', () => ({ remoteApiEnabled: true, get apiRuntimeConfig() { return transport.config; }, productCatalogApi: { catalog: transport.catalog } }));
vi.mock('@/mock/products', () => ({ clearProductCatalog: transport.clear, replaceProductCatalog: transport.replace }));
const dictionaries = { zh, en, vi: vietnamese };
const stop: Array<() => void> = [];
const deferred = () => { let resolve!: (v: any) => void, reject!: (e: any) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const quota = (kind = 'ineligible') => ({ source: 'server', sourceEnvironment: 'PRODUCTION', runId: '', generatedAt: '', facts: { rank: 2, directInvites: 4, activeDirect: 2 }, tiers: [{ productId: 'stellarbox-pro', name: 'old name', price: 999, monthlyStock: 60, soldThisMonth: kind === 'sold' ? 60 : 42, available: kind !== 'unavailable', unlockKind: 'ALL', conditions: [{ kind: 'rank', current: kind === 'ineligible' ? 1 : 5, required: 3 }], perks: [] }] });
const catalog = (revision = 'one') => ({ products: [{ id: 'stellarbox-pro', name: 'Current product', price: 1299, dailyEarnNEX: 80, dailyEarn: 1.5, productType: 'DEVICE', gpu: 'GPU', vram: 'VRAM' }], source: 'nx_product', sourceEnvironment: 'PRODUCTION', runId: '', serverCanonical: true, revision });
function component(raw: string, deps: Record<string, unknown>) {
  const descriptor = parse(raw.replace(/<image\b/g, '<view data-native-image="true"'), { filename: 'fixture.vue' }).descriptor;
  const result = compileScript(descriptor, { id: 'quota-warm', inlineTemplate: true, templateOptions: { compilerOptions: { hoistStatic: false, isCustomElement: tag => ['view', 'text'].includes(tag) } } });
  const exports = { default: {} as Vue.Component };
  const code = ts.transpileModule(result.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'exports', code)((id: string) => id === 'vue' ? Vue : deps[id] ?? (() => { throw new Error(`missing ${id}`); })(), exports);
  return exports;
}
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.doMock('@/api/errors', () => ({ ApiError }));
  transport.config = Vue.reactive({ environment: 'dev', baseUrl: 'https://test.invalid' }); transport.catalog.mockResolvedValue(catalog());
});
afterEach(() => stop.splice(0).forEach(fn => fn()));
async function page(code: keyof typeof dictionaries = 'en', kind = 'ineligible') {
  const store = await import('@/store/product-catalog');
  const runtimeRevision = await import('@/api/order-api');
  const show: Array<() => void> = [], hide: Array<() => void> = [], unload: Array<() => void> = [], load: Array<(q: any) => void> = [];
  const navTo = vi.fn(), api = { snapshot: vi.fn(async () => quota(kind)) };
  const app = Vue.reactive({ accountKey: 'user:A', accountBindingEpoch: 1 }), locale = Vue.reactive({ code });
  const common = {
    '@/lib/finance-amount-display': { formatFinanceAmount }, '@/i18n/team-logic-copy': { teamLogicCopy }, '@/i18n/compute-points': { formatComputePoints },
    '@/store/locale': { useLocaleStore: () => locale }, '@/i18n/network-reaudit': { networkReauditCopy }, '@/i18n/use-t': { useT: () => Vue.computed(() => dictionaries[locale.code]) }, '@/i18n/format': { fmt },
    '@/lib/brand-copy': { nexGridBrandText }, '@/lib/product-media': { getProductMedia },
    '@/composables/use-scroll-grow-progress': { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: Vue.ref(true) }), PROGRESS_GROW_TRANSITION: 'none' },
  };
  const buttons: Vue.ComponentInternalInstance[] = [];
  const button = component(buttonSource, { '@/components/liquid-glass.vue': slot });
  const setupButton = (button.default as any).setup;
  (button.default as any).setup = (props: unknown, context: unknown) => { buttons.push(Vue.getCurrentInstance()!); return setupButton(props, context); };
  const tier = component(tierSource, { ...common, './quota-condition-bar.vue': component(conditionSource, common), '@/components/ui/nx-button.vue': button });
  const p = mountEntry(source.replace(/<image\b/g, '<view data-native-image="true"'), {
    ...common, '@/lib/amount-display': { formatAmount }, '@/lib/route': { navTo, takeNavigationQuery: () => '' },
    '@dcloudio/uni-app': { onLoad: (fn: any) => load.push(fn), onShow: (fn: any) => show.push(fn), onHide: (fn: any) => hide.push(fn), onUnload: (fn: any) => unload.push(fn) },
    '@/components/app-chassis.vue': slot, '@/components/sub-page-header.vue': slot, '@/components/team/team-art.vue': slot,
    '@/components/ui/nx-button.vue': button, '@/components/team/quota-tier-card.vue': tier,
    '@/api/runtime': { remoteApiEnabled: true, teamQuotaApi: api, apiRuntimeConfig: transport.config }, '@/api/order-api': runtimeRevision,
    '@/mock/products': { getProduct: () => undefined, annualRoiPct: () => 5 }, '@/store/product-catalog': store,
    '@/lib/product-copy': { specText: (_: unknown, v: string) => v }, '@/store/network': { useNetwork: () => ({ members: [] }) }, '@/store/v-rank': { useVRank: () => ({ myRank: 2 }) }, '@/store/config': { useConfig: () => ({}) }, '@/store/app': { useApp: () => app },
    '@/lib/team-p3-17-18-request-scope': requestScope, '@/lib/quota-perk': { isAnnualizedQuotaPerk },
  });
  const dispose = () => { unload.forEach(fn => fn()); p.unmount(); }; stop.push(dispose); load.forEach(fn => fn({}));
  return { ...p, store, runtimeRevision, api, app, locale, navTo, load, show: async () => { show.forEach(fn => fn()); await flush(); }, hide: async () => { hide.forEach(fn => fn()); await flush(); },
    card: () => p.nodes('quota-tier')[0], action: () => all(p.nodes('quota-actions')[0]).find(n => n.props.role === 'button'),
    bypassAction: () => { const host = all(p.nodes('quota-actions')[0]).find(n => n.props.role === 'button'); const instance = buttons.find(b => !b.isUnmounted && b.subTree.el === host); (instance!.vnode.props!.onClick as () => void)(); }, dispose };
}
it.each(['zh', 'en', 'vi'] as const)('keeps all known %s card text on pending ordinary return without authorizing it', async code => {
  const p = await page(code); await p.show(); const before = text(p.root); const card = text(p.card());
  await p.hide(); const read = deferred(); p.api.snapshot.mockReturnValueOnce(read.promise); await p.show();
  expect(text(p.card())).toBe(card); expect(text(p.root)).toBe(before); expect(text(p.root)).not.toContain(networkReauditCopy(code).loading);
  expect(p.action()!.props['aria-disabled']).toBe(true); p.action()!.props.onClick(); p.bypassAction(); expect(p.navTo).not.toHaveBeenCalled();
  read.resolve(quota('eligible')); await flush(); expect(text(p.card())).toContain(dictionaries[code].quota.unlocked); expect(p.action()!.props['aria-disabled']).toBe(false);
  p.action()!.props.onClick(); expect(p.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/detail?id=stellarbox-pro');
});
it.each(['eligible', 'ineligible', 'sold', 'unavailable'])('keeps the previous %s business label during real store refresh and transport failure', async kind => {
  const p = await page('en', kind); await p.show(); const before = text(p.card()); await p.hide();
  const directory = deferred(), quotaRead = deferred(); transport.catalog.mockReturnValueOnce(directory.promise); const refresh = p.store.refreshProductCatalog(true);
  p.api.snapshot.mockReturnValueOnce(quotaRead.promise); await p.show(); expect(transport.catalog).toHaveBeenCalledTimes(2); expect(p.api.snapshot).toHaveBeenCalledTimes(2);
  expect(text(p.card())).toBe(before); if (p.action()) { expect(p.action()!.props['aria-disabled']).toBe(true); p.action()!.props.onClick(); }
  directory.reject(new ApiError({ kind: 'network', message: 'offline' })); quotaRead.reject(new Error('offline')); await refresh; await flush();
  expect(p.store.productCatalogState.serverCanonical).toBe(false); expect(transport.clear).toHaveBeenCalled();
  expect(p.store.isProductCatalogDisplayCurrent()).toBe(true); expect(text(p.card())).toBe(before);
  expect(text(p.root)).toContain(en.store.catalogErrorTitle); expect(text(p.root)).toContain(networkReauditCopy('en').quotaLoadError); expect(p.navTo).not.toHaveBeenCalled();
  transport.catalog.mockResolvedValueOnce(catalog()); await p.store.refreshProductCatalog(true); all(p.root).find(n => n.props['aria-label'] === en.store.catalogRetry)!.props.onClick(); await flush();
  expect(text(p.card())).toBe(before); if (p.action()) expect(p.action()!.props['aria-disabled']).toBe(false);
});
it('keeps cold unknown, coalesces same visible pending read, and recovers through actual retry', async () => {
  const read = deferred(), p = await page(); p.api.snapshot.mockReturnValueOnce(read.promise); await p.show(); await p.show();
  expect(p.nodes('quota-tier')).toHaveLength(0); expect(text(p.root)).toContain(networkReauditCopy('en').loading); expect(p.api.snapshot).toHaveBeenCalledTimes(1);
  read.reject(new Error('offline')); await flush(); expect(p.nodes('quota-tier')).toHaveLength(0); expect(text(p.root)).toContain(networkReauditCopy('en').quotaLoadError);
  all(p.root).find(n => n.props['aria-label'] === en.store.catalogRetry)!.props.onClick(); await flush(); expect(p.nodes('quota-tier')).toHaveLength(1);
});
it.each(['account', 'binding', 'locale', 'environment', 'baseUrl', 'query', 'prepare', 'write', 'catalogRevision'])('invalidates known display and rejects old completion across %s', async boundary => {
  const p = await page(); await p.show(); await p.hide(); const old = deferred(), fresh = deferred(); p.api.snapshot.mockReturnValueOnce(old.promise).mockReturnValue(fresh.promise); await p.show();
  if (boundary === 'account') { p.app.accountKey = 'user:B'; p.app.accountKey = 'user:A'; p.app.accountBindingEpoch++; }
  if (boundary === 'binding') p.app.accountBindingEpoch++;
  if (boundary === 'locale') { p.locale.code = 'vi'; p.locale.code = 'en'; }
  if (boundary === 'environment') { transport.config.environment = 'prod'; transport.config.environment = 'dev'; }
  if (boundary === 'baseUrl') { transport.config.baseUrl = 'https://other.invalid'; transport.config.baseUrl = 'https://test.invalid'; }
  if (boundary === 'query') { p.load.forEach(fn => fn({ product: 'other' })); p.load.forEach(fn => fn({ product: 'stellarbox-pro' })); }
  if (boundary === 'prepare') { p.store.prepareProductCatalog(); p.store.prepareProductCatalog(); }
  if (boundary === 'write') p.runtimeRevision.advanceRuntimeRevision('purchase');
  if (boundary === 'catalogRevision') { transport.catalog.mockResolvedValueOnce(catalog('two')); await p.store.refreshProductCatalog(true); }
  await flush(); expect(p.nodes('quota-tier')).toHaveLength(0);
  old.resolve(quota('eligible')); await flush(); expect(p.nodes('quota-tier')).toHaveLength(0); expect(p.navTo).not.toHaveBeenCalled();
  await p.show(); fresh.resolve(quota('sold')); await flush(); expect(text(p.card())).toContain(en.quota.stockUnavailable);
});
it.each([new ApiError({ kind: 'auth', status: 403, message: 'denied' }), new ApiError({ kind: 'http', status: 401, message: 'expired' }), new ApiError({ kind: 'protocol', message: 'invalid' })])('revokes warm presentation on strict catalog failure %s and permits explicit recovery', async error => {
  const p = await page(); await p.show(); await p.hide(); const old = deferred(); p.api.snapshot.mockReturnValueOnce(old.promise); await p.show();
  transport.catalog.mockRejectedValueOnce(error); await p.store.refreshProductCatalog(true); await flush();
  expect(p.nodes('quota-tier')).toHaveLength(0); expect(p.store.productCatalogDisplayProof.value).toBeNull(); expect(text(p.root)).toContain(en.store.catalogErrorTitle);
  old.resolve(quota('eligible')); await flush(); expect(p.nodes('quota-tier')).toHaveLength(0);
  transport.catalog.mockResolvedValueOnce(catalog()); all(p.root).find(n => n.props['aria-label'] === en.store.catalogRetry)!.props.onClick(); await flush();
  expect(p.nodes('quota-tier')).toHaveLength(1); expect(p.action()!.props['aria-disabled']).toBe(false); expect(p.navTo).not.toHaveBeenCalled();
});
it('ignores hidden late success and allows a new current observation after return', async () => {
  const p = await page(); await p.show(); const card = text(p.card()); const old = deferred(), current = deferred(); p.api.snapshot.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await p.show(); await p.hide(); old.resolve(quota('eligible')); await flush(); expect(text(p.card())).toBe(card);
  await p.show(); current.resolve(quota('sold')); await flush(); expect(text(p.card())).toContain(en.quota.stockUnavailable); expect(p.navTo).not.toHaveBeenCalled();
});
