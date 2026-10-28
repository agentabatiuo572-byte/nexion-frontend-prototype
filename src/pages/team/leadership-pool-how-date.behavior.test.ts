import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, test, vi } from "vitest";
import source from "./leadership-pool-how.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { formatDisplayDateTime } from "@/lib/display-date";
import { leadershipHowFacts } from "@/lib/leadership-how-facts";
import { leadershipPoolFailureState } from "@/lib/leadership-pool-state";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { rankLabel } from "@/lib/v-rank-copy";

// Real SFC script/template; only remote reads and chassis children are isolated.
type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ""): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: text => node(text), createComment: () => node(),
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
const text = (root: Host): string => root.text + root.children.map(text).join("");
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
const dictionaries = { en, zh, vi: vietnamese };
type Locale = keyof typeof dictionaries;
const code = ts.transpileModule(compileScript(parse(source).descriptor, {
  id: "leadership-date-481", inlineTemplate: true,
}).content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const unmounts: Array<() => void> = [];
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); await Vue.nextTick(); }
async function mount(nextPayoutAt: unknown, remoteRead?: () => Promise<unknown>, rankOverrides: Record<string, unknown> = {}) {
  const locale = Vue.ref<Locale>("zh");
  const snapshot = Object.freeze({ nextPayoutAt, injectRate: .05, unlockRank: 3, distribution: [], myVotes: 2, totalVotes: 40, mySharePct: .05 });
  const api = vi.fn(remoteRead ?? (async () => snapshot));
  const navBack = vi.fn();
  const rankState = Vue.reactive({ remoteReady: true, remoteError: false, ladder: [] as any[], refreshCanonicalVRank: vi.fn(), ...rankOverrides });
  rankState.refreshCanonicalVRank.mockImplementation(async () => { if (!rankState.remoteError) { rankState.ladder = [...rankState.ladder]; rankState.remoteReady = true; } });
  const shows: Array<() => void> = [];
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onHide: () => {}, onShow: (callback: () => void) => shows.push(callback) },
    "@/components/app-chassis.vue": { default: slot },
    "@/components/team/reward-page-surface.vue": { default: slot },
    "@/components/sub-page-header.vue": { default: slot },
    "@/components/team/reward-compact-hero.vue": { default: slot },
    "@/components/team/reward-rule-block.vue": { default: slot },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.value]) },
    "@/store/locale": { useLocaleStore: () => Vue.reactive({ get code() { return locale.value; } }) },
    "@/i18n/network-reaudit": { networkReauditCopy },
    "@/i18n/format": { fmt, dateLocale: () => ({ en: "en-US", zh: "zh-CN", vi: "vi-VN" })[locale.value] },
    "@/lib/display-date": { formatDisplayDateTime },
    "@/lib/route": { navBack },
    "@/api/runtime": { remoteApiEnabled: true, apiRuntimeConfig: { environment: 'prod', baseUrl: 'https://fixture.invalid' }, teamInsightsApi: { leadershipPool: api } },
    "@/store/auth": { useAuth: () => Vue.reactive({ isAuthenticated: true }) },
    "@/store/app": { useApp: () => Vue.reactive({ accountKey: "user:3778" }) },
    "@/store/v-rank": { useVRank: () => rankState },
    "@/lib/v-rank-copy": { rankLabel },
    "@/lib/leadership-pool-state": { leadershipPoolFailureState },
    "@/lib/leadership-how-facts": { leadershipHowFacts },
    "@/lib/account-scope": { captureAccountScope: () => 1, isCurrentAccountScope: () => true },
    "@/api/order-api": { captureRuntimeRevision: () => 1, isCurrentRuntimeRevision: () => true, subscribeRuntimeRevision: () => () => {} },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected page import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node();
  const app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  return { root, locale, snapshot, api, navBack, rankState, show: async () => { shows.forEach(callback => callback()); await flush(); } };
}
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const zones = [
  ["Asia/Tokyo", "2026-10-12 08:59:00"],
  ["Asia/Ho_Chi_Minh", "2026-10-12 06:59:00"],
] as const;
for (const [zone, expected] of zones) {
  test.each(["missing Intl", "ignored locale/options", "throwing locale"])(`481 ${zone} %s keeps local time across zh/en/vi`, async mode => {
    vi.stubEnv("TZ", zone);
    if (mode === "missing Intl") vi.stubGlobal("Intl", undefined);
    const localeSpy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => {
      if (mode === "throwing locale") throw new Error("Android locale formatter unavailable");
      return "Mon Oct 12 2026 08:59:00 GMT+0900 (JST)";
    });
    const page = await mount("2026-10-11T23:59:00Z"); await page.show();
    for (const language of ["zh", "en", "vi"] as const) {
      page.locale.value = language; await flush();
      expect(text(page.root)).toContain(fmt(dictionaries[language].poolHowItWorks.nextPayout, { time: `${{ zh: "2026/10/12", en: "Oct 12, 2026", vi: "12/10/2026" }[language]} ${expected.slice(11)}` }));
      expect(text(page.root)).toContain(fmt(dictionaries[language].poolHowItWorks.currentRules, { rank: 3 }));
      expect(text(page.root)).not.toMatch(/Mon Oct|GMT\+|Invalid Date|NaN/);
    }
    expect(localeSpy).not.toHaveBeenCalled(); expect(page.api).toHaveBeenCalledTimes(3);
    expect(page.snapshot.nextPayoutAt).toBe("2026-10-11T23:59:00Z");
    all(page.root).find(item => item.props.role === "button")!.props.onClick();
    expect(page.navBack).toHaveBeenCalledWith("/pages/team/leadership-pool");
  });
  test.each(["2026-10-11T23:59:00Z", "2026-10-12T08:59:00+09:00"])(`481 ${zone} preserves normal equivalent instant %s`, async value => {
    vi.stubEnv("TZ", zone);
    const page = await mount(value); await page.show();
    expect(text(page.root)).toContain(fmt(zh.poolHowItWorks.nextPayout, { time: expected.replace(/-/g, "/") }));
    expect(page.snapshot.nextPayoutAt).toBe(value);
  });
}
test.each(["not-a-date", "", undefined, null, "   "])("481 unknown/invalid %s displays dash rather than invented epoch", async value => {
  const page = await mount(value); await page.show();
  for (const language of ["zh", "en", "vi"] as const) {
    page.locale.value = language; await Vue.nextTick();
    expect(text(page.root)).toContain(fmt(dictionaries[language].poolHowItWorks.nextPayout, { time: "—" }));
    expect(text(page.root)).not.toMatch(/Invalid Date|NaN|1970/);
  }
});
test("481 no snapshot keeps loading; failed read keeps error and retry", async () => {
  const page = await mount(undefined, async () => { throw new Error("read failed"); });
  expect(text(page.root)).toContain(zh.pool.loading);
  expect(text(page.root)).not.toContain(fmt(zh.poolHowItWorks.nextPayout, { time: "—" }));
  await page.show();
  expect(text(page.root)).toContain(zh.pool.loadError); expect(text(page.root)).toContain(zh.pool.retry);
  expect(text(page.root)).not.toContain("下一次结算时间");
});

test.each(['zh', 'en', 'vi'] as const)('R10 shows only current returned votes/share and links records in %s', async language => {
  const page = await mount('2026-10-11T23:59:00Z'); page.locale.value = language; await page.show();
  const copy = networkReauditCopy(language);
  expect(text(page.root)).toContain(copy.votes + '2');
  expect(text(page.root)).toContain(copy.totalVotes + '40');
  expect(text(page.root)).toContain(copy.share + '5%');
  expect(text(page.root)).toContain(copy.poolRulesPending);
  all(page.root).find(n => n.props.role === 'button' && text(n) === copy.poolRecords)!.props.onClick();
  expect(page.navBack).toHaveBeenCalledWith('/pages/team/leadership-pool');
});

test.each([0, undefined])('R10 zero or missing vote total %s never invents a share', async totalVotes => {
  const page = await mount('', async () => ({ unlockRank: 2, injectRate: .05, nextPayoutAt: '', distribution: [], myVotes: 0, totalVotes, mySharePct: 0 }));
  await page.show(); expect(text(page.root)).toContain(networkReauditCopy('zh').share + '—');
  expect(text(page.root)).not.toContain('0%');
});


const distributionFixture = [2, 4, 6, 8].map(vRank => ({ vRank, people: 2, votes: vRank }));
const configuredLadder = Array.from({ length: 9 }, (_, v) => ({ v, title: '', cnTitle: '', leadershipVotes: v }));
const hasClass = (node: Host, name: string) => String(node.props.class).split(' ').includes(name);
test.each(['zh', 'en', 'vi'] as const)('T4 %s shows configured weights separately from this period distribution', async language => {
  const page = await mount('', async () => ({ unlockRank: 2, injectRate: .05, nextPayoutAt: '', myVotes: 2, totalVotes: 40, mySharePct: .05, distribution: distributionFixture }), { ladder: configuredLadder });
  page.locale.value = language; await page.show();
  const weights = all(page.root).filter(n => hasClass(n, 'pool-how-weight-row')).map(text);
  expect(weights).toEqual([2,3,4,5,6,7,8].map(v => `V${v}${v}`));
  const rows = all(page.root).filter(n => hasClass(n, 'pool-how-distribution-row')).map(text);
  expect(rows).toHaveLength(4);
  for (const [i, rank] of [2,4,6,8].entries()) {
    expect(rows[i]).toContain(`V${rank}`);
    expect(rows[i]).toContain(fmt(dictionaries[language].pool.peopleVotesEa, { count: 2, votes: rank }));
    expect(rows[i]).toContain(`${dictionaries[language].poolHowItWorks.colVotes}: ${2*rank}`);
  }
  expect(text(page.root)).toContain(networkReauditCopy(language).poolRulesPending);
  expect(text(page.root)).not.toContain(dictionaries[language].poolHowItWorks.s1Para1);
});
test('T4 known zero configured weights stay zero and absent weights/participation stay unknown', async () => {
  const page = await mount('', async () => ({ unlockRank: 2, nextPayoutAt: '', distribution: [], myVotes: 0, totalVotes: 0, mySharePct: 0 }),
    { ladder: [{ v: 2, leadershipVotes: 0 }, { v: 3, leadershipVotes: undefined }] });
  await page.show();
  expect(all(page.root).filter(n => hasClass(n, 'pool-how-weight-row')).map(text)).toEqual(['V20','V3—']);
  expect(all(page.root).filter(n => hasClass(n, 'pool-how-distribution-row'))).toHaveLength(0);
  expect(text(page.root)).toContain(zh.poolHowItWorks.noVoteRows);
});
test('T4 a rank configuration failure does not hide known current distribution and has its own retry', async () => {
  const page = await mount('', async () => ({ unlockRank: 2, nextPayoutAt: '', distribution: distributionFixture, myVotes: 2, totalVotes: 40, mySharePct: .05 }),
    { remoteReady: false, remoteError: true });
  await page.show();
  expect(all(page.root).filter(n => hasClass(n, 'pool-how-distribution-row'))).toHaveLength(4);
  expect(all(page.root).filter(n => hasClass(n, 'pool-how-weight-row'))).toHaveLength(0);
  const count = page.rankState.refreshCanonicalVRank.mock.calls.length;
  all(page.root).find(n => n.props.role === 'button' && text(n) === zh.pool.retry)!.props.onClick();
  expect(page.rankState.refreshCanonicalVRank).toHaveBeenCalledTimes(count + 1);
});
