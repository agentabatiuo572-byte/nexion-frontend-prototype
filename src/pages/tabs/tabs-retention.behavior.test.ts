import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import tabsSource from "./tabs.vue?raw";
import contentSource from "@/components/native-tab-content.vue?raw";
import * as navigation from "@/lib/native-tab-navigation";
import * as lifecycle from "@/composables/use-tab-page-lifecycle";
import { useNow } from "@/composables/use-now";

vi.mock("@dcloudio/uni-app", () => ({ onLoad: vi.fn(), onShow: vi.fn(), onHide: vi.fn(), onUnload: vi.fn() }));

type Node = { children: Node[]; parent?: Node; style: Record<string, string> };
const node = (): Node => ({ children: [], style: {} });
const renderer = Vue.createRenderer<Node, Node>({
  createElement: node, createText: node, createComment: node,
  setText() {}, setElementText() {}, patchProp() {},
  parentNode: item => item.parent ?? null, nextSibling: () => null,
  insert(item, parent) { if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item); item.parent = parent; parent.children.push(item); },
  remove(item) { if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item); },
});

function component(source: string, imports: Record<string, unknown>) {
  const script = compileScript(parse(source).descriptor, { id: "retained-tab-test", inlineTemplate: true, templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" } } });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", code)((id: string) => id === "vue" ? Vue : id.endsWith(".vue") ? { default: imports[id] } : imports[id], exports);
  return exports.default;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("retains at most one instance per tab/query, delivers visibility, and discards account/locale scopes", async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  const instances: Record<string, number> = {};
  const appState = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
  const locale = Vue.reactive({ code: "en" });
  const runtime = Vue.reactive({ environment: "dev", baseUrl: "https://test.example" });
  const page = { route: "pages/tabs/tabs" };
  vi.stubGlobal("getCurrentPages", () => [page]);
  const pages = Object.fromEntries(Object.keys(navigation.TAB_PATHS).map(name => [name, Vue.defineComponent({ setup() {
    const serial = instances[name] = (instances[name] ?? 0) + 1;
    const label = `${name}:${serial}`;
    useNow();
    lifecycle.onLoad(query => events.push(`${label}:load:${query?.activityId ?? ""}`));
    lifecycle.onShow(() => events.push(`${label}:show`));
    lifecycle.onHide(() => events.push(`${label}:hide`));
    lifecycle.onUnload(() => events.push(`${label}:unload`));
    return () => Vue.h("view", label);
  } })]));
  const content = component(contentSource, { "@/composables/use-tab-page-lifecycle": lifecycle });
  const loaded: Array<(query: Record<string, string>) => void> = [];
  const hidden: Array<() => void> = [], shown: Array<() => void> = [];
  const frame = Vue.defineComponent({ setup(_, { slots }) { return () => Vue.h("view", slots.default?.()); } });
  const tabs = component(tabsSource, {
    "@dcloudio/uni-app": { onLoad: (fn: typeof loaded[number]) => loaded.push(fn), onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    "@/components/app-chassis.vue": frame, "@/components/native-tab-content.vue": content,
    ...Object.fromEntries(Object.entries(navigation.TAB_PATHS).map(([name, path]) => [`@${path.slice(0)}.vue`, pages[name]])),
    "@/composables/use-tab-page-lifecycle": lifecycle, "@/lib/native-tab-navigation": navigation,
    "@/lib/passive-read-window": { notifyPageActivation: () => {} },
    "@/store/app": { useApp: () => appState }, "@/store/locale": { useLocaleStore: () => locale }, "@/api/runtime": { apiRuntimeConfig: runtime },
  });
  const app = renderer.createApp(tabs);
  app.mount(node()); loaded[0]({});
  const select = async (href: string) => { expect(navigation.switchNativeTab(href)).toBe(true); await Vue.nextTick(); };
  await select("/pages/store/store?activityId=a");
  await select("/pages/index/index");
  expect(instances.home).toBe(1);
  expect(events.filter(value => value === "home:1:show")).toHaveLength(2);
  expect(events).toContain("store:1:hide");
  expect(events).not.toContain("home:1:unload");
  expect(vi.getTimerCount()).toBe(1);
  await select("/pages/store/store?activityId=b");
  expect(events).toContain("store:1:unload");
  expect(events).toContain("store:2:load:b");
  for (const path of Object.values(navigation.TAB_PATHS)) await select(path);
  expect(Object.values(instances).reduce((a, b) => a + b, 0) - events.filter(value => value.endsWith(":unload")).length).toBe(5);
  hidden[0](); await Vue.nextTick(); expect(vi.getTimerCount()).toBe(0);
  shown[0](); await Vue.nextTick(); expect(vi.getTimerCount()).toBe(1);
  for (const change of [() => appState.accountBindingEpoch++, () => appState.accountKey = "user:2", () => locale.code = "vi", () => runtime.baseUrl = "https://prod.example"]) {
    change(); await Vue.nextTick();
    expect(Object.values(instances).reduce((a, b) => a + b, 0) - events.filter(value => value.endsWith(":unload")).length).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  }
  app.unmount(); expect(vi.getTimerCount()).toBe(0);
  expect(navigation.switchNativeTab("/pages/earn/earn")).toBe(false);
});
