import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import raw from "./globe.vue?raw";
import nativeRaw from "@/components/native-svg.vue?raw";
import SvgText from "@/components/svg-text";
import { svgMarkup } from "@/lib/native-svg-markup";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as viMessages } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { formatTrialDateTime } from "@/lib/trial-date";
import type { NetworkRegionProjection } from "@/api/network-regions-api";
import { advanceRuntimeRevision, captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

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
const projection = (): NetworkRegionProjection => ({
  activeNodes: 0, activeJobs: 0, countryCount: 2, source: "server", generatedAt: "2026-10-01T00:00:00Z",
  regions: [
    { id: "self", displayName: "Mobile region", location: "Mobile", latitude: 0, longitude: 0, isUserRegion: true },
    { id: "us", displayName: "Virginia", location: "US", latitude: 45, longitude: -90, isUserRegion: false },
    { id: "unknown", displayName: "Unknown location", location: "Unknown", latitude: null, longitude: null, isUserRegion: false },
  ].map(region => ({ ...region, activeNodes: 0, activeJobs: 0, jobsPerHour: 0 })),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function mount(platform: "app" | "h5" = "app", failInitially = false, initialRead?: Promise<NetworkRegionProjection>) {
  initPreContext(platform);
  const native = compile(nativeRaw, "native-svg.vue", { vue: Vue, "@/lib/native-svg-markup": { svgMarkup } });
  const locale = Vue.ref<"en" | "zh" | "vi">("en");
  const dictionaries = { en, zh, vi: viMessages };
  const t = Vue.computed(() => dictionaries[locale.value]);
  const account = Vue.reactive({ accountKey: "user:fixture", accountBindingEpoch: 1, global: { activeDevices: 0, activeJobs: 0 } });
  const api = { list: vi.fn().mockResolvedValue(projection()) };
  if (failInitially) api.list.mockRejectedValueOnce(new Error("offline"));
  if (initialRead) api.list.mockReturnValueOnce(initialRead);
  const shows: Array<() => void> = [];
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
  const empty = { props: ["kind", "title", "desc", "ctaLabel"], emits: ["cta"],
    setup: (props: any, { emit }: any) => () => Vue.h("view", { class: "test-empty-state" }, [
      Vue.h("text", props.title), props.ctaLabel ? Vue.h("button", { onClick: () => emit("cta") }, props.ctaLabel) : null,
    ]) };
  const deps = {
    vue: Vue, "@/components/native-svg.vue": { default: native }, "@/components/svg-text": { default: SvgText },
    "@/components/app-chassis.vue": { default: slot }, "@/components/sub-page-header.vue": { default: slot },
    "@/components/empty-state.vue": { default: empty }, "@/i18n/use-t": { useT: () => t },
    "@/store/app": { useApp: () => account }, "@/store/config": { useConfig: () => ({ config: { publicStats: {} } }) },
    "@/lib/platform-stats": { publicStatsHealth: () => ({ devicesOk: true }) },
    "@/mock/globe-regions": { MOCK_GLOBE_FIXTURE_ID: "unused", REGIONS: [] },
    "@/i18n/format": { fmt, dateLocale: () => "en-US" },
    "@/lib/trial-date": { formatTrialDateTime },
    "@/composables/use-dialog-a11y": { useDialogA11y: () => {} },
    "@/api/runtime": { remoteApiEnabled: true, networkRegionsApi: api },
    "@dcloudio/uni-app": { onShow: (cb: () => void) => shows.push(cb), onHide: () => {} },
    "@/lib/active-page-refresh": { registerActivePageRefresh: () => () => {} },
    "@/api/order-api": { captureRuntimeRevision, subscribeRuntimeRevision },
  };
  const root = node("root");
  const app = renderer.createApp(compile(raw, "globe.vue", deps));
  app.mount(root); unmounts.push(() => app.unmount());
  shows.forEach(cb => cb()); await settle();
  const graph = () => all(root).find(item => hasClass(item, "nx-globe-native"));
  const controls = () => all(graph() ?? node()).filter(item => item.props.role === "button" && item.props["aria-label"]);
  const markup = () => String(all(graph() ?? root).find(item => hasClass(item, "nx-native-svg"))?.props.innerHTML ?? "");
  const drawer = () => all(root).find(item => item.props.role === "dialog");
  return { root, api, account, locale, shows, graph, controls, markup, drawer };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

for (const [zone, expected] of [
  ["Asia/Tokyo", "2026-10-04 00:02:46"],
  ["Asia/Ho_Chi_Minh", "2026-10-03 22:02:46"],
]) {
  test.each(["english fallback", "throws"])(`BUG 415 ${zone} renders local numeric drawer dates when Android locale %s`, async (mode) => {
    vi.stubEnv("TZ", zone);
    const localeSpy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => {
      if (mode === "throws") throw new Error("Android locale formatter unavailable");
      return "Sun Oct 04 2026 00:02:46 GMT+0900 (JST)";
    });
    for (const generatedAt of ["2026-10-03T15:02:46Z", "2026-10-04T00:02:46+09:00"]) {
      const page = await mount("app", false, Promise.resolve({ ...projection(), generatedAt }));
      emit(page.controls()[0], "onClick"); await settle();
      for (const code of ["en", "vi", "zh"] as const) {
        page.locale.value = code; await settle();
        const copy = { en, zh, vi: viMessages }[code].globe;
        expect(text(page.drawer()!)).toContain(fmt(copy.projectionUpdatedAt, { at: expected }));
        expect(text(page.drawer()!)).not.toMatch(/Sun Oct|GMT\+|Invalid Date/);
      }
      emit(all(page.drawer()!).find(item => item.props["aria-label"] === zh.trial.sheetCloseAria)!, "onClick"); await settle();
      const row = all(page.root).find(item => item.props.role === "button" && text(item).includes("Mobile region"))!;
      emit(row, "onClick"); await settle();
      expect(text(page.drawer()!)).toContain(fmt(zh.globe.projectionUpdatedAt, { at: expected }));
      expect(page.api.list).toHaveBeenCalledOnce();
    }
    expect(localeSpy).not.toHaveBeenCalled();
  });
}

test.each(["invalid", "", "+275761-01-01T00:00:00Z"])("BUG 415 renders the existing unavailable date for invalid generatedAt %s", async (generatedAt) => {
  const page = await mount("app", false, Promise.resolve({ ...projection(), generatedAt }));
  emit(page.controls()[0], "onClick"); await settle();
  for (const code of ["en", "vi", "zh"] as const) {
    page.locale.value = code; await settle();
    const copy = { en, zh, vi: viMessages }[code].globe;
    expect(text(page.drawer()!)).toContain(fmt(copy.projectionUpdatedAt, { at: copy.metricUnavailable }));
    expect(text(page.drawer()!)).not.toMatch(/Invalid Date|NaN/);
  }
});

test.each(["app", "h5"] as const)("%s exits cold-start loading after account and runtime rebinding succeeds", async (platform) => {
  const old = deferred<NetworkRegionProjection>();
  const current = deferred<NetworkRegionProjection>();
  const page = await mount(platform, false, old.promise);
  page.api.list.mockReturnValue(current.promise);

  // Bootstrap binds the account before synchronously notifying the runtime;
  // Vue flushes the account watcher afterwards, in the same final scope.
  page.account.accountKey = "user:rebound";
  page.account.accountBindingEpoch += 1;
  advanceRuntimeRevision("cold-start account binding");
  await settle();
  old.resolve({ ...projection(), regions: [{ ...projection().regions[0], displayName: "OLD ACCOUNT" }] });
  await settle();
  expect(text(page.root)).not.toContain("OLD ACCOUNT");
  expect(text(page.root)).toContain(en.globe.regionProjectionLoadingTitle);

  current.resolve(projection());
  await settle();
  expect(text(page.root)).toContain("Mobile region");
  expect(text(page.root)).not.toContain(en.globe.regionProjectionLoadingTitle);
  expect(text(page.root)).not.toContain(en.globe.regionProjectionErrorTitle);
});

test.each(["app", "h5"] as const)("%s exposes Retry after cold-start rebinding fails and recovers through the CTA", async (platform) => {
  const old = deferred<NetworkRegionProjection>();
  const current = deferred<NetworkRegionProjection>();
  const page = await mount(platform, false, old.promise);
  page.api.list.mockReturnValue(current.promise);
  page.account.accountKey = "user:rebound";
  page.account.accountBindingEpoch += 1;
  advanceRuntimeRevision("cold-start account binding");
  await settle();
  old.resolve(projection());
  await settle();
  current.reject(new Error("current network read failed"));
  await settle();
  expect(text(page.root)).not.toContain(en.globe.regionProjectionLoadingTitle);
  expect(text(page.root)).toContain(en.globe.regionProjectionErrorTitle);
  expect(text(page.root)).not.toContain("Mobile region");

  page.api.list.mockResolvedValue(projection());
  const retry = all(page.root).find(item => item.tag === "button")!;
  expect(retry).toBeDefined();
  emit(retry, "onClick");
  await settle();
  expect(text(page.root)).toContain("Mobile region");
  expect(text(page.root)).not.toContain(en.globe.regionProjectionErrorTitle);
});

test("APP renders the real serialized dot map and regions even with zero active nodes", async () => {
  const page = await mount();
  expect(page.graph()).toBeDefined();
  expect(style(page.graph()!).paddingTop).toBe(`${240 / 440 * 100}%`);
  expect(all(page.graph()!).some(item => item.tag === "svg" || item.tag === "g")).toBe(false);
  expect(page.markup()).toContain('viewBox="0 0 440 240"');
  expect(page.markup()).toContain('width="100%" height="100%"');
  expect((page.markup().match(/<circle /g) ?? []).length).toBeGreaterThan(200);
  expect((page.markup().match(/<line /g) ?? []).length).toBe(2);
  const gradientIds = [...page.markup().matchAll(/<radialGradient id="([^"]+)"/g)].map(match => match[1]);
  expect(gradientIds).toHaveLength(2);
  gradientIds.forEach(id => expect(page.markup()).toContain(`fill="url(#${id})"`));
  expect(page.markup()).toContain('x1="220" y1="120" x2="110" y2="60"');
  expect(page.markup()).not.toMatch(/onClick|onclick|<animate|<script/);
  expect(page.controls().map(item => item.props["aria-label"])).toEqual(["Mobile region", "Virginia", "Unknown location"]);
  expect(page.controls().map(item => [style(item).left, style(item).top])).toEqual([["50%", "50%"], ["25%", "25%"], ["75%", "66%"]]);
  expect(page.controls().every(item => item.tag === "view" && item.props.tabindex === "0")).toBe(true);
  expect(page.controls().every(item => style(item).width === "44px" && style(item).height === "44px")).toBe(true);
  expect(text(page.graph()!)).toContain(en.globe.yourNodeBadge);
});

test("APP touch and keyboard nodes open the existing drawer and keep unavailable latency honest", async () => {
  const page = await mount();
  emit(page.controls()[0], "onClick"); await settle();
  expect(text(page.drawer()!)).toContain("Mobile region");
  expect(text(page.drawer()!)).toContain(en.globe.latencyTelemetryMissingHint);
  expect(text(page.drawer()!)).toContain(en.globe.metricUnavailable);
  emit(all(page.drawer()!).find(item => item.props["aria-label"] === en.trial.sheetCloseAria)!, "onClick"); await settle();
  expect(page.drawer()).toBeUndefined();
  const preventDefault = vi.fn();
  emit(page.controls()[1], "onKeydown", { key: "Enter", preventDefault }); await settle();
  expect(text(page.drawer()!)).toContain("Virginia"); expect(preventDefault).toHaveBeenCalled();
  emit(all(page.drawer()!).find(item => hasClass(item, "nx-globe-scrim"))!, "onClick"); await settle();
  emit(page.controls()[2], "onKeydown", { key: " ", preventDefault }); await settle();
  expect(text(page.drawer()!)).toContain("Unknown location");
  expect(page.api.list).toHaveBeenCalledOnce();
});

test("APP labels and decorative pulse update without creating telemetry or retaining timers", async () => {
  const page = await mount();
  expect(page.graph()).toBeDefined();
  expect(all(page.graph()!).some(item => hasClass(item, "nx-globe-native-pulse"))).toBe(false);
  vi.advanceTimersByTime(1800); await settle();
  expect(all(page.graph()!).filter(item => hasClass(item, "nx-globe-native-pulse"))).toHaveLength(1);
  for (const code of ["zh", "vi", "en"] as const) {
    page.locale.value = code; await settle();
    expect(text(page.graph()!)).toContain({ en, zh, vi: viMessages }[code].globe.yourNodeBadge);
    expect(page.controls().map(item => item.props["aria-label"])).toEqual(["Mobile region", "Virginia", "Unknown location"]);
  }
  expect(page.api.list).toHaveBeenCalledOnce();
  unmounts.pop()!(); expect(vi.getTimerCount()).toBe(0);
});

test("APP blocks absent data, recovers on Retry, and preserves the confirmed map on refresh error", async () => {
  const page = await mount("app", true);
  expect(page.graph()).toBeUndefined(); expect(text(page.root)).toContain(en.globe.regionProjectionErrorTitle);
  emit(all(page.root).find(item => item.tag === "button")!, "onClick"); await settle();
  expect(page.controls()).toHaveLength(3);
  const confirmed = page.markup();
  page.api.list.mockRejectedValueOnce(new Error("refresh failed"));
  page.shows.forEach(cb => cb()); await settle();
  expect(page.markup()).toBe(confirmed); expect(text(page.root)).toContain(en.globe.regionProjectionErrorTitle);
  emit(all(page.root).find(item => item.tag === "button")!, "onClick"); await settle();
  expect(text(page.root)).not.toContain(en.globe.regionProjectionErrorTitle);
  emit(page.controls()[0], "onClick"); await settle();
  expect(text(page.drawer()!)).toContain("Mobile region");
  page.api.list.mockResolvedValueOnce({ ...projection(), regions: [] });
  page.account.accountBindingEpoch += 1; await settle();
  expect(page.graph()).toBeUndefined(); expect(page.drawer()).toBeUndefined();
  expect(text(page.root)).toContain(en.globe.regionProjectionEmptyTitle);
});

test("H5 retains its original SVG, clickable regions, keyboard activation and SMIL pulse", async () => {
  const page = await mount("h5");
  expect(page.graph()).toBeUndefined(); expect(page.markup()).toBe("");
  const svg = all(page.root).find(item => item.tag === "svg" && item.props.viewBox === "0 0 440 240")!;
  expect(svg).toBeDefined();
  expect(all(svg).filter(item => item.tag === "circle").length).toBeGreaterThan(200);
  expect(all(svg).filter(item => item.tag === "line")).toHaveLength(2);
  const controls = all(svg).filter(item => item.tag === "g" && item.props.role === "button");
  expect(controls).toHaveLength(3);
  emit(controls[1], "onKeydown", { key: "Enter", preventDefault: vi.fn() }); await settle();
  expect(text(page.drawer()!)).toContain("Virginia");
  vi.advanceTimersByTime(1800); await settle();
  expect(all(svg).filter(item => item.tag === "animate")).toHaveLength(2);
});
