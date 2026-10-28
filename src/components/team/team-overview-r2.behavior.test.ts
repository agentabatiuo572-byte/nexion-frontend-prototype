import * as Vue from 'vue';
import type { Component } from 'vue';
import { compileScript, compileStyle, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { createPassiveTabReadFixture } from '@/lib/passive-tab-read.test-support';
import visibilityToggleSource from '@/components/ui/data-visibility-toggle.vue?raw';
import { formatComputePoints, sumComputePoints } from '@/i18n/compute-points';
import { fmt } from '@/i18n/format';
import summarySource from './team-summary-card.vue?raw';
import artSource from './team-art.vue?raw';
import ledgerSource from './team-ledger-card.vue?raw';
import teamSource from '@/pages/team/team.vue?raw';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { formatAmount } from '@/lib/amount-display';
import { formatUsd, formatUsdOverviewParts } from '@/lib/usd-display';

// Node-only host: execute the actual SFCs without a browser or layout engine.
type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ''): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node('#text', text), createComment: () => node('#comment'),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    if (at < 0) parent.children.push(child); else parent.children.splice(at, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join('');
const hasClass = (target: Host, name: string) => Vue.normalizeClass(target.props.class).split(' ').includes(name);
const find = (root: Host, name: string) => all(root).find(target => hasClass(target, name))!;
const accessibleText = (root: Host): string => root.props['aria-hidden'] === true || root.props['aria-hidden'] === 'true'
  ? '' : root.text + root.children.map(accessibleText).join('');
const unmounts: Array<() => void> = [];
beforeEach(() => {
  vi.stubGlobal('uni', { getStorageSync: () => undefined, setStorageSync: vi.fn() });
  setActivePinia(createPinia());
});
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.unstubAllGlobals(); });
const dictionaries = { en, zh, vi: vietnamese };
type Locale = keyof typeof dictionaries;

function compile(source: string, dependencies: Record<string, unknown>): Component {
  const script = compileScript(parse(source).descriptor, { id: 'team-r2', inlineTemplate: true,
    templateOptions: { compilerOptions: { hoistStatic: false, isCustomElement: tag => tag === 'view' || tag === 'text' } },
  });
  const code = ts.transpileModule(script.content, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = { default: {} as Component };
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'vue') return Vue;
    if (id === '@/components/ui/data-visibility-toggle.vue') return { default: compile(visibilityToggleSource, dependencies) };
    if (id === '@/components/team/team-ledger-card.vue') return { default: compile(ledgerSource, dependencies) };
    if (id === '@/components/team/team-summary-card.vue') return { default: compile(summarySource, dependencies) };
    if (!(id in dependencies)) throw new Error(`Unexpected team R2 import: ${id}`);
    return dependencies[id];
  }, exports);
  return exports.default;
}
async function mount(source: string, initial: Record<string, unknown>, locale: Locale = 'en', extraDependencies: Record<string, unknown> = {}) {
  const navTo = vi.fn();
  const dependencies = {
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[locale]) },
    '@/store/locale': { useLocaleStore: () => ({ code: locale }) },
    '@/store/data-visibility': { useDataVisibility },
    '@/i18n/team-redesign': { teamRedesignCopy },
    '@/lib/route': { navTo, takeNavigationQuery: () => '' }, '@/lib/amount-display': { formatAmount },
    '@/lib/usd-display': { formatUsd, formatUsdOverviewParts },
    './team-art.vue': { default: compile(artSource, {}) },
    '@/components/ui/nx-button.vue': { default: { props: ['label'], emits: ['click'],
      setup: (props: any, { emit }: any) => () => Vue.h('button', { onClick: () => emit('click') }, props.label) } },
    ...extraDependencies,
  };
  const props = Vue.reactive(initial);
  const component = compile(source, dependencies);
  const root = node('root');
  const app = renderer.createApp({ setup: () => () => Vue.h(component, props) });
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  return { root, props, navTo, set: async (next: Record<string, unknown>) => { Object.assign(props, next); await Vue.nextTick(); } };
}
const amounts = { totalUSDTLifetime: 800, contributors: 16, directUSDT: 600, extendedUSDT: 200,
  monthUSDT: 1234.56, monthNEX: 12, unlockedUSDT: 50, coolingUSDT: 25 };

describe('team statistics use the shared visibility preference', () => {
  it.each(['zh', 'en', 'vi'] as const)('%s masks actual text and ratio geometry, then restores current values without changing navigation', async locale => {
    const ledger = await mount(ledgerSource, { ...amounts, available: true }, locale);
    const summary = await mount(summarySource, { status: 'ready', total: 987654321, direct: 345 }, locale);
    const visibility = useDataVisibility();
    const toggle = find(ledger.root, 'data-visibility-toggle');
    expect(toggle.parent).toBe(find(ledger.root, 'team-ledger__header'));
    find(ledger.root, 'team-ledger__breakdown').props.onClick(); await Vue.nextTick();
    expect(all(find(ledger.root, 'team-ledger__bar')).some(item => item.props.style?.width === '75%')).toBe(true);
    toggle.props.onClick({ stopPropagation: vi.fn() }); await Vue.nextTick();
    expect(visibility.hidden).toBe(true);
    expect(toggle.props['aria-pressed']).toBe('true');
    expect(text(find(ledger.root, 'team-ledger__amount'))).toBe('••••');
    expect(text(find(ledger.root, 'team-ledger__nex'))).toBe('•••• UVT');
    expect(all(find(ledger.root, 'team-ledger__settlement')).filter(item => hasClass(item, 'tabular-nums')).map(text)).toEqual(['••••', '••••']);
    expect(text(find(ledger.root, 'team-ledger__lifetime'))).not.toMatch(/800|16/);
    expect(text(find(ledger.root, 'team-ledger__split'))).not.toMatch(/600|200|75%|25%/);
    expect(all(find(ledger.root, 'team-ledger__bar')).filter(item => item.props.style?.width)).toEqual([]);
    expect(text(find(summary.root, 'team-summary__number'))).toBe('••••');
    expect(text(find(summary.root, 'team-summary__direct'))).not.toContain('345');
    expect(find(summary.root, 'team-summary__body').props.class).not.toContain('team-summary__body--long-count');
    const maskedUnits = find(summary.root, 'team-summary__number').props.style['--team-summary-count-units'];
    await summary.set({ total: 7, direct: 2 });
    expect(find(summary.root, 'team-summary__number').props.style['--team-summary-count-units']).toBe(maskedUnits);
    await ledger.set({ monthUSDT: 7654.32, contributors: 29 });
    expect(text(find(ledger.root, 'team-ledger__amount'))).toBe('••••');
    const aria = all(ledger.root).concat(all(summary.root)).flatMap(item => Object.entries(item.props)
      .filter(([key]) => key.startsWith('aria-')).map(([, value]) => String(value))).join('|');
    expect(aria).not.toMatch(/1,234|7654|7,654|987654321|345/);
    expect(ledger.props.monthUSDT).toBe(7654.32);
    expect(ledger.props.directUSDT).toBe(600);
    const details = find(ledger.root, 'team-ledger__details');
    expect(details.parent).toBe(find(ledger.root, 'team-ledger__nex').parent);
    expect(details.props.role).toBe('link'); expect(details.props.tabindex).toBe('0');
    details.props.onClick(); expect(ledger.navTo).toHaveBeenCalledWith('/pages/team/commissions');
    // A different consumer uses the same store; revealing restores the latest read.
    visibility.toggle(); await Vue.nextTick();
    expect(text(find(ledger.root, 'team-ledger__amount'))).toBe('$7,654.32');
    expect(text(find(ledger.root, 'team-ledger__lifetime'))).toContain('29');
    expect(text(find(summary.root, 'team-summary__number'))).toBe('7');
    expect(all(find(ledger.root, 'team-ledger__bar')).some(item => item.props.style?.width === '75%')).toBe(true);
  });

  it('keeps failure/retry, empty invitation and unknown reads functional while hidden', async () => {
    const visibility = useDataVisibility(); visibility.toggle();
    const onRetry = vi.fn(), onInvite = vi.fn();
    const ledger = await mount(ledgerSource, { ...amounts, available: false, failed: true, onRetry });
    const summary = await mount(summarySource, { status: 'ready', total: 0, direct: 0, onInvite });
    expect(text(find(ledger.root, 'team-ledger__amount'))).toBe('••••');
    expect(accessibleText(find(ledger.root, 'team-ledger__feedback'))).toContain(en.network.projectionErrorDesc);
    find(ledger.root, 'team-ledger__retry').props.onClick(); expect(onRetry).toHaveBeenCalledOnce();
    all(summary.root).find(item => item.tag === 'button')!.props.onClick(); expect(onInvite).toHaveBeenCalledOnce();
    expect(text(find(summary.root, 'team-summary__empty'))).not.toContain(en.team.summaryEmpty);
    visibility.toggle(); await Vue.nextTick();
    expect(text(find(ledger.root, 'team-ledger__amount'))).toBe('—');
    expect(text(find(summary.root, 'team-summary__number'))).toBe('0');
  });
});

async function teamHome(locale: Locale) {
  const shows: Array<() => void> = [];
  const app = Vue.reactive({ accountKey: 'team-test-account', accountBindingEpoch: 1 });
  const runtime = Vue.reactive({ environment: 'dev', baseUrl: 'https://team.test.invalid' });
  const passive = createPassiveTabReadFixture(() => JSON.stringify([app.accountKey, app.accountBindingEpoch, locale, runtime.environment, runtime.baseUrl]));
  passive.notifyPageActivation('/pages/team/team');
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h('view', {}, slots.default?.()) };
  const poolSnapshot = Vue.reactive({ myVotes: 17, mySharePct: .1234, projectedPayoutUSDT: 876.54,
    currentWeekPoolUSDT: 76543.21, unlockRank: 3, injectRate: .05 });
  const network = Vue.reactive({ remoteStatus: 'ready', remoteTransientFailure: false, hasRemoteSnapshot: true, totalMembers: 987654321, members: [],
    byLayer: () => ({ 1: [1, 2, 3], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }), refreshCanonicalNetwork: vi.fn(), ensureCanonicalNetwork: vi.fn(), invalidateReadOwner: vi.fn() });
  const commission = Vue.reactive({ eventsStatus: 'ready', eventsTransientFailure: false, events: [],
    eventsEvidence: { source: 'server', serverCanonical: true, sourceEnvironment: 'PRODUCTION', runId: '', aggregate: {
    totalUSDT: 800, totalNEX: 12, directUSDT: 600, extendedUSDT: 200, contributorCount: 16,
    monthUSDT: 1234.56, monthNEX: 12, unlockedUSDT: 50, coolingUSDT: 25 } },
    monthUSDT: () => 1234.56, monthNEX: () => 12, unlockedUSDT: () => 50, coolingUSDT: () => 25,
    binarySnapshot: { estimatedAmountUsdt: 456.78, trackAComputePoints: 31234, trackBComputePoints: 56789 },
    refreshCanonicalBinary: vi.fn(), refreshCanonicalEvents: vi.fn(), ensureCanonicalBinary: vi.fn(), ensureCanonicalEvents: vi.fn(), invalidateReadOwner: vi.fn() });
  const page = await mount(teamSource, {}, locale, {
    '@/lib/passive-tab-read': passive,
    '@/i18n/compute-points': { formatComputePoints, sumComputePoints },
    '@/i18n/format': { fmt, dateLocale: () => locale },
    '@/composables/use-tab-page-lifecycle': { onLoad: () => {}, onShow: (fn: () => void) => shows.push(fn), onHide: () => {} },
    '@/components/tab-page-frame.vue': { default: slot },
    '@/components/ui/nx-list-group.vue': { default: slot },
    '@/components/ui/nx-list-row.vue': { default: slot },
    // These are separate owned consumers, not replacements for their privacy tests.
    '@/components/team/invite-earn-card.vue': { default: slot },
    '@/components/promotion/referral-progress.vue': { default: slot },
    '@/components/team/network-orb-backdrop.vue': { default: slot },
    '@/store/v-rank': { useVRank: () => ({ myRank: 4, remoteReady: true, remoteError: null, remoteTransientFailure: false,
      refreshCanonicalVRank: vi.fn(), ensureCanonicalVRank: vi.fn(), invalidateReadOwner: vi.fn() }), nextRankProgress: () => null },
    '@/lib/v-rank-copy': { rankLabel: () => 'V4' },
    '@/store/network': { useNetwork: () => network },
    '@/store/commission': { useCommission: () => commission },
    '@/store/leadership-pool': { useLeadershipPool: () => ({}) },
    '@/api/runtime': { remoteApiEnabled: true, apiRuntimeConfig: runtime, teamInsightsApi: { leadershipPool: async () => poolSnapshot } },
    '@/store/product-catalog': { productCatalogState: Vue.reactive({ status: 'ready', serverCanonical: true, sourceEnvironment: 'PRODUCTION', runId: '' }),
      productCatalogDisplayProof: Vue.ref({ sourceEnvironment: 'PRODUCTION', runId: '', revision: 'team-fixture', bindingEpoch: 1, runtimeEpoch: 0 }),
      isProductCatalogDisplayCurrent: () => true },
    '@/lib/leadership-pool-state': { leadershipPoolFailureState: () => 'error' },
    '@/store/referral-reward': { useReferralReward: () => ({ snapshot: null, loading: false }) },
    '@/store/app': { useApp: () => app },
    '@/lib/account-scope': { captureAccountScope: () => 1, isCurrentAccountScope: () => true },
    '@/api/order-api': { captureRuntimeRevision: () => ({ runId: null, epoch: 0 }), isCurrentRuntimeRevision: () => true, subscribeRuntimeRevision: () => () => {} },
  });
  shows.forEach(show => show());
  // Join the real passive read scheduled by onShow before asserting its rendered result.
  await passive.runPassiveTabRead('leadership-pool', async () => poolSnapshot);
  await Vue.nextTick();
  return { ...page, poolSnapshot, network, commission };
}

describe('team home privacy coverage through its actual SFC', () => {
  it.each(['zh', 'en', 'vi'] as const)('%s conceals rank, member totals, compute and pool statistics while preserving public qualification rules', async locale => {
    const page = await teamHome(locale), visibility = useDataVisibility();
    expect(text(find(page.root, 'team-rank__level'))).toBe('V4');
    expect(text(find(page.root, 'nx-team-binary-link'))).toContain(formatUsd(456.78));
    expect(text(find(page.root, 'nx-team-leadership-pool-link'))).toContain(formatUsd(876.54));
    visibility.toggle(); await Vue.nextTick();
    expect(text(find(page.root, 'team-rank__level'))).toBe('••••');
    expect(text(find(page.root, 'nx-team-royalty-network-link'))).not.toContain('987654321');
    const binary = find(page.root, 'nx-team-binary-link'), pool = find(page.root, 'nx-team-leadership-pool-link');
    expect(text(binary)).toContain('A · ••••');
    expect(text(binary)).toContain('B · ••••');
    for (const value of [formatUsd(456.78), formatComputePoints(31234, locale), formatComputePoints(56789, locale)]) expect(text(binary)).not.toContain(value);
    expect(text(pool)).not.toContain(formatUsd(876.54));
    expect(text(pool)).not.toMatch(/17|12\.34/);
    const aria = all(page.root).flatMap(item => Object.entries(item.props).filter(([key]) => key.startsWith('aria-')).map(([, value]) => String(value))).join('|');
    expect(aria).not.toMatch(/987654321|876\.54|12\.34|V4/);
    binary.props.onClick(); pool.props.onClick(); find(page.root, 'nx-team-royalty-network-link').props.onClick();
    expect(page.navTo.mock.calls).toEqual([['/pages/team/binary'], ['/pages/team/leadership-pool'], ['/pages/team/unilevel']]);
    page.poolSnapshot.myVotes = 0; await Vue.nextTick();
    expect(text(pool)).toContain('V3'); // Public eligibility threshold is not a personal statistic.
    expect(text(pool)).toContain('5%');
    expect(text(pool)).not.toContain(formatUsd(76543.21));
    expect(page.poolSnapshot.currentWeekPoolUSDT).toBe(76543.21);
    visibility.toggle(); await Vue.nextTick();
    expect(text(pool)).toContain(formatUsd(76543.21));
    expect(text(binary)).toContain(formatUsd(456.78));
    page.network.remoteStatus = 'error'; await Vue.nextTick();
    expect(text(find(page.root, 'nx-team-royalty-network-link'))).not.toContain('987654321');
  });
});

describe('R1-TV04 ledger state continuity', () => {
  it.each(['zh', 'en', 'vi'] as const)('%s preserves the same hero and status slots across initial/read/refresh/error/retry', async locale => {
    const onRetry = vi.fn(), copy = dictionaries[locale];
    const p = await mount(ledgerSource, { ...amounts, available: false, loading: true, failed: false, onRetry }, locale);
    const hero = find(p.root, 'team-ledger'), amount = find(p.root, 'team-ledger__amount');
    const settlement = find(p.root, 'team-ledger__settlement'), feedback = find(p.root, 'team-ledger__feedback');
    const slots = all(feedback).filter(item => hasClass(item, 'team-ledger__feedback-item'));
    expect(slots).toHaveLength(1);
    expect(text(amount)).toBe('—');
    expect(text(settlement)).not.toContain('$');
    expect(accessibleText(feedback)).toBe('');
    expect(hero.props['aria-busy']).toBe(true);
    const retry = find(p.root, 'team-ledger__retry');
    expect(retry.props.tabindex).toBe(-1);
    retry.props.onClick(); expect(onRetry).not.toHaveBeenCalled();
    const sameSlots = () => {
      expect(find(p.root, 'team-ledger')).toBe(hero);
      expect(find(p.root, 'team-ledger__amount')).toBe(amount);
      expect(find(p.root, 'team-ledger__settlement')).toBe(settlement);
      expect(find(p.root, 'team-ledger__feedback')).toBe(feedback);
      slots.forEach((slot, i) => expect(all(feedback).filter(item => hasClass(item, 'team-ledger__feedback-item'))[i]).toBe(slot));
    };
    await p.set({ available: true, loading: false }); sameSlots();
    expect(text(amount)).toBe('$1,234.56');
    expect(accessibleText(feedback)).toBe('');
    expect(hero.props['aria-busy']).toBe(false);
    find(p.root, 'team-ledger__breakdown').props.onClick(); await Vue.nextTick();
    expect(text(find(p.root, 'team-ledger__lifetime'))).toContain('$800.00');
    await p.set({ loading: true }); sameSlots();
    expect(text(amount)).toBe('$1,234.56');
    expect(accessibleText(feedback)).toBe('');
    const breakdown = find(p.root, 'team-ledger__breakdown');
    expect(hasClass(breakdown, 'is-hidden')).toBe(false);
    expect(hasClass(breakdown, 'is-unknown')).toBe(false);
    expect(breakdown.props['aria-hidden']).toBe(false);
    expect(breakdown.props['aria-disabled']).toBe(true);
    expect(breakdown.props.tabindex).toBe(-1);
    breakdown.props.onClick(); await Vue.nextTick();
    expect(breakdown.props['aria-expanded']).toBe(true);
    expect(hero.props['aria-busy']).toBe(true);
    await p.set({ failed: true, loading: false, available: false }); sameSlots();
    expect(text(amount)).toBe('—');
    expect(text(find(p.root, 'team-ledger__lifetime'))).not.toContain('$800.00');
    expect(accessibleText(feedback)).toContain(copy.network.projectionErrorDesc);
    expect(retry.props.tabindex).toBe(0);
    retry.props.onClick(); expect(onRetry).toHaveBeenCalledOnce();
    await p.set({ failed: false, loading: true }); sameSlots();
    expect(accessibleText(feedback)).toBe('');
    await p.set({ available: true, loading: false, monthUSDT: 0, monthNEX: 0, unlockedUSDT: 0, coolingUSDT: 0 }); sameSlots();
    expect(text(amount)).toBe('$0.00');
    expect(text(find(p.root, 'team-ledger__nex'))).toBe('+ 0.00 UVT');
    find(p.root, 'team-ledger__details').props.onClick();
    expect(p.navTo).toHaveBeenCalledWith('/pages/team/commissions');
  });

  it('never exposes previous-account amounts after its snapshot is cleared, even before loading starts', async () => {
    const p = await mount(ledgerSource, { ...amounts, available: true });
    await p.set({ available: false });
    expect(text(find(p.root, 'team-ledger__amount'))).toBe('—');
    expect(text(find(p.root, 'team-ledger__settlement'))).not.toContain('$');
    find(p.root, 'team-ledger__breakdown').props.onClick(); await Vue.nextTick();
    expect(find(p.root, 'team-ledger__breakdown').props['aria-expanded']).toBe(false);
  });

  it('wires the page into a single unconditional ledger rather than a second loading block', () => {
    const template = parse(teamSource).descriptor.template!.content;
    const cards = template.match(/<TeamLedgerCard\b[\s\S]*?\/>/g)!;
    expect(cards).toHaveLength(1);
    expect(cards[0]).not.toMatch(/v-if|v-else/);
    for (const binding of [':available="ledgerVisible"', ':loading="ledgerLoading"', ':failed="ledgerFailureFeedback"', '@retry="refreshRemoteLedger"']) expect(cards[0]).toContain(binding);
    expect(template).not.toContain('toolCellStyle(0)');
  });
});

describe('R1-TV01 summary count and container contracts (not pixel measurements)', () => {
  it.each(['zh', 'en', 'vi'] as const)('%s retains the decorative arrow slot without making a loading or failed member card actionable', async locale => {
    const onOpen = vi.fn();
    const p = await mount(summarySource, { status: 'ready', hasSnapshot: true, total: 12, direct: 10, onOpen }, locale);
    const arrow = find(p.root, 'team-summary__arrow'), card = find(p.root, 'team-summary');
    expect(arrow.props['aria-hidden']).toBe('true');
    card.props.onClick(); expect(onOpen).toHaveBeenCalledOnce();
    for (const status of ['loading', 'error', 'idle']) {
      await p.set({ status });
      expect(find(p.root, 'team-summary__arrow')).toBe(arrow);
      expect(arrow.props.style.visibility).toBe('hidden');
      expect(card.props.role).toBeUndefined();
      card.props.onClick(); expect(onOpen).toHaveBeenCalledOnce();
    }
    await p.set({ status: 'ready' }); expect(arrow.props.style.visibility).toBe('visible');
    card.props.onClick(); expect(onOpen).toHaveBeenCalledTimes(2);
    await p.set({ total: 0 }); expect(arrow.props.style.visibility).toBe('hidden');
  });

  it('preserves default and explicitly requested art sizes for the other consumers', async () => {
    const p = await mount(artSource, { kind: 'gift' });
    const art = find(p.root, 'team-art');
    expect(art.props.style['--team-art-default-size']).toBe('112px');
    expect(art.props.style.backgroundPosition).toBe('100% 0%');
    await p.set({ size: 128 }); expect(art.props.style['--team-art-default-size']).toBe('128px');
    await p.set({ size: 88, kind: 'growth' });
    expect(art.props.style['--team-art-default-size']).toBe('88px');
    expect(art.props.style.backgroundPosition).toBe('100% 100%');
  });

  it.each(['zh', 'en', 'vi'] as const)('%s keeps real multi-digit counts and the existing navigation/retry/invitation states', async locale => {
    const onOpen = vi.fn(), onInvite = vi.fn(), onRetry = vi.fn();
    const p = await mount(summarySource, { status: 'ready', total: 987654, direct: 123456, onOpen, onInvite, onRetry }, locale);
    const count = find(p.root, 'team-summary__number'), card = find(p.root, 'team-summary');
    expect(text(count)).toBe('987654');
    expect(text(find(p.root, 'team-summary__direct'))).toContain('123456');
    expect(find(p.root, 'team-art').props.style).toMatchObject({ '--team-art-default-size': '56px' });
    expect(find(p.root, 'team-art').props.style).not.toHaveProperty('width');
    card.props.onClick(); expect(onOpen).toHaveBeenCalledOnce();
    await p.set({ total: 123456789 }); expect(text(count)).toBe('123456789');
      await p.set({ status: 'loading', hasSnapshot: true }); expect(text(count)).toBe('123456789');
      await p.set({ hasSnapshot: false }); expect(text(count)).toBe('—');
    expect(card.props['aria-busy']).toBe(true);
    card.props.onClick(); expect(onOpen).toHaveBeenCalledOnce();
    await p.set({ status: 'error' });
    all(p.root).find(item => item.tag === 'button')!.props.onClick(); expect(onRetry).toHaveBeenCalledOnce();
    await p.set({ status: 'ready', total: 0, direct: 0 }); expect(text(count)).toBe('0');
    all(p.root).find(item => item.tag === 'button')!.props.onClick(); expect(onInvite).toHaveBeenCalledOnce();
  });

  it('compiles a stacked fallback, real container thresholds and a shared art size variable', () => {
    for (const source of [summarySource, artSource, ledgerSource]) {
      const css = parse(source).descriptor.styles[0].content;
      expect(compileStyle({ source: css, filename: 'team-r2.vue', id: 'team-r2', scoped: true }).errors).toEqual([]);
    }
    const summaryCss = parse(summarySource).descriptor.styles[0].content;
    expect(summaryCss).toContain('container: team-summary / inline-size');
    expect(summaryCss).toMatch(/\.team-summary__body\s*\{[^}]*flex-direction: column/);
    expect(summaryCss).toContain('@container team-summary (min-width: 140px)');
    expect(summaryCss).toContain('@container team-summary (min-width: 260px)');
    expect(summaryCss).toMatch(/\.team-summary__number\s*\{[^}]*white-space: nowrap;[^}]*overflow-x: auto/);
    expect(summaryCss).not.toContain('!important');
    expect(summaryCss).not.toContain('@media');
    const artCss = parse(artSource).descriptor.styles[0].content;
    expect(artCss).toContain('width: var(--team-art-size, var(--team-art-default-size))');
    expect(artCss).toContain('height: var(--team-art-size, var(--team-art-default-size))');
    const ledgerCss = parse(ledgerSource).descriptor.styles[0].content;
    expect(ledgerCss).toMatch(/\.team-ledger__feedback-item\s*\{[^}]*grid-area: 1 \/ 1;[^}]*visibility: hidden/);
    expect(ledgerCss).toMatch(/\.team-ledger__feedback-item\.is-active\s*\{[^}]*visibility: visible/);
  });
});

it.each(['zh','en','vi'] as const)('%s main-Team cold unknown keeps static shell and placeholders without reading copy',async locale=>{
 const p=await mount(summarySource,{status:'idle',hasSnapshot:false,total:0,direct:0},locale);
 const card=find(p.root,'team-summary'),count=find(p.root,'team-summary__number');
 expect(text(count)).toBe('—');expect(text(find(p.root,'team-summary__direct'))).toContain('—');expect(text(card)).not.toContain(dictionaries[locale].team.summaryLoading);
 expect(all(p.root).some(n=>hasClass(n,'team-summary__status'))).toBe(false);
 await p.set({status:'loading'});expect(text(count)).toBe('—');expect(text(card)).not.toContain(dictionaries[locale].team.summaryLoading);
 expect(all(p.root).some(n=>hasClass(n,'team-summary__status'))).toBe(false);
});
