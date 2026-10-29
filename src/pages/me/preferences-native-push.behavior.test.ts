import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preJs, preHtml } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { nativePushCopy } from "@/i18n/native-push";
import type { PushPermission } from "@/services/native-push-controller";
import source from "./preferences.vue?raw";

type Node = { children: Node[]; parent: Node | null; props: Record<string, any>; text: string };
const node = (): Node => ({ children: [], parent: null, props: {}, text: "" });
const renderer = Vue.createRenderer<Node, Node>({
  createElement: node, createText: text => ({ ...node(), text }), createComment: node,
  setText(target, text) { target.text = text; }, setElementText(target, text) { target.text = text; target.children = []; },
  patchProp: (target, key, _old, value) => { target.props[key] = value; },
  parentNode: item => item.parent, nextSibling: () => null,
  insert(item, parent) { item.parent = parent; parent.children.push(item); },
  remove(item) { if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item); },
});
const all = (root: Node): Node[] => [root, ...root.children.flatMap(all)];
const disposals: Array<() => void> = [];
afterEach(() => disposals.splice(0).forEach(dispose => dispose()));

function mount(platform: "app" | "h5" = "app", state: PushPermission = "unknown", language = "zh") {
  initPreContext(platform);
  const descriptor = parse(source).descriptor;
  const processed = source.replace(descriptor.scriptSetup!.content, preJs(descriptor.scriptSetup!.content, "preferences.vue"))
    .replace(descriptor.template!.content, preHtml(descriptor.template!.content, "preferences.vue"));
  const code = ts.transpileModule(compileScript(parse(processed).descriptor, { id: "preferences-push", inlineTemplate: true }).content,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const permission = Vue.ref(state), locale = Vue.reactive({ code: language });
  const push = { nativePushPermission: permission, refreshNativePush: vi.fn(), requestNativePushPermission: vi.fn(), openNativePushSettings: vi.fn() };
  const shows: Array<() => void> = [];
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
  const imports: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: (fn: () => void) => shows.push(fn) },
    "@/components/app-chassis.vue": { default: slot }, "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/components/me/preference-toggle-row.vue": { default: { render: () => null } },
    "@/i18n/use-t": { useT: () => Vue.ref(zh) },
    "@/store/preferences": { usePreferences: () => ({ remoteReady: false, error: null }), isMandatoryNotifKind: (kind: string) => kind === "system" },
    "@/services/native-push": push, "@/i18n/native-push": { nativePushCopy }, "@/store/locale": { useLocaleStore: () => locale },
  };
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", code)((id: string) => imports[id], exports);
  const app = renderer.createApp(exports.default), root = node(); app.mount(root);
  disposals.push(() => app.unmount()); shows.forEach(show => show());
  const panel = () => all(root).find(item => item.props["data-testid"] === "system-notifications");
  return { push, permission, locale, panel, shows, text: () => all(root).map(item => item.text).join(""),
    click: () => panel()!.children.find(item => item.props.role === "button")!.props.onClick() };
}

it("requests first permission from the unknown native state and refreshes on page show", () => {
  const page = mount(); expect(page.text()).toContain(nativePushCopy.zh.unknown); page.click();
  expect(page.push.refreshNativePush).toHaveBeenCalledOnce(); expect(page.push.requestNativePushPermission).toHaveBeenCalledOnce();
  expect(page.push.openNativePushSettings).not.toHaveBeenCalled();
});
it.each(["granted", "denied"] as const)("opens system settings from actual %s state", state => {
  const page = mount("app", state); expect(page.text()).toContain(nativePushCopy.zh[state]); page.click();
  expect(page.push.openNativePushSettings).toHaveBeenCalledOnce(); expect(page.push.requestNativePushPermission).not.toHaveBeenCalled();
});
it.each(["zh", "en", "vi"] as const)("renders and reacts to permission readback in %s", async language => {
  const page = mount("app", "unknown", language); expect(page.text()).toContain(nativePushCopy[language].title);
  page.permission.value = "denied"; await Vue.nextTick(); expect(page.text()).toContain(nativePushCopy[language].denied);
  page.click(); expect(page.push.openNativePushSettings).toHaveBeenCalledOnce();
});
it("compiles the native permission panel and lifecycle hook out of H5", () => {
  const page = mount("h5"); expect(page.panel()).toBeUndefined(); expect(page.shows).toHaveLength(0);
  expect(page.push.refreshNativePush).not.toHaveBeenCalled(); expect(page.text()).not.toContain(nativePushCopy.zh.title);
});
