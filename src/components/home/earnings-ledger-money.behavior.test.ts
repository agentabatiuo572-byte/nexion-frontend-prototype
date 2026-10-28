import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./earnings-ledger-card.vue?raw";
import { formatUsd } from "@/lib/usd-display";
import { formatHomeFeedTime } from "./home-live-feed";
import type { AppHomeEarningsLedgerRow } from "@/api/app-home-api";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const descriptor = parse(source).descriptor;
const script = compileScript(descriptor, { id: "ledger-money-behavior" });
const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
}).code)(Vue);
const scopes: Vue.EffectScope[] = [];
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));
const row = (id: string, rewardUsdt: number, synthetic = false): AppHomeEarningsLedgerRow => ({
  id, client: "Client", model: "Model", rewardUsdt, synthetic, completedAt: `2030-01-01T00:00:0${id}Z`,
});

function mount(ledger: AppHomeEarningsLedgerRow[] | null, copy = zh, remoteApiEnabled = true) {
  const app = Vue.reactive({ homeTruth: ledger === null ? null : { earningsLedger: ledger, earningsLedgerMode: "SETTLED" },
    homeTruthStatus: "ready", refreshHomeTruth: vi.fn() });
  const navTo = vi.fn();
  const modules: Record<string, unknown> = {
    '@/store/data-visibility': { useDataVisibility: () => ({ hidden: false, mask: String }) },
    "@/store/locale": { useLocaleStore: () => ({ code: copy === zh ? "zh" : copy === vietnamese ? "vi" : "en" }) },
    vue: Vue, "@/lib/usd-display": { formatUsd }, "./home-live-feed": { formatHomeFeedTime },
    "@/lib/route": { navTo }, "@/i18n/use-t": { useT: () => Vue.ref(copy) },
    "@/api/runtime": { remoteApiEnabled }, "@/store/app": { useApp: () => app },
  };
  const output: any = {};
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected ledger import: ${id}`);
    return modules[id];
  }, output);
  const scope = Vue.effectScope(); scopes.push(scope);
  const state = scope.run(() => output.default.setup({}, { expose() {} }));
  return { app, state, navTo, html: () => renderToString(Vue.createSSRApp({ render, setup: () => ({ ...state }) })) };
}

it.each([en, zh, vietnamese])("renders real remote micro-earnings at detail precision without changing ledger values", async copy => {
  const ledger = [row("1", 0.00032), row("2", 0.00005), row("3", 1234.56789)];
  const original = JSON.stringify(ledger), page = mount(ledger, copy);
  expect(page.state.rows.value.map((item: { id: string; amt: string }) => [item.id, item.amt])).toEqual([
    ["3", "+$1,234.5679"], ["2", "+<$0.0001"], ["1", "+$0.0003"],
  ]);
  const html = await page.html();
  expect(html).toContain("+$1,234.5679");
  expect(html).toContain("+&lt;$0.0001");
  expect(html).toContain("+$0.0003");
  expect(html).not.toContain("+$0.00</text>");
  expect(JSON.stringify(ledger)).toBe(original);
  expect(page.app.homeTruth?.earningsLedger).toEqual(ledger);
});

it("preserves the synthetic sign rule and renders exact zero without a negative sign", () => {
  const page = mount([row("1", 0), row("2", -0), row("3", 0.00032, true)]);
  expect(page.state.rows.value.map((item: { amt: string }) => item.amt)).toEqual(["$0.0003", "$0.00", "$0.00"]);
});

it("keeps sorting and the five-row limit display-only", () => {
  const ledger = [row("1", 1), row("3", 3), row("2", 2), row("6", 6), row("5", 5), row("4", 4)];
  const original = JSON.stringify(ledger), page = mount(ledger);
  expect(page.state.rows.value.map((item: { id: string }) => item.id)).toEqual(["6", "5", "4", "3", "2"]);
  expect(JSON.stringify(ledger)).toBe(original);
});

it("retains micro-earnings with the stale label after failure and uses the existing retry/navigation paths", async () => {
  const page = mount([row("1", 0.00032)]);
  page.app.homeTruthStatus = "error";
  const html = await page.html();
  expect(html).toContain(zh.home.networkStale);
  expect(html).toContain("+$0.0003");
  page.state.retryHome();
  expect(page.app.refreshHomeTruth).toHaveBeenCalledExactlyOnceWith();
  page.state.goAll();
  expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/wallet-bills");
});

it("does not invent zero rows for an unavailable ledger", async () => {
  const page = mount(null); page.app.homeTruthStatus = "error";
  expect(page.state.rows.value).toEqual([]);
  const html = await page.html();
  expect(html).toContain(zh.uiChrome.unavailable);
  expect(html).not.toContain("$0.00");
});

it("uses the same detail rule for local display samples", () => {
  const page = mount(null, zh, false);
  expect(page.state.rows.value.map((item: { amt: string }) => item.amt)).toEqual([
    "+$0.0003", "+<$0.0001", "+$0.0002", "+$0.0005", "+<$0.0001",
  ]);
});
