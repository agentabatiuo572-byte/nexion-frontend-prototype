import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { formatHowNumber } from "@/lib/rank-how-content";
import { buildCommissionsHowContent, createCommissionsHowResource, COMMISSIONS_HOW_SLOTS, type CommissionsHowSnapshot } from "@/lib/commissions-how-content";

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
export const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
export const text = (root: Host): string => root.text + root.children.map(text).join("");
const unmounts: Array<() => void> = [];
const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
const header = Vue.defineComponent({ props: ["actionLabel", "action"], setup: props => () => Vue.h("view", [
  props.actionLabel ? Vue.h("view", { role: "button", onClick: props.action }, String(props.actionLabel)) : null,
]) });
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
    "@/components/sub-page-header.vue": { default: header },
    "@/components/empty-state.vue": { default: emptyState },
    "@/components/glass-segments.vue": { default: segments },
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
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); await Vue.nextTick(); }

import directSource from "./unilevel.vue?raw";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
export const dictionaries = { en, zh, vi: vietnamese };
export const policyFixture = () => ({ configured: true, policyVersion: 3, effectiveAt: "2026-10-01T00:00:00Z", nexUsdtPrice: .01,
  purchase: { enabled: true, totalRatePct: 12.3456, usdtSharePct: 60, coolingDays: 7 },
  deviceEarning: { enabled: true, totalRatePct: 5, usdtSharePct: 70, coolingDays: 0 } });
export const eventFixture = (id = "one", kind = "direct_purchase") => ({ id, kind, sourceUserName: "Member " + id, sourceRef: "REF-" + id,
  sourceDeviceId: kind === "direct_device_earning" ? "DEVICE" : null, policyVersion: 3, basisUsdt: 1000, nexUsdtPrice: .01,
  amountUSDT: 60, amountNEX: 4000, ts: 1790812800000, unlockAt: 1790812800000, status: "unlocked", recoveryPendingUSDT: 0, recoveryPendingNEX: 0 });
export const snapshotFixture = (events = [eventFixture()]) => ({ period: "month", page: 1, pageSize: 20, totalRows: events.length, events,
  split: { purchase: { amountUSDT: 60, amountNEX: 4000, count: 1 }, deviceEarning: { amountUSDT: .3, amountNEX: 20, count: 1 } },
  generatedAt: "2026-10-05T00:00:00Z", snapshotAt: "2026-10-05T00:00:00Z" });
export async function directPage(options: { locale?: keyof typeof dictionaries; ready?: boolean; api?: { snapshot: any; policy: any }; purchaseApi?: { unilevel: any } } = {}) {
  const ready = options.ready !== false;
  const app = Vue.reactive({ accountKey: ready ? "user:607" : "default", accountBindingEpoch: 1 });
  const auth = Vue.reactive({ isAuthenticated: ready, accountId: ready ? "user:607" : "default" });
  const locale = Vue.ref(options.locale ?? "en");
  let runtimeEpoch = 1;
  const runtimeCallbacks: Array<() => void> = [];
  const api = options.api ?? { snapshot: vi.fn().mockResolvedValue(snapshotFixture()), policy: vi.fn().mockResolvedValue(policyFixture()) };
  const purchaseApi = options.purchaseApi ?? { unilevel: async (...args: any[]) => {
    const source = await api.snapshot(...args.slice(0, 4));
    const events = source.events.filter((event: any) => event.kind === "direct_purchase").map((event: any) => ({ ...event, layer: 1, orderId: event.sourceRef }));
    return { ...source, events, totalRows: source.events.length === 0 ? 0 : source.totalRows,
      split: { direct: source.split.purchase, extended: { amountUSDT: 0, amountNEX: 0, count: 0 } } };
  } };
  const navTo = vi.fn();
  const page = await mount(directSource, {
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.value]) },
    "@/i18n/format": { fmt, dateLocale: () => locale.value === "vi" ? "vi-VN" : locale.value === "zh" ? "zh-CN" : "en-US" },
    "@/store/app": { useApp: () => app }, "@/store/auth": { useAuth: () => auth },
    "@/api/direct-referral-api": { createDirectReferralApi: () => api },
    "@/api/team-insights-api": { createTeamInsightsApi: () => purchaseApi },
    "@/api/runtime": { apiClient: {}, expectedApiEnvironment: "prod", remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: Number(app.accountKey.split(":")[1] || 607) } }) } },
    "@/lib/binary-session-ready": { binarySessionReady }, "@/lib/binary-read-coalescer": { createScopedReadCoalescer },
    "@/lib/account-scope": { captureAccountScope: () => app.accountBindingEpoch, isCurrentAccountScope: (epoch: number) => epoch === app.accountBindingEpoch },
    "@/api/order-api": { captureRuntimeRevision: () => ({ epoch: runtimeEpoch, runId: null }), isCurrentRuntimeRevision: (scope: { epoch: number }) => scope.epoch === runtimeEpoch,
      subscribeRuntimeRevision: (fn: () => void) => { runtimeCallbacks.push(fn); return () => {}; } },
    "@/lib/route": { navTo },
  });
  return { ...page, app, auth, api, purchaseApi, locale, navTo, revision: () => { runtimeEpoch++; runtimeCallbacks.forEach(fn => fn()); } };
}
export const click = async (root: Host, label: string) => {
  const target = all(root).find(item => item.props.onClick && text(item) === label);
  if (!target) throw new Error("Control missing: " + label);
  target.props.onClick(); await flush();
};
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); });
