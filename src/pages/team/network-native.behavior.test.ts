import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import raw from "./network.vue?raw";
import SvgText from "@/components/svg-text";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as viMessages } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { rankLabel, rankTitle } from "@/lib/v-rank-copy";
import type { NetworkMember } from "@/store/network";

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

async function mount(platform: "app" | "h5" = "app") {
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
  const network = Vue.reactive({
    members: [] as NetworkMember[], hasRemoteSnapshot: true, remoteStatus: "ready",
    ensureCanonicalNetwork: vi.fn(), refreshCanonicalNetwork: vi.fn(),
  });
  const rank = Vue.reactive({ myRank: 0, remoteReady: true, ladder: [] });
  const locale = Vue.reactive({ code: "en" as "en" | "zh" | "vi" });
  const dictionaries = { en, zh, vi: viMessages };
  const t = Vue.computed(() => dictionaries[locale.code]);
  const navTo = vi.fn();
  const shows: Array<() => void> = [];
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
  const deps: Record<string, unknown> = {
    vue: Vue, "@/components/svg-text": { default: SvgText },
    "@/components/app-chassis.vue": { default: slot },
    "@/components/sub-page-header.vue": { default: { render: () => Vue.h("view") } },
    "@/components/team/v-badge.vue": { default: { props: ["v"], render: () => Vue.h("view") } },
    "@/i18n/use-t": { useT: () => t }, "@/i18n/format": { fmt },
    "@/store/network": { useNetwork: () => network }, "@/store/v-rank": { useVRank: () => rank },
    "@/lib/v-rank-copy": { rankLabel, rankTitle }, "@/store/locale": { useLocaleStore: () => locale },
    "@/composables/use-dialog-a11y": { useDialogA11y: () => {} },
    "@/api/runtime": { remoteApiEnabled: true },
    "@dcloudio/uni-app": { onShow: (callback: () => void) => shows.push(callback) },
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
  unmounts.push(() => app.unmount());
  await Vue.nextTick();
  const controls = () => all(root).filter((item) => item.props.role === "button" && item.props["aria-label"]);
  const self = () => controls().find((item) => item.props["aria-label"] === fmt(t.value.network.selfNodeLabel, { n: rank.remoteReady ? `V${rank.myRank}` : "—" }))!;
  return { root, network, rank, locale, navTo, shows, controls, self };
}

function member(id: string, layer: NetworkMember["layer"], status: NetworkMember["status"] = "active"): NetworkMember {
  return { id, name: `Member ${id}`, avatar: "M", vRank: 2, layer, status, binary: "unassigned", isSpillover: false,
    joinedAt: Date.now() - 86400000, monthVolumeUSD: 17, totalVolumeUSD: null, city: "Fixture City" };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { unmounts.splice(0).forEach((unmount) => unmount()); vi.useRealTimers(); });

test("APP empty network uses a square positioned view graph, not unknown SVG and inline labels", async () => {
  const page = await mount();
  const graph = all(page.root).find((item) => hasClass(item, "nx-net-native"));
  expect(graph, "empty native graph must still have its own square layout").toBeDefined();
  expect(style(graph!).paddingTop).toBe("100%");
  expect(all(graph!).some((item) => item.tag === "svg")).toBe(false);
  const orbits = all(graph!).filter((item) => hasClass(item, "nx-net-native-orbit"));
  expect(orbits).toHaveLength(2);
  expect(orbits.map((item) => style(item).width)).toEqual([`${116 / 360 * 100}%`, `${264 / 360 * 100}%`]);
  const labels = all(graph!).filter((item) => item.tag === "text");
  expect(labels.map(text)).toEqual([en.network.diagramYou, "V0", en.network.badgeDirect, en.network.badgeExtended]);
  expect(labels.slice(1).every((item) => style(item).position === "absolute")).toBe(true);
  expect(new Set(labels.slice(1).map((item) => style(item).top)).size).toBe(3);
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
  const members = page.controls().filter((item) => item.props["aria-label"].startsWith("Member "));
  expect(members).toHaveLength(3);
  expect(members.every((item) => item.tag === "view")).toBe(true);
  expect(members[0].props["aria-label"]).toBe(`Member one · V2 · ${en.network.badgeDirect}`);
  expect(members[2].props["aria-label"]).toBe(`Member three · V2 · ${en.network.badgeExtended}`);
  expect(style(members[0]).left).toBe("50%");
  expect(style(members[0]).top).toBe(`${122 / 360 * 100}%`);
  expect(all(graph).filter((item) => hasClass(item, "nx-net-native-connection"))).toHaveLength(2);
  emit(members[2], "onClick"); await Vue.nextTick();
  let sheet = all(page.root).find((item) => item.props.role === "dialog")!;
  expect(text(sheet)).toContain("Member three");
  expect(text(sheet)).toContain("Fixture City");
  expect(text(sheet)).toContain("$17");
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
    expect(text(page.root)).toContain(dictionary.network.badgeDirect);
    expect(page.self().props["aria-label"]).not.toContain("VV3");
  }
});

test("APP pulse uses only actual active nodes and is cleaned up before a fresh visit", async () => {
  const page = await mount();
  page.network.members = [member("active", 1), member("idle", 2, "idle"), member("offline", 2, "offline")];
  await Vue.nextTick(); vi.advanceTimersByTime(1200); await Vue.nextTick();
  const pulses = all(page.root).filter((item) => hasClass(item, "nx-net-native-pulse"));
  expect(pulses).toHaveLength(1);
  expect(pulses[0].parent?.props["aria-label"]).toContain("Member active");
  page.network.members = [member("offline", 2, "offline")];
  await Vue.nextTick(); vi.advanceTimersByTime(1200); await Vue.nextTick();
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
  expect(all(svg).filter((item) => item.tag === "circle").map((item) => item.props.r)).toEqual(["58", "132", "50", "14"]);
  expect(all(svg).filter((item) => item.tag === "text")).toHaveLength(4);
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
  vi.advanceTimersByTime(1200); await Vue.nextTick();
  expect(all(svg).filter((item) => item.tag === "animate")).toHaveLength(2);
  expect(all(svg).some((item) => item.tag === "set")).toBe(true);
});
