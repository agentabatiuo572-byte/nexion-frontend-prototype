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
import { rankGapText, rankConditionsText, rankLabel } from '@/lib/v-rank-copy';
import { formatHowNumber } from '@/lib/rank-how-content';
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
  myRank: 0, selfBuyUSD: 0, directRefs: 0, teamVolumeUSD: 0, vDownlineCounts: {}, ladder: ladder(),
});
async function page(locale: Locale = 'en', initial?: ReturnType<typeof facts>) {
  const refreshCanonicalVRank = vi.fn(() => {});
  const state = Vue.reactive({ ...facts(), remoteReady: !!initial, remoteError: null as string | null,
    capabilities: { peer: false, genesis: false }, prizeName: '', ...initial,
    refreshCanonicalVRank,
  });
  refreshCanonicalVRank.mockImplementation(() => { state.remoteReady = false; state.remoteError = null; });
  const navTo = vi.fn();
  const shows: Array<() => void> = [];
  const dependencies: Record<string, unknown> = {
    '@/lib/amount-display': { formatAmount },
    vue: Vue, '@/lib/route': { navTo }, '@/lib/brand-copy': { platformDisplayText },
    '@/lib/rank-entitlement-label': { isEntitlementVRankReward, rankEntitlementLabel },
    '@/lib/v-rank-copy': { rankGapText, rankConditionsText, rankLabel },
    '@/lib/rank-how-content': { formatHowNumber },
    '@/i18n/format': { fmt },
    '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref(auditUiCopy[locale]) },
    '@/components/ui/nx-button.vue': { default: { props: ['label'], setup: (props: any) => () => Vue.h('text', props.label) } },
    '@/components/ui/nx-section.vue': { default: slot },
    '@/components/ui/nx-list-group.vue': { default: slot },
    '@/components/ui/nx-list-row.vue': { default: { props: ['title'], setup: (props: any) => () => Vue.h('text', props.title) } },
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[locale]) },
    '@/store/locale': { useLocaleStore: () => ({ code: locale }) },
    '@/store/v-rank': { useVRank: () => state, nextRankProgress },
    '@/api/runtime': { remoteApiEnabled: true },
    '@dcloudio/uni-app': { onShow: (callback: () => void) => shows.push(callback) },
    '@/components/app-chassis.vue': { default: slot }, '@/components/sub-page-header.vue': { default: { props:['action','actionLabel'], setup:(props:any)=>()=>Vue.h('view',{role:'link',onClick:props.action},props.actionLabel) } },
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
  return { root, state, navTo, ready, show: async () => { shows.forEach(callback => callback()); await Vue.nextTick(); } };
}

describe('rank page canonical read and next-rank progress', () => {
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
    const loaded = facts(); loaded.ladder[1].conditions = { selfBuyUSD: 299, directRefs: 3 };
    await p.ready(loaded);
    expect(all(p.root).filter(item => item.props.role === 'progressbar')).toHaveLength(2); expect(text(p.root)).toContain('0 / 3');
    expect(text(p.root)).not.toContain(copy.rank.loading); expect(text(p.root)).not.toContain(copy.rank.loadError);
    await p.show();
    expect(text(p.root)).toContain(copy.rank.loading); unknown(); // Retained data is hidden during reread.
  });

  it('shows each enabled condition with real current values, requirements and independent gaps', async () => {
    const loaded = facts();
    loaded.ladder[1].conditions = { selfBuyUSD: 300, directRefs: 3, teamVolumeUSD: 5_000, vDownlines: { 0: 2, 1: 3 } };
    Object.assign(loaded, { selfBuyUSD: 120, directRefs: 2, teamVolumeUSD: 2_000, vDownlineCounts: { 0: 4, 1: 1 } });
    const p = await page('en', loaded), rendered = texts(p.root);
    expect(rendered).toContain('V1 Published 1');
    for (const [label, gap] of [
      ['V1 · Self-buy ≥ $300.00 · $120.00 / $300.00', 'Self-buy $180.00 more'],
      ['V1 · Direct refs ≥ 3 · 2 / 3', '1 more direct referral meeting the self-purchase requirement'],
      ['V1 · Team compute amount ≥ $5000.00 · $2000.00 / $5000.00', '$3000.00 more team compute amount'],
      ['V1 · 2× V0 · 5 / 2', 'Done'],
      ['V1 · 3× V1 · 1 / 3', '2 more Published 1 (V1)'],
    ]) expect(conditionTexts(p.root, label)).toEqual([label, gap]);
    expect(p.state.myRank).toBe(0); // The preview does not promote the account.
    expect(text(p.root)).toContain('900.00 UVT'); expect(text(p.root)).toContain(en.rank.cultivationRecipient);
    const rules = all(p.root).find(item => item.props.role === 'link')!;
    rules.props.onClick(); expect(p.navTo).toHaveBeenLastCalledWith('/pages/team/rank-how');
    expect(text(p.root)).not.toContain(en.rank.upgradeCta);
  });

  it.each([
    ['en', 'V1 Published 1', 'V1 · Self-buy ≥ $300.00 · $120.00 / $300.00', 'Self-buy $180.00 more', 'V1 · Direct refs ≥ 3 · 2 / 3'],
    ['zh', 'V1 公开 1', 'V1 · 自买 ≥ $300.00 · $120.00 / $300.00', '再自买 $180.00', 'V1 · 直接邀请 ≥ 3 · 2 / 3'],
    ['vi', 'V1 Published 1', 'V1 · Tự mua ≥ $300.00 · $120.00 / $300.00', 'Tự mua thêm $180.00', 'V1 · Mời trực tiếp ≥ 3 · 2 / 3'],
  ] as const)('formats %s target, threshold, value and gap through existing localized copy', async (locale, target, buy, gap, refs) => {
    const loaded = facts(); loaded.ladder[1].conditions = { selfBuyUSD: 300, directRefs: 3 };
    Object.assign(loaded, { selfBuyUSD: 120, directRefs: 2 });
    const p = await page(locale, loaded), rendered = texts(p.root);
    for (const expected of [target, buy, gap, refs]) expect(rendered).toContain(expected);
  });

  it('uses the current next target and omits disabled conditions without a mock fallback', async () => {
    const loaded = facts(); loaded.myRank = 2; loaded.teamVolumeUSD = 6_000;
    loaded.ladder[3].conditions = { selfBuyUSD: 0, directRefs: 0, teamVolumeUSD: 5_000, vDownlines: { 1: 0 } };
    const p = await page('en', loaded), rendered = texts(p.root);
    expect(rendered).toContain('V3 Published 3');
    expect(conditionTexts(p.root, 'V3 · Team compute amount ≥ $5000.00 · $6000.00 / $5000.00'))
      .toEqual(['V3 · Team compute amount ≥ $5000.00 · $6000.00 / $5000.00', 'Done']);
    expect(text(p.root)).not.toContain('Self-buy'); expect(text(p.root)).not.toContain('Direct refs');
    expect(text(p.root)).not.toContain('× V1'); expect(text(p.root)).not.toContain('more team compute amount');
    expect(p.state.myRank).toBe(2);
  });

  it('renders the current TEST172 account and published V1 thresholds without replacing its purchase total', async () => {
    const loaded = facts(); loaded.selfBuyUSD = 39.8;
    loaded.ladder[1].conditions = { selfBuyUSD: 500, directRefs: 3, teamVolumeUSD: 0 };
    const p = await page('en', loaded);
    expect(conditionTexts(p.root, 'V1 · Self-buy ≥ $500.00 · $39.80 / $500.00'))
      .toEqual(['V1 · Self-buy ≥ $500.00 · $39.80 / $500.00', 'Self-buy $460.20 more']);
    expect(conditionTexts(p.root, 'V1 · Direct refs ≥ 3 · 0 / 3'))
      .toEqual(['V1 · Direct refs ≥ 3 · 0 / 3', '3 more direct referrals meeting the self-purchase requirement']);
    expect(text(p.root)).not.toContain('Team compute amount ≥ $0'); expect(text(p.root)).not.toContain('× V');
    expect(text(p.root)).not.toContain('19.9'); expect(p.state.selfBuyUSD).toBe(39.8); expect(p.state.myRank).toBe(0);
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
    expect(conditionTexts(p.root, prior.replace("4 / 4", "3 / 4"))).toHaveLength(2);
    expect(conditionTexts(p.root, target)).toEqual([target, copy.rank.done]);
  });

  it.each(['en', 'zh', 'vi'] as const)('keeps blocking preceding conditions visible after rank protection or a refund in %s', async locale => {
    const loaded = facts(); loaded.selfBuyUSD = 39.8;
    loaded.ladder[1].conditions = { selfBuyUSD: 500, directRefs: 3 };
    loaded.ladder[2].conditions = { teamVolumeUSD: 5_000 };
    loaded.ladder[3].conditions = { teamVolumeUSD: 20_000, vDownlines: { 2: 2 } };
    const p = await page(locale, loaded), copy = dictionaries[locale];
    const labels = locale === 'zh'
      ? { buy: 'V1 · 自买 ≥ $500.00 · $39.80 / $500.00', buyGap: '再自买 $460.20', refs: 'V1 · 直接邀请 ≥ 3 · 0 / 3', refsGap: '还差 3 位满足自购条件的直接邀请' }
      : locale === 'vi'
        ? { buy: 'V1 · Tự mua ≥ $500.00 · $39.80 / $500.00', buyGap: 'Tự mua thêm $460.20', refs: 'V1 · Mời trực tiếp ≥ 3 · 0 / 3', refsGap: 'Cần thêm 3 người được giới thiệu trực tiếp đáp ứng điều kiện tự mua' }
        : { buy: 'V1 · Self-buy ≥ $500.00 · $39.80 / $500.00', buyGap: 'Self-buy $460.20 more', refs: 'V1 · Direct refs ≥ 3 · 0 / 3', refsGap: '3 more direct referrals meeting the self-purchase requirement' };
    for (const current of [1, 2] as const) {
      Object.assign(p.state, { myRank: current, selfBuyUSD: 39.8, directRefs: 0,
        teamVolumeUSD: current === 1 ? 5_000 : 20_000, vDownlineCounts: { 2: 1, 3: 1 } });
      await Vue.nextTick();
      expect(conditionTexts(p.root, labels.buy)).toEqual([labels.buy, labels.buyGap]);
      expect(conditionTexts(p.root, labels.refs)).toEqual([labels.refs, labels.refsGap]);
      const targetVolume = current === 1 ? '5000.00' : '20000.00';
      const target = locale === 'zh' ? `V${current + 1} · 团队算力额 ≥ $${targetVolume} · $${targetVolume} / $${targetVolume}`
        : locale === 'vi' ? `V${current + 1} · Giá trị công suất nhóm $${targetVolume} · $${targetVolume} / $${targetVolume}`
          : `V${current + 1} · Team compute amount ≥ $${targetVolume} · $${targetVolume} / $${targetVolume}`;
      expect(conditionTexts(p.root, target)).toEqual([target, copy.rank.done]);
      // Satisfying every preceding gate updates the observation, never myRank.
      p.state.selfBuyUSD = 500; p.state.directRefs = 3; await Vue.nextTick();
      expect(conditionTexts(p.root, labels.buy.replace('$39.80 /', '$500.00 /'))).toEqual([]);
      expect(conditionTexts(p.root, labels.refs.replace('0 / 3', '3 / 3'))).toEqual([]);
      expect(p.state.myRank).toBe(current);
    }
    p.state.teamVolumeUSD = 4_000; await Vue.nextTick();
    const volumes = locale === 'zh'
      ? [['V2 · 团队算力额 ≥ $5000.00 · $4000.00 / $5000.00', '团队算力额还差 $1000.00'], ['V3 · 团队算力额 ≥ $20000.00 · $4000.00 / $20000.00', '团队算力额还差 $16000.00']]
      : locale === 'vi'
        ? [['V2 · Giá trị công suất nhóm $5000.00 · $4000.00 / $5000.00', 'Thêm $1000.00 giá trị công suất nhóm'], ['V3 · Giá trị công suất nhóm $20000.00 · $4000.00 / $20000.00', 'Thêm $16000.00 giá trị công suất nhóm']]
        : [['V2 · Team compute amount ≥ $5000.00 · $4000.00 / $5000.00', '$1000.00 more team compute amount'], ['V3 · Team compute amount ≥ $20000.00 · $4000.00 / $20000.00', '$16000.00 more team compute amount']];
    for (const [label, gap] of volumes) expect(conditionTexts(p.root, label)).toEqual([label, gap]);
  });

  const twoDecimalCopy = [
    ['en', 'V1 · Self-buy ≥ $500.00 · $500.00 / $500.00', 'Self-buy $0.00 more',
      'V1 · Team compute amount ≥ $2000.00 · $2000.00 / $2000.00', '$0.00 more team compute amount', '$765.88 more team compute amount'],
    ['zh', 'V1 · 自买 ≥ $500.00 · $500.00 / $500.00', '再自买 $0.00',
      'V1 · 团队算力额 ≥ $2000.00 · $2000.00 / $2000.00', '团队算力额还差 $0.00', '团队算力额还差 $765.88'],
    ['vi', 'V1 · Tự mua ≥ $500.00 · $500.00 / $500.00', 'Tự mua thêm $0.00',
      'V1 · Giá trị công suất nhóm $2000.00 · $2000.00 / $2000.00', 'Thêm $0.00 giá trị công suất nhóm', 'Thêm $765.88 giá trị công suất nhóm'],
  ] as const;
  for (const intl of ['present', 'absent'] as const) {
    it.each(twoDecimalCopy)(`renders two-decimal %s money while qualification uses raw values with Intl ${intl}`, async (locale, buy, buyGap, team, teamGap, otherGap) => {
      if (intl === 'absent') vi.stubGlobal('Intl', undefined);
      const loaded = facts(); loaded.selfBuyUSD = 499.999999; loaded.teamVolumeUSD = 1999.999999;
      loaded.ladder[1].conditions = { selfBuyUSD: 500, teamVolumeUSD: 2_000 };
      const p = await page(locale, loaded), copy = dictionaries[locale];
      expect(p.state.selfBuyUSD).toBe(499.999999);
      expect(p.state.teamVolumeUSD).toBe(1999.999999);
      expect(conditionTexts(p.root, buy)).toEqual([buy, buyGap]);
      expect(conditionTexts(p.root, team)).toEqual([team, teamGap]);
      expect(texts(p.root)).not.toContain(copy.rank.done);
      p.state.teamVolumeUSD = 1234.123456; await Vue.nextTick();
      expect(texts(p.root)).toContain(otherGap);
      p.state.selfBuyUSD = 500; p.state.teamVolumeUSD = 2_000; await Vue.nextTick();
      expect(texts(p.root).filter(item => item === copy.rank.done)).toHaveLength(2);
      expect(texts(p.root)).not.toContain(buyGap); expect(texts(p.root)).not.toContain(teamGap);
      expect(p.state.myRank).toBe(0);
    });
  }

  it.each(['en', 'zh', 'vi'] as const)('keeps a confirmed highest rank free of a fabricated %s next target or zero gaps', async locale => {
    const loaded = facts(); loaded.ladder = loaded.ladder.slice(0, 9); loaded.myRank = 8;
    const p = await page(locale, loaded), copy = dictionaries[locale];
    expect(text(p.root)).toContain(locale === 'zh' ? 'V8 公开 8' : 'V8 Published 8');
    expect(text(p.root)).not.toContain(copy.rank.next); expect(text(p.root)).not.toContain(copy.rank.upgradeCta);
    expect(text(p.root)).not.toContain(' / '); expect(text(p.root)).not.toContain('100%');
    expect(text(p.root)).not.toContain(copy.rank.needSelfBuy); expect(text(p.root)).not.toContain('V9');
  });
});
