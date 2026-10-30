import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./live-feed-card.vue?raw";
import * as feed from "./home-live-feed";
import { formatUsd } from "@/lib/usd-display";
import { parseServerTimestamp } from "@/api/server-time";
import { zh } from "@/i18n/messages/zh";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

const row = (id: string, minute: number) => ({ id, model: `Model ${id}`, client: "Client", rewardUsdt: 0.001,
  synthetic: false, completedAt: `2026-10-30T00:${String(minute).padStart(2, "0")}:00Z` });

function mount(motion = true) {
  let tick = () => {};
  const app = Vue.reactive({ homeTruth: { earningsLedger: [row("a", 1), row("b", 2), row("c", 3)] }, homeTruthStatus: "ready", refreshHomeTruth: vi.fn() });
  const code = ts.transpileModule(compileScript(parse(source).descriptor, { id: "live-feed-reveal" }).content,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const imports: Record<string, unknown> = {
    vue: Vue, "./home-live-feed": feed, "@/api/server-time": { parseServerTimestamp }, "@/lib/usd-display": { formatUsd }, "@/lib/route": { navTo: vi.fn() },
    "@/components/glass-segments.vue": { default: { render: () => null } },
    "./home-running-tasks.vue": { default: { render: () => null } }, "./home-income-list.vue": { default: { render: () => null } },
    "@/i18n/use-t": { useT: () => Vue.ref(zh) }, "@/store/locale": { useLocaleStore: () => ({ code: "zh" }) },
    "@/store/app": { useApp: () => app }, "@/store/data-visibility": { useDataVisibility: () => ({ hidden: false, mask: String }) },
    "@/composables/use-intro-motion": { useIntroMotion: () => Vue.ref(motion) },
    "@/composables/use-tab-page-lifecycle": { useVisibleInterval: (callback: () => void) => { tick = callback; } },
  };
  const exports = {} as { default: { setup: (props: object, context: object) => any } };
  new Function("require", "exports", code)((id: string) => { if (!(id in imports)) throw new Error(id); return imports[id]; }, exports);
  const scope = Vue.effectScope(); cleanups.push(() => scope.stop());
  const state = scope.run(() => exports.default.setup({}, { expose() {} }))!;
  const shown = () => (state.displayActivityRows.value as Array<{ k: string }>).map(entry => entry.k);
  return { app, state, shown, tick: () => tick() };
}

it("shows the first ledger snapshot at once, then reveals each new settlement oldest first", async () => {
  const view = mount();
  expect(view.shown()).toEqual(["c", "b", "a"]);
  view.app.homeTruth.earningsLedger = [...view.app.homeTruth.earningsLedger, row("d", 4), row("e", 5)];
  await Vue.nextTick();
  expect(view.shown()).toEqual(["c", "b", "a"]);
  view.tick();
  expect(view.shown()).toEqual(["d", "c", "b", "a"]); expect(view.state.enteringId.value).toBe("d");
  view.tick();
  expect(view.shown()).toEqual(["e", "d", "c", "b", "a"]); expect(view.state.enteringId.value).toBe("e");
  view.tick();
  expect(view.shown()).toEqual(["e", "d", "c", "b", "a"]);
});

it("keeps six rows visible while new settlements wait", async () => {
  const view = mount();
  view.app.homeTruth.earningsLedger = Array.from({ length: 6 }, (_, i) => row(`old${i}`, i));
  await Vue.nextTick();
  view.tick();
  view.app.homeTruth.earningsLedger = [...view.app.homeTruth.earningsLedger, row("new1", 10), row("new2", 11)];
  await Vue.nextTick();
  expect(view.shown()).toHaveLength(6); expect(view.shown()[0]).toBe("old5");
  view.tick();
  expect(view.shown()[0]).toBe("new1"); expect(view.shown()).toHaveLength(6);
});

it("shows a different account's ledger and reduced-motion updates at once", async () => {
  const replaced = mount();
  replaced.app.homeTruth.earningsLedger = [row("x", 7), row("y", 8)];
  await Vue.nextTick();
  expect(replaced.shown()).toEqual(["y", "x"]);
  const still = mount(false);
  still.app.homeTruth.earningsLedger = [...still.app.homeTruth.earningsLedger, row("d", 4)];
  await Vue.nextTick();
  expect(still.shown()).toEqual(["d", "c", "b", "a"]);
});

it("keeps the rows on screen while the server's newest-five window has already moved on", async () => {
  const view = mount();
  const old = Array.from({ length: 5 }, (_, i) => row(`old${i}`, i));
  view.app.homeTruth.earningsLedger = old;
  await Vue.nextTick();
  view.tick();
  expect(view.shown()).toEqual(["old4", "old3", "old2", "old1", "old0"]);
  view.app.homeTruth.earningsLedger = [old[3], old[4], row("new1", 10), row("new2", 11), row("new3", 12)];
  await Vue.nextTick();
  expect(view.shown()).toEqual(["old4", "old3", "old2", "old1", "old0"]);
  view.tick();
  expect(view.shown()).toEqual(["new1", "old4", "old3", "old2", "old1"]);
  view.tick(); view.tick();
  expect(view.shown()).toEqual(["new3", "new2", "new1", "old4", "old3"]);
  view.app.homeTruth.earningsLedger = [...view.app.homeTruth.earningsLedger];
  await Vue.nextTick();
  expect(view.shown()).toEqual(["new3", "new2", "new1", "old4", "old3"]);
});
