import { createPassiveTabReadFixture } from '@/lib/passive-tab-read.test-support';
import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import * as lifecycle from '@/composables/use-tab-page-lifecycle';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { localized } from '@/lib/promotion-display';
import { isPromotionActive, promotionDisclosures } from '@/lib/promotion-entry';
import { promotionMachineSlots } from '@/components/catalog-machine-image';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';
import source from './referral-progress.vue?raw';

vi.mock('@dcloudio/uni-app', () => ({ onLoad: vi.fn(), onShow: vi.fn(), onHide: vi.fn(), onUnload: vi.fn() }));
type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ''): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node('#text', text), createComment: () => node('#comment'),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  patchProp: (n, key, _old, value) => { n.props[key] = value; }, parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert: (n, parent, anchor) => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); n.parent = parent; const i = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(i < 0 ? parent.children.length : i, 0, n); },
  remove: n => { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); n.parent = null; },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const text = (n: Host): string => n.text + n.children.map(text).join('');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); await Vue.nextTick(); };
function deferred<T = any>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const empty = () => ({ items: [], nextCursor: null, hasMore: false });
const activity = (id = 'A') => ({ activityId: id, version: 1, template: 'DIRECT_REFERRAL', state: 'ACTIVE', title: { zh: '首购', en: 'First purchase', vi: 'Mua lần đầu' }, rewardRules: [] });
const mounted: Vue.App[] = [];
let pinia: ReturnType<typeof createPinia>;
beforeEach(() => {
  pinia = createPinia(); setActivePinia(pinia);
  vi.stubGlobal('uni', { getStorageSync: () => undefined, setStorageSync: vi.fn() });
});
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); disposePinia(pinia); vi.useRealTimers(); vi.unstubAllGlobals(); });

function screen(language: 'zh' | 'en' | 'vi' = 'zh') {
  vi.useFakeTimers({ toFake: ['Date'] });
  const first = deferred(), app = Vue.reactive({ accountKey: 'user:current', accountBindingEpoch: 1 }), auth = Vue.reactive({ isAuthenticated: true }), locale = Vue.reactive({ code: language });
  const list = vi.fn().mockReturnValue(first.promise), referral = vi.fn(async (id: string) => ({ activityId: id, qualifyingOrders: 2, ownRewards: [] }));
  const Button = Vue.defineComponent({ props: ['label', 'busy'], setup: (props, { slots }) => () => Vue.h('button', { 'data-label': props.label, 'aria-busy': props.busy }, slots.default?.()) });
  const passive = createPassiveTabReadFixture(() => JSON.stringify([app.accountKey, app.accountBindingEpoch, auth.isAuthenticated, locale.code]));
  passive.notifyPageActivation('/pages/team/team');
  const modules: Record<string, any> = {
    '@/lib/passive-tab-read': passive,
    '@/store/data-visibility': { useDataVisibility },
    vue: Vue, '@/composables/use-tab-page-lifecycle': lifecycle,
    '@/api/runtime': { remoteApiEnabled: true, sessionVault: { read: () => auth.isAuthenticated ? { user: {} } : null }, promotionApi: { list, referral } },
    '@/store/app': { useApp: () => app }, '@/store/auth': { useAuth: () => auth }, '@/store/locale': { useLocaleStore: () => locale },
    '@/i18n/use-t': { useT: () => Vue.computed(() => ({ zh, en, vi: vietnamese })[locale.code]) },
    '@/i18n/team-redesign': { teamRedesignCopy }, '@/lib/promotion-display': { localized }, '@/lib/promotion-entry': { isPromotionActive, promotionDisclosures },
    '@/components/ui/nx-button.vue': { default: Button }, '@/components/catalog-machine-image': { promotionMachineSlots },
    '@/mock/products': { getProduct: () => undefined }, '@/store/product-catalog': { productCatalogState: Vue.reactive({ status: 'ready', serverCanonical: true }), refreshProductCatalog: vi.fn(async () => true), revalidateProductCatalog: vi.fn(async () => true) },
  };
  const compiled = compileScript(parse(source).descriptor, { id: 'referral-empty-refresh', inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } } });
  const code = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  new Function('require', 'exports', code)((id: string) => { if (id in modules) return modules[id]; if (id.endsWith('.vue')) return { default: { render: () => null } }; throw new Error(id); }, exports);
  const root = node('root'), hooks = lifecycle.createTabLifecycle({}, true), instance = renderer.createApp(exports.default);
  instance.provide(lifecycle.TAB_LIFECYCLE, hooks); instance.mount(root); mounted.push(instance);
  const find = (cls: string) => all(root).filter(n => String(n.props.class ?? '').split(' ').includes(cls));
  const retry = () => all(root).find(n => n.tag === 'button' && n.props['data-label'] === ({ zh, en, vi: vietnamese })[locale.code].promotion.retry)!;
  return { first, app, auth, locale, list, referral, root, find, retry, nextVisit: () => { passive.notifyPageActivation('/pages/me/preferences'); passive.notifyPageActivation('/pages/team/team'); }, protect: () => { for (const tab of ['index/index', 'earn/earn', 'team/team']) passive.notifyPageActivation('/pages/'+tab, { tabSwitch: true }); }, hide: () => hooks.setVisible(false), show: () => hooks.setVisible(true), unmount: () => instance.unmount() };
}

it.each(['zh', 'en', 'vi'] as const)('keeps a confirmed empty %s referral section out of flow during actual tab warm return', async language => {
  const s = screen(language);
  expect(s.find('referral-progress')).toHaveLength(1);
  s.first.resolve(empty()); await flush(); expect(s.find('referral-progress')).toHaveLength(0);
  s.hide(); const next = deferred(); s.list.mockReturnValue(next.promise); s.nextVisit(); s.show(); await flush();
  expect(s.find('referral-progress')).toHaveLength(0);
  const status = s.find('referral-refresh-status'); expect(status).toHaveLength(1); expect(status[0].props.role).toBe('status');
  expect(text(status[0])).toBe(({ zh, en, vi: vietnamese })[language].promotion.loading);
  expect(parse(source).descriptor.styles.map(s => s.content).join('')).toMatch(/\.referral-refresh-status\s*\{[^}]*position:\s*absolute/);
  next.resolve(empty()); await flush(); expect(s.find('referral-progress')).toHaveLength(0); expect(s.find('referral-refresh-status')).toHaveLength(0);
});

it('renders new genuine activities and keeps their DOM while the next read is pending', async () => {
  const s = screen(); s.first.resolve(empty()); await flush();
  const next = deferred(); s.list.mockReturnValue(next.promise); s.hide(); s.nextVisit(); s.show(); await flush();
  next.resolve({ items: [activity()], nextCursor: null, hasMore: false }); await flush();
  const hero = s.find('referral-hero')[0]; expect(hero).toBeDefined(); expect(text(s.root)).toContain('首购');
  s.list.mockReturnValue(deferred().promise); s.hide(); s.nextVisit(); s.show(); await flush();
  expect(s.find('referral-hero')[0]).toBe(hero); expect(s.find('promotion-copy').some(n => text(n) === zh.promotion.loading)).toBe(false);
});

it.each(['cold', 'warm'] as const)('keeps a real %s failure visible with the original retry and recovers', async mode => {
  const s = screen();
  if (mode === 'warm') { s.first.resolve(empty()); await flush(); s.hide(); const failure = deferred(); s.list.mockReturnValue(failure.promise); s.nextVisit(); s.show(); failure.reject(new Error('offline')); }
  else s.first.reject(new Error('offline'));
  await flush(); expect(s.find('referral-recovery')).toHaveLength(1); expect(text(s.root)).toContain(zh.promotion.error); expect(s.retry()).toBeDefined();
  const retry = deferred(); s.list.mockReturnValue(retry.promise); s.retry().props.onClick(); await flush();
  expect(s.find('referral-progress')).toHaveLength(mode === 'cold' ? 1 : 0);
  retry.resolve(empty()); await flush(); expect(s.find('referral-recovery')).toHaveLength(0); expect(s.find('referral-progress')).toHaveLength(0);
});

it.each((['account', 'epoch', 'auth', 'locale'] as const).flatMap(scope => (['success', 'failure'] as const).map(outcome => ({ scope, outcome }))))('clears successful-empty state synchronously on $scope and rejects the old $outcome', async ({ scope, outcome }) => {
  const s = screen(); s.first.resolve(empty()); await flush(); s.hide();
  const old = deferred(); s.list.mockReturnValueOnce(old.promise); s.nextVisit(); s.show(); await flush();
  const fresh = deferred(); s.list.mockReturnValue(fresh.promise);
  if (scope === 'account') s.app.accountKey = 'user:next';
  if (scope === 'epoch') s.app.accountBindingEpoch++;
  if (scope === 'auth') s.auth.isAuthenticated = false;
  if (scope === 'locale') s.locale.code = 'vi';
  // A sync invalidation starts the new scope read before any old completion.
  expect(s.list.mock.calls.length).toBe(3);
  if (outcome === 'success') old.resolve(empty()); else old.reject(new Error('old offline'));
  await flush(); expect(s.find('referral-progress')).toHaveLength(1); expect(s.find('referral-refresh-status')).toHaveLength(0); expect(s.find('referral-recovery')).toHaveLength(0);
  fresh.resolve(empty()); await flush(); s.hide(); s.list.mockReturnValue(deferred().promise); s.nextVisit(); s.show(); await flush(); expect(s.find('referral-progress')).toHaveLength(0);
});

it.each(['hide', 'unmount'] as const)('reuses same-scope hidden success on return and rejects a removed component after %s', async boundary => {
  const s = screen(); if (boundary === 'hide') s.hide(); else s.unmount(); s.first.resolve(empty()); await flush();
  if (boundary === 'hide') { s.show(); await flush(); expect(s.list).toHaveBeenCalledTimes(1); expect(s.find('referral-progress')).toHaveLength(0); expect(s.find('referral-refresh-status')).toHaveLength(0); }
  else expect(all(s.root).filter(n => n.tag === 'view')).toHaveLength(0);
});

it('preserves an empty filtered page cursor and fetches the genuine next activity', async () => {
  const s = screen(); s.first.resolve({ items: [{ ...activity('other'), template: 'SKU_GIFT' }], nextCursor: 'cursor', hasMore: true }); await flush();
  const button = s.find('referral-more')[0]; expect(button).toBeDefined();
  const next = deferred(); s.list.mockReturnValue(next.promise); button.props.onClick(); await flush(); expect(s.list).toHaveBeenLastCalledWith({ cursor: 'cursor', limit: 20 }, true);
  expect(s.find('promotion-copy').some(n => text(n) === zh.promotion.loading)).toBe(false);
  next.resolve({ items: [activity('B')], nextCursor: null, hasMore: false }); await flush(); expect(s.find('referral-hero')).toHaveLength(1); expect(s.find('referral-more')).toHaveLength(0);
});

it('reuses a protected successful empty section and performs a real new-visit read after protection ends', async () => {
  const s = screen(); s.first.resolve(empty()); await flush();
  const next = deferred(); s.list.mockReturnValue(next.promise);
  s.hide(); s.protect(); s.show(); await flush();
  expect(s.list).toHaveBeenCalledTimes(1); expect(s.find('referral-progress')).toHaveLength(0); expect(s.find('referral-refresh-status')).toHaveLength(0);
  vi.setSystemTime(Date.now() + 3000); expect(s.list).toHaveBeenCalledTimes(1);
  s.hide(); s.nextVisit(); s.show(); await flush();
  expect(s.list).toHaveBeenCalledTimes(2); expect(s.find('referral-progress')).toHaveLength(0); expect(s.find('referral-refresh-status')).toHaveLength(1);
  next.resolve({ items: [activity()], nextCursor: null, hasMore: false }); await flush();
  expect(s.find('referral-hero')).toHaveLength(1); expect(s.find('referral-recovery')).toHaveLength(0);
});
