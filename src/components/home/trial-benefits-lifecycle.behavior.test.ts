import * as Vue from 'vue';
import type { Component } from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, expect, test, vi } from 'vitest';
import heroSource from '../trial-hero-banner.vue?raw';
import benefitsSource from './home-benefits.vue?raw';
import { trialLifecycleCopy, formatTrialRemaining } from '@/i18n/trial-lifecycle';
import { auditUiCopy } from '@/i18n/audit-ui';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';

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
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

async function mount(locale: 'zh' | 'en' | 'vi', initialStatus = 'active', surface: 'hero' | 'benefits' = 'hero') {
  const trial = Vue.reactive({ status: initialStatus, authorityStatus: 'ready', reason: 'in-progress',
    eligibility: () => ({ ok: trial.authorityStatus === 'ready' && trial.reason === '', reason: trial.reason }),
    confirmedOfferState: () => trial.reason === '' ? 'claimable' : 'unavailable', showHeroPromo: () => trial.status === 'none' && trial.reason === '',
  });
  const retainedStatus = Vue.ref<string | null>(initialStatus);
  const projection = {
    status: retainedStatus, deviceName: Vue.ref('UVELBox S1'),
    config: Vue.computed(() => trial.authorityStatus === 'error' ? null : { trialDays: 3, shadowDailyUSD: 20, trialOffsetCapUSD: 50 }),
    offsetUSD: Vue.computed(() => trial.authorityStatus === 'error' ? null : 11.37),
    remainingMs: Vue.computed(() => trial.authorityStatus === 'error' ? null : 2 * 86400_000 + 123_000),
    estimatedOffsetUSD: Vue.computed(() => trial.authorityStatus === 'error' ? null : 50), refresh: vi.fn(),
  };
  const voucher = Vue.reactive({ claimable: true, claimedUnused: [] as string[], hasClaimableForSurface: () => voucher.claimable });
  const show = vi.fn(), navTo = vi.fn(), messages = { zh, en, vi: vietnamese }[locale], copy = trialLifecycleCopy[locale];
  const section = { setup: (_props: unknown, context: { slots: Vue.Slots }) => () => Vue.h('section', context.slots.default?.()) };
  const modules: Record<string, unknown> = {
    vue: Vue, '@/store/free-trial': { useFreeTrial: () => trial },
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
  const root = node('root'), app = renderer.createApp(exports.default, { embedded: true });
  app.mount(root); cleanups.push(() => app.unmount()); await Vue.nextTick();
  return { root, trial, retainedStatus, projection, show, navTo, voucher, copy,
    click: () => (byClass(root, 'trial-cta')!.props.onClick as (event: unknown) => void)({ stopPropagation: vi.fn() }),
  };
}

test.each((['zh', 'en', 'vi'] as const).flatMap(locale => ['active', 'grace', 'ended', 'converted'].map(status => ({ locale, status }))))('$locale $status keeps a lifecycle card with the correct next destination', async ({ locale, status }) => {
  const view = await mount(locale, status);
  const title = { active: view.copy.activeTitle, grace: view.copy.graceTitle, ended: view.copy.endedTitle, converted: view.copy.convertedTitle }[status];
  expect(textContent(view.root)).toContain(title);
  if (status === 'active' || status === 'grace') {
    expect(textContent(view.root)).toContain(formatTrialRemaining(48 * 3600000 + 123000, view.copy.longRemaining)); expect(textContent(view.root)).toContain('$11.37');
    expect(textContent(view.root)).not.toContain('$50.00');
  }
  view.click(); expect(view.navTo).toHaveBeenCalledExactlyOnceWith(status === 'converted' ? '/pages/me/devices' : '/pages/me/trial');
  expect(view.show).not.toHaveBeenCalled();
});

test.each(['zh', 'en', 'vi'] as const)('%s ended trials may claim only after a fresh eligible response', async locale => {
  const view = await mount(locale, 'ended');
  view.trial.reason = ''; await Vue.nextTick();
  view.click(); expect(view.show).toHaveBeenCalledOnce(); expect(view.navTo).not.toHaveBeenCalled();
  view.trial.authorityStatus = 'loading'; await Vue.nextTick();
  view.click(); expect(view.show).toHaveBeenCalledOnce(); expect(view.navTo).toHaveBeenCalledWith('/pages/me/trial');
});

test('failed reads preserve the active card and neutral numbers, with a working retry', async () => {
  const view = await mount('zh'); view.trial.authorityStatus = 'error'; view.trial.status = 'none'; await Vue.nextTick();
  expect(textContent(view.root)).toContain(view.copy.activeTitle);
  expect(textContent(view.root)).not.toContain('$0.00'); expect(textContent(view.root)).not.toContain('$11.37');
  expect(textContent(byClass(view.root, 'trial-countdown')!)).toBe('-');
  (byClass(view.root, 'trial-retry')!.props.onClick as (event: unknown) => void)({ stopPropagation: vi.fn() });
  expect(view.projection.refresh).toHaveBeenCalledOnce();
});

test('a full queue leaves the offer visible and routes to management instead of claiming', async () => {
  const view = await mount('zh', 'none'); view.trial.reason = 'capacity-full'; await Vue.nextTick();
  expect(textContent(view.root)).toContain(view.copy.capacityFull);
  expect(textContent(byClass(view.root, 'trial-cta')!)).toBe(view.copy.manageDevices);
  view.click(); expect(view.navTo).toHaveBeenCalledExactlyOnceWith('/pages/me/devices'); expect(view.show).not.toHaveBeenCalled();
});

test.each(['active', 'grace', 'ended', 'converted'])('benefits keeps the %s trial after claim and fills the grid when the voucher is gone', async status => {
  const view = await mount('en', status, 'benefits');
  expect(find(view.root, item => item.type === 'trial-card')).toBeDefined();
  expect(byClass(view.root, 'home-benefits__grid--single')).toBeUndefined();
  view.voucher.claimable = false; await Vue.nextTick();
  expect(find(view.root, item => item.type === 'trial-card')).toBeDefined();
  expect(byClass(view.root, 'home-benefits__grid--single')).toBeDefined();
  view.trial.status = 'none'; view.trial.authorityStatus = 'error'; await Vue.nextTick();
  expect(find(view.root, item => item.type === 'trial-card')).toBeDefined();
});
