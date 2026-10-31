import { teamPrivacyFixture } from './team-privacy.test-support';
import { formatFinanceAmount } from '@/lib/finance-amount-display';
import * as Vue from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import source from './quota.vue?raw';
import tierSource from '@/components/team/quota-tier-card.vue?raw';
import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { formatComputePoints } from '@/i18n/compute-points';
import { nexGridBrandText } from '@/lib/brand-copy';
import { mountEntry, all, text, flush, slot } from '@/lib/entry-review.test-support';
import { formatAmount } from '@/lib/amount-display';
import { getProductMedia } from '@/lib/product-media';
import { fmt } from '@/i18n/format';
import { networkReauditCopy } from '@/i18n/network-reaudit';
import { isAnnualizedQuotaPerk } from '@/lib/quota-perk';
import * as requestScope from '@/lib/team-p3-17-18-request-scope';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';
import type { TeamQuotaSnapshot } from '@/api/team-quota-api';
import { rackPurchaseEligibility } from '@/components/store/purchase-eligibility.fixture';
import { VIZ_RING_TRANSITION } from '@/composables/use-scroll-grow-progress';

const dictionaries = { zh, en, vi: vietnamese };
const snapshot = (): TeamQuotaSnapshot => ({ source: 'server', sourceEnvironment: 'PRODUCTION', runId: '', generatedAt: '2026-10-25T00:00:00Z',
  facts: { rank: 2, directRefs: 2, directInvites: 4, activeDirect: 2, teamComputePoints: 99999 },
  tiers: ['stellarbox-pro', 'stellarrack-p1'].map(productId => ({ productId, quotaCode: productId, name: 'Old name', price: 999,
    monthlyStock: 60, soldThisMonth: 42, unlockKind: 'ALL', available: true,
    conditions: [{ kind: 'teamComputePoints', required: 20000, current: 12800 }], perks: [] })),
});
const button = { default: Vue.defineComponent({ props: ['label', 'busy'], emits: ['click'], setup: (props, { emit, slots }) => () => Vue.h('view',
  { role: 'button', 'aria-label': props.label, onClick: () => { if (!props.busy) emit('click'); } }, slots.default?.() ?? String(props.label)) }) };
const stop: Array<() => void> = [];
afterEach(() => stop.splice(0).forEach(fn => fn()));
function page(locale: keyof typeof dictionaries = 'en', product = '', intent = '') {
  const inviteRingInView = Vue.ref(true);
  const show: Array<() => void> = [], hide: Array<() => void> = [], load: Array<(query: object) => void> = [];
  const navTo = vi.fn(), api = { snapshot: vi.fn(async () => snapshot()) }, refreshCatalog = vi.fn(async () => {});
  const retryEligibility = vi.fn(async () => false);
  const app = Vue.reactive({ accountKey: 'user:A', accountBindingEpoch: 1 });
  const catalogState = Vue.reactive({ status: 'ready', serverCanonical: true });
  const presentation = Vue.ref({ products: snapshot().tiers.map((tier, i) => ({ id: tier.productId, name: `Catalog product ${i + 1}`,
    price: 1299 + i * 1000, dailyEarnNEX: 80.125, dailyEarn: 1.5, productType: 'DEVICE', gpu: 'GPU', vram: 'VRAM' })) });
  // UniApp image is native; preserve its attributes in the in-memory host.
  const adapted = source.replace(/<image\b/g, '<view data-native-image="true"');
  const p = mountEntry(adapted, {
    '@/composables/use-scroll-grow-progress': { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: inviteRingInView }), VIZ_RING_TRANSITION },
    '@/lib/amount-display': { formatAmount }, '@/lib/finance-amount-display': { formatFinanceAmount }, '@/lib/product-media': { getProductMedia },
    '@/lib/route': { navTo, takeNavigationQuery: () => '' },
    '@dcloudio/uni-app': { onLoad: (fn: (q: object) => void) => load.push(fn), onShow: (fn: () => void) => show.push(fn), onHide: (fn: () => void) => hide.push(fn), onUnload: vi.fn() },
    '@/components/app-chassis.vue': slot, '@/components/sub-page-header.vue': { default: Vue.defineComponent({ props: ['back'], setup: props => () => Vue.h('view', { 'data-back': props.back }) }) },
    '@/components/team/team-art.vue': slot, '@/components/ui/nx-button.vue': button,
    '@/components/store/purchase-eligibility-panel.vue': { default: Vue.defineComponent({ props: ['status', 'snapshot'], setup: props => () => Vue.h('view', { 'data-purchase-conditions': props.snapshot }) }) },
    '@/store/purchase-eligibility': { useRemotePurchaseEligibility: () => ({ eligibility: Vue.ref({ status: 'ready', snapshot: rackPurchaseEligibility }), retry: retryEligibility }) },
    '@/components/team/quota-tier-card.vue': { default: Vue.defineComponent({ props: ['tier', 'pending', 'actionBlocked'], setup: props => () => Vue.h('view', { 'data-tier': props.tier.productId, 'data-facts': props.tier, 'data-pending': props.pending, 'data-action-blocked': props.actionBlocked }, props.tier.name) }) },
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[locale]) }, '@/store/data-visibility': teamPrivacyFixture().dependency, '@/store/locale': { useLocaleStore: () => ({ code: locale }) },
    '@/i18n/network-reaudit': { networkReauditCopy }, '@/i18n/format': { fmt }, '@/api/runtime': { remoteApiEnabled: true, teamQuotaApi: api, apiRuntimeConfig: { environment: 'dev', baseUrl: 'https://test.invalid' } },
    '@/api/order-api': { subscribeRuntimeRevision: () => () => {} },
    '@/mock/products': { getProduct: () => undefined, annualRoiPct: () => 5 },
    '@/store/product-catalog': { productCatalogState: catalogState, productCatalogPresentation: presentation, refreshProductCatalog: refreshCatalog,
      productCatalogDisplayProof: Vue.ref({ bindingEpoch: 1, revision: 'one' }), isProductCatalogDisplayCurrent: () => catalogState.serverCanonical && catalogState.status !== 'error' },
    '@/lib/product-copy': { specText: (_: unknown, value: string) => value }, '@/store/network': { useNetwork: () => ({ members: [] }) },
    '@/store/v-rank': { useVRank: () => ({ myRank: 2 }) }, '@/store/config': { useConfig: () => ({}) }, '@/store/app': { useApp: () => app },
    '@/lib/team-p3-17-18-request-scope': requestScope, '@/lib/quota-perk': { isAnnualizedQuotaPerk },
  }); stop.push(p.unmount); load.forEach(fn => fn({ product, intent }));
  return { ...p, app, api, navTo, catalogState, refreshCatalog, retryEligibility, inviteRingInView, tiers: () => all(p.root).filter(n => n.props['data-tier']),
    show: async () => { show.forEach(fn => fn()); await flush(); }, hide: async () => { hide.forEach(fn => fn()); await flush(); } };
}
it('opens exact product conditions as a read-only destination with all E1 and F4B facts', async () => {
  const p = page('zh', 'stellarrack-p1', 'tradein-conditions'); await p.show();
  expect(p.tiers()).toHaveLength(0);
  expect(all(p.root).find(n => n.props['data-purchase-conditions'])!.props['data-purchase-conditions']).toEqual(rackPurchaseEligibility);
  expect(all(p.root).filter(n => n.props.role === 'button').map(n => n.props['aria-label'])).toEqual([zh.store.purchaseEligibilityRetry]);
  expect(p.retryEligibility).toHaveBeenCalledOnce();
  expect(p.api.snapshot).not.toHaveBeenCalled(); expect(p.navTo).not.toHaveBeenCalled();
  expect(all(p.root).find(n => n.props['data-back'])!.props['data-back']).toBe('/pages/me/devices');
});
it('replays the real invite ratio after viewport exit and keeps visible snapshot updates on the same ring', async () => {
  const p = page(); p.inviteRingInView.value = false; await p.show();
  const ring = p.nodes('quota-ring')[0];
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 0, transition: 'none' });
  expect(String(ring.props.class)).not.toContain('nx-viz-sweep');
  p.inviteRingInView.value = true; await flush();
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 50, transition: VIZ_RING_TRANSITION });
  p.api.snapshot.mockResolvedValueOnce({ ...snapshot(), facts: { ...snapshot().facts, activeDirect: 3 } });
  await p.show();
  expect(p.nodes('quota-ring')[0]).toBe(ring);
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 75, transition: VIZ_RING_TRANSITION });
  p.inviteRingInView.value = false; await flush();
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 0, transition: 'none' });
  p.inviteRingInView.value = true; await flush();
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 75, transition: VIZ_RING_TRANSITION });
});
it.each(['zh', 'en', 'vi'] as const)('keeps %s focused product identity, stock and independent point conditions', async locale => {
  const p = page(locale, 'stellarrack-p1'); await p.show();
  expect(p.tiers()).toHaveLength(1);
  expect(p.tiers()[0].props['data-facts']).toMatchObject({ productId: 'stellarrack-p1', name: 'Catalog product 2', price: 2299,
    monthlyStock: 60, soldThisMonth: 42, available: true, conditions: [{ current: 12800, required: 20000, kind: 'volume' }] });
  expect(text(p.root)).not.toContain('Catalog product 1');
  expect(all(p.root).find(n => n.props['data-native-image'])!.props.src).toBe(getProductMedia('stellarrack-p1')!.src);
  expect(all(p.root).find(n => n.props['data-back'])!.props['data-back']).toBe('/pages/store/detail?id=stellarrack-p1');
  all(p.root).find(n => n.props['aria-label'] === dictionaries[locale].rank.conditionsLabel)!.props.onClick(); expect(p.navTo).toHaveBeenLastCalledWith('/pages/team/rank');
  all(p.root).find(n => n.props['aria-label'] === dictionaries[locale].quota.inviteFriendsTitle)!.props.onClick(); expect(p.navTo).toHaveBeenLastCalledWith('/pages/team/team?intent=share');
  all(p.root).find(n => n.props['aria-label'] === dictionaries[locale].empty.devicesCta)!.props.onClick();
  expect(p.navTo).toHaveBeenLastCalledWith('/pages/store/store');
});
it('explains a missing focused tier and returns to exactly that product', async () => {
  const p = page('en', 'unknown-sku'); await p.show();
  expect(p.tiers()).toHaveLength(0); expect(text(p.root)).toContain(en.quota.focusedTierMissing);
  all(p.root).find(n => n.props['aria-label'] === en.store.gateLockedCta)!.props.onClick();
  expect(p.navTo).toHaveBeenCalledWith('/pages/store/detail?id=unknown-sku');
});
it('keeps failed or incomplete reads out of product rows and supports retry', async () => {
  const p = page(); expect(p.tiers()).toHaveLength(0);
  p.api.snapshot.mockRejectedValueOnce(new Error('offline')); await p.show();
  expect(p.tiers()).toHaveLength(0); expect(text(p.root)).toContain(networkReauditCopy('en').quotaLoadError); expect(text(p.root)).not.toContain(en.authOtp.errorServiceUnavailable);
  all(p.root).find(n => n.props['aria-label'] === en.store.catalogRetry)!.props.onClick(); await flush();
  expect(p.tiers()).toHaveLength(2);
  p.catalogState.status = 'error'; await flush(); expect(p.tiers()).toHaveLength(0); expect(text(p.root)).toContain(en.store.catalogErrorTitle);
  all(p.root).find(n => n.props['aria-label'] === en.store.catalogRetry)!.props.onClick();
  expect(p.refreshCatalog).toHaveBeenLastCalledWith(true);
});
it('clears account-owned rows and ignores old-account and hidden-page responses', async () => {
  const p = page(); let resolveA!: (value: TeamQuotaSnapshot) => void;
  p.api.snapshot.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }));
  await p.show(); p.app.accountKey = 'user:B'; p.app.accountBindingEpoch++; await flush();
  expect(p.tiers()).toHaveLength(2);
  resolveA({ ...snapshot(), tiers: [] }); await flush(); expect(p.tiers()).toHaveLength(2);
  let resolveHidden!: (value: TeamQuotaSnapshot) => void;
  p.api.snapshot.mockImplementationOnce(() => new Promise(resolve => { resolveHidden = resolve; }));
  await p.show(); await p.hide(); resolveHidden({ ...snapshot(), tiers: [] }); await flush(); expect(p.tiers()).toHaveLength(2);
});
it('preserves quota rows through a slow return and visible error without treating old stock as current', async () => {
  const p = page(); await p.show(); await p.hide();
  expect(p.tiers()).toHaveLength(2);
  let reject!: (reason: unknown) => void;
  p.api.snapshot.mockImplementationOnce(() => new Promise((_yes, no) => { reject = no; }));
  p.catalogState.status = 'loading'; await p.show();
  expect(p.tiers()).toHaveLength(2); expect(p.tiers().every(n => !n.props['data-pending'] && n.props['data-action-blocked'])).toBe(true);
  reject(new Error('offline')); await flush();
  expect(p.tiers()).toHaveLength(2); expect(p.tiers().every(n => !n.props['data-pending'] && n.props['data-action-blocked'])).toBe(true);
  expect(text(p.root)).toContain(networkReauditCopy('en').quotaLoadError);
  p.catalogState.serverCanonical = false; await flush(); expect(p.tiers()).toHaveLength(0);
});
it('shows an empty snapshot without substituting catalog products or invented eligibility', async () => {
  const p = page(); p.api.snapshot.mockResolvedValueOnce({ ...snapshot(), tiers: [] }); await p.show();
  expect(p.tiers()).toHaveLength(0); expect(text(p.root)).toContain(en.empty.listTitle);
  expect(all(p.root).filter(n => n.props['data-native-image'])).toHaveLength(0);
});
it('retains the real tier layout while masking stock and qualification and disabling the stale purchase action', () => {
  const navigate = vi.fn();
  const p = mountEntry(tierSource.replace(/<image\b/g, '<view data-native-image="true"'), {
    '@/lib/finance-amount-display': { formatFinanceAmount }, '@/i18n/team-logic-copy': { teamLogicCopy },
    '@/i18n/compute-points': { formatComputePoints },
    '@/store/data-visibility': teamPrivacyFixture().dependency, '@/store/locale': { useLocaleStore: () => ({ code: 'en' }) }, '@/i18n/network-reaudit': { networkReauditCopy },
    './quota-condition-bar.vue': { default: Vue.defineComponent({ props: ['met', 'valueText'], setup: props => () => Vue.h('view', { 'data-met': props.met }, props.valueText) }) },
    '@/components/ui/nx-button.vue': { default: Vue.defineComponent({ props: ['label', 'disabled', 'busy'], emits: ['click'], setup: (props, { emit }) => () => Vue.h('view', { 'data-action-disabled': props.disabled, onClick: () => { if (!props.disabled) emit('click'); } }, props.label) }) },
    '@/i18n/use-t': { useT: () => Vue.ref(en) }, '@/i18n/format': { fmt }, '@/lib/brand-copy': { nexGridBrandText },
    '@/lib/product-media': { getProductMedia }, '@/composables/use-scroll-grow-progress': { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: Vue.ref(true) }), VIZ_RING_TRANSITION: 'none' },
  }, { pending: true, onNavigate: navigate, tier: { ...snapshot().tiers[0], name: 'Existing product', unlockKind: 'all',
    conditions: [{ kind: 'invites', label: 'Rank', current: 5, required: 1 }], perks: [] } });
  stop.push(p.unmount);
  expect(text(p.root)).toContain('Existing product'); expect(text(p.root)).toContain('— / —');
  expect(text(p.root)).not.toContain(en.quota.unlocked);
  expect(all(p.root).find(n => n.props['data-met'] !== undefined)!.props['data-met']).toBe(false);
  const action = all(p.root).find(n => n.props['data-action-disabled'] !== undefined)!;
  expect(action.props['data-action-disabled']).toBe(true); action.props.onClick(); expect(navigate).not.toHaveBeenCalled();
  const ring = p.nodes('quota-stock__ring')[0];
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 0, transition: 'none' });
});

it.each(['all', 'either'] as const)('unlocks %s tiers with no minimums while retaining sold-out feedback', async unlockKind => {
  const stockInView = Vue.ref(false);
  const tier = Vue.reactive({ productId: 'stellarbox-pro', name: 'Stored product', price: 10, monthlyStock: 2,
    soldThisMonth: 0, unlockKind, conditions: [], perks: [], tint: '#fff' });
  const navigate = vi.fn();
  const p = mountEntry(tierSource.replace(/<image\b/g, '<view data-native-image="true"'), {
    '@/store/data-visibility': teamPrivacyFixture().dependency, '@/i18n/team-logic-copy': { teamLogicCopy },
    '@/lib/finance-amount-display': { formatFinanceAmount }, '@/i18n/compute-points': { formatComputePoints },
    '@/store/locale': { useLocaleStore: () => ({ code: 'en' }) }, '@/i18n/network-reaudit': { networkReauditCopy },
    './quota-condition-bar.vue': slot, '@/components/ui/nx-button.vue': button,
    '@/i18n/use-t': { useT: () => Vue.ref(en) }, '@/i18n/format': { fmt }, '@/lib/product-media': { getProductMedia },
    '@/composables/use-scroll-grow-progress': { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: stockInView }), VIZ_RING_TRANSITION },
  }, { tier, onNavigate: navigate });
  stop.push(p.unmount);
  expect(text(p.root)).toContain(en.quota.unlocked);
  const ring = p.nodes('quota-stock__ring')[0];
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 0, transition: 'none' });
  expect(String(ring.props.class)).not.toContain('nx-viz-sweep');
  tier.soldThisMonth = 1; stockInView.value = true; await flush();
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 50, transition: VIZ_RING_TRANSITION });
  tier.monthlyStock = 4; await flush();
  expect(p.nodes('quota-stock__ring')[0]).toBe(ring);
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 25, transition: VIZ_RING_TRANSITION });
  stockInView.value = false; await flush();
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 0, transition: 'none' });
  stockInView.value = true; await flush();
  expect(ring.props.style).toMatchObject({ '--nx-viz-ring': 25, transition: VIZ_RING_TRANSITION });
  const buy = all(p.root).find(n => n.props['aria-label'] === fmt(en.quota.buyCta, { name: tier.name }));
  expect(buy).toBeDefined(); buy!.props.onClick();
  expect(navigate).toHaveBeenCalledWith('/pages/store/detail?id=stellarbox-pro');
  tier.soldThisMonth = tier.monthlyStock; await flush();
  expect(text(p.root)).toContain(en.quota.stockUnavailable);
  expect(all(p.root).find(n => n.props['aria-label'] === fmt(en.quota.buyCta, { name: tier.name }))).toBeUndefined();
});
