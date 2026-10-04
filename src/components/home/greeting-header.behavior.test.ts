import * as Vue from "vue";
import type { Component } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import raw from "./greeting-header.vue?raw";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useI18nRuntime } from "@/store/i18n-runtime";
import { hydrateCurrentProfileLocale } from "@/lib/locale-profile-sync-runtime";
import { pendingProfileLocaleHydration } from "@/lib/locale-profile-hydration";
import { homeGreetingName } from "./home-greeting";
import { nexGridBrandText } from "@/lib/brand-copy";
import type { LocaleCode } from "@/i18n";

const requests = vi.hoisted(() => ({ profile: vi.fn(), bundle: vi.fn() }));
vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  sessionVault: { read: () => ({ user: { userId: 3778 } }), revision: () => 1 },
  profileApi: { profile: requests.profile, updateLanguage: vi.fn() },
  i18nApi: { all: requests.bundle },
}));
vi.mock("@/store/app", () => ({ useApp: () => ({ accountKey: "user:3778" }) }));

// Compile the real SFC, including its template, and mount it on Vue's renderer.
const { descriptor } = parse(raw, { filename: "greeting-header.vue" });
const script = compileScript(descriptor, { id: "greeting-header-behavior", inlineTemplate: true });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type HostNode = { text: string; parent: HostNode | null; children: HostNode[] };
const node = (text = ""): HostNode => ({ text, parent: null, children: [] });
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: () => node(), createText: node, createComment: () => node(),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: () => {}, parentNode: (child) => child.parent,
  nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent) => { child.parent = parent; parent.children.push(child); },
  remove: (child) => { if (child.parent) child.parent.children = child.parent.children.filter((entry) => entry !== child); },
});
const textContent = (target: HostNode): string => target.text + target.children.map(textContent).join("");
const unmounts: Array<() => void> = [];

async function mount(hour = 15, displayName = "UVEL 3778") {
  vi.setSystemTime(new Date(2026, 8, 30, hour, 0));
  const profile = Vue.reactive({ displayName });
  const dependencies: Record<string, unknown> = {
    vue: Vue,
    "@/i18n/use-t": { useT },
    "@/store/profile": { useProfile: () => profile },
    "./home-greeting": { homeGreetingName },
    "@/lib/brand-copy": { nexGridBrandText },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected component import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node();
  const app = renderer.createApp(exports.default);
  app.mount(root);
  unmounts.push(() => app.unmount());
  await Vue.nextTick();
  return { profile, text: () => textContent(root) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn() });
  setActivePinia(createPinia());
  requests.profile.mockReset(); requests.bundle.mockReset();
});
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

const afternoon = { en: "Good afternoon", vi: "Chào buổi chiều", zh: "下午好" };
test.each([
  ["en", "vi"], ["en", "zh"], ["vi", "en"], ["vi", "zh"], ["zh", "en"], ["zh", "vi"],
] as Array<[keyof typeof afternoon, keyof typeof afternoon]>)
("a mounted greeting follows %s → %s without remounting", async (from, to) => {
  const locale = useLocaleStore(); locale.setLocale(from);
  const header = await mount();
  expect(header.text()).toBe(`${afternoon[from]}, UVEL 3778`);
  locale.setLocale(to);
  await Vue.nextTick();
  expect(header.text()).toBe(`${afternoon[to]}, UVEL 3778`);
});

test("late account-language hydration updates the already mounted greeting", async () => {
  const locale = useLocaleStore(); locale.setLocale("vi");
  const header = await mount(18);
  let resolve!: (profile: { language: LocaleCode }) => void;
  requests.profile.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  hydrateCurrentProfileLocale();
  expect(header.text()).toBe("Chào buổi tối, UVEL 3778");
  resolve({ language: "zh" });
  await pendingProfileLocaleHydration({ accountId: "user:3778", revision: 1 });
  await Vue.nextTick();
  expect(header.text()).toBe("晚上好, UVEL 3778");
});

test("a freshly published dictionary updates a mounted greeting in the same locale", async () => {
  useLocaleStore().setLocale("zh");
  const header = await mount();
  expect(header.text()).toBe("下午好, UVEL 3778");
  requests.bundle.mockResolvedValueOnce({ messages: { "home.greetingAfternoon": "午后好" } });
  await useI18nRuntime().refresh("zh", true);
  await Vue.nextTick();
  expect(header.text()).toBe("午后好, UVEL 3778");
});

test.each([
  [0, "深夜"], [4, "深夜"], [5, "早上好"], [11, "早上好"],
  [12, "下午好"], [17, "下午好"], [18, "晚上好"], [23, "晚上好"],
] as Array<[number, string]>)("preserves the local-hour boundary at %s", async (hour, greeting) => {
  useLocaleStore().setLocale("zh");
  expect((await mount(hour)).text()).toBe(`${greeting}, UVEL 3778`);
});

test("locale changes keep the hour captured when the component mounted", async () => {
  const locale = useLocaleStore(); locale.setLocale("zh");
  const header = await mount(11);
  vi.setSystemTime(new Date(2026, 8, 30, 18, 0));
  locale.setLocale("en");
  await Vue.nextTick();
  expect(header.text()).toBe("Good morning, UVEL 3778");
});

test("preserves the fallback and full server nickname while the locale changes", async () => {
  const locale = useLocaleStore(); locale.setLocale("zh");
  const header = await mount(15, "");
  expect(header.text()).toBe("下午好, UVEL");
  header.profile.displayName = "  UVEL 3778 Two Words  ";
  locale.setLocale("en");
  await Vue.nextTick();
  expect(header.text()).toBe("Good afternoon, UVEL 3778 Two Words");
});
