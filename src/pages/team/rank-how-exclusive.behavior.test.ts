import { formatComputePoints } from '@/i18n/compute-points';
import * as Vue from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import source from './rank-how.vue?raw';
import { mountEntry, all, text, flush, slot, type Host } from '@/lib/entry-review.test-support';
import { installKeyboardActivation, uninstallKeyboardActivation } from '@/lib/a11y-activate';
import { buildRankHowContent, createRankHowResource } from '@/lib/rank-how-content';
import { rankName } from '@/lib/v-rank-copy';
import { rankGuideCopy } from '@/i18n/rank-guide-copy';
import { ruleHero, ruleSection } from '@/components/team/team-rule-guide.test-support';
import { teamRuleGuideCopy } from '@/components/team/team-rule-guide-copy';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';
import type { RankHowPolicy } from '@/api/rank-how-policy-api';
import type { CanonicalVRankRow } from '@/api/v-rank-api';

const dictionaries = { zh, en, vi: vietnamese };
const ids = ['overview', 'overview-detail', 'ladder', 'promotion', 'stepwise', 'protection', 'rewards',
  'requirement-self', 'requirement-direct', 'requirement-team', 'requirement-legs',
  'unlock-network', 'unlock-peer', 'unlock-leadership', 'unlock-cultivation',
  'example', 'example-start', 'example-self', 'example-team', 'example-legs', 'example-trigger', 'example-results',
  'result-network', 'result-peer', 'result-leadership', 'result-cultivation', 'faq-members', 'faq-rank', 'faq-rewards'];
const policy = (): RankHowPolicy => ({ version: 'published-test', locale: 'en', hero: 'Published policy overview',
  source: 'server', sourceEnvironment: 'PRODUCTION', runId: '',
  rules: { permanentProtection: true, qualifiedReferralSelfComputePoints: 3000, leadershipConfigured: false },
  sections: ids.map((id, order) => ({ id, order, title: `Title ${id}`, body:
    id === 'requirement-self' || id === 'example-self' ? '{selfComputePoints}'
      : id === 'requirement-team' || id === 'example-team' ? '{teamComputePoints}' : `Published ${id}` })),
});
const ranks: CanonicalVRankRow[] = [0, 1].map(v => ({ v, title: `Published rank ${v}`, cnTitle: `公开等级 ${v}`,
  directBonus: .1, unilevelDepth: 1, peerBonus: .05, leadershipVotes: 2, cultivationBonus: 900,
  selfComputePoints: v * 2000, teamComputePoints: v * 20000,
  rewards: [], visible: true }));
const button = { default: Vue.defineComponent({ props: ['label', 'disabled', 'busy'], emits: ['click'],
  setup: (props, { emit, slots }) => () => Vue.h('view', { role: 'button', 'aria-label': props.label,
    onClick: () => { if (!props.disabled && !props.busy) emit('click'); } }, slots.default?.() ?? String(props.label)),
}) };
const stop: Array<() => void> = [];
afterEach(() => {
  stop.splice(0).forEach(fn => fn());
  uninstallKeyboardActivation();
  vi.unstubAllGlobals();
});
function page(language: keyof typeof dictionaries = 'en') {
  const shown: Array<() => void> = [], navTo = vi.fn(), navBack = vi.fn();
  const app = Vue.reactive({ accountKey: 'user:A', accountBindingEpoch: 1 });
  const scope = { epoch: 1 };
  const published = vi.fn(async () => policy());
  const ladder = vi.fn(async () => ({ ranks, capabilities: { peer: false, genesis: false } }));
  const p = mountEntry(source, {
    '@dcloudio/uni-app': { onHide: () => {}, onShow: (fn: () => void) => shown.push(fn) },
    '@/components/app-chassis.vue': slot, '@/components/sub-page-header.vue': slot,
    '@/components/team/team-rule-hero.vue': ruleHero, '@/components/team/team-rule-section.vue': ruleSection,
    '@/components/team/team-rule-guide-copy': { teamRuleGuideCopy }, '@/components/ui/nx-button.vue': button,
    '@/components/team/v-badge-icon.vue': { default: Vue.defineComponent({ props: ['v', 'size'], setup: props => () => Vue.h('view', { 'data-rank': props.v }) }) },
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[language]) }, '@/store/locale': { useLocaleStore: () => ({ code: language }) },
    '@/store/app': { useApp: () => app },
    '@/store/auth': { useAuth: () => Vue.reactive({ isAuthenticated: true }) },
    '@/lib/account-scope': { captureAccountScope: () => scope.epoch, isCurrentAccountScope: (owner: number) => owner === scope.epoch },
    '@/lib/route': { navTo, navBack }, '@/api/runtime': { apiClient: {}, apiRuntimeConfig: { environment: 'prod', baseUrl: 'https://fixture.invalid' }, expectedApiEnvironment: 'prod', vRankApi: { ladder } },
    '@/api/rank-how-policy-api': { createRankHowPolicyApi: () => ({ published }) },
    '@/lib/rank-how-content': { buildRankHowContent, createRankHowResource }, '@/lib/v-rank-copy': { rankName },
    '@/i18n/rank-guide-copy': { rankGuideCopy },
  }); stop.push(p.unmount);
  return { ...p, app, scope, navTo, navBack, published, ladder, show: async () => { shown.forEach(fn => fn()); await flush(); } };
}
// Published rules render as expanded sections behind an in-page directory (design system 04.7).
const guideShown = (p: ReturnType<typeof page>) => all(p.root).filter(n => n.props['data-rank-how'] === 'published');
const renderedSections = (p: ReturnType<typeof page>) => all(p.root).filter(n => n.props['data-rule-section']).map(n => n.props['data-rule-section']).sort();
const openAllFaqs = async (p: ReturnType<typeof page>) => {
  for (const toggle of p.nodes('team-rule-faq__toggle').filter(n => !n.props['aria-expanded'])) toggle.props.onClick();
  await flush();
};

it.each([
  ['zh', false], ['en', false], ['vi', false],
  ['zh', true], ['en', true], ['vi', true],
] as const)('activates the %s guide controls by keyboard with document activation %s', async (locale, withDocumentActivation) => {
  const p = page(locale); await p.show();
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  if (withDocumentActivation) {
    vi.stubGlobal('document', {
      addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    installKeyboardActivation();
  }
  const press = async (node: Host, key: string) => {
    const event = {
      key, defaultPrevented: false, repeat: false, altKey: false, ctrlKey: false, metaKey: false,
      target: { tagName: 'UNI-VIEW', getAttribute: (name: string) => node.props[name], click: () => node.props.onClick() },
      preventDefault() { this.defaultPrevented = true; },
    };
    // Exercise the compiled template handlers before the real document listener.
    const handlers = node.props.onKeydown;
    for (const handler of Array.isArray(handlers) ? handlers : handlers ? [handlers] : []) handler(event);
    listeners.get('keydown')?.(event as unknown as KeyboardEvent);
    await flush();
    return event;
  };
  expect(renderedSections(p)).toEqual([...ids].sort());
  const faqs = p.nodes('team-rule-faq__toggle');
  expect(faqs.map(n => n.props['aria-expanded'])).toEqual([true, false, false]);
  for (const toggle of faqs) {
    const opened = toggle.props['aria-expanded'];
    expect((await press(toggle, 'Enter')).defaultPrevented).toBe(true);
    expect(toggle.props['aria-expanded']).toBe(!opened);
    expect(all(p.root).some(n => n.props.id === toggle.props['aria-controls'])).toBe(!opened);
    expect((await press(toggle, ' ')).defaultPrevented).toBe(true);
    expect(toggle.props['aria-expanded']).toBe(opened);
  }
  const chips = p.nodes('team-rule-hero__jump');
  expect(chips.map(n => n.props.role)).toEqual(Array(6).fill('link'));
  for (const id of ['ladder', 'overview', 'promotion', 'steps', 'rewards', 'faq']) expect(all(p.root).some(n => n.props.id === `team-rule-${id}`)).toBe(true);
  // Directory chips declare role + tabindex only; the platform activation layer handles Enter.
  expect(chips[2].props.onKeydown).toBeUndefined();
  if (withDocumentActivation) {
    const scrolled: string[] = [];
    vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {},
      getElementById: (id: string) => ({ scrollIntoView: () => scrolled.push(id) }) });
    await press(chips[2], 'Enter');
    expect(scrolled).toEqual(['team-rule-promotion']);
  }
  const rankLink = p.nodes('how-rank-link')[0];
  expect((await press(rankLink, ' ')).defaultPrevented).toBe(false);
  expect(p.navTo).not.toHaveBeenCalled();
  expect((await press(rankLink, 'Enter')).defaultPrevented).toBe(true);
  expect(p.navTo).toHaveBeenCalledTimes(1);
  expect(p.navTo).toHaveBeenCalledWith('/pages/team/rank');
});

it('reloads after account rebinding has finished instead of retaining a stale request owner', async () => {
  const p = page(); await p.show();
  // completeSignIn binds app state before rebinding the account-scoped stores.
  p.app.accountBindingEpoch++;
  p.scope.epoch++;
  await flush();
  expect(p.nodes('how-state')).toHaveLength(0);
  expect(guideShown(p)).toHaveLength(1);
});
it('keeps loading, failed reads and retry separate from published rules', async () => {
  const p = page();
  expect(p.nodes('how-state')).toHaveLength(1);
  expect(guideShown(p)).toHaveLength(0);
  expect(text(p.root)).toContain(en.rankHowItWorks.ctaBack);
  p.published.mockRejectedValueOnce(new Error('offline')); await p.show();
  expect(p.nodes('how-state')).toHaveLength(1); expect(guideShown(p)).toHaveLength(0);
  const retry = all(p.root).find(n => n.props.role === 'button' && n.props['aria-label'] === 'Reload')!;
  retry.props.onClick(); await flush();
  expect(p.nodes('how-state')).toHaveLength(0); expect(guideShown(p)).toHaveLength(1);
  expect(p.published).toHaveBeenCalledTimes(2);
});
it('does not show incomplete policies or fabricate missing point thresholds', async () => {
  const p = page();
  p.published.mockResolvedValueOnce({ ...policy(), sections: policy().sections.filter(section => section.id !== 'protection') });
  await p.show(); expect(guideShown(p)).toHaveLength(0); expect(p.nodes('how-state')).toHaveLength(1);
  p.ladder.mockResolvedValueOnce({ ranks: ranks.map(rank => ({ ...rank, selfComputePoints: undefined, teamComputePoints: undefined })), capabilities: { peer: false, genesis: false } });
  await p.show(); expect(guideShown(p)).toHaveLength(0); expect(text(p.root)).not.toMatch(/987|45678/);
});
it.each([
  ['zh', '2,000 算力点', '20,000 算力点'],
  ['en', '2,000 compute pts', '20,000 compute pts'],
  ['vi', '2.000 điểm tính toán', '20.000 điểm tính toán'],
] as const)('renders the %s dynamic ladder, steps, expanded rules and navigation', async (locale, own, team) => {
  const p = page(locale); await p.show();
  expect(p.nodes('how-state')).toHaveLength(0);
  expect(all(p.root).filter(n => n.props['data-rank'] !== undefined).map(n => n.props['data-rank'])).toEqual([0, 1]);
  expect(text(guideShown(p)[0])).toContain(rankGuideCopy(locale).headline);
  const guide = rankGuideCopy(locale);
  expect(p.nodes('team-rule-hero__jump').map(text)).toEqual([guide.ladder, guide.overview, guide.conditions, guide.steps, guide.rewards, guide.faq]);
  expect(text(p.root)).toContain('Published policy overview');
  expect(p.nodes('team-rule-item__n').map(text)).toEqual(['1', '2', '3']);
  expect(text(p.root)).toContain(own); expect(text(p.root)).toContain(team); expect(text(p.root)).not.toMatch(/45678|987|\$/);
  for (const expected of ['Published stepwise', 'Published unlock-cultivation', 'Published faq-members', 'Published protection', 'Published result-cultivation']) expect(text(p.root)).toContain(expected);
  expect(text(p.root)).toContain(buildRankHowContent(policy(), ranks, { peer: false, genesis: false }, locale, dictionaries[locale].rank.cond).copy.peerUnavailable);
  expect(text(p.root)).not.toContain('Published faq-rank');
  await openAllFaqs(p);
  expect(renderedSections(p)).toEqual([...ids].sort());
  for (const section of policy().sections.filter(s => !['unlock-peer', 'result-peer'].includes(s.id) && !s.body.startsWith('{'))) {
    expect(text(p.root)).toContain(section.title); expect(text(p.root)).toContain(section.body);
  }
  p.nodes('how-rank-link')[0].props.onClick(); expect(p.navTo).toHaveBeenCalledWith('/pages/team/rank');
  const back = all(p.root).find(n => n.props.role === 'button' && n.props['aria-label'] === dictionaries[locale].rankHowItWorks.ctaBack)!;
  back.props.onClick(); expect(p.navBack).toHaveBeenCalledWith('/pages/team/rank');
});

it.each(['zh', 'en', 'vi'] as const)('R1-R01 renders the real %s guide steps and referral condition in compute points', async locale => {
  const p = page(locale);
  const pointsPolicy = policy();
  pointsPolicy.sections = pointsPolicy.sections.map(section => ({ ...section, body:
    section.id === 'requirement-self' || section.id === 'example-self' ? '{selfComputePoints}'
      : section.id === 'requirement-team' || section.id === 'example-team' ? '{teamComputePoints}'
        : section.id === 'requirement-direct' ? '{referralThreshold}' : section.body }));
  const before = JSON.stringify({ pointsPolicy, ranks });
  p.published.mockResolvedValueOnce(pointsPolicy);
  p.ladder.mockResolvedValueOnce({ ranks, capabilities: { peer: false, genesis: false } });
  await p.show();
  expect(p.nodes('how-state')).toHaveLength(0);
  for (const [id, points] of [['requirement-direct', 3000], ['requirement-self', 2000], ['example-self', 2000], ['requirement-team', 20000], ['example-team', 20000]] as const) {
    const section = all(p.root).find(node => node.props['data-rule-section'] === id)!;
    expect(text(section)).toContain(formatComputePoints(points, locale));
  }
  expect(all(p.root).map(node => node.text).join('\n')).not.toMatch(/USD|\$/);
  expect(JSON.stringify({ pointsPolicy, ranks })).toBe(before);
});

it('keeps additional published rules and authoritative terminology intact in the guide', async () => {
  const p = page();
  const extra = { id: 'settlement-scope', order: 30, title: 'Published scope', body: 'L1–L4: published eligibility.\nRefunds still apply.' };
  const published = { ...policy(), sections: [...policy().sections, extra] };
  const before = JSON.stringify(published);
  p.published.mockResolvedValueOnce(published); await p.show();
  expect(text(p.root)).toContain(extra.title); expect(text(p.root)).toContain(extra.body);
  expect(all(p.root).some(n => n.props.id === 'team-rule-more')).toBe(true);
  expect(p.nodes('team-rule-hero__jump').map(text).at(-1)).toBe(rankGuideCopy('en').more);
  expect(JSON.stringify(published)).toBe(before);
});

it('does not invent an example when there are no adjacent published rank thresholds', async () => {
  const p = page();
  p.ladder.mockResolvedValueOnce({ ranks: [ranks[0]], capabilities: { peer: false, genesis: false } });
  // The non-example rule explanations do not depend on an example rank.
  p.published.mockResolvedValueOnce({ ...policy(), sections: policy().sections.map(s => ({ ...s, body: `Published ${s.id}` })) });
  await p.show();
  expect(p.nodes('how-state')).toHaveLength(0);
  expect(p.nodes('team-rule-item__n')).toHaveLength(0);
  expect(text(p.root)).toContain('No adjacent rank thresholds');
  expect(text(p.root)).toContain('Published protection');
  expect(text(p.root)).not.toMatch(/\{(?:fromRank|toRank)\}/);
});
