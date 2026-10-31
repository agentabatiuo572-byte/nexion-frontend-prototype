// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { baseParse, compile } from "@vue/compiler-dom";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { homeEarningsSubtitle } from "./home/home-real-copy";
import { fmt } from "@/i18n/format";

function source(path: string) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
function fragment(path: string, marker: string) {
  const template = parse(source(path)).descriptor.template!.content;
  let found = "";
  function visit(node: any) {
    if (node.type === 1 && node.loc.source.slice(0, node.loc.source.indexOf(">") + 1).includes(marker)) {
      found ||= node.loc.source;
    }
    node.children?.forEach(visit);
  }
  visit(baseParse(template));
  if (!found) throw new Error(`${path}: ${marker}`);
  // Standalone branches keep the production expression, without unrelated siblings.
  return found.replace(/v-else-if=/, "v-if=");
}
async function html(path: string, marker: string, state: Record<string, unknown>) {
  return renderTemplate(fragment(path, marker), state);
}
async function renderTemplate(template: string, state: Record<string, unknown>) {
  const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true }).code)(Vue);
  const app = Vue.createSSRApp({ render, setup: () => state });
  const exports = {} as { default: Vue.Component };
  const descriptor = parse(source("components/ui/nx-button.vue")).descriptor;
  const button = ts.transpileModule(compileScript(descriptor, { id: "static-read-button", inlineTemplate: true }).content,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", button)((id: string) => id === "vue" ? Vue : { default: { render: () => null } }, exports);
  app.component("NxButton", exports.default);
  app.component("LiquidGlass", { render: () => null });
  return (await renderToString(app)).replace(/&#39;/g, "'");
}
function computedValue(path: string, name: string, deps: Record<string, unknown>) {
  const script = parse(source(path)).descriptor.scriptSetup!.content;
  const ast = ts.createSourceFile("consumer.ts", script, ts.ScriptTarget.Latest, true);
  let statement = "";
  for (const item of ast.statements) if (ts.isVariableStatement(item)
    && item.declarationList.declarations.some(d => d.name.getText(ast) === name)) statement = item.getText(ast);
  if (!statement) throw new Error(name);
  return new Function(...Object.keys(deps), ts.transpileModule(`${statement};return ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(deps));
}

describe.each([["zh", zh], ["en", en], ["vi", vi]] as const)("silent retained warm presentation %s", (_locale, t) => {
  it("keeps earnings subtitle, while cold reads and genuine errors stay explicit", async () => {
    const path = "components/home/tech-money-card.vue", marker = 'class="earnings-feedback"';
    const state = { t, remoteApiEnabled: true, retrying: true, app: { homeTruthStatus: "loading", homeTruth: {} }, earningsSubtitle: "3 completed jobs", retryEarnings() {} };
    const warm = await html(path, marker, state);
    expect(warm).toContain("3 completed jobs"); expect(warm).not.toContain(t.home.techEarningsLoading);
    expect(await html(path, marker, { ...state, app: { homeTruthStatus: "loading", homeTruth: null } })).toContain(t.home.techEarningsLoading);
    expect(await html(path, marker, { ...state, retrying: false, app: { homeTruthStatus: "error", homeTruth: {} } })).toContain(t.coreReview.earningsReadFailed);
  });
  it("does not insert My order status after a successful empty read", async () => {
    const state = { t, remoteApiEnabled: true, remoteOrdersLoading: true, remoteOrdersHasRead: true };
    const path = "pages/me/me.vue", marker = 'data-me-orders-state="loading"';
    expect(await html(path, marker, state)).not.toContain(t.orders.refreshing);
    expect(await html(path, marker, { ...state, remoteOrdersHasRead: false })).toContain(t.orders.refreshing);
    expect(await html(path, 'data-me-orders-state="failed"', { t, remoteApiEnabled: true, remoteOrdersFailed: true, refreshRemoteOrders() {} })).toContain(t.orders.refreshFailed);
  });
  it("keeps Trust real failure/retry but no warm footer", async () => {
    const path = "pages/trust/trust.vue", marker = 'class="trust-refresh-status"';
    const continuity = { trustRefreshing: "warm-read", trustRefreshFailed: "read-failed" };
    const state = { t, continuity, refreshing: true, refreshError: false, loadTrustSections() {} };
    expect(await html(path, marker, state)).not.toContain("warm-read");
    expect(await html(path, marker, { ...state, refreshing: false, refreshError: true })).toContain("read-failed");
  });
  it("keeps raffle old snapshot silent and reports an actual retained-data failure", async () => {
    const path = "pages/events/genesis-raffle.vue", marker = 'class="raffle-status"';
    const copy = { loading: t.help.loadingMore, refreshError: "read-failed" };
    expect(await html(path, marker, { copy, loading: true, snapshot: {}, error: null })).not.toContain(copy.loading);
    expect(await html(path, marker, { copy, loading: true, snapshot: null, error: null })).toContain(copy.loading);
    expect(await html(path, marker, { copy, loading: false, snapshot: {}, error: true })).toContain("read-failed");
  });
  it("does not replace the retained Genesis refresh button label", async () => {
    const rendered = await html("pages/genesis/genesis.vue", '@click="retryGenesis"', { t, refreshing: true, retryGenesis() {} });
    expect(rendered).toContain(t.genesis.refresh); expect(rendered).not.toContain(t.promotion.loading);
    expect(rendered).toContain('aria-disabled="true"');
  });
  it("keeps withdrawal freshness denial without a visible warm status", async () => {
    const path = "pages/me/wallet-withdraw.vue";
    const template = parse(source(path)).descriptor.template!.content.split("\n")
      .filter(row => /\{\{ withdrawal(?:Facts|Action|Read)StatusText \}\}/.test(row)).join("\n");
    // The actual adjacent status expressions keep their production branch relationship.
    const state = { withdrawalFactsNeedsRetry: false, withdrawalFactsRefreshing: true, withdrawalQuoteRefreshing: true, withdrawalActionsFresh: false, withdrawalFactsStatusText: "warm-read", withdrawalActionStatusText: "warm-read", withdrawalReadStatusText: "warm-read" };
    expect(await renderTemplate(`<view>${template}</view>`, state)).not.toContain("warm-read");
    expect(await renderTemplate(`<view>${template}</view>`, { ...state, withdrawalFactsNeedsRetry: true, withdrawalActionStatusText: "read-failed", withdrawalReadStatusText: "read-failed" })).toContain("read-failed");
  });
  it("keeps repurchase post-command sync and true history errors", async () => {
    const path = "pages/me/wallet-repurchase.vue", marker = ':style="cardStyle" role="status" aria-live="polite"';
    const w = { historySyncing: "command-history-sync", historySyncFailed: "read-failed" };
    const state = { w, cardStyle: {}, retryCtaStyle: {}, retryLabel: t.ui.retry, repurchase: { historyLoading: true, historyError: null, submitting: false, orders: [{}], refreshHistory() {} } };
    expect(await html(path, marker, state)).not.toContain(w.historySyncing);
    expect(await html(path, marker, { ...state, repurchase: { ...state.repurchase, submitting: true } })).toContain(w.historySyncing);
    expect(await html(path, marker, { ...state, repurchase: { ...state.repurchase, historyLoading: false, historyError: "failed" } })).toContain(w.historySyncFailed);
  });
  it("uses the current wallet snapshot only for presentation while loading", async () => {
    const path = "components/promotion/promotion-checkout.vue";
    // Render the real balance block and its recovery row (the wallet line became label + amount on 2026-10-30).
    const template = parse(source(path)).descriptor.template!.content;
    // The balanced <view> element that starts at the marker.
    const block = (start: string) => {
      const from = template.indexOf(start);
      let depth = 0, i = from;
      for (const tag of template.slice(from).matchAll(/<view\b|<\/view>/g)) {
        depth += tag[0] === "</view>" ? -1 : 1;
        if (depth === 0) { i = from + tag.index! + tag[0].length; break; }
      }
      return template.slice(from, i);
    };
    const markup = `<view>${block('<view class="checkout-wallet-balance"')}${block('<view v-if="walletState===\'error\'" class="checkout-wallet-recovery"')}</view>`;
    const render = new Function("Vue", compile(markup, { mode: "function", prefixIdentifiers: true, isCustomElement: tag => tag === "view" || tag === "text" }).code)(Vue);
    const show = (snapshot: boolean, walletState: string) => renderToString(Vue.createSSRApp({ render, setup: () => ({ t, walletState, app: { remoteFleetHasSnapshot: snapshot, user: { usdtBalance: 150 } }, formatAmount: String, reviewCopy: { walletLoading: "warm-read", walletError: "read-failed" }, refreshWallet: () => {} }) }));
    expect(await show(true, "loading")).toContain(t.wallet.usdtBalance);
    expect(await show(true, "loading")).toContain(">150<");
    expect(await show(false, "loading")).toContain("warm-read");
    expect(await show(true, "error")).toContain("read-failed");
  });
});

it("keeps the actual weekly static button and arrow at full contrast during a read, without removing disabled semantics", async () => {
  const wq = Vue.reactive({ loading: true, snapshot: {} as object | null });
  const ctaText = computedValue("components/home/weekly-quest-hero.vue", "ctaText", { computed: Vue.computed, wq, w: Vue.ref({ refreshing: "warm-read", goComplete: "Go complete" }) });
  const state = { completed: false, questTargetClosed: false, periodExpired: false, quest: {}, wq, w: { targetClosed: "Closed" }, ctaText: ctaText.value, onCta() {} };
  const pending = await html("components/home/weekly-quest-hero.vue", 'v-if="!completed"', state);
  expect(pending).toContain("opacity:1;"); expect(pending).toContain('aria-disabled="true"'); expect(pending).toContain('width="14"');
  const closed = await html("components/home/weekly-quest-hero.vue", 'v-if="!completed"', { ...state, questTargetClosed: true });
  expect(closed).not.toContain("opacity:1;"); expect(closed).toContain("Closed");
  wq.snapshot = null; expect(ctaText.value).toBe("Go complete");
});

it("keeps the weekly navigation label stable without unlocking its loading command", async () => {
  const wq = Vue.reactive({ loading: true, snapshot: {} });
  const ctaText = computedValue("components/home/weekly-quest-hero.vue", "ctaText", { computed: Vue.computed, wq, w: Vue.ref({ refreshing: "warm-read", goComplete: "Go complete" }) });
  expect(ctaText.value).toBe("Go complete");
  const output = await html("components/home/weekly-quest-hero.vue", 'v-if="!completed"', { completed: false, questTargetClosed: false, periodExpired: false, quest: {}, wq, w: { targetClosed: "Closed" }, ctaText: ctaText.value, onCta() {} });
  expect(output).toContain("Go complete"); expect(output).toContain("disabled"); expect(output).not.toContain('aria-busy="true"');
});

it.each([["zh", zh], ["en", en], ["vi", vi]] as const)("uses actual retained earnings subtitle logic in %s without inventing a positive settlement", (_locale, t) => {
  const app = Vue.reactive({ homeTruthStatus: "loading", homeTruth: {} as object | null });
  const deps = {
    computed: Vue.computed, homeEarningsSubtitle, remoteApiEnabled: true, app, remoteToday: Vue.ref(0), remoteJobCount: Vue.ref(0),
    remoteTodayVsYesterdayPct: Vue.ref(null), t: Vue.ref(t), fmt, visibility: { hidden: false, mask: (value: unknown) => value },
  };
  const settledSubtitle = computedValue("components/home/tech-money-card.vue", "settledSubtitle", deps);
  const value = computedValue("components/home/tech-money-card.vue", "earningsSubtitle", { ...deps, settledSubtitle });
  expect(value.value).toBe(t.home.techEarningsEmpty);
  app.homeTruth = null; expect(value.value).toBe(t.home.techEarningsLoading);
});

it.each([["refreshing", "unavailable"], ["stale", "refreshing"], ["unavailable", "loading"]])("keeps a real financial read failure visible beside another %s/%s source", (facts, daily) => {
  const value = computedValue("pages/me/wallet-withdraw.vue", "withdrawalReadStatusText", {
    computed: Vue.computed, withdrawalFactsState: Vue.ref(facts), dailyFactsState: Vue.ref(daily), factsStatusText: (state: string) => state,
    withdrawalActionStatusText: Vue.ref("warm-read"),
  });
  expect(value.value).toBe([facts, daily].find(state => state === "unavailable" || state === "stale"));
});
