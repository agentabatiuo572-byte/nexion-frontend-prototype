import { parse } from "@vue/compiler-sfc";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import { ref, reactive } from "vue";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import raw from "./globe.vue?raw";
import SvgText from "@/components/svg-text";
import { useIntroMotion } from "@/composables/use-intro-motion";
import { en } from "@/i18n/messages/en";
import { all, flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import { globeSimulation, GLOBE_SIMULATION_INTERVAL_MS } from "@/lib/globe-simulation.test-support";
import { globeSimulation as configuredGlobeSimulation, GLOBE_CENTERS as metadata } from "@/lib/globe-simulation";
import { TEST_GLOBE_CONFIG } from "@/lib/globe-simulation.test-support";

const unmounts: Array<() => void> = [];
let preference: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let preferenceChanged: () => void;

async function mount() {
  initPreContext("h5");
  const descriptor = parse(raw, { filename: "globe.vue" }).descriptor;
  const source = raw
    .replace(descriptor.template!.content, preHtml(descriptor.template!.content, "globe.vue"))
    .replace(descriptor.scriptSetup!.content, preJs(descriptor.scriptSetup!.content, "globe.vue"));
  const shows: Array<() => void> = [], hides: Array<() => void> = [];
  const cfg = reactive({ config: { publicStats: { globeDisplay: structuredClone(TEST_GLOBE_CONFIG) as typeof TEST_GLOBE_CONFIG | undefined } }, revalidate: vi.fn(async () => {}) });
  const page = mountEntry(source, {
    "@/components/svg-text": { default: SvgText },
    "@/components/app-chassis.vue": slot, "@/components/sub-page-header.vue": slot,
    "@/i18n/use-t": { useT: () => ref(en) },
    "@/composables/use-intro-motion": { useIntroMotion },
    "@/lib/globe-simulation": { globeSimulation: configuredGlobeSimulation, GLOBE_CENTERS: metadata },
    "@/store/config": { useConfig: () => cfg },
    "@/composables/use-dialog-a11y": { useDialogA11y() {} },
    "@dcloudio/uni-app": { onShow: (fn: () => void) => shows.push(fn), onHide: (fn: () => void) => hides.push(fn) },
  });
  unmounts.push(page.unmount);
  shows.forEach(fn => fn()); await flush();
  return {
    ...page, shows, hides, cfg,
    animations: () => all(page.root).filter(n => n.tag === "animate"),
    totals: () => page.nodes("tabular-nums").filter(n => n.props.style.fontSize === "20px").map(text),
    rows: () => all(page.root).filter(n => n.props.role === "button" && !n.props["aria-label"]),
    dialog: () => all(page.root).find(n => n.props.role === "dialog"),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(120 * GLOBE_SIMULATION_INTERVAL_MS);
  preference = { matches: false, addEventListener: vi.fn((_event, fn) => { preferenceChanged = fn; }), removeEventListener: vi.fn() };
  vi.stubGlobal("window", { matchMedia: vi.fn(() => preference) });
});
afterEach(() => {
  unmounts.splice(0).forEach(fn => fn());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

test.each([true, false])("initial reduced-motion=%s controls SMIL without freezing the simulated metrics", async reduced => {
  preference.matches = reduced;
  const page = await mount();
  const before = page.totals();
  vi.advanceTimersByTime(1800); await flush();
  expect(page.animations()).toHaveLength(reduced ? 0 : 2);
  expect(all(page.root).filter(n => n.tag === "circle").length).toBeGreaterThan(200);
  expect(page.rows()).toHaveLength(8);
  vi.advanceTimersByTime(3600); await flush();
  const snapshot = globeSimulation(121);
  expect(page.totals()).toEqual([snapshot.nodes.toLocaleString(), snapshot.jobs.toLocaleString()]);
  expect(page.totals()).not.toEqual(before);
});

test("live motion preference removes and restores SMIL without resampling the current snapshot", async () => {
  const page = await mount();
  vi.advanceTimersByTime(1800); await flush();
  expect(page.animations()).toHaveLength(2);
  const before = page.totals();
  preference.matches = true; preferenceChanged(); await flush();
  expect(page.animations()).toHaveLength(0);
  expect(page.totals()).toEqual(before);
  preference.matches = false; preferenceChanged(); await flush();
  expect(page.animations()).toHaveLength(2);
  expect(page.totals()).toEqual(before);
  expect(vi.getTimerCount()).toBe(1);
});

test("unavailable motion preference keeps a static usable map and current counters", async () => {
  vi.stubGlobal("window", undefined);
  const page = await mount();
  vi.advanceTimersByTime(GLOBE_SIMULATION_INTERVAL_MS); await flush();
  expect(page.animations()).toHaveLength(0);
  expect(page.rows()).toHaveLength(8);
  const snapshot = globeSimulation(121);
  expect(page.totals()).toEqual([snapshot.nodes.toLocaleString(), snapshot.jobs.toLocaleString()]);
});

test("hiding across unaligned time slots closes selection, freezes the snapshot and resumes current wall time once", async () => {
  vi.setSystemTime(120 * GLOBE_SIMULATION_INTERVAL_MS + 5325);
  const page = await mount();
  page.rows()[3].props.onClick(); await flush();
  expect(page.dialog()).toBeDefined();
  page.hides.forEach(fn => fn()); await flush();
  expect(page.dialog()).toBeUndefined();
  const before = page.totals();
  vi.advanceTimersByTime(GLOBE_SIMULATION_INTERVAL_MS * 30); await flush();
  expect(page.totals()).toEqual(before);
  page.shows.forEach(fn => fn()); page.shows.forEach(fn => fn()); await flush();
  const snapshot = globeSimulation(Math.floor(Date.now() / GLOBE_SIMULATION_INTERVAL_MS));
  expect(page.totals()).toEqual([snapshot.nodes.toLocaleString(), snapshot.jobs.toLocaleString()]);
  expect(page.totals()).not.toEqual(before);
  expect(page.dialog()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(1);
});

test("unmount releases the simulation timer and motion listener, and queued lifecycle calls cannot restart them", async () => {
  const page = await mount();
  expect(preference.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  page.unmount(); unmounts.pop();
  expect(preference.removeEventListener).toHaveBeenCalledWith("change", preferenceChanged);
  expect(vi.getTimerCount()).toBe(0);
  page.shows.forEach(fn => fn()); page.hides.forEach(fn => fn());
  vi.advanceTimersByTime(GLOBE_SIMULATION_INTERVAL_MS * 2); await flush();
  expect(vi.getTimerCount()).toBe(0);
  expect(page.root.children).toHaveLength(0);
});


test("H9 arrival and updates replace only metrics, preserving all static centers", async () => {
  const page = await mount();
  page.cfg.config.publicStats.globeDisplay = undefined; await flush();
  expect(page.totals()).toEqual(["—", "—"]);
  expect(page.rows()).toHaveLength(8);
  page.cfg.config.publicStats.globeDisplay = { ...TEST_GLOBE_CONFIG, intervalMs: 1001,
    centers: TEST_GLOBE_CONFIG.centers.map(row => ({ ...row, nodes: 0 })) };
  await flush();
  expect(page.totals()).toEqual(["0", "0"]);
  expect(page.rows()).toHaveLength(8);
  vi.advanceTimersByTime(3003); await flush();
  expect(page.cfg.revalidate).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);
});
