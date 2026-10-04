import * as Vue from "vue";
import type { Component } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import raw from "./trial-entry.vue?raw";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import type { TrialStatus } from "@/store/trial-boundary";

vi.mock("@/api/runtime", () => ({ remoteApiEnabled: false, i18nApi: { all: vi.fn() } }));

// Execute the production script and template with the real reactive translations.
const { descriptor } = parse(raw, { filename: "trial-entry.vue" });
const script = compileScript(descriptor, { id: "trial-entry-behavior", inlineTemplate: true });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type HostNode = { type: string; text: string; parent: HostNode | null; children: HostNode[]; props: Record<string, unknown> };
const node = (type: string, text = ""): HostNode => ({ type, text, parent: null, children: [], props: {} });
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: type => node(type), createText: text => node("text", text), createComment: () => node("comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent) => { child.parent = parent; parent.children.push(child); },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child); },
});
const textContent = (target: HostNode): string => target.text + target.children.map(textContent).join("");
const findAction = (target: HostNode): HostNode | undefined =>
  target.props["data-me-action"] === "trial" ? target : target.children.map(findAction).find(Boolean);
const unmounts: Array<() => void> = [];

async function mount(status: TrialStatus) {
  const trial = Vue.reactive({ status });
  const navTo = vi.fn();
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@/lib/route": { navTo }, "@/i18n/use-t": { useT }, "@/i18n/format": { fmt },
    "@/store/free-trial": { useFreeTrial: () => trial },
    "@/components/trial-promo-banner.vue": { default: { render: () => Vue.h("promo-fixture") } },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected component import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node("root");
  const app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  return { root, trial, navTo, action: () => findAction(root) };
}

beforeEach(() => {
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn() });
  setActivePinia(createPinia());
});
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.unstubAllGlobals(); });

test.each([
  ["en", "active", "Trial in progress · Active"],
  ["en", "grace", "Trial ended · Production stopped"],
  ["zh", "active", "试用进行中 · 体验中"],
  ["zh", "grace", "试用已结束 · 已停止产出"],
  ["vi", "active", "Đang dùng thử · Đang chạy"],
  ["vi", "grace", "Đã kết thúc dùng thử · Đã ngừng sinh lời"],
] as const)("renders the %s %s entry with its truthful title and detail route", async (locale, status, title) => {
  useLocaleStore().setLocale(locale);
  const entry = await mount(status);
  const action = entry.action()!;
  expect(action).toBeDefined();
  expect(action.children[0].children[0].text).toBe(title);
  expect(action.props["aria-label"]).toBe(title);
  expect(action.props.role).toBe("button");
  (action.props.onClick as () => void)();
  expect(entry.navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/trial");
  expect(entry.trial.status).toBe(status);
});

test("a mounted entry follows status and locale changes while retaining the same detail entry", async () => {
  const locale = useLocaleStore(); locale.setLocale("en");
  const entry = await mount("active");
  entry.trial.status = "grace"; await Vue.nextTick();
  expect(entry.action()?.props["aria-label"]).toBe("Trial ended · Production stopped");
  locale.setLocale("zh"); await Vue.nextTick();
  expect(entry.action()?.props["aria-label"]).toBe("试用已结束 · 已停止产出");
  entry.trial.status = "active"; await Vue.nextTick();
  expect(entry.action()?.props["aria-label"]).toBe("试用进行中 · 体验中");
  expect(entry.trial.status).toBe("active");
});

test.each(["none", "ended", "converted"] as const)("keeps %s delegated to the existing promo component", async status => {
  const entry = await mount(status);
  expect(entry.action()).toBeUndefined();
  expect(entry.root.children.some(child => child.type === "promo-fixture")).toBe(true);
  expect(textContent(entry.root)).toBe("");
  expect(entry.trial.status).toBe(status);
});
