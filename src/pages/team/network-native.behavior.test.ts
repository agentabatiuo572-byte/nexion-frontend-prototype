import * as networkReaudit from "@/i18n/network-reaudit";
import * as computePoints from "@/i18n/compute-points";
import { displayNickname } from "@/lib/brand-copy";
import * as Vue from "vue";
import { formatDisplayDateTime } from "@/lib/display-date";
import { createTeamNetworkApi } from "@/api/team-network-api";
import { formatAmount } from "@/lib/amount-display";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import raw from "./network.vue?raw";
import dialogSource from "@/composables/use-dialog-a11y.ts?raw";
import SvgText from "@/components/svg-text";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as viMessages } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { rankLabel, rankTitle } from "@/lib/v-rank-copy";
import { useNetwork, type NetworkMember } from "@/store/network";
import { createPinia, setActivePinia } from "pinia";

const runtime = vi.hoisted(() => ({ snapshot: vi.fn(() => new Promise<any>(() => {})) }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, apiRuntimeConfig: { environment: "dev", baseUrl: "https://test.invalid" }, teamNetworkApi: { snapshot: runtime.snapshot } }));
vi.mock("@/api/order-api", () => ({
  captureRuntimeRevision: () => 0, isCurrentRuntimeRevision: () => true,
  subscribeRuntimeRevision: () => () => {},
}));

type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag = "", text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
// Like the APP-vue bridge, this host has no SVG namespace rendering fallback.
// Exercise the actual page: unsupported svg geometry must not reach the APP host.
const renderer = Vue.createRenderer<Host, Host>({
  createElement: (tag) => node(tag), createText: (text) => node("#text", text), createComment: () => node("#comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: (child) => child.parent,
  nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child);
    child.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    if (at < 0) parent.children.push(child); else parent.children.splice(at, 0, child);
  },
  remove: (child) => { if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const style = (target: Host): Record<string, any> => Object.fromEntries(
  Object.entries(Vue.normalizeStyle([target.props.style]) as Record<string, any>)
    .map(([key, value]) => [key.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()), value]),
);
const hasClass = (target: Host, name: string) => Vue.normalizeClass(target.props.class).split(" ").includes(name);
const emit = (target: Host, key: string, event = {}) => {
  const callbacks = Array.isArray(target.props[key]) ? target.props[key] : [target.props[key]];
  for (const callback of callbacks) {
    expect(callback, `missing ${key} on ${target.tag}`).toBeTypeOf("function");
    callback(event);
  }
};
const unmounts: Array<() => void> = [];

async function mount(platform: "app" | "h5" = "app", canonicalNetwork?: ReturnType<typeof useNetwork>) {
  initPreContext(platform);
  const original = parse(raw, { filename: "network.vue" }).descriptor;
  // Reparse after Uni preprocessing: compileScript also consumes the template
  // AST, so changing descriptor.content alone would accidentally test both ports.
  const { descriptor } = parse(raw
    .replace(original.template!.content, preHtml(original.template!.content, "network.vue"))
    .replace(original.scriptSetup!.content, preJs(original.scriptSetup!.content, "network.vue")), { filename: "network.vue" });
  const script = compileScript(descriptor, { id: "network-native-behavior", inlineTemplate: true });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const network = canonicalNetwork ?? Vue.reactive({
    members: [] as NetworkMember[], hasRemoteSnapshot: true, remoteStatus: "ready",
    ensureCanonicalNetwork: vi.fn(), refreshCanonicalNetwork: vi.fn(),
  });
  const rank = Vue.reactive({ myRank: 0, remoteReady: true, ladder: [] });
  const locale = Vue.reactive({ code: "en" as "en" | "zh" | "vi" });
  const dictionaries = { en, zh, vi: viMessages };
  const t = Vue.computed(() => dictionaries[locale.code]);
  const navTo = vi.fn();
  const shows: Array<() => void> = [];
  const hides: Array<() => void> = [];
  const backs: Array<(event: { from: string }) => boolean> = [];
  const uniHooks = { onShow: (callback: () => void) => shows.push(callback), onHide: (callback: () => void) => hides.push(callback),
    onBackPress: (callback: typeof backs[number]) => backs.push(callback) };
  const dialogExports = {} as { useDialogA11y: (...args: any[]) => void };
  const dialogCode = ts.transpileModule(preJs(dialogSource, "use-dialog-a11y.ts"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("require", "exports", dialogCode)((id: string) => {
    if (id === "vue") return Vue;
    if (id === "@dcloudio/uni-app") return uniHooks;
    if (id === "./use-tab-page-lifecycle") return { TAB_LIFECYCLE: Symbol("no-hosted-network-tab") };
    throw new Error(`Unexpected dialog import: ${id}`);
  }, dialogExports);
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
  const deps: Record<string, unknown> = {
    "@/lib/amount-display": { formatAmount },
    "@/lib/display-date": { formatDisplayDateTime },
    "@/i18n/network-reaudit": networkReaudit,
    "@/i18n/compute-points": computePoints,
    "@/lib/brand-copy": { displayNickname },
    vue: Vue, "@/components/svg-text": { default: SvgText },
    "@/components/app-chassis.vue": { default: slot },
    "@/components/sub-page-header.vue": { default: { render: () => Vue.h("view") } },
    "@/components/team/team-rank-emblem.vue": { default: { props: ["rank"], render: () => Vue.h("view") } },
    "@/i18n/use-t": { useT: () => t }, "@/i18n/format": { fmt },
    "@/store/network": { useNetwork: () => network }, "@/store/v-rank": { useVRank: () => rank },
    "@/lib/v-rank-copy": { rankLabel, rankTitle }, "@/store/locale": { useLocaleStore: () => locale },
    "@/composables/use-dialog-a11y": dialogExports,
    "@/api/runtime": { remoteApiEnabled: true },
    "@dcloudio/uni-app": uniHooks,
    "@/lib/route": { navTo },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in deps)) throw new Error(`unexpected page import: ${id}`);
    return deps[id];
  }, exports);
  const root = node("root");
  const app = renderer.createApp(exports.default);
  app.mount(root);
  let mounted = true;
  const dispose = () => { if (mounted) { app.unmount(); mounted = false; } };
  unmounts.push(dispose);
  await Vue.nextTick();
  const controls = () => all(root).filter((item) => item.props.role === "button" && item.props["aria-label"]);
  const self = () => controls().find((item) => item.props["aria-label"] === fmt(t.value.network.selfNodeLabel, { n: rank.remoteReady ? `V${rank.myRank}` : "—" }))!;
  return { root, network, rank, locale, navTo, shows, hides, controls, self, backs, dispose,
    back: (from = "backbutton") => backs.map(callback => callback({ from })).some(consumed => consumed === true) };
}

function member(id: string, layer: NetworkMember["layer"], status: NetworkMember["status"] = "active"): NetworkMember {
  return { id, name: `Member ${id}`, avatar: "M", vRank: 2, layer, status, binary: "unassigned", isSpillover: false,
    joinedAt: Date.now() - 86400000, monthVolumeUSD: 17, totalVolumeUSD: null, monthComputePoints: 320, lifetimeComputePoints: null, city: "Fixture City" };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { unmounts.splice(0).forEach((unmount) => unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("APP empty network uses a square positioned view graph, not unknown SVG and inline labels", async () => {
  const page = await mount();
  const graph = all(page.root).find((item) => hasClass(item, "nx-net-native"));
  expect(graph, "empty native graph must still have its own square layout").toBeDefined();
  expect(style(graph!).paddingTop).toBe("100%");
  expect(all(graph!).some((item) => item.tag === "svg")).toBe(false);
  const orbits = all(graph!).filter((item) => hasClass(item, "nx-net-native-orbit"));
  expect(orbits).toHaveLength(2);
  expect(orbits.map((item) => style(item).width)).toEqual([`${144 / 360 * 100}%`, `${280 / 360 * 100}%`]);
  const labels = all(graph!).filter((item) => item.tag === "text");
  expect(labels.map(text)).toEqual([en.network.diagramYou, "V0"]);
  expect(labels.slice(1).every((item) => style(item).position === "absolute")).toBe(true);
  expect(new Set(labels.slice(1).map((item) => style(item).top)).size).toBe(1);
  expect(page.self().tag).toBe("view");
  emit(page.self(), "onClick");
  expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/team/rank");
});

test("APP real projection binds direct/extended nodes, touch details, close and return without adding facts", async () => {
  const page = await mount();
  page.network.members = [member("one", 1), member("two", 1, "offline"), member("three", 3, "idle")];
  await Vue.nextTick();
  const graph = all(page.root).find((item) => hasClass(item, "nx-net-native"))!;
  expect(graph).toBeDefined();
  const members = page.controls().filter((item) => hasClass(item, "nx-net-node") && item.props["aria-label"].startsWith("Member "));
  expect(members).toHaveLength(3);
  expect(members.every((item) => item.tag === "view")).toBe(true);
  expect(members[0].props["aria-label"]).toBe(`Member one · V2 · ${en.network.badgeDirect}`);
  expect(members[2].props["aria-label"]).toBe(`Member three · V2 · ${en.network.badgeExtended}`);
  expect(style(members[0]).left).toBe("50%");
  expect(style(members[0]).top).toBe(`${108 / 360 * 100}%`);
  expect(all(graph).filter((item) => hasClass(item, "nx-net-native-connection"))).toHaveLength(2);
  emit(members[2], "onClick"); await Vue.nextTick();
  let sheet = all(page.root).find((item) => item.props.role === "dialog")!;
  expect(text(sheet)).toContain("Member three");
  expect(text(sheet)).toContain("Fixture City");
  expect(text(sheet)).toContain("320 compute pts");
  expect(text(sheet)).toContain("—"); // Unknown all-time volume remains unknown.
  emit(all(sheet).find((item) => item.props["aria-label"] === en.ui.close)!, "onClick");
  await Vue.nextTick();
  expect(all(page.root).some((item) => item.props.role === "dialog")).toBe(false);
  page.shows.forEach((callback) => callback()); await Vue.nextTick();
  expect(page.network.ensureCanonicalNetwork).toHaveBeenCalledTimes(2);
  emit(page.controls().find((item) => item.props["aria-label"].startsWith("Member one"))!, "onClick");
  await Vue.nextTick(); sheet = all(page.root).find((item) => item.props.role === "dialog")!;
  expect(text(sheet)).toContain("Member one"); expect(text(sheet)).not.toContain("Member three");
  emit(all(sheet).find((item) => hasClass(item, "nx-net-scrim"))!, "onClick"); await Vue.nextTick();
  expect(all(page.root).some((item) => item.props.role === "dialog")).toBe(false);
  expect(page.network.members.map((item) => item.id)).toEqual(["one", "two", "three"]);
});

test.each(["app", "h5"] as const)("%s preserves unavailable/error and confirmed snapshot semantics", async (platform) => {
  const page = await mount(platform);
  page.network.hasRemoteSnapshot = false; page.network.remoteStatus = "error"; page.rank.remoteReady = false;
  await Vue.nextTick();
  expect(all(page.root).filter((item) => item.tag === "text" && hasClass(item, "tabular-nums") && text(item) === "—")).toHaveLength(3);
  expect(text(page.root)).toContain(en.network.projectionErrorTitle);
  expect(page.self().props["aria-label"]).toContain("—");
  page.network.hasRemoteSnapshot = true; page.network.members = [member("kept", 1)];
  await Vue.nextTick();
  expect(page.controls().some((item) => item.props["aria-label"].startsWith("Member kept"))).toBe(true);
});

test("mounted APP labels follow late rank and all three locale dictionaries", async () => {
  const page = await mount();
  page.rank.remoteReady = false; await Vue.nextTick();
  expect(page.self().props["aria-label"]).toContain("—");
  page.rank.remoteReady = true; page.rank.myRank = 3;
  for (const code of ["zh", "vi", "en"] as const) {
    page.locale.code = code; await Vue.nextTick();
    const dictionary = { en, zh, vi: viMessages }[code];
    expect(page.self().props["aria-label"]).toBe(fmt(dictionary.network.selfNodeLabel, { n: "V3" }));
    expect(text(page.self())).toContain(dictionary.network.diagramYou);
    expect(text(page.root)).toContain(dictionary.network.legendDirect);
    expect(page.self().props["aria-label"]).not.toContain("VV3");
  }
});

test("APP acknowledges only selection, stays still when idle and clears the pulse on hide", async () => {
  const page = await mount();
  page.network.members = [member("active", 1), member("idle", 2, "idle"), member("offline", 2, "offline")];
  await Vue.nextTick(); vi.advanceTimersByTime(1200); await Vue.nextTick();
  expect(all(page.root).some((item) => hasClass(item, 'nx-net-native-pulse'))).toBe(false);
  emit(page.controls().find(item=>item.props['aria-label'].startsWith('Member active'))!, 'onClick');
  await Vue.nextTick();
  const pulses = all(page.root).filter((item) => hasClass(item, "nx-net-native-pulse"));
  expect(pulses).toHaveLength(1);
  expect(pulses[0].parent?.props["aria-label"]).toContain("Member active");
  page.hides.forEach(fn=>fn()); await Vue.nextTick();
  expect(all(page.root).some((item) => hasClass(item, "nx-net-native-pulse"))).toBe(false);
  unmounts.pop()!();
  expect(vi.getTimerCount()).toBe(0);
  const revisited = await mount();
  expect(revisited.controls()).toHaveLength(1);
  expect(all(revisited.root).some((item) => item.props.role === "dialog")).toBe(false);
  emit(revisited.self(), "onClick");
  expect(revisited.navTo).toHaveBeenCalledExactlyOnceWith("/pages/team/rank");
});

test("H5 retains SVG geometry, keyboard self/member activation, pulse and single-V accessible names", async () => {
  const page = await mount("h5");
  expect(all(page.root).some((item) => hasClass(item, "nx-net-native"))).toBe(false);
  const svg = all(page.root).find((item) => item.tag === "svg" && item.props.viewBox === "0 0 360 360")!;
  expect(svg).toBeDefined();
  expect(all(svg).filter((item) => item.tag === "circle").map((item) => item.props.r)).toEqual([72, "140", "50", "18"]);
  expect(all(svg).filter((item) => item.tag === "text")).toHaveLength(2);
  expect(page.self().tag).toBe("g"); expect(page.self().props.tabindex).toBe("0");
  expect(page.self().props["aria-label"]).not.toContain("VV0");
  const preventDefault = vi.fn();
  emit(page.self(), "onKeydown", { key: "Enter", preventDefault });
  expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/team/rank");
  expect(preventDefault).toHaveBeenCalled();
  page.network.members = [member("keyboard", 1)]; await Vue.nextTick();
  const control = page.controls().find((item) => item.props["aria-label"].startsWith("Member keyboard"))!;
  emit(control, "onKeydown", { key: " ", preventDefault }); await Vue.nextTick();
  expect(text(all(page.root).find((item) => item.props.role === "dialog")!)).toContain("Member keyboard");
  expect(all(svg).filter((item) => item.tag === "animate")).toHaveLength(2);
  expect(all(svg).some((item) => item.tag === "set")).toBe(true);
  vi.advanceTimersByTime(1000); await Vue.nextTick();
  expect(all(svg).filter((item) => item.tag === 'animate')).toHaveLength(0);
});

test('H5 does not mount SVG animations with reduced motion and responds to setting changes',async()=>{
  let changed!:()=>void;
  const media={matches:true,addEventListener:vi.fn((_event:string,listener:()=>void)=>{changed=listener;}),removeEventListener:vi.fn()};
  vi.stubGlobal('window',{matchMedia:vi.fn(()=>media)});
  const page=await mount('h5');page.network.members=[member('A',1),member('B',1)];await Vue.nextTick();
  emit(page.controls().find(item=>item.props['aria-label'].startsWith('Member A'))!,'onClick');await Vue.nextTick();
  expect(all(page.root).filter(item=>item.tag==='animate')).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
  media.matches=false;changed();
  emit(page.controls().find(item=>item.props['aria-label'].startsWith('Member B'))!,'onClick');await Vue.nextTick();
  expect(all(page.root).filter(item=>item.tag==='animate')).toHaveLength(2);
  media.matches=true;changed();await Vue.nextTick();
  expect(all(page.root).filter(item=>item.tag==='animate')).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

async function selectedCanonicalPage(platform: "app" | "h5") {
  setActivePinia(createPinia());
  const network = useNetwork();
  const page = await mount(platform, network);
  unmounts.push(() => network.$dispose());
  network.members = [member("original", 1)];
  network.hasRemoteSnapshot = true;
  network.remoteStatus = "ready";
  await Vue.nextTick();
  emit(page.controls().find(item => item.props["aria-label"].startsWith("Member original"))!, "onClick");
  await Vue.nextTick();
  const sheet = () => all(page.root).find(item => item.props.role === "dialog");
  expect(text(sheet()!)).toContain("Member original");
  return { ...page, network, sheet };
}

test("Android Back closes the selected canonical member sheet before page navigation", async () => {
  const page = await selectedCanonicalPage("app"); expect(page.backs).toHaveLength(1);
  expect(page.back()).toBe(true); await Vue.nextTick();
  expect(page.sheet()).toBeUndefined(); expect(page.navTo).not.toHaveBeenCalled();
  expect(page.back()).toBe(false);
});

test("a network page without a selected sheet leaves native Back unconsumed", async () => {
  const page = await mount(); expect(page.backs).toHaveLength(1); expect(page.back()).toBe(false);
});

test("programmatic Back is not consumed or used to cancel the network sheet", async () => {
  const page = await selectedCanonicalPage("app"); expect(page.backs).toHaveLength(1);
  expect(page.back("navigateBack")).toBe(false); expect(page.sheet()).toBeDefined();
  expect(page.back()).toBe(true); await Vue.nextTick(); expect(page.sheet()).toBeUndefined();
});

test("a retained hidden network cannot intercept the active page and resumes only its own open sheet", async () => {
  const page = await selectedCanonicalPage("app"); expect(page.backs).toHaveLength(1);
  page.hides.forEach(hide => hide()); expect(page.back()).toBe(false); expect(page.sheet()).toBeDefined();
  page.shows.forEach(show => show()); expect(page.back()).toBe(true); await Vue.nextTick(); expect(page.sheet()).toBeUndefined();
});

test("unmount removes the selected network dialog from its old page Back hook", async () => {
  const page = await selectedCanonicalPage("app"); expect(page.backs).toHaveLength(1);
  page.dispose(); expect(page.back()).toBe(false);
});

test("account clear removes Back interception and cannot reopen an old same-ID member", async () => {
  const page = await selectedCanonicalPage("app"); expect(page.backs).toHaveLength(1);
  page.network.bindAccount("user:other"); await Vue.nextTick(); expect(page.sheet()).toBeUndefined(); expect(page.back()).toBe(false);
  page.network.members = [member("original", 1)]; await Vue.nextTick(); expect(page.sheet()).toBeUndefined(); expect(page.back()).toBe(false);
});

test("H5 registers no native Back hook and retains Escape close and focus restoration", async () => {
  const listeners = new Map<string, (event: any) => void>();
  let active: Focusable;
  class Focusable { getClientRects() { return [1]; } focus = vi.fn(() => { active = this; }); }
  const trigger = new Focusable(), close = new Focusable(); active = trigger;
  vi.stubGlobal("HTMLElement", Focusable); vi.stubGlobal("SVGElement", class {});
  vi.stubGlobal("document", { get activeElement() { return active; }, querySelector: () => ({ querySelectorAll: () => [close] }),
    addEventListener: (kind: string, callback: (event: any) => void) => listeners.set(kind, callback),
    removeEventListener: (kind: string) => listeners.delete(kind) });
  const page = await selectedCanonicalPage("h5"); await Vue.nextTick(); await Vue.nextTick();
  expect(page.backs).toHaveLength(0); expect(active === close).toBe(true);
  const preventDefault = vi.fn(), stopPropagation = vi.fn();
  listeners.get("keydown")!({ key: "Escape", preventDefault, stopPropagation }); await Vue.nextTick();
  expect(page.sheet()).toBeUndefined(); expect(preventDefault).toHaveBeenCalled(); expect(stopPropagation).toHaveBeenCalled();
  await Vue.nextTick(); expect(active === trigger).toBe(true); expect(listeners.has("keydown")).toBe(false);
  page.dispose(); expect(listeners.size).toBe(0);
});

test.each(["app", "h5"] as const)("%s canonical account clear closes detail and cannot reopen it from a later same-ID member", async platform => {
  const page = await selectedCanonicalPage(platform);
  page.network.bindAccount("user:next");
  await Vue.nextTick();
  expect(page.network.members).toEqual([]);
  expect(page.network.hasRemoteSnapshot).toBe(false);
  expect(page.sheet()).toBeUndefined();
  page.network.members = [{ ...member("original", 1), name: "New account member" }];
  await Vue.nextTick();
  expect(page.sheet()).toBeUndefined();
  emit(page.controls().find(item => item.props["aria-label"].startsWith("New account member"))!, "onClick");
  await Vue.nextTick();
  expect(text(page.sheet()!)).toContain("New account member");
  expect(text(page.sheet()!)).not.toContain("Member original");
});

test.each(["app", "h5"] as const)("%s canonical member removal closes detail and does not revive a removed selection", async platform => {
  const page = await selectedCanonicalPage(platform);
  page.network.members = [];
  await Vue.nextTick();
  expect(page.sheet()).toBeUndefined();
  page.network.members = [member("original", 1)];
  await Vue.nextTick();
  expect(page.sheet()).toBeUndefined();
});

test.each(["app", "h5"] as const)("%s confirmed selection survives retry and reads refreshed canonical fields", async platform => {
  const page = await selectedCanonicalPage(platform);
  page.network.remoteStatus = "loading";
  await Vue.nextTick();
  expect(text(page.sheet()!)).toContain("Member original");
  page.network.remoteStatus = "error";
  await Vue.nextTick();
  expect(text(page.sheet()!)).toContain("Fixture City");
  page.network.members = [{ ...member("original", 1), name: "Updated canonical member", monthVolumeUSD: 93, monthComputePoints: 1440, city: "Updated city" }];
  await Vue.nextTick();
  expect(text(page.sheet()!)).toContain("Updated canonical member");
  expect(text(page.sheet()!)).toContain("1,440 compute pts");
  expect(text(page.sheet()!)).toContain("Updated city");
  expect(text(page.sheet()!)).not.toContain("Member original");
  expect(text(page.sheet()!)).not.toContain("Fixture City");
});


test.each(["app", "h5"] as const)("%s displays historical reset names in nodes and refreshed details without changing raw members", async platform => {
  const page = await mount(platform);
  for (const code of ["zh", "en", "vi"] as const) {
    page.locale.code = code;
    page.network.members = [{ ...member("53018", 1), name: "NexGrid-F343FA44" }];
    await Vue.nextTick();
    const control = page.controls().find(item => item.props["aria-label"].startsWith("UVEL-F343FA44"))!;
    emit(control, "onClick"); await Vue.nextTick();
    const sheet = () => all(page.root).find(item => item.props.role === "dialog")!;
    expect(text(sheet())).toContain("UVEL-F343FA44");
    expect(page.network.members[0].name).toBe("NexGrid-F343FA44");
    page.network.members = [{ ...member("53018", 1), name: "NexGrid fan" }];
    await Vue.nextTick();
    expect(text(sheet())).toContain("NexGrid fan");
    expect(page.controls().some(item => item.props["aria-label"].startsWith("NexGrid fan"))).toBe(true);
  }
});


// Assert the actual platform template, canonical store projection and local
// getters, rather than treating a TZ environment value as calendar coverage.
test.each(["app", "h5"] as const)("%s member sheet renders canonical join instants as complete local dates", async platform => {
  const timestamp = "2025-12-31T16:05:06Z";
  const payload = { totalMembers: 1, directMembers: 1, activeMembers: 1,
    monthVolumeUsdt: 17, lifetimeVolumeUsdt: null, generatedAt: "2026-10-27T00:00:00Z",
    source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    members: [{ id: "42", name: "Member 42", avatarUrl: null, vRank: 2, layer: 1,
      leg: "A", joinedAt: timestamp, monthVolumeUsdt: 17, lifetimeVolumeUsdt: null,
      status: "ACTIVE", region: "Fixture City" }], nextCursor: null };
  const api = createTeamNetworkApi({ request: vi.fn().mockResolvedValue(payload) } as any, "prod");
  runtime.snapshot.mockImplementationOnce(() => api.snapshot());
  setActivePinia(createPinia());
  const network = useNetwork();
  expect(await network.refreshCanonicalNetwork()).toBe(true);
  expect(network.members[0].joinedAt).toBe(Date.parse(timestamp));
  const page = await mount(platform, network);
  emit(page.controls().find(item => item.props["aria-label"].startsWith("Member 42"))!, "onClick");
  await Vue.nextTick();
  for (const [zone, offset, expected] of [
    ["Asia/Tokyo", -540, ["2026/01/01 01:05", "Jan 1, 2026 01:05", "01/01/2026 01:05"]],
    ["America/Los_Angeles", 480, ["2025/12/31 08:05", "Dec 31, 2025 08:05", "31/12/2025 08:05"]],
  ] as const) {
    vi.stubEnv("TZ", zone);
    expect(new Date(timestamp).getTimezoneOffset()).toBe(offset);
    vi.stubGlobal("Intl", undefined);
    for (const [index, language] of (["zh", "en", "vi"] as const).entries()) {
      page.locale.code = language; await Vue.nextTick();
      const sheet = all(page.root).find(item => item.props.role === "dialog")!;
      const joined = all(sheet).find(item => hasClass(item, "sheet-detail-row") && text(item).startsWith(({ zh, en, vi: viMessages })[language].network.joined))!;
      expect(text(joined.children.at(-1)!)).toBe(expected[index]);
      expect(text(sheet)).toContain("Member 42");
      expect(network.members[0]).toMatchObject({ id: "42", joinedAt: Date.parse(timestamp), layer: 1, status: "active", totalVolumeUSD: null });
    }
  }
});

test.each(["app", "h5"] as const)("%s member sheet keeps invalid joins unknown and never guesses numeric seconds", async platform => {
  vi.stubEnv("TZ", "UTC");
  expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).toBe(0);
  const page = await mount(platform);
  page.network.members = [member("unknown", 1)]; await Vue.nextTick();
  emit(page.controls().find(item => item.props["aria-label"].startsWith("Member unknown"))!, "onClick");
  for (const value of [0, -1, NaN, Infinity, 9e18, null, undefined]) {
    page.network.members = [{ ...member("unknown", 1), joinedAt: value as number }]; await Vue.nextTick();
    const sheet = all(page.root).find(item => item.props.role === "dialog")!;
    const joined = all(sheet).find(item => hasClass(item, "sheet-detail-row") && text(item).startsWith(en.network.joined))!;
    expect(text(joined.children.at(-1)!)).toBe("—");
  }
  page.network.members = [{ ...member("unknown", 1), joinedAt: 1767197106 }]; await Vue.nextTick();
  const sheet = all(page.root).find(item => item.props.role === "dialog")!;
  const joined = all(sheet).find(item => hasClass(item, "sheet-detail-row") && text(item).startsWith(en.network.joined))!;
  expect(text(joined.children.at(-1)!)).toBe("Jan 21, 1970 10:53");
});
