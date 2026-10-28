import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import activitySource from "./live-feed-card.vue?raw";
import ledgerSource from "./earnings-ledger-card.vue?raw";
import * as feed from "./home-live-feed";
import { formatAmount } from "@/lib/amount-display";
import { formatUsd } from "@/lib/usd-display";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

const dictionaries = { zh, en, vi: vietnamese };
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function page(source: string, language: keyof typeof dictionaries) {
  const locale = Vue.reactive({ code: language });
  const ledger = [
    { id: "before-year", model: "Model A", client: "Client A", rewardUsdt: 0.00032, synthetic: false, completedAt: "2025-12-31T14:59:00Z" },
    { id: "after-year", model: "Model B", client: "Client B", rewardUsdt: 0.00005, synthetic: false, completedAt: "2025-12-31T15:05:00Z" },
  ];
  const original = JSON.stringify(ledger);
  const app = Vue.reactive({ homeTruth: { earningsLedger: ledger, earningsLedgerMode: "SETTLED" }, homeTruthStatus: "ready", refreshHomeTruth: vi.fn() });
  const descriptor = parse(source).descriptor;
  const code = ts.transpileModule(compileScript(descriptor, { id: "home-history-date" }).content,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const render = new Function("Vue", compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag) }).code)(Vue);
  const segments = { render: () => null };
  const imports: Record<string, unknown> = {
    '@/store/data-visibility': { useDataVisibility: () => ({ hidden: false, mask: String }) },
    vue: Vue, "./home-live-feed": feed, "@/lib/amount-display": { formatAmount }, "@/lib/usd-display": { formatUsd },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.code]) }, "@/store/locale": { useLocaleStore: () => locale },
    "@/store/app": { useApp: () => app }, "@/api/runtime": { remoteApiEnabled: true },
    "@/lib/route": { navTo: vi.fn() }, "@/components/glass-segments.vue": { default: segments },
  };
  const exports = {} as { default: { setup: (props: object, context: object) => any } };
  new Function("require", "exports", code)((id: string) => imports[id], exports);
  const scope = Vue.effectScope(); cleanups.push(() => scope.stop());
  const state = scope.run(() => exports.default.setup({}, { expose() {} }));
  return { locale, app, original, html: (tab = "activity") => {
    if (state.tab) state.tab.value = tab;
    const component = Vue.createSSRApp({ render, setup: () => ({ ...state }) });
    component.component("GlassSegments", segments);
    return renderToString(component);
  } };
}

it.each([
  ["zh", "2025/12/31 23:59", "2026/01/01 00:05"],
  ["en", "Dec 31, 2025 23:59", "Jan 1, 2026 00:05"],
  ["vi", "31/12/2025 23:59", "01/01/2026 00:05"],
] as const)("renders full year/day/minutes in actual %s activity, earnings and ledger consumers", async (language, older, newer) => {
  vi.stubEnv("TZ", "Asia/Tokyo"); expect(new Date("2025-12-31T15:05:00Z").getTimezoneOffset()).toBe(-540);
  vi.stubGlobal("Intl", undefined);
  const activity = page(activitySource, language), ledger = page(ledgerSource, language);
  for (const html of [await activity.html(), await activity.html("earnings"), await ledger.html()]) {
    expect(html).toContain(older); expect(html).toContain(newer);
  }
  expect(JSON.stringify(activity.app.homeTruth.earningsLedger)).toBe(activity.original);
  expect(JSON.stringify(ledger.app.homeTruth.earningsLedger)).toBe(ledger.original);
  expect(activity.app.refreshHomeTruth).not.toHaveBeenCalled();
});

it("updates both consumers when language changes without refetching or changing settlement facts", async () => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  for (const source of [activitySource, ledgerSource]) {
    const p = page(source, "zh"); expect(await p.html()).toContain("2026/01/01 00:05");
    p.locale.code = "en"; expect(await p.html()).toContain("Jan 1, 2026 00:05");
    p.locale.code = "vi"; expect(await p.html()).toContain("01/01/2026 00:05");
    expect(JSON.stringify(p.app.homeTruth.earningsLedger)).toBe(p.original);
    expect(p.app.refreshHomeTruth).not.toHaveBeenCalled();
  }
});
