import * as Vue from "vue";
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
import { buildCommissionsHowContent, createCommissionsHowResource, COMMISSIONS_HOW_SLOTS, type CommissionsHowSnapshot } from "@/lib/commissions-how-content";
import type { CommissionEvent, CommissionKind } from "@/store/commission";

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
    ...(slots.default?.() ?? []),
  ]),
});
const emptyState = Vue.defineComponent({
  props: ["title", "desc", "ctaLabel", "kind"], emits: ["cta"],
  setup: (props, { emit }) => () => Vue.h("view", { "data-empty-kind": props.kind }, [
    Vue.h("text", String(props.title)), props.desc ? Vue.h("text", String(props.desc)) : null,
    props.ctaLabel ? Vue.h("view", { role: "button", onClick: () => emit("cta") }, String(props.ctaLabel)) : null,
  ]),
});
const segments = Vue.defineComponent({
  props: ["modelValue", "options"], emits: ["update:modelValue"],
  setup: (props, { emit }) => () => Vue.h("view", { role: "tablist" },
    props.options.map((item: { value: string; label: string }) => Vue.h("view", {
      role: "tab", "aria-selected": item.value === props.modelValue,
      onClick: () => emit("update:modelValue", item.value),
    }, item.label))),
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
    vue: Vue, "@dcloudio/uni-app": { onShow: (callback: () => void) => shows.push(callback) },
    "@/components/app-chassis.vue": { default: slot },
    "@/components/sub-page-header.vue": { default: slot },
    "@/components/empty-state.vue": { default: emptyState },
    "@/components/glass-segments.vue": { default: segments },
    ...Object.fromEntries(["hero", "section", "icon-row", "callout-box", "faq-row"].map(name => [
      `@/components/how/how-${name}.vue`, { default: copyComponent(name) },
    ])),
    "@/i18n/format": { fmt, dateLocale: () => "en-US" },
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
const kinds: CommissionKind[] = ["unilevel", "binary", "peer", "cultivation", "leadership", "genesis"];
const event = (kind: CommissionKind): CommissionEvent => ({
  id: `fixture-${kind}`, kind, sourceUserName: `Event ${kind}`, amountUSDT: 7, amountNEX: 0,
  ts: 1790812800000, unlockAt: 1790812800000, status: "unlocked",
});
async function commissions(code: Locale = "en") {
  const commission = Vue.reactive({
    eventsStatus: "idle", events: [] as CommissionEvent[], eventsEvidence: null, eventsTotalRows: 0,
    eventsLoadMoreStatus: "idle", unlockMatured: vi.fn(), loadMoreCanonicalEvents: vi.fn(),
    unlockedUSDT: () => 0, unlockedNEX: () => 0, coolingUSDT: () => 0, monthUSDT: () => 0, totalUSDTLifetime: () => 0,
    byKind: () => Object.fromEntries(kinds.map(kind => [kind, { usdt: 0, nex: 0, count: 0 }])),
    refreshCanonicalEvents: vi.fn(async () => {}),
  });
  const reads: Array<ReturnType<typeof deferred<CommissionEvent[]>>> = [];
  commission.refreshCanonicalEvents.mockImplementation(async () => {
    commission.eventsStatus = "loading"; commission.events = [];
    const read = deferred<CommissionEvent[]>(); reads.push(read);
    try { commission.events = await read.promise; commission.eventsStatus = "ready"; }
    catch { commission.eventsStatus = "error"; }
  });
  const navTo = vi.fn();
  const page = await mount(commissionsSource, {
    "@/store/commission": { useCommission: () => commission }, "@/api/runtime": { remoteApiEnabled: true },
    "@/i18n/use-t": { useT: () => Vue.ref(dictionaries[code]) }, "@/lib/route": { navTo },
  });
  return { ...page, commission, reads, navTo };
}
function guideSnapshot(): CommissionsHowSnapshot {
  const bodies: Record<string, string> = {
    network: "{networkRates} {networkGate}", binary: "{binaryRules}", cooling: "{coolingDays}",
    peer: "{peerRules} {peerStatus}", genesis: "{genesisStatus}", leadership: "{leadershipRules}",
  };
  return {
    document: { contentKey: "team-commissions-how", version: "fixture-current", versionSource: "ENTRY", status: "PUBLISHED",
      source: "server", sourceEnvironment: "PRODUCTION", runId: "", locale: "en",
      blocks: COMMISSIONS_HOW_SLOTS.map(id => ({ id, kind: "text", title: `Published ${id}`, body: bodies[id] ?? `Body ${id}` })) },
    rates: { unilevelUsdt: { 1: .13 }, unilevelNex: { 1: 2 } },
    guide: { source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null,
      coolingDays: null, network: { depthGateLayer: 5, depthGateRank: 4, exitCapRate: null },
      binary: null, leadership: null, capabilities: { peer: false, genesis: false } }, ranks: [],
  };
}
async function guide(code: Locale = "en") {
  const locale = Vue.reactive({ code });
  const reads: Array<ReturnType<typeof deferred<CommissionsHowSnapshot>>> = [];
  let current: ReturnType<typeof deferred<CommissionsHowSnapshot>>;
  const published = vi.fn(() => {
    current = deferred<CommissionsHowSnapshot>(); reads.push(current);
    return current.promise.then(facts => facts.document);
  });
  const navBack = vi.fn();
  const page = await mount(guideSource, {
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.code]) },
    "@/store/locale": { useLocaleStore: () => locale }, "@/lib/route": { navBack },
    "@/api/runtime": { apiClient: {}, expectedApiEnvironment: "PRODUCTION", howContentApi: { published },
      vRankApi: { ladder: () => current.promise.then(facts => ({ ranks: facts.ranks })) } },
    "@/api/commission-guide-api": { createCommissionGuideApi: () => ({
      rates: () => current.promise.then(facts => facts.rates), read: () => current.promise.then(facts => facts.guide),
    }) },
  });
  return { ...page, locale, reads, published, navBack };
}
const buttons = (root: Host) => all(root).filter(item => item.props.role === "button");
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); });

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
  const peer = all(page.root).find(item => item.props.role === "radio" && String(item.props["aria-label"]).startsWith(en.commissions.kind.peer))!;
  peer.props.onClick(); await Vue.nextTick();
  for (let returnNumber = 0; returnNumber < 2; returnNumber++) {
    all(page.root).find(item => item.props.role === "link")!.props.onClick();
    expect(page.navTo).toHaveBeenLastCalledWith("/pages/team/commissions-how");
    await page.show();
    expect(text(page.root)).toContain(en.network.projectionLoadingTitle);
    expect(text(page.root)).not.toContain(en.network.projectionErrorDesc);
    page.reads[2 + returnNumber].resolve([event("peer"), event("binary")]); await flush();
    expect(text(page.root)).toContain("Event peer"); expect(text(page.root)).not.toContain("Event binary");
    expect(all(page.root).filter(item => item.props.role === "tab" && item.props["aria-selected"]).map(text)).toEqual([en.commissions.kind.peer]);
  }
  const fresh = await commissions(); await fresh.show(); fresh.reads[0].resolve([event("peer"), event("binary")]); await flush();
  expect(text(fresh.root)).toContain("Event peer"); expect(text(fresh.root)).toContain("Event binary");
  expect(all(fresh.root).filter(item => item.props.role === "tab" && item.props["aria-selected"]).map(text)).toEqual([en.commissions.all]);
});

test.each(["en", "zh", "vi"] as const)("guide %s pending has one loading notice; ready keeps actual missing rules and disabled payouts", async code => {
  const page = await guide(code), copy = buildCommissionsHowContent(null, code).copy;
  for (let showNumber = 0; showNumber < 2; showNumber++) {
    await page.show();
    expect(text(page.root).split(copy.loading)).toHaveLength(2);
    expect(text(page.root)).not.toContain(copy.unavailable);
    expect(text(page.root)).not.toContain(copy.missing);
    expect(all(page.root).some(item => item.props["data-component"] === "hero" || item.props["data-component"] === "section")).toBe(false);
    expect(buttons(page.root).map(text)).toEqual([dictionaries[code].commissionsHowItWorks.ctaBack]);
  }
  expect(page.published).toHaveBeenCalledOnce(); // Same-locale pending reads stay deduplicated.
  page.reads[0].resolve(guideSnapshot()); await flush();
  expect(text(page.root)).not.toContain(copy.loading); expect(text(page.root)).not.toContain(copy.unavailable);
  expect(all(page.root).filter(item => item.props["data-component"] === "section")).toHaveLength(5);
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

test("guide refresh hides prior published rules while pending and preserves incomplete-read warnings", async () => {
  const page = await guide(); await page.show(); page.reads[0].resolve(guideSnapshot()); await flush();
  expect(text(page.root)).toContain("Published overview");
  await page.show();
  expect(text(page.root)).not.toContain("Published overview");
  expect(text(page.root)).not.toContain(buildCommissionsHowContent(null, "en").copy.unavailable);
  const incomplete = guideSnapshot(); incomplete.document.blocks = incomplete.document.blocks.filter(block => block.id !== "overview");
  page.reads[1].resolve(incomplete); await flush();
  const copy = buildCommissionsHowContent(incomplete, "en").copy;
  expect(text(page.root)).toContain(copy.unavailable);
  expect(buttons(page.root).some(item => text(item) === copy.retry)).toBe(true);
  expect(text(page.root)).toContain(copy.missing); expect(text(page.root)).toContain(copy.unsupported);
  expect(text(page.root)).not.toContain("13 USDT"); // Incomplete published context still suppresses amounts.
});
