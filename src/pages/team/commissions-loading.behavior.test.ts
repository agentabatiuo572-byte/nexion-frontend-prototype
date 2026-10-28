import * as Vue from "vue";
import { createPinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { formatAmount, formatGroupedAmount } from "@/lib/amount-display";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { commissionFilterCopy } from "@/i18n/commission-filter-copy";
import { teamRuleGuideCopy } from '@/components/team/team-rule-guide-copy';
import { commissionPublishedBlocks } from '@/components/team/team-rule-commission-copy';
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, test, vi } from "vitest";
import commissionsSource from "./commissions.vue?raw";
import guideSource from "./commissions-how.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { formatTrialDate } from "@/lib/trial-date";
import { formatHowNumber } from "@/lib/rank-how-content";
import { buildCommissionsHowContent, createCommissionsHowResource, COMMISSIONS_HOW_SLOTS, type CommissionsHowSnapshot } from "@/lib/commissions-how-content";
import type { CommissionEvent, CommissionKind } from "@/store/commission";
import type { TeamCommissionSnapshot } from "@/api/team-insights-api";

// Mount the production page scripts/templates with isolated read boundaries.
// The fixtures describe render states; they are not live server business facts.
type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
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
const text = (root: Host): string => root.text + root.children.map(text).join("");
const unmounts: Array<() => void> = [];
const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
const copyComponent = (name: string) => Vue.defineComponent({
  props: ["label", "title", "sub", "body", "q", "a"],
  setup: (props, { slots }) => () => Vue.h("view", { "data-component": name }, [
    ...Object.values(props).filter(value => value != null).map(value => Vue.h("text", String(value))),
    ...(slots.default?.() ?? []), ...(slots.footer?.() ?? []),
  ]),
});
const emptyState = Vue.defineComponent({
  props: ["title", "desc", "ctaLabel", "kind"], emits: ["cta"],
  setup: (props, { emit }) => () => Vue.h("view", { "data-empty-kind": props.kind }, [
    Vue.h("text", String(props.title)), props.desc ? Vue.h("text", String(props.desc)) : null,
    props.ctaLabel ? Vue.h("view", { role: "button", onClick: () => emit("cta") }, String(props.ctaLabel)) : null,
  ]),
});
const sheet = Vue.defineComponent({
  props: ["open", "title"], emits: ["close"],
  setup: (props, { slots }) => () => props.open
    ? Vue.h("view", { role: "dialog", "aria-label": props.title }, slots.default?.())
    : null,
});
async function mount(source: string, dependencies: Record<string, unknown>) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "commissions-loading-behavior", inlineTemplate: true });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = { default: {} as Component };
  const shows: Array<() => void> = [];
  const defaults: Record<string, unknown> = {
    '@/components/team/team-rule-guide-copy': { teamRuleGuideCopy },
    '@/components/team/team-rule-commission-copy': { commissionPublishedBlocks },
    '@/components/team/team-rule-hero.vue': { default: copyComponent('hero') },
    '@/components/team/team-rule-section.vue': { default: Vue.defineComponent({
      props: ['label', 'title', 'body', 'q', 'a'],
      setup: (props, { slots }) => () => Vue.h('view', { 'data-component': slots.default ? 'section' : 'rule' }, [
        ...Object.values(props).filter(value => value != null).map(value => Vue.h('text', String(value))), ...(slots.default?.() ?? []),
      ]),
    }) },
    '@/components/team/team-rule-document.vue': { default: slot },
    '@/store/app': { useApp: () => Vue.reactive({ accountKey: 'user:A', accountBindingEpoch: 1 }) },
    '@/store/auth': { useAuth: () => Vue.reactive({ isAuthenticated: true }) },
    '@/store/locale': { useLocaleStore: () => Vue.reactive({ code: 'en' }) },
    '@/lib/account-scope': { captureAccountScope: () => 1, isCurrentAccountScope: () => true },
    "@/lib/amount-display": { formatAmount, formatGroupedAmount },
    "@/i18n/network-reaudit": { networkReauditCopy },
    "@/i18n/commission-filter-copy": { commissionFilterCopy },
    "@/lib/trial-date": { formatTrialDate },
    vue: Vue, "@dcloudio/uni-app": { onHide: () => {}, onShow: (callback: () => void) => shows.push(callback) },
    "@/components/app-chassis.vue": { default: slot },
    "@/components/team/reward-page-surface.vue": { default: slot },
    "@/components/team/reward-compact-hero.vue": { default: copyComponent("hero") },
    "@/components/team/reward-rule-block.vue": { default: Vue.defineComponent({
      props: ["label", "title", "sub", "body", "q", "a", "n"],
      setup: (props, { slots }) => () => Vue.h("view", { "data-component": slots.default ? "section" : "rule" }, [
        ...Object.values(props).filter(value => value != null).map(value => Vue.h("text", String(value))), ...(slots.default?.() ?? []),
      ]),
    }) },
    "@/components/sub-page-header.vue": { default: slot },
    "@/components/empty-state.vue": { default: emptyState },
    "@/components/ui/nx-sheet.vue": { default: sheet },
    ...Object.fromEntries(["hero", "section", "icon-row", "callout-box", "faq-row"].map(name => [
      `@/components/how/how-${name}.vue`, { default: copyComponent(name) },
    ])),
    "@/i18n/format": { fmt, dateLocale: () => "en-US" },
    "@/lib/rank-how-content": { formatHowNumber },
    "@/lib/commissions-how-content": { buildCommissionsHowContent, createCommissionsHowResource },
  };
  new Function("require", "exports", code)((id: string) => {
    if (id in dependencies) return dependencies[id];
    if (id in defaults) return defaults[id];
    throw new Error(`Unexpected page import: ${id}`);
  }, exports);
  const root = node("root");
  const app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  return { root, shows, show: async () => { shows.forEach(callback => callback()); await flush(); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); await Vue.nextTick(); }
const dictionaries = { en, zh, vi: vietnamese };
type Locale = keyof typeof dictionaries;
const kinds: CommissionKind[] = ["direct_purchase", "direct_device_earning", "unilevel", "binary", "peer", "cultivation", "leadership", "genesis", "promotion", "other"];
const event = (kind: CommissionKind): CommissionEvent => ({
  id: `fixture-${kind}`, kind, sourceUserName: `Event ${kind}`, amountUSDT: 7, amountNEX: 0,
  ts: 1790812800000, unlockAt: 1790812800000, status: "unlocked",
});
async function commissions(code: Locale = "en", visibility: Pick<ReturnType<typeof useDataVisibility>, 'hidden' | 'mask'> = { hidden: false, mask: String }) {
  const locale = Vue.ref(code);
  const commission = Vue.reactive({
    eventsStatus: "idle", events: [] as CommissionEvent[], eventsEvidence: null as (Omit<Partial<TeamCommissionSnapshot>, 'aggregate'> & { aggregate: Partial<TeamCommissionSnapshot['aggregate']> }) | null, eventsTotalRows: 0,
    eventsLoadMoreStatus: "idle", unlockMatured: vi.fn(), loadMoreCanonicalEvents: vi.fn(),
    unlockedUSDT: () => 0, unlockedNEX: () => 0, coolingUSDT: () => 0, monthUSDT: () => 0, totalUSDTLifetime: () => 0,
    byKind: () => Object.fromEntries(kinds.map(kind => [kind, { usdt: 0, nex: 0, count: 0 }])),
    refreshCanonicalEvents: vi.fn(async () => {}),
  });
  const reads: Array<ReturnType<typeof deferred<CommissionEvent[]>>> = [];
  commission.refreshCanonicalEvents.mockImplementation(async () => {
    commission.eventsStatus = "loading"; commission.events = [];
    const read = deferred<CommissionEvent[]>(); reads.push(read);
    try { commission.events = await read.promise;
      commission.eventsEvidence = { events: commission.events, totalRows: commission.events.length,
        aggregate: { byKind: commission.byKind() as TeamCommissionSnapshot['aggregate']['byKind'] } };
      commission.eventsStatus = "ready"; }
    catch { commission.eventsStatus = "error"; }
  });
  const navTo = vi.fn();
  const page = await mount(commissionsSource, {
    '@/store/data-visibility': { useDataVisibility: () => visibility },
    "@/store/commission": { useCommission: () => commission }, "@/api/runtime": { remoteApiEnabled: true, apiRuntimeConfig: { environment: 'prod', baseUrl: 'https://fixture.invalid' } },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.value]) }, "@/lib/route": { navTo },
    "@/store/locale": { useLocaleStore: () => Vue.reactive({ code: locale }) },
    "@/i18n/format": { fmt, dateLocale: () => ({ en: "en-US", zh: "zh-CN", vi: "vi-VN" })[locale.value] },
  });
  return { ...page, commission, reads, navTo, locale };
}
function guideSnapshot(): CommissionsHowSnapshot {
  const bodies: Record<string, string> = {
    network: "{directPurchaseRules} {directDeviceRules}", binary: "{binaryRules}", cooling: "{coolingDays}",
    peer: "{peerRules} {peerStatus}", genesis: "{genesisStatus}", leadership: "{leadershipRules}",
  };
  return {
    document: { contentKey: "team-commissions-how", version: "fixture-current", versionSource: "ENTRY", status: "PUBLISHED",
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", locale: "en",
      blocks: COMMISSIONS_HOW_SLOTS.map(id => ({ id, kind: "text", title: `Published ${id}`, body: bodies[id] ?? `Body ${id}` })) },
    directPolicy: { configured: true, policyVersion: 1, effectiveAt: "2026-10-01T00:00:00Z", nexUsdtPrice: .01,
      purchase: { enabled: true, totalRatePct: 13, usdtSharePct: 60, coolingDays: 7 }, deviceEarning: { enabled: false, totalRatePct: 0, usdtSharePct: 50, coolingDays: 0 } },
    guide: { source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null,
      coolingDays: null, network: { depthGateLayer: 5, depthGateRank: 4, exitCapRate: null },
      binary: null, leadership: null, capabilities: { peer: false, genesis: false } }, ranks: [],
  };
}
async function guide(code: Locale = "en") {
  const locale = Vue.reactive({ code });
  const app = Vue.reactive({ accountKey: 'user:A', accountBindingEpoch: 1 });
  let boundEpoch = 1;
  const reads: Array<ReturnType<typeof deferred<CommissionsHowSnapshot>>> = [];
  let current: ReturnType<typeof deferred<CommissionsHowSnapshot>>;
  const published = vi.fn(() => {
    current = deferred<CommissionsHowSnapshot>(); reads.push(current);
    return current.promise.then(facts => facts.document);
  });
  const navBack = vi.fn();
  const page = await mount(guideSource, {
    '@/store/app': { useApp: () => app },
    '@/lib/account-scope': { captureAccountScope: () => boundEpoch, isCurrentAccountScope: (epoch: number) => epoch === boundEpoch },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.code]) },
    "@/store/locale": { useLocaleStore: () => locale }, "@/lib/route": { navBack },
    "@/api/runtime": { apiClient: {}, apiRuntimeConfig: { environment: 'prod', baseUrl: 'https://fixture.invalid' }, expectedApiEnvironment: "PRODUCTION", howContentApi: { published },
      vRankApi: { ladder: () => current.promise.then(facts => ({ ranks: facts.ranks })) } },
    "@/api/commission-guide-api": { createCommissionGuideApi: () => ({
      read: () => current.promise.then(facts => facts.guide),
    }) },
    "@/api/direct-referral-api": { createDirectReferralApi: () => ({ policy: () => current.promise.then(facts => facts.directPolicy) }) },
  });
  return { ...page, locale, reads, published, navBack, rebind() {
    // Startup updates app identity before the synchronous store-scope rebind completes.
    app.accountBindingEpoch++;
    app.accountKey = 'user:B';
    boundEpoch++;
  } };
}
const buttons = (root: Host) => all(root).filter(item => item.props.role === "button");
const filterTrigger = (root: Host) => buttons(root).find(item => item.props["aria-haspopup"] === "dialog")!;
const filterOptions = (root: Host) => buttons(root).filter(item => item.props["aria-pressed"] !== undefined);
const publicOutput = (root: Host) => [text(root), ...all(root).flatMap(item => Object.entries(item.props)
  .filter(([key]) => key.startsWith('aria-') || key === 'title').map(([, value]) => String(value)))].join('\n');
async function openFilters(root: Host) {
  expect(filterTrigger(root).props["aria-expanded"]).toBe(false);
  expect(filterOptions(root)).toHaveLength(0);
  filterTrigger(root).props.onClick(); await Vue.nextTick();
  expect(filterTrigger(root).props["aria-expanded"]).toBe(true);
  expect(all(root).filter(item => item.props.role === "dialog")).toHaveLength(1);
  expect(filterOptions(root)).toHaveLength(kinds.length + 1);
}
async function selectFilter(root: Host, label: string) {
  await openFilters(root);
  const option = filterOptions(root).find(item => item.props["aria-label"] === label);
  expect(option).toBeDefined(); option!.props.onClick(); await Vue.nextTick();
  expect(filterTrigger(root).props["aria-expanded"]).toBe(false);
  expect(filterOptions(root)).toHaveLength(0);
}
afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount());
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

test.each(['zh', 'en', 'vi'] as const)('B06 %s global privacy masks totals, open filter counts and reward records without changing data', async code => {
  vi.stubGlobal('uni', { getStorageSync: () => false, setStorageSync: vi.fn() });
  const visibility = useDataVisibility(createPinia());
  const page = await commissions(code, visibility); await page.show();
  const records = [
    { ...event('direct_purchase'), amountUSDT: 32.75, amountNEX: 98.25, orderAmountUSD: 1741.36 },
    { ...event('binary'), amountUSDT: 16.28, amountNEX: 46.39, status: 'cooling' as const },
    { ...event('peer'), amountUSDT: 18.47, amountNEX: 58.69, status: 'recovery_pending' as const, recoveryPendingUSDT: 2.13, recoveryPendingNEX: 7.27 },
    { ...event('genesis'), amountUSDT: 27.63, amountNEX: 84.19, status: 'reversed' as const },
  ];
  page.reads[0].resolve(records); await flush();
  const byKind = { ...page.commission.byKind(), direct_purchase: { usdt: 321.56, nex: 765.43, count: 19 } } as TeamCommissionSnapshot['aggregate']['byKind'];
  page.commission.eventsEvidence = { events: records, totalRows: 59, aggregate: { byKind,
    monthUSDT: 250.17, monthNEX: 40.23, totalUSDT: 1250.31, totalNEX: 70.37,
    unlockedUSDT: 25.43, unlockedNEX: 62.57, coolingUSDT: 50.79 } };
  await flush(); await openFilters(page.root);
  const shown = publicOutput(page.root), before = structuredClone(Vue.toRaw(page.commission.eventsEvidence));
  const amounts = ['250.17', '40.23', '1250.31', '70.37', '25.43', '62.57', '50.79',
    '32.75', '98.25', '1,741.36', '16.28', '46.39', '18.47', '58.69', '2.13', '7.27', '27.63', '84.19'];
  for (const value of amounts) expect(shown).toContain(value);
  expect(text(filterOptions(page.root)[0])).toBe(`${commissionFilterCopy(code).all}59`);
  visibility.toggle(); await Vue.nextTick();
  for (const value of amounts) expect(publicOutput(page.root)).not.toContain(value);
  expect(filterTrigger(page.root).props['aria-expanded']).toBe(true);
  expect(filterOptions(page.root).map(item => text(item.children.at(-1)!))).toEqual(kinds.map(() => '••••').concat('••••'));
  expect(text(page.root)).toContain(dictionaries[code].directReferral.recoveryPending);
  expect(text(page.root)).toContain(dictionaries[code].commissions.reversedTag);
  expect(text(page.root)).toContain('UVT');
  visibility.toggle(); await Vue.nextTick();
  expect(publicOutput(page.root)).toBe(shown);

  visibility.toggle(); await Vue.nextTick();
  filterOptions(page.root).find(item => item.props['aria-label'] === dictionaries[code].commissions.kind.direct_purchase)!.props.onClick();
  await Vue.nextTick();
  const summary = () => all(page.root).find(item => item.props.class === 'commission-filter-summary')!;
  expect(text(summary())).toContain('$•••• · •••• UVT');
  expect(publicOutput(page.root)).not.toMatch(/321\.56|765\.43|32\.75|98\.25|1,741\.36/);
  visibility.toggle(); await Vue.nextTick();
  expect(text(summary())).toContain('$321.56 · 765.43 UVT');
  expect(page.commission.eventsEvidence).toEqual(before);
  expect(page.commission.refreshCanonicalEvents).toHaveBeenCalledTimes(1);
});

test('B06 entering with privacy enabled preserves zero and unknown asset meanings when shown again', async () => {
  vi.stubGlobal('uni', { getStorageSync: () => true, setStorageSync: vi.fn() });
  const visibility = useDataVisibility(createPinia());
  const page = await commissions('en', visibility); await page.show();
  page.reads[0].resolve([]); await flush();
  page.commission.eventsEvidence = { events: [], totalRows: 0, aggregate: { monthUSDT: 0, totalNEX: 0, unlockedUSDT: 0 } };
  await flush(); await openFilters(page.root);
  expect(publicOutput(page.root)).not.toContain('0.00');
  expect(text(filterOptions(page.root)[0])).toBe(`${commissionFilterCopy('en').all}••••`);
  visibility.toggle(); await Vue.nextTick();
  const hero = all(page.root).find(item => item.props['data-component'] === 'hero')!;
  const lifetime = all(page.root).find(item => item.props.class === 'reward-income-lifetime')!;
  expect(text(hero)).toContain('$0.00— UVT');
  expect(text(lifetime)).toContain('— USD0.00 UVT');
  expect(text(filterOptions(page.root)[0])).toBe(`${commissionFilterCopy('en').all}0`);
  expect(page.commission.eventsEvidence.aggregate.monthNEX).toBeUndefined();
});

for (const [zone, localDate] of [["Asia/Tokyo", "2026-10-12"], ["Asia/Ho_Chi_Minh", "2026-10-11"]]) {
  test.each(["missing Intl", "English fallback", "throws"])(`544 ${zone} %s retains local commission dates across zh/en/vi`, async mode => {
    vi.stubEnv("TZ", zone);
    if (mode === "missing Intl") vi.stubGlobal("Intl", undefined);
    const nativeLocale = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => {
      if (mode === "throws") throw new Error("Android locale formatter unavailable");
      return "Mon Oct 12 2026";
    });
    const page = await commissions("zh"); await page.show();
    const timestamp = Date.parse("2026-10-11T15:30:00Z");
    const originalEvents = kinds.map(kind => ({ ...event(kind), ts: timestamp, sourceRef: `REF-${kind}`, sourceDeviceId: "DEVICE-7" }));
    page.reads[0].resolve(originalEvents); await flush();
    for (const language of ["zh", "en", "vi"] as const) {
      page.locale.value = language; await Vue.nextTick();
      if (language !== 'zh') {
        expect(page.commission.eventsStatus).toBe('loading');
        page.reads.at(-1)!.resolve(originalEvents); await flush();
      }
      const shownDate = language === "zh" ? localDate.replace(/-/g, "/") : language === "vi" ? `${localDate.slice(8)}/${localDate.slice(5, 7)}/${localDate.slice(0, 4)}` : `Oct ${Number(localDate.slice(8))}, 2026`;
      for (const kind of kinds) {
        const copy = dictionaries[language];
        expect(text(page.root)).toContain(`${copy.commissions.kind[kind]} · ${kind === "direct_purchase" ? copy.directReferral.order : copy.directReferral.receipt} REF-${kind} · ${copy.directReferral.device}: DEVICE-7 · ${shownDate}`);
      }
      expect(text(page.root)).not.toMatch(/Mon Oct|Invalid Date|NaN|GMT\+/);
      expect(all(page.root).filter(item => item.props.style?.marginTop === "2px" && item.props.style?.fontSize === "12px")
        .some(item => item.props.style.color === "var(--v5-ink-3)" && text(item).endsWith(shownDate))).toBe(true);
    }
    expect(nativeLocale).not.toHaveBeenCalled();
    expect(originalEvents.map(item => [item.ts, item.amountUSDT, item.amountNEX, item.status]))
      .toEqual(kinds.map(() => [timestamp, 7, 0, "unlocked"]));
  });
}

test.each([NaN, Infinity, -Infinity, 8.64e15 + 1, -8.64e15 - 1, null, undefined, "", "not-a-date"])(
  "544 unknown or invalid commission timestamp %s stays unknown",
  async timestamp => {
    const page = await commissions("zh"); await page.show();
    const records = [{ ...event("direct_purchase"), ts: timestamp as number }];
    page.reads[0].resolve(records); await flush();
    for (const language of ["zh", "en", "vi"] as const) {
      page.locale.value = language; await Vue.nextTick();
      if (language !== 'zh') {
        expect(page.commission.eventsStatus).toBe('loading');
        page.reads.at(-1)!.resolve(records); await flush();
      }
      expect(text(page.root)).toContain(`${dictionaries[language].commissions.kind.direct_purchase} · —`);
      expect(text(page.root)).not.toMatch(/Invalid Date|NaN|1970/);
    }
  },
);

test.each(["en", "zh", "vi"] as const)("commissions %s retains real device source and paired pending recovery fields", async code => {
  const page = await commissions(code); await page.show();
  page.reads[0].resolve([{...event("direct_device_earning"), sourceRef: "EARN-REAL-7", sourceDeviceId: "DEVICE-REAL-7",
    status: "recovery_pending", recoveryPendingUSDT: 1.5, recoveryPendingNEX: 80}]); await flush();
  expect(text(page.root)).toContain("EARN-REAL-7"); expect(text(page.root)).toContain("DEVICE-REAL-7");
  expect(text(page.root)).toContain(dictionaries[code].directReferral.recoveryPending);
  expect(text(page.root)).toContain(fmt(dictionaries[code].directReferral.pendingAmounts, { usdt: "1.50", nex: "80.00" }));
  expect(text(page.root)).not.toContain("+7.00");
});

test.each(["en", "zh", "vi"] as const)("commissions %s idle and pending are loading, never projection failure or zero result", async code => {
  const page = await commissions(code), copy = dictionaries[code];
  for (const phase of ["idle", "loading"]) {
    if (phase === "loading") await page.show();
    expect(page.commission.eventsStatus).toBe(phase);
    expect(text(page.root)).toContain(copy.network.projectionLoadingTitle);
    expect(text(page.root)).not.toContain(copy.network.projectionErrorDesc);
    expect(text(page.root)).not.toContain(copy.empty.commissionsTitle);
    expect(text(page.root)).not.toContain("$0.00");
    expect(buttons(page.root)).toHaveLength(0);
  }
  page.reads[0].resolve([]); await flush();
  expect(text(page.root)).toContain(copy.empty.commissionsTitle);
  expect(text(page.root)).not.toContain(copy.network.projectionLoadingTitle);
});

test("commissions true error keeps its retry; two Rules returns retain Peer, and a fresh visit resets filters", async () => {
  const page = await commissions(); await page.show();
  page.reads[0].reject(new Error("isolated failed read")); await flush();
  expect(text(page.root)).toContain(en.network.projectionErrorTitle);
  expect(text(page.root)).toContain(en.network.projectionErrorDesc);
  expect(text(buttons(page.root)[0])).toBe(en.network.retry);
  buttons(page.root)[0].props.onClick(); await flush();
  expect(text(page.root)).toContain(en.network.projectionLoadingTitle);
  expect(buttons(page.root)).toHaveLength(0);
  page.reads[1].resolve([event("peer"), event("binary")]); await flush();
  await selectFilter(page.root, en.commissions.kind.peer);
  for (let returnNumber = 0; returnNumber < 2; returnNumber++) {
    all(page.root).find(item => item.props.role === "link")!.props.onClick();
    expect(page.navTo).toHaveBeenLastCalledWith("/pages/team/commissions-how");
    await page.show();
    expect(text(page.root)).not.toContain(en.network.projectionLoadingTitle);
    expect(text(page.root)).not.toContain(en.network.projectionErrorDesc);
    page.reads[2 + returnNumber].resolve([event("peer"), event("binary")]); await flush();
    expect(text(page.root)).toContain("Event peer"); expect(text(page.root)).not.toContain("Event binary");
    expect(text(filterTrigger(page.root))).toBe(commissionFilterCopy('en').kinds.peer);
  }
  const fresh = await commissions(); await fresh.show(); fresh.reads[0].resolve([event("peer"), event("binary")]); await flush();
  expect(text(fresh.root)).toContain("Event peer"); expect(text(fresh.root)).toContain("Event binary");
  expect(text(filterTrigger(fresh.root))).toBe(commissionFilterCopy('en').all);
  await openFilters(fresh.root);
  expect(filterOptions(fresh.root).filter(item => item.props['aria-pressed']).map(item => item.props['aria-label']))
    .toEqual([en.commissions.all]);
});

test.each(["en", "zh", "vi"] as const)("guide %s pending has one loading notice; ready keeps actual missing rules and disabled payouts", async code => {
  const page = await guide(code), copy = buildCommissionsHowContent(null, code).copy;
  for (let showNumber = 0; showNumber < 2; showNumber++) {
    await page.show();
    expect(text(page.root).split(copy.loading)).toHaveLength(2);
    expect(text(page.root)).not.toContain(copy.unavailable);
    expect(text(page.root)).not.toContain(copy.missing);
    expect(all(page.root).some(item => item.props["data-component"] === "hero" || item.props["data-component"] === "section")).toBe(false);
    expect(buttons(page.root).map(text)).toEqual([networkReauditCopy(code).backCommissions]);
  }
  expect(page.published).toHaveBeenCalledOnce(); // Same-locale pending reads stay deduplicated.
  page.reads[0].resolve(guideSnapshot()); await flush();
  expect(text(page.root)).not.toContain(copy.loading); expect(text(page.root)).not.toContain(copy.unavailable);
  expect(all(page.root).filter(item => item.props["data-component"] === "section")).toHaveLength(6);
  expect(text(page.root)).toContain(copy.missing); expect(text(page.root)).toContain(copy.hold);
  expect(text(page.root)).toContain(copy.unsupported); expect(text(page.root)).toContain(copy.notOpen);
  expect(text(page.root)).toContain(copy.noTotal);
  buttons(page.root).at(-1)!.props.onClick(); expect(page.navBack).toHaveBeenCalledExactlyOnceWith("/pages/team/commissions");
});

test("guide failed read shows one real error and keyboard Retry, then replaces it with fresh rules", async () => {
  const page = await guide(); await page.show();
  const copy = buildCommissionsHowContent(null, "en").copy;
  page.reads[0].reject(new Error("isolated failed guide")); await flush();
  expect(text(page.root).split(copy.unavailable)).toHaveLength(2);
  expect(buttons(page.root).at(-1) && text(buttons(page.root).at(-1)!)).toBe(networkReauditCopy('en').backCommissions);
  expect(all(page.root).some(item => item.props["data-component"] === "section")).toBe(false);
  const retry = buttons(page.root).find(item => text(item) === copy.retry)!;
  expect(retry.props.tabindex).toBe("0");
  const preventDefault = vi.fn();
  for (const handler of [retry.props.onKeydown].flat()) handler({ key: "Enter", preventDefault });
  await flush();
  expect(preventDefault).toHaveBeenCalled(); expect(page.published).toHaveBeenCalledTimes(2);
  expect(text(page.root)).toContain(copy.loading); expect(text(page.root)).not.toContain(copy.unavailable);
  page.reads[1].resolve(guideSnapshot()); await flush();
  expect(text(page.root)).toContain("Published overview"); expect(text(page.root)).not.toContain(copy.retry);
});

test.each(['zh', 'en', 'vi'] as const)('guide %s completes cold loading after startup finishes binding the account scope', async language => {
  const page = await guide(language); await page.show();
  const prior = page.reads[0];
  page.rebind(); await flush();
  prior.resolve(guideSnapshot()); await flush();
  expect(text(page.root)).not.toContain('Published overview');
  page.reads.at(-1)!.resolve(guideSnapshot()); await flush();
  expect(text(page.root)).toContain('Published overview');
  expect(text(page.root)).not.toContain(buildCommissionsHowContent(null, language).copy.loading);
});

test("guide refresh retains prior published rules while pending and preserves incomplete-read warnings", async () => {
  const page = await guide(); await page.show(); page.reads[0].resolve(guideSnapshot()); await flush();
  expect(text(page.root)).toContain("Published overview");
  await page.show();
  expect(text(page.root)).toContain("Published overview");
  expect(text(page.root)).not.toContain(buildCommissionsHowContent(null, "en").copy.unavailable);
  const incomplete = guideSnapshot(); incomplete.document.blocks = incomplete.document.blocks.filter(block => block.id !== "overview");
  page.reads[1].resolve(incomplete); await flush();
  const copy = buildCommissionsHowContent(incomplete, "en").copy;
  expect(text(page.root)).toContain(copy.unavailable);
  expect(text(buttons(page.root).at(-1)!)).toBe(networkReauditCopy('en').backCommissions);
  expect(buttons(page.root).some(item => text(item) === copy.retry)).toBe(true);
  expect(all(page.root).some(item => item.props["data-component"] === "hero" || item.props["data-component"] === "section")).toBe(false);
  expect(text(page.root)).not.toContain("13 USDT"); // Incomplete published context still suppresses amounts.
});


test.each(["en", "zh", "vi"] as const)("577 %s promotion and other filters preserve rewards without showing them as genesis", async code => {
  const page = await commissions(code); await page.show();
  const promotion = {...event("promotion"), id:"CM-389", amountUSDT:100, amountNEX:50,
    orderId:"PROMOTION-1", status:"cooling" as const, unlockAt:1793863394000};
  const other = {...event("other"), id:"CM-900", amountUSDT:3, amountNEX:0};
  page.reads[0].resolve([promotion, other, event("genesis")]); await flush();
  for (const kind of ["promotion", "other", "genesis"] as const) {
    await selectFilter(page.root, dictionaries[code].commissions.kind[kind]);
    expect(text(page.root)).toContain(`Event ${kind}`);
    for (const excluded of ["promotion", "other", "genesis"].filter(item => item !== kind))
      expect(text(page.root)).not.toContain(`Event ${excluded}`);
    expect(text(filterTrigger(page.root))).toBe(commissionFilterCopy(code).kinds[kind]);
  }
  expect(promotion).toMatchObject({id:"CM-389",amountUSDT:100,amountNEX:50,orderId:"PROMOTION-1",status:"cooling",unlockAt:1793863394000});
});


test.each(['en', 'zh', 'vi'] as const)('T1 %s filter keeps pagination reachable until matching records have loaded', async language => {
  const page = await commissions(language); await page.show();
  page.reads[0].resolve(Array.from({ length: 20 }, (_, i) => ({ ...event('direct_purchase'), id: `first-${i}` }))); await flush();
  const copy = dictionaries[language];
  page.commission.eventsTotalRows = 21; page.commission.eventsEvidence!.totalRows = 21;
  page.commission.byKind = () => Object.fromEntries(kinds.map(kind => [kind, { usdt: kind === 'leadership' ? 1 : 0, nex: 0, count: kind === 'leadership' ? 1 : 20 }]));
  page.commission.eventsEvidence!.aggregate.byKind = page.commission.byKind() as TeamCommissionSnapshot["aggregate"]["byKind"];
  await flush();
  await openFilters(page.root);
  const option = (label: string) => filterOptions(page.root).find(item => item.props['aria-label'] === label)!;
  expect(text(option(copy.commissions.all))).toBe(`${commissionFilterCopy(language).all}21`);
  option(copy.commissions.kind.leadership).props.onClick(); await flush();
  expect(filterOptions(page.root)).toHaveLength(0);
  expect(text(page.root)).not.toContain(copy.empty.filterTitle);
  expect(text(page.root)).not.toContain('Event leadership');
  const nextReads: Array<ReturnType<typeof deferred<CommissionEvent[]>>> = [];
  page.commission.loadMoreCanonicalEvents.mockImplementation(async () => {
    page.commission.eventsLoadMoreStatus = 'loading';
    const read = deferred<CommissionEvent[]>(); nextReads.push(read);
    try { page.commission.events.push(...await read.promise); page.commission.eventsLoadMoreStatus = 'idle'; }
    catch { page.commission.eventsLoadMoreStatus = 'error'; }
  });
  const load = buttons(page.root).find(n => text(n) === copy.unilevel.loadMore)!;
  expect(load).toBeDefined();
  load.props.onClick(); load.props.onClick(); await flush();
  expect(page.commission.loadMoreCanonicalEvents).toHaveBeenCalledTimes(1);
  expect(load.props['aria-busy']).toBe(true);
  nextReads[0].reject(new Error('page unavailable')); await flush();
  expect(text(page.root)).not.toContain(copy.empty.filterTitle);
  buttons(page.root).find(n => text(n) === copy.network.retry)!.props.onClick(); await flush();
  nextReads[1].resolve([{ ...event('leadership'), sourceUserName: 'Audit20', amountUSDT: 1 }]); await flush();
  expect(text(page.root)).toContain('Audit20');
  expect(text(page.root)).toContain('+$1.00');
  expect(buttons(page.root).some(n => text(n) === copy.unilevel.loadMore)).toBe(false);
  expect(text(filterTrigger(page.root))).toBe(commissionFilterCopy(language).kinds.leadership);
  await openFilters(page.root);
  expect(option(copy.commissions.kind.leadership).props['aria-pressed']).toBe(true);
  option(copy.commissions.kind.promotion).props.onClick(); await flush();
  expect(filterOptions(page.root)).toHaveLength(0);
  expect(text(page.root)).toContain(copy.empty.filterTitle);
});

test.each(['en', 'zh', 'vi'] as const)('T6 %s monthly and lifetime summaries keep independent USD and UVT aggregates', async language => {
  const page = await commissions(language); await page.show(); page.reads[0].resolve([]); await flush();
  page.commission.eventsEvidence = { ...page.commission.eventsEvidence, aggregate: { monthUSDT: 250, monthNEX: 40, totalUSDT: 1250, totalNEX: 70 } };
  await flush();
  const hero = all(page.root).find(n => n.props['data-component'] === 'hero')!;
  const lifetime = all(page.root).find(n => String(n.props.class).split(' ').includes('reward-income-lifetime'))!;
  expect(text(hero)).toContain('$250.0040.00 UVT');
  expect(text(lifetime)).toContain('$1250.0070.00 UVT');
  page.commission.eventsEvidence = { ...page.commission.eventsEvidence, aggregate: { monthUSDT: 0, monthNEX: 0, totalUSDT: 0, totalNEX: 0 } }; await flush();
  expect(text(hero)).toContain('$0.000.00 UVT');
  page.commission.eventsEvidence = { ...page.commission.eventsEvidence, aggregate: { monthUSDT: 250, totalUSDT: 1250 } }; await flush();
  expect(text(hero)).toContain('$250.00— UVT');
  expect(text(lifetime)).toContain('$1250.00— UVT');
});
