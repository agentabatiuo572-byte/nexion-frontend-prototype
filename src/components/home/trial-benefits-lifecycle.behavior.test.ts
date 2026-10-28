import * as Vue from 'vue';
import type { Component } from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import heroSource from '../trial-hero-banner.vue?raw';
import benefitsSource from './home-benefits.vue?raw';
import { trialLifecycleCopy, formatTrialRemaining } from '@/i18n/trial-lifecycle';
import { auditUiCopy } from '@/i18n/audit-ui';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { voucherSupportsSurface } from '@/lib/voucher-sheet-authority';

type Node = { type: string; text: string; parent: Node | null; children: Node[]; props: Record<string, unknown> };
const node = (type: string, text = ''): Node => ({ type, text, parent: null, children: [], props: {} });
const renderer = Vue.createRenderer<Node, Node>({
  createElement: type => node(type), createText: text => node('text', text), createComment: () => node('comment'),
  setText: (target, text) => { target.text = text; }, setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; }, parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
const textContent = (target: Node): string => target.text + target.children.map(textContent).join('');
const find = (target: Node, predicate: (item: Node) => boolean): Node | undefined => predicate(target) ? target : target.children.map(child => find(child, predicate)).find(Boolean);
const byClass = (target: Node, className: string) => find(target, item => String(item.props.class ?? '').split(/\s+/).includes(className));
// Bubble through the rendered tree; Vue's compiled .self/.prevent/.stop guards remain real.
function dispatch(target: Node, type: 'click' | 'keydown', key?: string) {
  let stopped = false;
  const event = { type, key, target, currentTarget: target, preventDefault: vi.fn(),
    stopPropagation: vi.fn(() => { stopped = true; }),
  };
  for (let current: Node | null = target; current; current = current.parent) {
    event.currentTarget = current;
    const handlers = current.props[type === 'click' ? 'onClick' : 'onKeydown'];
    for (const handler of Array.isArray(handlers) ? handlers : [handlers]) {
      if (typeof handler === 'function') handler(event);
    }
    if (stopped) break;
  }
  return event;
}
const cleanups: Array<() => void> = [];
beforeEach(() => vi.stubGlobal('uni', { getStorageSync: () => false, setStorageSync: vi.fn() }));
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.unstubAllGlobals(); });

async function mount(locale: 'zh' | 'en' | 'vi', initialStatus = 'active', surface: 'hero' | 'benefits' = 'hero', embedded = true) {
  const visibility = useDataVisibility(createPinia());
  const trial = Vue.reactive({ status: initialStatus, authorityStatus: 'ready', reason: 'in-progress',
    eligibility: () => ({ ok: trial.authorityStatus === 'ready' && trial.reason === '', reason: trial.reason }),
    confirmedOfferState: () => trial.reason === '' ? 'claimable' : 'unavailable', showHeroPromo: () => trial.status === 'none' && trial.reason === '',
  });
  const retainedStatus = Vue.ref<string | null>(initialStatus);
  const remainingMs = Vue.ref(2 * 86400_000 + 123_000);
  const projection = {
    status: retainedStatus, deviceName: Vue.ref('UVELBox S1'),
    config: Vue.computed(() => trial.authorityStatus === 'error' ? null : { trialDays: 3, shadowDailyUSD: 20, trialOffsetCapUSD: 50 }),
    offsetUSD: Vue.computed(() => trial.authorityStatus === 'error' ? null : 11.37),
    remainingMs: Vue.computed(() => trial.authorityStatus === 'error' ? null : remainingMs.value),
    estimatedOffsetUSD: Vue.computed(() => trial.authorityStatus === 'error' ? null : 50), refresh: vi.fn(),
  };
  const voucher = Vue.reactive({ claimable: true, claimedUnused: [] as string[], hasClaimableForSurface: () => voucher.claimable,
    presentationOffers: [{id:'offer',claimSurfaces:['home']}], presentationClaimable: [{id:'offer',claimSurfaces:['home']}] });
  const show = vi.fn(), navTo = vi.fn(), messages = { zh, en, vi: vietnamese }[locale], copy = trialLifecycleCopy[locale];
  const section = { setup: (_props: unknown, context: { slots: Vue.Slots }) => () => Vue.h('section', context.slots.default?.()) };
  const modules: Record<string, unknown> = {
    '@/store/data-visibility': { useDataVisibility: () => visibility },
    vue: Vue, '@/store/free-trial': { useFreeTrial: () => trial },
    '@/api/runtime': { remoteApiEnabled: true }, '@/lib/voucher-sheet-authority': { voucherSupportsSurface },
    '@/store/trial-config': { useTrialConfig: () => ({ config: { seatsLeftToday: 5, trialDays: 3 } }) },
    '@/composables/use-trial-presentation': { useTrialPresentation: () => projection },
    '@/store/trial-claim-sheet': { useTrialClaimSheet: () => ({ show }) },
    '@/i18n/use-t': { useT: () => Vue.ref(messages) }, '@/i18n/format': { fmt },
    '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref(auditUiCopy[locale]) },
    '@/i18n/trial-lifecycle': { useTrialLifecycleCopy: () => Vue.ref(copy), formatTrialRemaining },
    '@/store/locale': { useLocaleStore: () => ({ code: locale }) }, '@/lib/route': { navTo }, '@/lib/amount-display': { formatAmount },
    '@/components/liquid-glass.vue': { default: { render: () => null } },
    '@/components/ui/nx-section.vue': { default: section }, '@/store/voucher': { useVoucher: () => voucher },
    '@/components/voucher-banner.vue': { default: { render: () => Vue.h('voucher') } },
    '@/components/trial-hero-banner.vue': { default: { render: () => Vue.h('trial-card') } },
  };
  const source = surface === 'hero' ? heroSource : benefitsSource;
  const compiled = compileScript(parse(source).descriptor, { id: 'trial-benefits-lifecycle', inlineTemplate: true }).content;
  const code = ts.transpileModule(compiled, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Component };
  new Function('require', 'exports', code)((id: string) => { if (!(id in modules)) throw new Error(id); return modules[id]; }, exports);
  const root = node('root'), app = renderer.createApp(exports.default, { embedded });
  app.mount(root); cleanups.push(() => app.unmount()); await Vue.nextTick();
  return { root, trial, retainedStatus, remainingMs, projection, show, navTo, voucher, copy, visibility,
    click: () => dispatch(byClass(root, 'nx-trial-hero--card-entry') ?? byClass(root, 'trial-cta')!, 'click'),
  };
}

test.each((['zh', 'en', 'vi'] as const).flatMap(locale => ['active', 'grace', 'ended', 'converted'].map(status => ({ locale, status }))))('$locale $status keeps a lifecycle card with the correct next destination', async ({ locale, status }) => {
  const view = await mount(locale, status);
  const title = { active: view.copy.activeTitle, grace: view.copy.graceTitle, ended: view.copy.endedTitle, converted: view.copy.convertedTitle }[status];
  const card = byClass(view.root, 'nx-trial-hero--card-entry')!;
  const action = status === 'converted' ? view.copy.viewDevices : status === 'ended' ? view.copy.buyDevice : view.copy.viewTrial;
  expect(card.props.role).toBe('button'); expect(card.props.tabindex).toBe(0);
  expect(card.props['aria-label']).toBe(`${title} · UVELBox S1 · ${action}`);
  expect(byClass(view.root, 'trial-cta')).toBeUndefined();
  if (status === 'active' || status === 'grace') {
    const badge = byClass(view.root, 'trial-badge')!;
    expect(textContent(badge)).toBe(status === 'active' ? view.copy.cardActiveTitle : view.copy.cardGraceTitle);
    expect(badge.props['aria-label']).toBe(title);
    const countdown = byClass(view.root, 'trial-header-countdown')!;
    expect(textContent(countdown)).toBe('2d 0h:03');
    expect(countdown.props['aria-label']).toBe(`${status === 'grace' ? view.copy.creditUntilLabel : view.copy.remainingLabel} ${formatTrialRemaining(48 * 3600000 + 123000, view.copy.longRemaining)}`);
    expect(byClass(view.root, 'trial-lifecycle-time')).toBeUndefined();
    expect(textContent(view.root)).toContain('$11.37');
    expect(textContent(view.root)).not.toContain('$50.00');
  } else {
    expect(textContent(byClass(view.root, 'trial-badge')!)).toBe(title);
    expect(byClass(view.root, 'trial-header-countdown')).toBeUndefined();
  }
  view.click(); expect(view.navTo).toHaveBeenCalledExactlyOnceWith(status === 'converted' ? '/pages/me/devices' : '/pages/me/trial');
  expect(view.show).not.toHaveBeenCalled();
});

test.each(['zh', 'en', 'vi'] as const)('%s ended trials may claim only after a fresh eligible response', async locale => {
  const view = await mount(locale, 'ended');
  expect(byClass(view.root, 'trial-cta')).toBeUndefined();
  view.trial.reason = ''; await Vue.nextTick();
  view.click(); expect(view.show).toHaveBeenCalledOnce(); expect(view.navTo).not.toHaveBeenCalled();
  view.trial.authorityStatus = 'loading'; await Vue.nextTick();
  view.click(); expect(view.show).toHaveBeenCalledOnce(); expect(view.navTo).toHaveBeenCalledWith('/pages/me/trial');
});

test('failed reads preserve the active card and neutral numbers, with a working retry', async () => {
  const view = await mount('zh'); view.trial.authorityStatus = 'error'; view.trial.status = 'none'; await Vue.nextTick();
  expect(byClass(view.root, 'nx-trial-hero--card-entry')!.props['aria-label']).toContain(view.copy.activeTitle);
  expect(byClass(view.root, 'trial-badge')!.props['aria-label']).toBe(view.copy.activeTitle);
  expect(textContent(view.root)).not.toContain('$0.00'); expect(textContent(view.root)).not.toContain('$11.37');
  expect(textContent(byClass(view.root, 'trial-header-countdown')!)).toBe('-');
  const event = dispatch(byClass(view.root, 'trial-retry')!, 'click');
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(view.projection.refresh).toHaveBeenCalledOnce();
  expect(view.navTo).not.toHaveBeenCalled(); expect(view.show).not.toHaveBeenCalled();
});

test('header countdown rounds partial minutes up and carries hours and days without ending the trial', async () => {
  const view = await mount('en');
  const cases: Array<[number, string]> = [
    [0, '0d 0h:00'], [1, '0d 0h:01'],
    [59_999, '0d 0h:01'], [60_000, '0d 0h:01'], [60_001, '0d 0h:02'],
    [3_599_999, '0d 1h:00'], [3_600_000, '0d 1h:00'], [3_600_001, '0d 1h:01'],
    [86_399_999, '1d 0h:00'], [86_400_000, '1d 0h:00'], [86_400_001, '1d 0h:01'],
    [2 * 86_400_000 + 23 * 3_600_000 + 43 * 60_000 + 1, '2d 23h:44'],
  ];
  for (const [remaining, expected] of cases) {
    view.remainingMs.value = remaining; await Vue.nextTick();
    expect(textContent(byClass(view.root, 'trial-header-countdown')!), `remaining=${remaining}`).toBe(expected);
    expect(byClass(view.root, 'nx-trial-hero--card-entry')!.props['data-trial-state']).toBe('active');
  }
  expect(textContent(view.root)).toContain('$11.37');
  expect(view.show).not.toHaveBeenCalled(); expect(view.navTo).not.toHaveBeenCalled();
});

test('a full queue leaves the offer visible and routes to management instead of claiming', async () => {
  const view = await mount('zh', 'none'); view.trial.reason = 'capacity-full'; await Vue.nextTick();
  expect(textContent(view.root)).toContain(view.copy.cardCapacityFull);
  expect(byClass(view.root, 'nx-trial-hero--card-entry')).toBeUndefined();
  expect(textContent(byClass(view.root, 'trial-cta')!)).toBe(view.copy.cardManage);
  expect(byClass(view.root, 'trial-cta')!.props['aria-label']).toBe(view.copy.manageDevices);
  view.click(); expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/me/devices'); expect(view.show).not.toHaveBeenCalled();
});

test('an unclaimed offer keeps its CTA and opens the claim sheet only once', async () => {
  const view = await mount('vi', 'none'); view.trial.reason = ''; await Vue.nextTick();
  expect(byClass(view.root, 'nx-trial-hero--card-entry')).toBeUndefined();
  const card = byClass(view.root, 'nx-trial-hero')!;
  expect(card.props.role).toBeUndefined(); expect(card.props.tabindex).toBeUndefined();
  const cta = byClass(view.root, 'trial-cta')!;
  expect(cta.props['aria-label']).toBe(vietnamese.trial.heroClaimCta);
  const event = dispatch(cta, 'click');
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(view.show).toHaveBeenCalledOnce(); expect(view.navTo).not.toHaveBeenCalled();
});

test.each(['Enter', ' '])('lifecycle card handles %j only when the key target is the card itself', async key => {
  const view = await mount('vi');
  const card = byClass(view.root, 'nx-trial-hero--card-entry')!;
  const descendantEvent = dispatch(byClass(view.root, 'trial-title')!, 'keydown', key);
  expect(descendantEvent.preventDefault).not.toHaveBeenCalled();
  expect(view.navTo).not.toHaveBeenCalled(); expect(view.show).not.toHaveBeenCalled();

  const rootEvent = dispatch(card, 'keydown', key);
  expect(rootEvent.preventDefault).toHaveBeenCalledOnce();
  expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/me/trial');
  expect(view.show).not.toHaveBeenCalled();
});

test('lifecycle card leaves unrelated keys and nested retry keys alone', async () => {
  const view = await mount('en'); view.trial.authorityStatus = 'error'; await Vue.nextTick();
  const card = byClass(view.root, 'nx-trial-hero--card-entry')!;
  for (const key of ['Tab', 'Escape', 'ArrowDown']) {
    expect(dispatch(card, 'keydown', key).preventDefault).not.toHaveBeenCalled();
  }
  const retry = byClass(view.root, 'trial-retry')!;
  for (const key of ['Enter', ' ']) {
    expect(dispatch(retry, 'keydown', key).preventDefault).not.toHaveBeenCalled();
  }
  expect(view.navTo).not.toHaveBeenCalled(); expect(view.show).not.toHaveBeenCalled();
});

test.each(['active', 'grace', 'ended'])('benefits keeps the %s trial after claim and fills the grid when the voucher is gone', async status => {
  const view = await mount('en', status, 'benefits');
  expect(find(view.root, item => item.type === 'trial-card')).toBeDefined();
  expect(byClass(view.root, 'home-benefits__grid--single')).toBeUndefined();
  view.voucher.claimable = false; view.voucher.presentationOffers=[]; view.voucher.presentationClaimable=[]; await Vue.nextTick();
  expect(find(view.root, item => item.type === 'trial-card')).toBeDefined();
  expect(byClass(view.root, 'home-benefits__grid--single')).toBeDefined();
  view.trial.status = 'none'; view.trial.authorityStatus = 'error'; await Vue.nextTick();
  expect(find(view.root, item => item.type === 'trial-card')).toBeDefined();
});

test.each((['zh', 'en', 'vi'] as const).flatMap(locale => ['active', 'grace'].map(status => ({ locale, status }))))(
  '$locale embedded $status hides accrued credit without masking labels, countdown or destination', async ({ locale, status }) => {
    const screen = await mount(locale, status);
    const countdown = textContent(byClass(screen.root, 'trial-header-countdown')!);
    const countdownName = byClass(screen.root, 'trial-header-countdown')!.props['aria-label'];
    const cardName = byClass(screen.root, 'nx-trial-hero--card-entry')!.props['aria-label'];
    expect(textContent(byClass(screen.root, 'trial-lifecycle-credit')!)).toContain('$11.37');
    screen.visibility.toggle(); await Vue.nextTick();
    expect(textContent(byClass(screen.root, 'trial-lifecycle-credit')!)).toContain(screen.copy.creditLabel);
    expect(textContent(byClass(screen.root, 'trial-lifecycle-credit')!)).toContain('••••');
    expect(textContent(screen.root)).not.toContain('$11.37');
    expect(textContent(byClass(screen.root, 'trial-header-countdown')!)).toBe(countdown);
    expect(byClass(screen.root, 'trial-header-countdown')!.props['aria-label']).toBe(countdownName);
    expect(byClass(screen.root, 'nx-trial-hero--card-entry')!.props['aria-label']).toBe(cardName);
    screen.click(); expect(screen.navTo).toHaveBeenCalledExactlyOnceWith('/pages/me/trial');
    expect(screen.projection.offsetUSD.value).toBe(11.37);
    screen.visibility.toggle(); await Vue.nextTick();
    expect(textContent(byClass(screen.root, 'trial-lifecycle-credit')!)).toContain('$11.37');
  },
);

test('standalone hero and public estimate rules retain their existing scope', async () => {
  const standalone = await mount('en', 'active', 'hero', false);
  standalone.visibility.toggle(); await Vue.nextTick();
  expect(textContent(byClass(standalone.root, 'trial-lifecycle-credit')!)).toContain('$11.37');
  const offer = await mount('en', 'none', 'hero', false);
  offer.trial.reason = ''; offer.visibility.toggle(); await Vue.nextTick();
  expect(textContent(byClass(offer.root, 'trial-value')!)).toBe('$50.00');
  expect(offer.projection.estimatedOffsetUSD.value).toBe(50);
  expect(textContent(offer.root)).not.toContain('••••');
});

test('a masked embedded credit does not turn a failed unknown read into zero', async () => {
  const screen = await mount('zh');
  screen.visibility.toggle(); screen.trial.authorityStatus = 'error'; await Vue.nextTick();
  expect(textContent(byClass(screen.root, 'trial-lifecycle-credit')!)).toContain('••••');
  screen.visibility.toggle(); await Vue.nextTick();
  expect(textContent(byClass(screen.root, 'trial-lifecycle-credit')!)).toContain('-');
  expect(textContent(screen.root)).not.toContain('$0.00');
  expect(screen.projection.offsetUSD.value).toBeNull();
});


test('converted trial leaves the shared Store-style voucher and does not return during a failed warm read', async () => {
  const view = await mount('zh', 'converted', 'benefits');
  expect(find(view.root, item => item.type === 'trial-card')).toBeUndefined();
  expect(find(view.root, item => item.type === 'voucher')).toBeDefined();
  expect(byClass(view.root, 'home-benefits__grid--single')).toBeDefined();
  view.trial.status = 'none'; view.trial.authorityStatus = 'error'; await Vue.nextTick();
  expect(find(view.root, item => item.type === 'trial-card')).toBeUndefined();
  view.voucher.presentationOffers = []; view.voucher.presentationClaimable = []; await Vue.nextTick();
  expect(byClass(view.root, 'home-benefits')).toBeUndefined();
});
