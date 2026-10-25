import * as Vue from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import source from './rank-how.vue?raw';
import { mountEntry, all, text, flush, slot } from '@/lib/entry-review.test-support';
import { buildRankHowContent, createRankHowResource } from '@/lib/rank-how-content';
import { rankName } from '@/lib/v-rank-copy';
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
  rules: { permanentProtection: true, qualifiedReferralSelfBuyUSD: 300, leadershipConfigured: false },
  sections: ids.map((id, order) => ({ id, order, title: `Title ${id}`, body:
    id === 'requirement-self' || id === 'example-self' ? '{selfComputePoints}'
      : id === 'requirement-team' || id === 'example-team' ? '{teamComputePoints}' : `Published ${id}` })),
});
const ranks: CanonicalVRankRow[] = [0, 1].map(v => ({ v, title: `Published rank ${v}`, cnTitle: `公开等级 ${v}`,
  directBonus: .1, unilevelDepth: 1, peerBonus: .05, leadershipVotes: 2, cultivationBonus: 900,
  selfComputePoints: v * 2000, teamComputePoints: v * 20000, selfBuyUSD: 987, teamVolumeUSD: 45678,
  rewards: [], visible: true }));
const button = { default: Vue.defineComponent({ props: ['label', 'disabled', 'busy'], emits: ['click'],
  setup: (props, { emit, slots }) => () => Vue.h('view', { role: 'button', 'aria-label': props.label,
    onClick: () => { if (!props.disabled && !props.busy) emit('click'); } }, slots.default?.() ?? String(props.label)),
}) };
const stop: Array<() => void> = [];
afterEach(() => stop.splice(0).forEach(fn => fn()));
function page(language: keyof typeof dictionaries = 'en') {
  const shown: Array<() => void> = [], navTo = vi.fn(), navBack = vi.fn();
  const published = vi.fn(async () => policy());
  const ladder = vi.fn(async () => ({ ranks, capabilities: { peer: false, genesis: false } }));
  const p = mountEntry(source, {
    '@dcloudio/uni-app': { onShow: (fn: () => void) => shown.push(fn) },
    '@/components/app-chassis.vue': slot, '@/components/sub-page-header.vue': slot,
    '@/components/team/team-art.vue': slot, '@/components/ui/nx-button.vue': button,
    '@/components/team/v-badge-icon.vue': { default: Vue.defineComponent({ props: ['v', 'size'], setup: props => () => Vue.h('view', { 'data-rank': props.v }) }) },
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[language]) }, '@/store/locale': { useLocaleStore: () => ({ code: language }) },
    '@/lib/route': { navTo, navBack }, '@/api/runtime': { apiClient: {}, expectedApiEnvironment: 'prod', vRankApi: { ladder } },
    '@/api/rank-how-policy-api': { createRankHowPolicyApi: () => ({ published }) },
    '@/lib/rank-how-content': { buildRankHowContent, createRankHowResource }, '@/lib/v-rank-copy': { rankName },
  }); stop.push(p.unmount);
  return { ...p, navTo, navBack, published, ladder, show: async () => { shown.forEach(fn => fn()); await flush(); } };
}
it('keeps loading, failed reads and retry separate from published rules', async () => {
  const p = page();
  expect(p.nodes('how-state')).toHaveLength(1);
  expect(p.nodes('how-rules')).toHaveLength(0);
  expect(text(p.root)).not.toContain(en.rankHowItWorks.ctaBack);
  p.published.mockRejectedValueOnce(new Error('offline')); await p.show();
  expect(p.nodes('how-state')).toHaveLength(1); expect(p.nodes('how-rules')).toHaveLength(0);
  const retry = all(p.root).find(n => n.props.role === 'button' && n.props['aria-label'] === 'Reload')!;
  retry.props.onClick(); await flush();
  expect(p.nodes('how-state')).toHaveLength(0); expect(p.nodes('how-rules')).toHaveLength(1);
  expect(p.published).toHaveBeenCalledTimes(2);
});
it('does not show incomplete policies or fabricate missing point thresholds', async () => {
  const p = page();
  p.published.mockResolvedValueOnce({ ...policy(), sections: policy().sections.filter(section => section.id !== 'protection') });
  await p.show(); expect(p.nodes('how-rules')).toHaveLength(0); expect(p.nodes('how-state')).toHaveLength(1);
  p.ladder.mockResolvedValueOnce({ ranks: ranks.map(rank => ({ ...rank, selfComputePoints: undefined, teamComputePoints: undefined })), capabilities: { peer: false, genesis: false } });
  await p.show(); expect(p.nodes('how-rules')).toHaveLength(0); expect(text(p.root)).not.toMatch(/987|45678/);
});
it.each([
  ['zh', '2,000 算力点', '20,000 算力点'],
  ['en', '2,000 compute pts', '20,000 compute pts'],
  ['vi', '2.000 điểm tính toán', '20.000 điểm tính toán'],
] as const)('renders the %s dynamic ladder, steps, collapsible rules and navigation', async (locale, own, team) => {
  const p = page(locale); await p.show();
  expect(p.nodes('how-state')).toHaveLength(0);
  expect(all(p.root).filter(n => n.props['data-rank'] !== undefined).map(n => n.props['data-rank'])).toEqual([0, 1]);
  expect(p.nodes('how-step')).toHaveLength(3);
  expect(text(p.root)).toContain(own); expect(text(p.root)).toContain(team); expect(text(p.root)).not.toMatch(/45678|987|\$/);
  expect(text(p.root)).toContain('Published stepwise');
  for (const [id, expected] of [['rewards', 'Published unlock-cultivation'], ['protection', 'Published protection'],
    ['example-results', 'Published result-cultivation'], ['faq', 'Published faq-members']]) {
    const toggle = all(p.root).find(n => n.props['aria-controls'] === `rule-${id}`)!;
    toggle.props.onClick(); await flush();
    expect(toggle.props['aria-expanded']).toBe(true); expect(text(p.root)).toContain(expected);
    expect(p.nodes('how-rule__body')).toHaveLength(1);
    toggle.props.onClick(); await flush(); expect(p.nodes('how-rule__body')).toHaveLength(0);
  }
  p.nodes('how-rank-link')[0].props.onClick(); expect(p.navTo).toHaveBeenCalledWith('/pages/team/rank');
  const back = all(p.root).find(n => n.props.role === 'button' && n.props['aria-label'] === dictionaries[locale].rankHowItWorks.ctaBack)!;
  back.props.onClick(); expect(p.navBack).toHaveBeenCalledWith('/pages/team/rank');
});

it.each(['zh', 'en', 'vi'] as const)('R1-R01 renders the real %s guide steps and referral condition with precise legacy USD', async locale => {
  const p = page(locale);
  const legacyPolicy = policy();
  legacyPolicy.rules.qualifiedReferralSelfBuyUSD = 0.000001;
  legacyPolicy.sections = legacyPolicy.sections.map(section => ({ ...section, body:
    section.id === 'requirement-self' || section.id === 'example-self' ? '{selfBuy}'
      : section.id === 'requirement-team' || section.id === 'example-team' ? '{teamVolume}'
        : section.id === 'requirement-direct' ? '{referralThreshold}' : section.body }));
  const legacyRanks = ranks.map(rank => ({ ...rank, selfComputePoints: undefined, teamComputePoints: undefined,
    selfBuyUSD: 0.000001, teamVolumeUSD: 299.000001 }));
  const before = JSON.stringify({ legacyPolicy, legacyRanks });
  p.published.mockResolvedValueOnce(legacyPolicy);
  p.ladder.mockResolvedValueOnce({ ranks: legacyRanks, capabilities: { peer: false, genesis: false } });
  await p.show();
  const tiny = locale === 'vi' ? '0,000001 USD' : '0.000001 USD';
  const team = locale === 'vi' ? '299,000001 USD' : '299.000001 USD';
  expect(p.nodes('how-state')).toHaveLength(0);
  expect(text(p.nodes('how-step')[0])).toContain(tiny);
  expect(text(p.nodes('how-step')[1])).toContain(team);
  expect(text(p.nodes('how-rule__body')[0])).toContain(tiny);
  expect(all(p.root).map(node => node.text).join('\n')).not.toContain('USDT');
  expect(JSON.stringify({ legacyPolicy, legacyRanks })).toBe(before);
});
