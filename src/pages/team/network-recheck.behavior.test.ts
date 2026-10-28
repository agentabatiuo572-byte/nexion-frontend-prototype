import { teamLogicCopy } from '@/i18n/team-logic-copy';
import * as draftSession from '@/lib/ambassador-draft-session';
import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach, expect, test, vi } from 'vitest';
import quotaSource from '@/components/team/quota-tier-card.vue?raw';
import quotaPage from './quota.vue?raw';
import binarySource from './binary.vue?raw';
import agentSource from './agent.vue?raw';
import { getProductMedia } from '@/lib/product-media';
import { formatAmount } from '@/lib/amount-display';
import { formatFinanceAmount } from '@/lib/finance-amount-display';
import { formatComputePoints } from '@/i18n/compute-points';
import { networkReauditCopy } from '@/i18n/network-reaudit';
import { fmt } from '@/i18n/format';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import * as requestScope from '@/lib/team-p3-17-18-request-scope';
import { mountEntry, all, text, flush, slot } from '@/lib/entry-review.test-support';

const dictionaries = { zh, en, vi: vietnamese };
const stop: Array<() => void> = [];
afterEach(() => stop.splice(0).forEach(fn => fn()));

function component(source: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(compileScript(parse(source).descriptor, { id: 'network-recheck', inlineTemplate: true }).content,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'vue') return Vue;
    if (!(id in dependencies)) throw new Error('Missing network test dependency: ' + id);
    return dependencies[id];
  }, exports);
  return exports.default;
}

test.each(['zh', 'en', 'vi'] as const)('R02 distinguishes qualification, availability and actual sold-out stock in %s', async language => {
  const copy = dictionaries[language], audit = networkReauditCopy(language);
  const tier = { productId: 'sample', name: 'Sample', price: 1299, monthlyStock: 60, soldThisMonth: 42, available: false,
    unlockKind: 'all', conditions: [{ label: 'Rank', current: 2, required: 3, kind: 'invites' }], perks: [], tint: 'var(--v5-brand)' };
  const card = component(quotaSource, {
    '@/i18n/team-logic-copy': { teamLogicCopy },
    '@/lib/amount-display': { formatAmount }, '@/lib/finance-amount-display': { formatFinanceAmount }, '@/i18n/compute-points': { formatComputePoints },
    '@/store/locale': { useLocaleStore: () => ({ code: language }) }, '@/i18n/network-reaudit': { networkReauditCopy },
    '@/i18n/use-t': { useT: () => Vue.ref(copy) }, '@/i18n/format': { fmt },
    '@/lib/product-media': { getProductMedia }, '@/components/ui/nx-button.vue': slot,
    './quota-condition-bar.vue': slot, '@/lib/brand-copy': { nexGridBrandText: (name: string) => name },
    '@/composables/use-scroll-grow-progress': { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: Vue.ref(true) }), PROGRESS_GROW_TRANSITION: '' },
  });
  const show = (value: typeof tier) => renderToString(Vue.createSSRApp(card, { tier: value }));
  const restricted = await show(tier);
  expect(restricted).toContain(fmt(copy.quota.priceLine, { price: formatFinanceAmount(tier.price) }));
  expect(restricted).toContain(copy.store.purchaseEligibilityIneligible);
  expect(restricted).not.toContain(copy.quota.stockUnavailable);
  const qualified = { ...tier, conditions: [{ ...tier.conditions[0], current: 3 }] };
  expect(await show(qualified)).toContain(audit.quotaUnavailable);
  expect(await show({ ...qualified, soldThisMonth: 60 })).toContain(copy.quota.stockUnavailable);
  expect(await show({ ...qualified, available: true })).toContain(fmt(copy.quota.buyCta, { name: 'Sample' }));
  expect(tier.soldThisMonth).toBe(42); expect(tier.conditions[0].current).toBe(2);
  const points = { ...qualified, available: true, conditions: [{ label: copy.quota.condTeamVol, current: 6000, required: 5000, kind: 'volume' }] };
  const pointsText = await show(points);
  expect(pointsText).toContain(`${formatComputePoints(6000, language)} / ${formatComputePoints(5000, language)}`);
  expect(pointsText).toContain(copy.quota.unlocked);
  expect(pointsText).not.toContain('USD');
  expect(await show({ ...points, conditions: [{ ...points.conditions[0], current: 4999 }] })).toContain(copy.quota.locked);

});

test.each(['zh', 'en', 'vi'] as const)('R02 fallback daily output remains an estimate with its real token amount in %s', language => {
  const body = quotaPage.slice(quotaPage.indexOf('const QUOTA_PERK_GEN'), quotaPage.indexOf('/** 请求聚焦'));
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const format = new Function('fmt', 'formatAmount', 'auditCopy', compiled + '\nreturn quotaPerkText;')(fmt, formatAmount, { value: networkReauditCopy(language) });
  expect(format('80.125 NEX/day')).toBe(fmt(networkReauditCopy(language).estimatedDaily, { n: '80.13' }));
  expect(format('80.125 UVT/day')).toBe(fmt(networkReauditCopy(language).estimatedDaily, { n: '80.13' }));
  expect(format('GPU 96 GB')).toBe('GPU 96 GB');
});

test('R12 reward currency keeps original credited, frozen, rejected and reversal signs', () => {
  const script = parse(binarySource).descriptor.scriptSetup!.content;
  const body = script.slice(script.indexOf('function binaryAmountLabel'), script.indexOf('\n}', script.indexOf('function binaryAmountLabel')) + 2);
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const label = new Function('formatFinanceAmount', compiled + '\nreturn binaryAmountLabel;')(formatFinanceAmount);
  for (const [status, expected] of [['unlocked', '+$120.00'], ['frozen', '$120.00'], ['rejected', '$120.00'], ['reversed', '−$120.00']]) {
    const event = Object.freeze({ amountUSDT: 120, status }); expect(label(event)).toBe(expected); expect(event.amountUSDT).toBe(120);
  }
});

test.each(['zh', 'en', 'vi'] as const)('R13 keeps real budget bounds, neutral presentation and V5 submission gate in %s', async language => {
  const shown: Array<() => void> = [], navTo = vi.fn();
  const rank = Vue.reactive({ myRank: 2, remoteReady: true, ladder: [], refreshCanonicalVRank: vi.fn(async () => {}) });
  const policy = { defaultBudgetUsdt: 3000, buckets: ['venue', 'kol', 'print', 'dev'].map(id => ({ id, title: id, rule: 'Actual rule', range: '100-10000 USDT', minBudgetUsdt: 125.25, maxBudgetUsdt: 9876.5 })) };
  const api = { policy: vi.fn(async () => policy), latest: vi.fn(async () => ({ status: 'NONE' })), history: vi.fn(async () => []), submit: vi.fn() };
  // UniApp owns input v-model; adapt only that native element for the in-memory renderer.
  const nativeInput = { default: Vue.defineComponent({ props: ['modelValue', 'disabled'], setup: props => () => Vue.h('input', { disabled: props.disabled, value: props.modelValue }) }) };
  const adapted = agentSource.replace('<script setup lang="ts">', '<script setup lang="ts">\nimport UniInput from "./network-test-input.vue";').replace(/<input\b/g, '<UniInput');
  const page = mountEntry(adapted, {
    '@/i18n/team-logic-copy': { teamLogicCopy },
    '@/lib/ambassador-draft-session': { ...draftSession, ambassadorDraftCache: draftSession.createAmbassadorDraftCache() },
    './network-test-input.vue': nativeInput,
    '@/lib/amount-display': { formatAmount }, '@/lib/finance-amount-display': { formatFinanceAmount },
    '@/lib/route': { navTo }, '@dcloudio/uni-app': { onShow: (fn: () => void) => shown.push(fn), onHide: vi.fn(), onUnload: vi.fn() },
    '@/components/app-chassis.vue': slot, '@/components/sub-page-header.vue': slot, '@/components/team/v-badge.vue': slot,
    '@/components/team/team-art.vue': slot, '@/components/team/team-rank-emblem.vue': slot,
    '@/store/v-rank': { useVRank: () => rank }, '@/lib/v-rank-copy': { rankLabel: (n: number) => `V${n}`, rankTitle: (n: number) => `V${n}` },
    '@/store/locale': { useLocaleStore: () => ({ code: language }) }, '@/i18n/network-reaudit': { networkReauditCopy },
    '@/i18n/use-t': { useT: () => Vue.ref(dictionaries[language]) }, '@/i18n/format': { fmt },
    '@/store/ui': { toast: { warn: vi.fn(), error: vi.fn(), success: vi.fn() } },
    '@/store/app': { useApp: () => Vue.reactive({ accountKey: 'user:21', accountBindingEpoch: 1 }) },
    '@/api/runtime': { remoteApiEnabled: true, ambassadorApplicationApi: api },
    '@/api/ambassador-application-api': { isAmbassadorApplicationPending: () => false },
    '@/api/errors': { isSettledRejection: () => false },
    '@/lib/ambassador-command-key': { acquireAmbassadorCommandKey: vi.fn(), finishAmbassadorCommand: vi.fn() },
    '@/lib/team-p3-17-18-request-scope': requestScope,
  }); stop.push(page.unmount);
  shown.forEach(fn => fn()); await flush();
  expect(text(page.root).split('125.25–9,876.50 USDT')).toHaveLength(5);
  expect(text(page.root)).toContain(networkReauditCopy(language).budgetLabel);
  const path = all(page.root).find(n => n.props.role === 'button' && text(n).includes(dictionaries[language].agent.pathCta))!;
  expect(path.props.style.background).not.toBe('var(--v5-brand)'); path.props.onClick(); expect(navTo).toHaveBeenCalledWith('/pages/team/rank');
  const ranges = all(page.root).filter(n => n.text === '125.25–9,876.50 USDT');
  expect(ranges).toHaveLength(4); ranges.forEach(n => expect(n.props.style.color).toBe('var(--v5-ink)'));
  const submit = all(page.root).find(n => n.props['aria-disabled'] === 'true' && text(n).includes(dictionaries[language].agent.lockedV5))!;
  submit.props.onClick(); await flush(); expect(api.submit).not.toHaveBeenCalled();
  expect(all(page.root).filter(n => n.tag === 'input').every(n => n.props.disabled)).toBe(true);
  expect(policy.buckets[0].minBudgetUsdt).toBe(125.25);
  rank.myRank = 5; await flush();
  expect(all(page.root).filter(n => n.tag === 'input').every(n => !n.props.disabled)).toBe(true);
  expect(api.submit).not.toHaveBeenCalled();
  rank.remoteReady = false; await flush();
  expect(text(page.root)).toContain(dictionaries[language].profile.rankUnavailable);
  expect(text(page.root)).not.toContain(dictionaries[language].agent.eligible);
  expect(all(page.root).filter(n => n.tag === 'input').every(n => n.props.disabled)).toBe(true);
  const unknownSubmit = all(page.root).find(n => n.props.role === 'button' && String(n.props.class).includes('agent-submit'))!;
  expect(unknownSubmit.props['aria-disabled']).toBe('true');
  unknownSubmit.props.onClick(); await flush();
  expect(api.submit).not.toHaveBeenCalled();
});
