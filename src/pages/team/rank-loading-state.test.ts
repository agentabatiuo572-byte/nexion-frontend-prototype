import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { increasedRankBenefitKeys, rankBenefitIncreaseHeading } from '@/lib/team-rank-benefits';
import { teamRankRequirements } from '@/lib/team-rank-progress';
import * as Vue from 'vue';
import { formatAmount } from '@/lib/amount-display';
import type { Component } from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import source from './rank.vue?raw';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { auditUiCopy } from '@/i18n/audit-ui';
import { platformDisplayText } from '@/lib/brand-copy';
import { isEntitlementVRankReward, rankEntitlementLabel } from '@/lib/rank-entitlement-label';
import { rankGapText, rankConditionsText, rankLabel, rankCultivationCopy } from '@/lib/v-rank-copy';
import { formatHowNumber } from '@/lib/rank-how-content';
import { computePointsCopy, formatComputePoints } from '@/i18n/compute-points';
import { nextRankProgress, type VRank, type VRankData, type VRankDef } from '@/store/v-rank';

vi.mock('@/api/runtime', () => ({ remoteApiEnabled: true, vRankApi: {} }));

// Execute the production setup and template; only read boundaries and decorative
// child components are isolated. These fixtures are not live account facts.
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
const texts = (root: Host): string[] => [
  ...all(root).filter(item => item.tag === 'text').map(text),
  ...all(root).filter(item => item.props.role === 'progressbar').map(bar => `${bar.props['aria-label']} · ${bar.props['aria-valuetext']}`),
];
const conditionTexts = (root: Host, label: string): string[] => {
  const bar = all(root).find(item => item.props.role === 'progressbar' && `${item.props['aria-label']} · ${item.props['aria-valuetext']}` === label);
  if (!bar) return [];
  const row = bar.parent!;
  const visible = row.children.find(child => child.props.class === 'rank-condition__heading')!;
  expect(text(visible)).toContain(bar.props['aria-valuetext']);
  const gap = row.children.find(child => child.props.class === 'rank-condition__gap');
  return [label, gap ? text(gap) : ''];
};
const unmounts: Array<() => void> = [];
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.unstubAllGlobals(); });

const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: 'rank-read-progress', inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => tag === 'view' || tag === 'text' } },
});
const code = ts.transpileModule(script.content, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h('view', slots.default?.()) };
const dictionaries = { en, zh, vi: vietnamese };
type Locale = keyof typeof dictionaries;
const ladder = (): VRankDef[] => Array.from({ length: 13 }, (_, v) => ({
  v: v as VRank, title: `Published ${v}`, cnTitle: `公开 ${v}`, conditions: {},
  directBonus: .1, unilevelDepth: 1, peerBonus: .05, leadershipVotes: 0,
  cultivationBonus: 900, rewards: [{ type: 'NEX', amount: 900 }],
}));
const facts = (): VRankData & { ladder: VRankDef[] } => ({
  myRank: 0, selfComputePoints: 0, directRefs: 0, teamComputePoints: 0, vDownlineCounts: {}, ladder: ladder(),
});
async function page(locale: Locale = 'en', initial?: ReturnType<typeof facts>) {
  const auth = Vue.reactive({ accountId: 'user:rank-review-A' });
  const refreshCanonicalVRank = vi.fn(() => {});
  const state = Vue.reactive({ ...facts(), remoteReady: !!initial, remoteError: null as string | null,
    capabilities: { peer: false, genesis: false }, prizeName: '', ...initial,
    refreshCanonicalVRank,
  });
  refreshCanonicalVRank.mockImplementation(() => { state.remoteReady = false; state.remoteError = null; });
  const navTo = vi.fn();
  const shows: Array<() => void> = [];
  const dependencies: Record<string, unknown> = {
    '@/lib/team-rank-benefits': { increasedRankBenefitKeys, rankBenefitIncreaseHeading },
    '@/i18n/team-logic-copy': { teamLogicCopy }, '@/lib/team-rank-progress': { teamRankRequirements },
    '@/lib/amount-display': { formatAmount },
    vue: Vue, '@/lib/route': { navTo }, '@/lib/brand-copy': { platformDisplayText },
    '@/lib/rank-entitlement-label': { isEntitlementVRankReward, rankEntitlementLabel },
    '@/lib/v-rank-copy': { rankGapText, rankConditionsText, rankLabel, rankCultivationCopy },
    '@/lib/rank-how-content': { formatHowNumber },
    '@/i18n/compute-points': { computePointsCopy, formatComputePoints },
    '@/i18n/format': { fmt },
    '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref(auditUiCopy[locale]) },
    '@/components/ui/nx-button.vue': { default: { props: ['label'], setup: (props: any) => () => Vue.h('text', props.label) } },
    '@/components/ui/nx-section.vue': { default: slot },
    '@/components/ui/nx-list-group.vue': { default: slot },
    '@/components/ui/nx-list-row.vue': { default: { props: ['title', 'subtitle'], setup: (props: any) => () => Vue.h('text', { 'data-gap-action': props.subtitle }, props.title) } },
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[locale]) },
    '@/store/locale': { useLocaleStore: () => ({ code: locale }) },
    '@/store/auth': { useAuth: () => auth },
    '@/store/v-rank': { useVRank: () => state, nextRankProgress },
    '@/api/runtime': { remoteApiEnabled: true },
    '@dcloudio/uni-app': { onShow: (callback: () => void) => shows.push(callback) },
    '@/components/app-chassis.vue': { default: slot }, '@/components/sub-page-header.vue': { default: { props: ['actionLabel', 'action'], setup: (props: any) => () => Vue.h('view', { role: 'link', onClick: props.action }, props.actionLabel) } },
    '@/components/team/team-rank-emblem.vue': { default: { props: ['rank', 'size'], setup: (props: any) => () => Vue.h('view', { 'data-rank-emblem': props.rank, 'data-size': props.size }) } },
    '@/components/team/v-badge-icon.vue': { default: { render: () => Vue.h('view') } },
    '@/composables/use-scroll-grow-progress': {
      useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: Vue.ref(true) }), PROGRESS_GROW_TRANSITION: '',
    },
  };
  const exports = { default: {} as Component };
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected rank page import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node('root');
  const app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  // Mounted refresh is real: only a completed canonical read reveals the facts.
  const ready = async (value = initial ?? facts()) => {
    Object.assign(state, value, { remoteReady: true, remoteError: null });
    await Vue.nextTick();
  };
  if (initial) await ready(); else await Vue.nextTick();
  return { root, state, auth, navTo, ready, show: async () => { shows.forEach(callback => callback()); await Vue.nextTick(); } };
}

describe('rank page canonical read and next-rank progress', () => {
  it.each(['en', 'zh', 'vi'] as const)('keeps the selected %s tier and intentional collapse through same-account rereads', async locale => {
    const loaded = facts(); loaded.myRank = 2;
    const p = await page(locale, loaded);
    const heading = (v: number) => all(p.root).find(item => item.props['aria-controls'] === `rank-details-${v}`)!;
    const opened = () => all(p.root).filter(item => item.props['aria-controls']?.startsWith('rank-details-') && item.props['aria-expanded']).map(item => item.props['aria-controls']);
    expect(opened()).toEqual(['rank-details-3']);
    heading(8).props.onClick(); await Vue.nextTick();
    expect(opened()).toEqual(['rank-details-8']);
    all(p.root).find(item => item.props.role === 'link')!.props.onClick();
    expect(p.navTo).toHaveBeenLastCalledWith('/pages/team/rank-how');
    await p.show();
    // A failed reread clears rank facts in the store. It is not an account change.
    p.state.ladder = []; p.state.remoteError = 'unavailable'; await Vue.nextTick();
    await p.ready(loaded);
    expect(opened()).toEqual(['rank-details-8']);
    await p.show(); await p.ready({ ...loaded, myRank: 3 });
    expect(opened()).toEqual(['rank-details-8']);
    heading(8).props.onClick(); await Vue.nextTick();
    expect(opened()).toEqual([]);
    await p.show(); await p.ready(loaded);
    expect(opened()).toEqual([]);
  });

  it('reinitializes the tier only for a different account or a removed published tier', async () => {
    const loaded = facts(); loaded.myRank = 2;
    const p = await page('en', loaded);
    const heading = (v: number) => all(p.root).find(item => item.props['aria-controls'] === `rank-details-${v}`)!;
    const opened = () => all(p.root).filter(item => item.props['aria-controls']?.startsWith('rank-details-') && item.props['aria-expanded']).map(item => item.props['aria-controls']);
    heading(8).props.onClick(); await Vue.nextTick();
    await p.show(); await p.ready({ ...loaded, ladder: loaded.ladder.filter(rank => rank.v !== 8) });
    expect(opened()).toEqual(['rank-details-3']);
    heading(7).props.onClick(); await Vue.nextTick();
    await p.show(); p.auth.accountId = 'user:rank-review-B'; await Vue.nextTick();
    await p.ready({ ...loaded, myRank: 4 });
    expect(opened()).toEqual(['rank-details-5']);
    expect(p.state.myRank).toBe(4);
  });

  it.each(['en', 'zh', 'vi'] as const)('keeps %s unknown/error/retry separate from a loaded rank', async locale => {
    const p = await page(locale), copy = dictionaries[locale];
    const unknown = () => {
      expect(text(p.root)).not.toContain('V0'); expect(text(p.root)).not.toContain(copy.rank.next);
      expect(text(p.root)).not.toContain(' / '); expect(text(p.root)).not.toContain('100%');
    };
    expect(text(p.root)).toContain(copy.rank.loading);
    expect(all(p.root).some(item => item.props.role === 'status' && item.props['aria-busy'] === 'true')).toBe(true);
    expect(text(p.root)).not.toContain(copy.rank.loadError); unknown();
    p.state.remoteError = 'unavailable'; await Vue.nextTick();
    expect(text(p.root)).toContain(copy.rank.loadError); expect(text(p.root)).toContain(copy.rank.retry); unknown();
    const retry = all(p.root).find(item => item.props.onClick && text(item).includes(copy.rank.retry))!;
    retry.props.onClick(); await Vue.nextTick();
    expect(p.state.refreshCanonicalVRank).toHaveBeenCalledTimes(2);
    expect(text(p.root)).toContain(copy.rank.loading); expect(text(p.root)).not.toContain(copy.rank.retry); unknown();
    const loaded = facts(); loaded.ladder[1].conditions = { selfComputePoints: 2990, directRefs: 3 };
    await p.ready(loaded);
    expect(all(p.root).filter(item => item.props.role === 'progressbar')).toHaveLength(2); expect(text(p.root)).toContain('0 / 3');
    expect(text(p.root)).not.toContain(copy.rank.loading); expect(text(p.root)).not.toContain(copy.rank.loadError);
    await p.show();
    expect(text(p.root)).toContain(copy.rank.loading); unknown(); // Retained data is hidden during reread.
  });

  it('renders independent point conditions, unchanged rewards and the rules destination', async () => {
    const loaded = facts();
    loaded.ladder[1].conditions = { selfComputePoints: 2000, teamComputePoints: 20000, directRefs: 3 };
    Object.assign(loaded, { selfComputePoints: 1280, teamComputePoints: 12800, directRefs: 2 });
    const p = await page('en', loaded);
    for (const [label, gap] of [
      ['V1 · Own compute ≥ 2,000 compute pts · 1,280 compute pts / 2,000 compute pts', '720 compute pts more own compute'],
      ['V1 · Team compute ≥ 20,000 compute pts · 12,800 compute pts / 20,000 compute pts', '7,200 compute pts more team compute'],
      ['V1 · Direct refs ≥ 3 · 2 / 3', '1 more direct referral meeting the self-purchase requirement'],
    ]) expect(conditionTexts(p.root, label)).toEqual([label, gap]);
    const bars = all(p.root).filter(item => item.props.role === 'progressbar');
    expect(bars.map(bar => bar.props['aria-valuenow'])).toEqual([64, 67, 64]);
    expect(text(p.root)).not.toContain('$'); expect(text(p.root)).not.toContain('90,000');
    expect(text(p.root)).toContain('When a directly invited member reaches V1, the corresponding reward is 900.00 UVT; payment status follows the reward records.');
    expect(text(p.root)).toContain(rankCultivationCopy('en').recipient);
    all(p.root).find(item => item.props.role === 'link')!.props.onClick();
    expect(p.navTo).toHaveBeenLastCalledWith('/pages/team/rank-how');
    expect(p.state.myRank).toBe(0); expect(p.state.selfComputePoints).toBe(1280);
  });

  it('opens the existing share flow from both rank invitation actions', async () => {
    const loaded = facts(); loaded.ladder[1].conditions = { directRefs: 3 };
    const p = await page('en', loaded);
    const actions = all(p.root).filter(item => item.props.onClick && text(item) === en.team.inviteFriends);
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      action.props.onClick();
      expect(p.navTo).toHaveBeenLastCalledWith('/pages/team/team?intent=share');
    }
    expect(p.navTo).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['zh', '成员成长奖励', '直接邀请的成员晋升至 V1 时，对应奖励为 900.00 UVT；到账状态以奖励记录为准。', '无推荐人时，由晋升者本人获得'],
    ['en', 'Member growth reward', 'When a directly invited member reaches V1, the corresponding reward is 900.00 UVT; payment status follows the reward records.', 'If there is no referrer, the promoted member receives it'],
    ['vi', 'Thưởng phát triển thành viên', 'Khi thành viên được mời trực tiếp đạt V1, phần thưởng tương ứng là 900.00 UVT; trạng thái chi trả theo bản ghi thưởng.', 'Nếu không có người giới thiệu, thành viên thăng hạng tự nhận thưởng'],
  ] as const)('shows the %s trigger and recipient only for confirmed cultivation rewards', async (locale, title, trigger, fallback) => {
    const loaded = facts();
    loaded.ladder[1].cultivationBonus = 7777;
    loaded.ladder[1].rewards = [
      { type: 'NEX', amount: 900 },
      { type: 'NEX', amount: 880, customLabel: 'cultivation' },
      { type: 'NEX', amount: 700, customLabel: 'SELF promotion' },
      { type: 'NEX', amount: 600, customLabel: 'Direct reward' },
      { type: 'NEX', amount: 0 },
      { type: 'USDT', amount: 500 },
      { type: 'VOUCHER', voucherId: 'voucher-1', displayName: 'Device voucher' },
      { type: 'SKU', skuId: 'sku-1', displayName: 'Device reward' },
      { type: 'CUSTOM', customLabel: 'Custom access' },
    ];
    const p = await page(locale, loaded);
    const descriptions = all(p.root).filter(item => item.props.class === 'rank-reward-description').map(text);
    expect(descriptions).toEqual([trigger, trigger.replace('900.00', '880.00')]);
    expect(all(p.root).filter(item => item.props.class === 'rank-reward-title').map(text)).toEqual([title, title]);
    // The displayed amount belongs to the same individual reward as its trigger
    // and recipient; the aggregate bonus and self/direct rewards cannot leak in.
    expect(all(p.root).filter(item => item.props.class === 'rank-reward-amount').map(text)).toEqual(['900.00 UVT', '880.00 UVT']);
    const recipients = all(p.root).filter(item => item.props.class === 'rank-reward-note').map(text);
    expect(recipients).toHaveLength(2);
    for (const recipient of recipients) expect(recipient).toContain(fallback);
    for (const ordinary of ['700.00 UVT', '600.00 UVT', '0.00 UVT', '500.00 USDT', 'Device voucher', 'Device reward', 'Custom access']) {
      expect(all(p.root).filter(item => item.props.class === 'rank-reward').map(text)).toContain(ordinary);
    }
    expect(text(p.root)).not.toContain('7777');
    expect(p.state.myRank).toBe(0);
  });

  it.each([
    ['en', 'Own compute ≥ 2,000 compute pts', '1,280 compute pts / 2,000 compute pts', '720 compute pts more own compute'],
    ['zh', '自购算力 ≥ 2,000 算力点', '1,280 算力点 / 2,000 算力点', '自购算力还差 720 算力点'],
    ['vi', 'Năng lực tự mua ≥ 2.000 điểm tính toán', '1.280 điểm tính toán / 2.000 điểm tính toán', 'Còn thiếu 720 điểm tính toán tự mua'],
  ] as const)('renders canonical %s count units in the actual page', async (locale, condition, values, gap) => {
    const loaded = facts(); loaded.ladder[1].conditions = { selfComputePoints: 2000 };
    loaded.selfComputePoints = 1280;
    const p = await page(locale, loaded);
    expect(conditionTexts(p.root, `V1 · ${condition} · ${values}`)).toEqual([`V1 · ${condition} · ${values}`, gap]);
    expect(text(p.root)).not.toContain('$');
  });

  it.each(['en', 'zh', 'vi'] as const)('keeps missing %s point facts unknown until the server reports them', async locale => {
    const loaded = facts(); loaded.selfComputePoints = undefined; loaded.teamComputePoints = undefined;
    loaded.ladder[1].conditions = { directRefs: 3 };
    const p = await page(locale, loaded);
    const pending = teamLogicCopy(locale).unknownProgress;
    expect(p.state.myRank).toBe(0);
    p.state.ladder[1].conditions = { selfComputePoints: 2000, teamComputePoints: 20000 };
    await Vue.nextTick();
    expect(text(p.root)).toContain(pending);
    expect(all(p.root).filter(item => item.props.role === 'progressbar').every(bar => bar.props['aria-valuenow'] === undefined)).toBe(true);
    p.state.selfComputePoints = 1280; p.state.teamComputePoints = 12800; await Vue.nextTick();
    expect(text(p.root)).not.toContain(pending);
    expect(all(p.root).filter(item => item.props.role === 'progressbar').map(bar => bar.props['aria-valuenow'])).toEqual([64, 64]);
    p.state.teamComputePoints = undefined; await Vue.nextTick();
    expect(text(p.root)).toContain(pending);
    expect(text(p.root)).not.toContain('$');
  });

  it.each(['en', 'zh', 'vi'] as const)('counts exact L1 buckets at or above the required V rank in %s', async locale => {
    const loaded = facts(); loaded.myRank = 2;
    loaded.ladder[3].conditions = { vDownlines: { 2: 2 } };
    const p = await page(locale, loaded), copy = dictionaries[locale];
    for (const [buckets, value, met] of [
      [{ 2: 1, 3: 1 }, '2 / 2', true],
      [{ 1: 9, 2: 1, 3: 0 }, '1 / 2', false],
      [{ 3: 2 }, '2 / 2', true],
    ] as const) {
      p.state.vDownlineCounts = { ...buckets }; await Vue.nextTick();
      const label = `V3 · 2× V2 · ${value}`;
      const gap = locale === 'zh' ? '再 1 个 公开 2(V2)' : locale === 'vi' ? 'Thêm 1 Published 2 (V2)' : '1 more Published 2 (V2)';
      expect(conditionTexts(p.root, label)).toEqual([label, met ? copy.rank.done : gap]);
      expect(p.state.myRank).toBe(2);
    }
    // A different required V remains a separate threshold, even when it belongs
    // to a preceding tier and shares the same source buckets.
    p.state.ladder[2].conditions = { vDownlines: { 1: 4 } };
    p.state.vDownlineCounts = { 1: 2, 2: 1, 3: 1 }; await Vue.nextTick();
    const prior = `V2 · 4× V1 · 4 / 4`;
    const target = `V3 · 2× V2 · 2 / 2`;
    expect(conditionTexts(p.root, prior)).toEqual([]); // Completed earlier gates remain available in their own tier.
    p.state.vDownlineCounts = { 1: 1, 2: 1, 3: 1 }; await Vue.nextTick();
    const toggle=all(p.root).find(item=>item.props["aria-controls"]==="inherited-conditions")!;
    expect(toggle.props["aria-expanded"]).toBe(false);toggle.props.onClick();await Vue.nextTick();
    expect(conditionTexts(p.root, prior.replace("4 / 4", "3 / 4"))).toHaveLength(2);
    expect(conditionTexts(p.root, target)).toEqual([target, copy.rank.done]);
  });


  it.each(['en', 'zh', 'vi'] as const)('retains unmet preceding point requirements after rank protection in %s', async locale => {
    const loaded = facts(); loaded.myRank = 2; loaded.selfComputePoints = 1280; loaded.teamComputePoints = 20000;
    loaded.ladder[1].conditions = { selfComputePoints: 2000, directRefs: 3 };
    loaded.ladder[2].conditions = { teamComputePoints: 5000 };
    loaded.ladder[3].conditions = { teamComputePoints: 20000, vDownlines: { 2: 2 } };
    const p = await page(locale, loaded);
    const barLabels = () => all(p.root).filter(item => item.props.role === 'progressbar').map(bar => String(bar.props['aria-label']));
    expect(barLabels().some(label => label.startsWith('V1 ·'))).toBe(false);
    const toggle=all(p.root).find(item=>item.props['aria-controls']==='inherited-conditions')!;
    expect(toggle.props['aria-expanded']).toBe(false);toggle.props.onClick();await Vue.nextTick();
    expect(barLabels().some(label => label.startsWith('V1 ·') && label.includes(computePointsCopy(locale).self))).toBe(true);
    expect(barLabels().some(label => label.startsWith('V2 ·'))).toBe(false);
    p.state.selfComputePoints = 2000; p.state.directRefs = 3; await Vue.nextTick();
    expect(barLabels().some(label => label.startsWith('V1 ·'))).toBe(false);
    p.state.teamComputePoints = 4000; await Vue.nextTick();
    expect(barLabels().filter(label => label.includes(computePointsCopy(locale).team))).toHaveLength(2);
    expect(text(p.root)).not.toContain('$'); expect(p.state.myRank).toBe(2);
  });

  for (const intl of ['present', 'absent'] as const) {
    it.each(['en', 'zh', 'vi'] as const)(`keeps six-decimal %s point gaps and raw eligibility with Intl ${intl}`, async locale => {
      if (intl === 'absent') vi.stubGlobal('Intl', undefined);
      const loaded = facts(); loaded.selfComputePoints = 499.999999; loaded.teamComputePoints = 1999.999999;
      loaded.ladder[1].conditions = { selfComputePoints: 500, teamComputePoints: 2000 };
      const p = await page(locale, loaded);
      const tiny = locale === 'vi' ? '0,000001 điểm tính toán' : locale === 'zh' ? '0.000001 算力点' : '0.000001 compute pts';
      expect(text(p.root)).toContain(tiny); expect(text(p.root)).not.toContain('$');
      expect(texts(p.root)).not.toContain(dictionaries[locale].rank.done);
      p.state.selfComputePoints = 500; p.state.teamComputePoints = 2000; await Vue.nextTick();
      expect(texts(p.root).filter(item => item === dictionaries[locale].rank.done)).toHaveLength(2);
      expect(text(p.root)).not.toContain(tiny); expect(p.state.myRank).toBe(0);
    });
  }

  it('renders published zero point thresholds without division by zero', async () => {
    const loaded = facts(); loaded.selfComputePoints = 0; loaded.ladder[1].conditions = { selfComputePoints: 0 };
    const p = await page('en', loaded);
    expect(conditionTexts(p.root, 'V1 · Own compute ≥ 0 compute pts · 0 compute pts / 0 compute pts'))
      .toEqual(['V1 · Own compute ≥ 0 compute pts · 0 compute pts / 0 compute pts', 'Done']);
    expect(all(p.root).find(item => item.props.role === 'progressbar')!.props['aria-valuenow']).toBe(100);
    expect(text(p.root)).not.toContain('NaN');
  });

  it.each(['en', 'zh', 'vi'] as const)('keeps a confirmed highest rank free of a fabricated %s next target or zero gaps', async locale => {
    const loaded = facts(); loaded.ladder = loaded.ladder.slice(0, 9); loaded.myRank = 8;
    const p = await page(locale, loaded), copy = dictionaries[locale];
    expect(text(p.root)).toContain(locale === 'zh' ? 'V8 公开 8' : 'V8 Published 8');
    expect(all(p.root).filter(item => item.props.class === 'rank-current-level').map(text)).toEqual(['V8']);
    expect(all(p.root).some(item => item.props['data-rank-emblem'] === 8 && item.props['data-size'] === 76)).toBe(true);
    expect(text(p.root)).not.toContain(copy.rank.next); expect(text(p.root)).not.toContain(copy.rank.upgradeCta);
    expect(text(p.root)).not.toContain(' / '); expect(text(p.root)).not.toContain('100%');
    expect(text(p.root)).not.toContain(copy.rank.needSelfBuy); expect(text(p.root)).not.toContain('V9');
  });
});


it.each(['zh', 'en', 'vi'] as const)('TI-F06 counts all active preceding gaps and actions separately from unknowns in %s', async locale => {
  const loaded = facts(); loaded.myRank = 2; loaded.selfComputePoints = 90; loaded.teamComputePoints = 20000; loaded.directRefs = 1;
  loaded.ladder[1].conditions = { selfComputePoints: 100, directRefs: 3 };
  loaded.ladder[2].conditions = { teamComputePoints: 5000 };
  loaded.ladder[3].conditions = { teamComputePoints: 20000 };
  const p = await page(locale, loaded);
  expect(text(p.root)).toContain(fmt(auditUiCopy[locale].remainingConditions, { n: 2 }));
  const actions = () => all(p.root).filter(item => item.props['data-gap-action']);
  expect(actions()).toHaveLength(2);
  expect(actions().every(item => item.props['data-gap-action'].startsWith('V1 ·'))).toBe(true);
  p.state.selfComputePoints = undefined; await Vue.nextTick();
  expect(text(p.root)).toContain(fmt(auditUiCopy[locale].remainingConditions, { n: 1 }));
  expect(text(p.root)).toContain(fmt(teamLogicCopy(locale).unknownConditions, { n: 1 }));
  expect(actions()).toHaveLength(1);
  expect(p.state.myRank).toBe(2);
  p.state.selfComputePoints = 100; p.state.directRefs = 3; await Vue.nextTick();
  expect(actions()).toHaveLength(0);
});

it.each(['zh', 'en', 'vi'] as const)('R1-TV05 shows only published increases in %s while keeping full benefits and dispatch restrictions', async locale => {
  const loaded = facts(); loaded.myRank = 2;
  loaded.ladder[2].unilevelDepth = 3;
  loaded.ladder[3].unilevelDepth = 4;
  loaded.ladder[3].leadershipVotes = 1;
  const p = await page(locale, loaded), copy = dictionaries[locale];
  const upcoming = () => all(p.root).find(item => item.props.class === 'rank-upcoming')!;
  const full = () => all(p.root).find(item => item.props.id === 'rank-details-3')!;
  expect(text(upcoming())).toContain(rankBenefitIncreaseHeading(locale));
  expect(text(upcoming())).toContain('L1–L4');
  expect(text(upcoming())).not.toContain(copy.rank.chips.direct);
  expect(text(full())).toContain(copy.rank.chips.direct);
  expect(text(full())).toContain('10%');
  const peerNotice = fmt(copy.rank.chips.peerNotDispatched, { n: '5' });
  expect(text(upcoming())).toContain(peerNotice); // Unchanged, undispatched peer benefit is still disclosed.
  expect(text(full())).toContain(peerNotice);
  p.state.capabilities.peer = true; await Vue.nextTick();
  expect(text(upcoming())).not.toContain(peerNotice);
  p.state.ladder[3].peerBonus = .1; await Vue.nextTick();
  expect(text(upcoming())).toContain(copy.rank.chips.peer);
  expect(text(upcoming())).toContain('10%');
  // Missing current rank must not become a fabricated zero baseline.
  p.state.ladder = p.state.ladder.filter(rank => rank.v !== 2); await Vue.nextTick();
  expect(text(upcoming())).toContain(auditUiCopy[locale].nextBenefits);
  expect(text(upcoming())).toContain(copy.rank.chips.direct);
  expect(text(upcoming())).not.toContain(rankBenefitIncreaseHeading(locale));
  expect(p.state.myRank).toBe(2);
});
