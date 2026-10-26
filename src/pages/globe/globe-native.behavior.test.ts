import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import raw from "./globe.vue?raw";
import { GLOBE_CENTERS, globeSimulation, GLOBE_SIMULATION_INTERVAL_MS } from "@/lib/globe-simulation";
import nativeRaw from "@/components/native-svg.vue?raw";
import SvgText from "@/components/svg-text";
import { svgMarkup } from "@/lib/native-svg-markup";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as viMessages } from "@/i18n/messages/vi";

// Compile both production SFCs through the installed Uni conditional parser.
// Reparse its output so compileScript consumes the correct template AST.
function compile(source: string, filename: string, deps: Record<string, unknown>): Component {
  const original = parse(source, { filename }).descriptor;
  const { descriptor } = parse(source
    .replace(original.template!.content, preHtml(original.template!.content, filename))
    .replace(original.scriptSetup!.content, preJs(original.scriptSetup!.content, filename)), { filename });
  const script = compileScript(descriptor, { id: filename, inlineTemplate: true });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in deps)) throw new Error(`Unexpected production import: ${id}`);
    return deps[id];
  }, exports);
  return exports.default;
}

type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag = "", text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
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
const hasClass = (target: Host, name: string) => Vue.normalizeClass(target.props.class).split(" ").includes(name);
const style = (target: Host) => Vue.normalizeStyle(target.props.style) as Record<string, unknown>;
function emit(target: Host, key: string, event = {}) {
  const callbacks = Array.isArray(target.props[key]) ? target.props[key] : [target.props[key]];
  callbacks.forEach((callback: (event: unknown) => void) => { expect(callback).toBeTypeOf("function"); callback(event); });
}
const unmounts: Array<() => void> = [];
const settle = async () => { for (let n = 0; n < 4; n++) await Vue.nextTick(); };
type Platform = "app" | "h5";
const dictionaries = { en, zh, vi: viMessages };
const INITIAL_STEP = 120;
const fixedLabels = ["23.6W+", "25.3W+", "16.3W+", "24.9W+", "20.8W+", "21.7W+", "31.6W+", "28.4W+"];

async function mount(platform: Platform) {
  initPreContext(platform);
  const native = compile(nativeRaw, "native-svg.vue", { vue: Vue, "@/lib/native-svg-markup": { svgMarkup } });
  const locale = Vue.ref<keyof typeof dictionaries>("en");
  const t = Vue.computed(() => dictionaries[locale.value]);
  const shows: Array<() => void> = [], hides: Array<() => void> = [];
  let dialogOpen: Vue.Ref<boolean> | undefined;
  let closeDialog: (() => void) | undefined;
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
  // Deliberately provide no API/store imports: this page must mount without either.
  const deps = {
    vue: Vue, "@/components/native-svg.vue": { default: native }, "@/components/svg-text": { default: SvgText },
    "@/components/app-chassis.vue": { default: slot }, "@/components/sub-page-header.vue": { default: slot },
    "@/i18n/use-t": { useT: () => t },
    "@/lib/globe-simulation": { globeSimulation, GLOBE_SIMULATION_INTERVAL_MS },
    "@/composables/use-dialog-a11y": { useDialogA11y: (open: Vue.Ref<boolean>, _selector: string, close: () => void) => {
      dialogOpen = open; closeDialog = close;
    } },
    "@dcloudio/uni-app": { onShow: (cb: () => void) => shows.push(cb), onHide: (cb: () => void) => hides.push(cb) },
  };
  const root = node("root");
  const app = renderer.createApp(compile(raw, "globe.vue", deps));
  app.mount(root);
  const unmount = () => app.unmount();
  unmounts.push(unmount);
  shows.forEach(cb => cb()); await settle();
  const graph = () => all(root).find(item => hasClass(item, "nx-globe-native"));
  const svg = () => all(root).find(item => item.tag === "svg" && item.props.viewBox === "0 0 440 240");
  const controls = () => all((platform === "app" ? graph() : svg())!).filter(item => item.props.role === "button" && item.props["aria-label"]);
  const rows = () => all(root).filter(item => item.props.role === "button" && !item.props["aria-label"]);
  const markup = () => String(all(graph() ?? root).find(item => hasClass(item, "nx-native-svg"))?.props.innerHTML ?? "");
  const drawer = () => all(root).find(item => item.props.role === "dialog");
  const drawerValues = () => all(drawer()!).filter(item => hasClass(item, "tabular-nums") && style(item)?.fontSize === "15px").map(text);
  const headline = () => all(root).filter(item => hasClass(item, "tabular-nums") && style(item)?.fontSize === "20px").map(text);
  const closeButton = () => all(drawer()!).find(item => item.props["aria-label"] === t.value.trial.sheetCloseAria)!;
  const hide = async () => { hides.forEach(cb => cb()); await settle(); };
  const show = async () => { shows.forEach(cb => cb()); await settle(); };
  const dispose = () => { unmounts.splice(unmounts.indexOf(unmount), 1); unmount(); };
  return { root, locale, graph, svg, controls, rows, markup, drawer, drawerValues, headline, closeButton,
    hide, show, dispose, dialogOpen: () => dialogOpen!.value, closeDialog: () => closeDialog!() };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(INITIAL_STEP * GLOBE_SIMULATION_INTERVAL_MS);
});
afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("APP serializes eight centers, reference connections and geographic leaders into native SVG", async () => {
  const page = await mount("app");
  expect(style(page.graph()!).paddingTop).toBe(`${240 / 440 * 100}%`);
  expect(all(page.graph()!).some(item => item.tag === "svg" || item.tag === "g")).toBe(false);
  expect(page.markup()).toContain('viewBox="0 0 440 240"');
  expect((page.markup().match(/<circle /g) ?? []).length).toBeGreaterThan(200);
  expect((page.markup().match(/<line /g) ?? []).length).toBe(15);
  const ids = [...page.markup().matchAll(/<radialGradient id="([^"]+)"/g)].map(match => match[1]);
  expect(ids).toHaveLength(2);
  ids.forEach(id => expect(page.markup()).toContain(`fill="url(#${id})"`));
  expect(page.markup()).not.toMatch(/onClick|onclick|<animate|<script/);
  expect(page.controls()).toHaveLength(8);
  page.controls().forEach(control => {
    expect(control.tag).toBe("view");
    expect(control.props.tabindex).toBe("0");
    expect(style(control).width).toBe("44px");
    expect(style(control).height).toBe("44px");
  });
  expect(text(page.graph()!)).toContain(en.globe.referenceCenterShort);
});

test("H5 retains eight SVG controls, leader lines and SMIL pulse", async () => {
  const page = await mount("h5");
  expect(page.graph()).toBeUndefined();
  expect(all(page.svg()!).filter(item => item.tag === "circle").length).toBeGreaterThan(200);
  expect(all(page.svg()!).filter(item => item.tag === "line")).toHaveLength(15);
  expect(page.controls()).toHaveLength(8);
  page.controls().forEach(control => {
    const dot = all(control).find(item => item.tag === "circle" && item.props["pointer-events"] === "auto")!;
    expect(dot).toBeDefined();
  });
  vi.advanceTimersByTime(1800); await settle();
  expect(all(page.svg()!).filter(item => item.tag === "animate")).toHaveLength(2);
});

for (const platform of ["app", "h5"] as const) {
  test(`${platform} separates dense center dots and connects display positions to geographic anchors`, async () => {
    const page = await mount(platform);
    const points = page.controls().map(control => {
      if (platform === "app") return [parseFloat(String(style(control).left)) / 100 * 440, parseFloat(String(style(control).top)) / 100 * 240];
      const dot = all(control).find(item => item.tag === "circle" && item.props["pointer-events"] === "auto")!;
      return [Number(dot.props.cx), Number(dot.props.cy)];
    });
    points.forEach(([x, y], i) => {
      expect(x).toBeGreaterThan(5); expect(x).toBeLessThan(435);
      expect(y).toBeGreaterThan(5); expect(y).toBeLessThan(235);
      for (const [otherX, otherY] of points.slice(i + 1)) {
        // ViewBox units: visible dots need a clear gap, without pinning layout coordinates.
        expect(Math.hypot(x - otherX, y - otherY)).toBeGreaterThanOrEqual(24);
      }
    });
    const lines: Record<string, unknown>[] = platform === "app"
      ? [...page.markup().matchAll(/<line\s+([^>]+)>/g)].map(match => Object.fromEntries(
        [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]])))
      : all(page.svg()!).filter(item => item.tag === "line").map(item => item.props);
    const leaders = lines.filter(line => Number(line["stroke-opacity"]) === .35);
    expect(leaders).toHaveLength(8);
    leaders.forEach((line, i) => {
      expect(Number(line.x1)).toBeCloseTo((GLOBE_CENTERS[i].lon + 180) / 360 * 440);
      expect(Number(line.y1)).toBeCloseTo((90 - GLOBE_CENTERS[i].lat) / 180 * 240);
      expect(Number(line.x2)).toBeCloseTo(points[i][0]);
      expect(Number(line.y2)).toBeCloseTo(points[i][1]);
      expect(line["pointer-events"]).toBe("none");
    });
    const connections = lines.filter(line => line["stroke-dasharray"] === "2 3");
    expect(connections).toHaveLength(7);
    connections.forEach((line, i) => {
      expect(Number(line.x1)).toBeCloseTo(points[0][0]); expect(Number(line.y1)).toBeCloseTo(points[0][1]);
      expect(Number(line.x2)).toBeCloseTo(points[i + 1][0]); expect(Number(line.y2)).toBeCloseTo(points[i + 1][1]);
    });
  });

  test(`${platform} renders eight translated center rows, fixed nodes and simulated metrics`, async () => {
    const page = await mount(platform);
    const snapshot = globeSimulation(INITIAL_STEP);
    expect(page.headline()).toEqual([snapshot.nodes.toLocaleString(), snapshot.jobs.toLocaleString()]);
    for (const locale of ["en", "zh", "vi"] as const) {
      page.locale.value = locale; await settle();
      const copy = dictionaries[locale];
      expect(copy.globe.simulatedData).toBeTruthy();
      expect(text(page.root)).toContain(copy.globe.simulatedData);
      expect(copy.globe.simulationLegend).toBeTruthy();
      expect(text(page.root)).toContain(copy.globe.simulationLegend);
      expect(page.rows()).toHaveLength(8);
      expect(page.controls().map(control => control.props["aria-label"])).toEqual(GLOBE_CENTERS.map(c => copy.globe[c.nameKey]));
      for (const [i, row] of page.rows().entries()) {
        expect(copy.globe[GLOBE_CENTERS[i].nameKey]).toBeTruthy();
        expect(text(row)).toContain(copy.globe.superComputeCenter);
        expect(text(row)).toContain(snapshot.regions[i].jobsPerHour.toLocaleString());
        expect(text(row)).not.toContain("ms");
        emit(row, "onClick"); await settle();
        expect(page.drawerValues()).toEqual([fixedLabels[i], snapshot.regions[i].jobsPerHour.toLocaleString(), `${snapshot.regions[i].avgLatencyMs}ms`]);
        expect(text(page.drawer()!)).toContain(copy.globe.simulationHint);
        emit(page.closeButton(), "onClick"); await settle();
        expect(page.drawer()).toBeUndefined();
      }
    }
  });

  test(`${platform} opens map and list controls by touch, Enter and Space, and closes the dialog`, async () => {
    const page = await mount(platform);
    emit(page.controls()[0], "onClick"); await settle();
    expect(text(page.drawer()!)).toContain(en.globe.centerSingapore);
    expect(page.dialogOpen()).toBe(true);
    emit(page.closeButton(), "onClick"); await settle();
    expect(page.drawer()).toBeUndefined();
    for (const [index, key] of [[1, "Enter"], [2, " "]] as const) {
      const preventDefault = vi.fn();
      emit(page.controls()[index], "onKeydown", { key, preventDefault }); await settle();
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(text(page.drawer()!)).toContain(en.globe[GLOBE_CENTERS[index].nameKey]);
      emit(all(page.drawer()!).find(item => hasClass(item, "nx-globe-scrim"))!, "onClick"); await settle();
      expect(page.drawer()).toBeUndefined();
    }
    for (const key of ["Enter", " "]) {
      emit(page.rows()[7], "onKeydown", { key, preventDefault: vi.fn() }); await settle();
      expect(text(page.drawer()!)).toContain(en.globe.centerSanJose);
      emit(page.closeButton(), "onKeydown", { key, preventDefault: vi.fn() }); await settle();
      expect(page.drawer()).toBeUndefined();
    }
    emit(page.rows()[3], "onClick"); await settle();
    page.closeDialog(); await settle();
    expect(page.drawer()).toBeUndefined();
    expect(page.dialogOpen()).toBe(false);
  });

  test(`${platform} preserves the selected center across language changes without resampling`, async () => {
    const page = await mount(platform);
    emit(page.rows()[5], "onClick"); await settle();
    const values = page.drawerValues(), totals = page.headline();
    for (const locale of ["zh", "vi", "en"] as const) {
      page.locale.value = locale; await settle();
      expect(text(page.drawer()!)).toContain(dictionaries[locale].globe.centerFrankfurt);
      expect(text(page.drawer()!)).toContain(dictionaries[locale].globe.simulationHint);
      expect(page.drawerValues()).toEqual(values);
      expect(page.headline()).toEqual(totals);
    }
  });

  test(`${platform} refreshes totals, list and an open drawer from one 5.4-second snapshot`, async () => {
    const page = await mount(platform);
    emit(page.rows()[1], "onClick"); await settle();
    const before = page.drawerValues(), totals = page.headline();
    vi.advanceTimersByTime(GLOBE_SIMULATION_INTERVAL_MS - 1); await settle();
    expect(page.headline()).toEqual(totals);
    expect(page.drawerValues()).toEqual(before);
    vi.advanceTimersByTime(1); await settle();
    const next = globeSimulation(INITIAL_STEP + 1);
    expect(page.headline()).toEqual([next.nodes.toLocaleString(), next.jobs.toLocaleString()]);
    expect(page.headline()).not.toEqual(totals);
    expect(page.drawerValues()).toEqual(["25.3W+", next.regions[1].jobsPerHour.toLocaleString(), `${next.regions[1].avgLatencyMs}ms`]);
    expect(text(page.rows()[1])).toContain(next.regions[1].jobsPerHour.toLocaleString());
    vi.advanceTimersByTime(GLOBE_SIMULATION_INTERVAL_MS * 11); await settle();
    expect(page.drawerValues()).not.toEqual(before);
    expect(page.drawerValues()[0]).toBe("25.3W+");
  });

  test(`${platform} freezes hidden data and pulses, closes selection and resumes the current snapshot`, async () => {
    const page = await mount(platform);
    vi.advanceTimersByTime(1800); await settle();
    emit(page.rows()[0], "onClick"); await settle();
    await page.hide();
    expect(page.drawer()).toBeUndefined();
    const pulses = () => all(page.root).filter(item => hasClass(item, "nx-globe-native-pulse") || item.tag === "animate");
    const hiddenText = text(page.root), hiddenPulses = pulses();
    expect(hiddenPulses).toHaveLength(platform === "app" ? 1 : 2);
    vi.advanceTimersByTime(GLOBE_SIMULATION_INTERVAL_MS * 24); await settle();
    expect(text(page.root)).toBe(hiddenText);
    expect(pulses()).toHaveLength(hiddenPulses.length);
    pulses().forEach((pulse, i) => expect(pulse).toBe(hiddenPulses[i]));
    await page.show();
    const snapshot = globeSimulation(Math.floor(Date.now() / GLOBE_SIMULATION_INTERVAL_MS));
    expect(page.headline()).toEqual([snapshot.nodes.toLocaleString(), snapshot.jobs.toLocaleString()]);
    expect(text(page.root)).not.toBe(hiddenText);
    expect(page.drawer()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(1);
  });

  test(`${platform} keeps one timer across show/hide cycles and clears it on unmount`, async () => {
    const page = await mount(platform);
    for (let i = 0; i < 3; i++) { await page.hide(); await page.show(); await page.show(); }
    expect(vi.getTimerCount()).toBe(1);
    page.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(GLOBE_SIMULATION_INTERVAL_MS * 2); await settle();
    expect(page.root.children).toHaveLength(0);
  });

  test(`${platform} remounts the same time slot without drawing a new random sample`, async () => {
    const first = await mount(platform), second = await mount(platform);
    expect(first.headline()).toEqual(second.headline());
    expect(first.rows().map(text)).toEqual(second.rows().map(text));
    expect(text(first.root)).not.toContain(en.globe.youAre);
    expect(text(first.rows()[0])).toContain(en.globe.referenceCenter);
  });
}
