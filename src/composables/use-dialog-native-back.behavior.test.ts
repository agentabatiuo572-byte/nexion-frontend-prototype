import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDialogA11y } from "./use-dialog-a11y";
import * as tabLifecycle from "./use-tab-page-lifecycle";
import dialogSource from "./use-dialog-a11y.ts?raw";
import themeSource from "@/components/me/theme-picker-sheet.vue?raw";
import globalSource from "@/components/global-ui.vue?raw";
import { zh } from "@/i18n/messages/zh";

const native = vi.hoisted(() => ({
  back: [] as Array<{ callback: (event: { from: string }) => boolean; target: unknown }>,
  show: [] as Array<() => void>, hide: [] as Array<() => void>,
}));
vi.mock("@dcloudio/uni-app", () => ({
  onBackPress: (callback: typeof native.back[number]["callback"], target: unknown) => native.back.push({ callback, target }),
  onShow: (callback: () => void) => native.show.push(callback),
  onHide: (callback: () => void) => native.hide.push(callback),
  onLoad: vi.fn(), onUnload: vi.fn(),
}));

type Node = { children: Node[]; parent: Node | null };
const node = (): Node => ({ children: [], parent: null });
const renderer = Vue.createRenderer<Node, Node>({
  createElement: node, createText: node, createComment: node,
  setText() {}, setElementText() {}, patchProp() {},
  parentNode: item => item.parent, nextSibling: () => null,
  insert(item, parent) { item.parent = parent; parent.children.push(item); },
  remove(item) { if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item); },
});
const unmounts: Array<() => void> = [];
beforeEach(() => {
  native.back.length = 0; native.show.length = 0; native.hide.length = 0;
  vi.stubGlobal("document", undefined);
});
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.unstubAllGlobals(); });
const settle = async () => { await Vue.nextTick(); await Vue.nextTick(); };
function back(from = "backbutton") { return native.back.map(handler => handler.callback({ from })).some(result => result === true); }

function actualTheme(dialog = useDialogA11y) {
  const code = ts.transpileModule(compileScript(parse(themeSource).descriptor, { id: "theme-back", inlineTemplate: true }).content,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mode = Vue.reactive({ mode: "light", setMode: vi.fn() });
  const imports: Record<string, unknown> = {
    vue: Vue, "@/composables/use-dialog-a11y": { useDialogA11y: dialog },
    "@/i18n/use-t": { useT: () => Vue.ref(zh) }, "@/store/theme": { useTheme: () => mode },
    "@/components/glass-segments.vue": { default: { render: () => Vue.h("view") } },
  };
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", code)((id: string) => imports[id], exports);
  return { component: exports.default, mode };
}

function actualGlobalUi(ui: unknown) {
  const code = ts.transpileModule(compileScript(parse(globalSource).descriptor, { id: "global-dialog-back", inlineTemplate: true }).content,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports: Record<string, unknown> = {
    vue: Vue, "@/composables/use-dialog-a11y": { useDialogA11y },
    "@/i18n/use-t": { useT: () => Vue.ref(zh) }, "@/store/ui": { useUI: () => ui },
    "@/lib/native-tab-navigation": { logicalNativePage: () => ({ route: "pages/tabs/tabs" }) },
    "@/lib/static-review-routes": { isStaticReviewRoute: () => false },
    "@/components/milestone-celebration.vue": { default: { render: () => Vue.h("view") } },
  };
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", code)((id: string) => imports[id], exports);
  return exports.default;
}

function mount(options: { tabVisible?: boolean; extraDialog?: boolean; extraClose?: boolean; globalUi?: boolean; dialog?: typeof useDialogA11y } = {}) {
  const theme = actualTheme(options.dialog), open = Vue.ref(false), extra = Vue.ref(false);
  const closeTheme = vi.fn(() => { open.value = false; });
  const cancel = vi.fn(() => { extra.value = false; }), confirm = vi.fn();
  const resolveConfirm = vi.fn((accepted: boolean) => { if (accepted) confirm(); else cancel(); });
  const resolutions: Array<{ id: string; accepted: boolean }> = [];
  const ui = Vue.reactive({
    confirmQueue: [] as Array<{ id: string; title: string }>,
    netError: { visible: false, title: "Network error", message: "Retry" }, toasts: [],
    resolveConfirm(id: string, accepted: boolean): void {
      resolutions.push({ id, accepted }); ui.confirmQueue = ui.confirmQueue.filter(item => item.id !== id);
    },
    hideNetError(): void { ui.netError.visible = false; },
  });
  const globalUi = options.globalUi ? actualGlobalUi(ui) : null;
  const lifecycle = tabLifecycle.createTabLifecycle({}, options.tabVisible ?? true);
  const owner = Vue.shallowRef<unknown>();
  const provider = Vue.defineComponent({ setup() {
    Vue.provide(tabLifecycle.TAB_LIFECYCLE, lifecycle);
    return () => Vue.h(theme.component, { open: open.value, onClose: closeTheme });
  } });
  const extraComponent = Vue.defineComponent({ setup() {
    useDialogA11y(extra, () => null, options.extraClose === false ? undefined : () => resolveConfirm(false));
    return () => Vue.h("view");
  } });
  const app = renderer.createApp({ setup() {
    owner.value = Vue.getCurrentInstance();
    return () => Vue.h("view", [Vue.h(provider), ...(options.extraDialog ? [Vue.h(extraComponent)] : []), ...(globalUi ? [Vue.h(globalUi)] : [])]);
  } });
  app.mount(node()); unmounts.push(() => app.unmount());
  return { open, extra, closeTheme, cancel, confirm, resolveConfirm, ui, resolutions, lifecycle, owner, mode: theme.mode };
}

it("closes the actual light-selected theme modal on Android Back without changing mode or leaving the page", async () => {
  const page = mount(); await settle();
  expect(native.back).toHaveLength(1);
  expect(native.back[0].target).toBe(page.owner.value);
  expect(back()).toBe(false);
  for (let i = 0; i < 2; i++) {
    page.open.value = true; await settle();
    expect(back()).toBe(true); await settle();
    expect(page.open.value).toBe(false);
    expect(back()).toBe(false);
  }
  expect(page.closeTheme).toHaveBeenCalledTimes(2);
  expect(page.mode.setMode).not.toHaveBeenCalled();
});

it("closes only the top dialog through its cancel callback, then the theme; confirmation is never submitted", async () => {
  const page = mount({ extraDialog: true }); await settle();
  page.open.value = true; await settle(); page.extra.value = true; await settle();
  expect(native.back).toHaveLength(1);
  expect(back()).toBe(true); await settle();
  expect(page.cancel).toHaveBeenCalledOnce(); expect(page.resolveConfirm).toHaveBeenCalledExactlyOnceWith(false);
  expect(page.confirm).not.toHaveBeenCalled();
  expect(page.open.value).toBe(true); expect(page.closeTheme).not.toHaveBeenCalled();
  expect(back()).toBe(true); await settle(); expect(page.open.value).toBe(false);
});

it("preserves a non-dismissible top overlay instead of dismissing the theme underneath", async () => {
  const page = mount({ extraDialog: true, extraClose: false }); await settle();
  page.open.value = true; await settle(); page.extra.value = true; await settle();
  expect(back()).toBe(true);
  expect(page.extra.value).toBe(true); expect(page.open.value).toBe(true);
  expect(page.cancel).not.toHaveBeenCalled(); expect(page.closeTheme).not.toHaveBeenCalled();
});

it.each([true, false])("keeps the actual global confirmation above the theme regardless of opening order: confirm first=%s", async confirmFirst => {
  const page = mount({ globalUi: true }); await settle();
  if (confirmFirst) { page.ui.confirmQueue.push({ id: "c1", title: "Confirm" }); await settle(); }
  page.open.value = true; await settle();
  if (!confirmFirst) { page.ui.confirmQueue.push({ id: "c1", title: "Confirm" }); await settle(); }
  expect(back()).toBe(true); await settle();
  expect(page.resolutions).toEqual([{ id: "c1", accepted: false }]);
  expect(page.open.value).toBe(true); expect(page.closeTheme).not.toHaveBeenCalled();
});

it("does not promote a retained theme above the actual global confirmation when its tab becomes visible again", async () => {
  const page = mount({ globalUi: true }); await settle();
  page.open.value = true; await settle(); page.lifecycle.setVisible(false);
  page.ui.confirmQueue.push({ id: "c1", title: "Confirm" }); await settle();
  page.lifecycle.setVisible(true); await settle();
  expect(back()).toBe(true); await settle();
  expect(page.resolutions).toEqual([{ id: "c1", accepted: false }]);
  expect(page.open.value).toBe(true); expect(page.closeTheme).not.toHaveBeenCalled();
});

it.each([true, false])("preserves the retry-only global error above confirmation and theme in DOM order: network first=%s", async networkFirst => {
  const page = mount({ globalUi: true }); await settle(); page.open.value = true; await settle();
  if (networkFirst) { page.ui.netError.visible = true; await settle(); }
  page.ui.confirmQueue.push({ id: "c1", title: "Confirm" }); await settle();
  if (!networkFirst) { page.ui.netError.visible = true; await settle(); }
  expect(back()).toBe(true); await settle();
  expect(page.resolutions).toEqual([]); expect(page.ui.netError.visible).toBe(true);
  expect(page.open.value).toBe(true); expect(page.closeTheme).not.toHaveBeenCalled();
  page.ui.netError.visible = false; await settle(); expect(back()).toBe(true); await settle();
  expect(page.resolutions).toEqual([{ id: "c1", accepted: false }]);
  expect(back()).toBe(true); await settle(); expect(page.open.value).toBe(false);
});

it("cancels only one actual confirmation per Back and preserves ordinary-sheet LIFO order", async () => {
  const page = mount({ globalUi: true, extraDialog: true }); await settle();
  page.extra.value = true; await settle(); page.open.value = true; await settle();
  page.ui.confirmQueue.push({ id: "c1", title: "First" }, { id: "c2", title: "Second" }); await settle();
  expect(back()).toBe(true); await settle(); expect(page.resolutions).toEqual([{ id: "c2", accepted: false }]);
  expect(page.open.value).toBe(true); expect(page.extra.value).toBe(true);
  expect(back()).toBe(true); await settle(); expect(page.resolutions).toHaveLength(2);
  expect(back()).toBe(true); await settle(); expect(page.open.value).toBe(false); expect(page.extra.value).toBe(true);
  expect(back()).toBe(true); await settle(); expect(page.extra.value).toBe(false);
});

it("does not swallow Back for closed dialogs, a hidden retained tab, a hidden page or programmatic navigation", async () => {
  const page = mount({ tabVisible: false }); await settle();
  page.open.value = true; await settle(); expect(back()).toBe(false);
  page.lifecycle.setVisible(true); await settle(); expect(back("navigateBack")).toBe(false);
  native.hide.forEach(hide => hide()); expect(back()).toBe(false);
  native.show.forEach(show => show()); page.lifecycle.setVisible(false); await settle(); expect(back()).toBe(false);
  page.lifecycle.setVisible(true); await settle(); expect(back()).toBe(true); await settle();
  expect(page.closeTheme).toHaveBeenCalledOnce(); expect(back()).toBe(false);
});

it("unregisters unmounted dialog entries without swallowing the next page return", async () => {
  const page = mount(); await settle(); page.open.value = true; await settle();
  unmounts.splice(0).forEach(unmount => unmount());
  expect(back()).toBe(false); expect(page.closeTheme).not.toHaveBeenCalled();
});

it("keeps native Back registration out of the H5 compiled composable", async () => {
  initPreContext("h5");
  const code = ts.transpileModule(preJs(dialogSource, "use-dialog-a11y.ts"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {} as { useDialogA11y: typeof useDialogA11y };
  new Function("require", "exports", code)((id: string) => id === "vue" ? Vue : undefined, exports);
  const page = mount({ dialog: exports.useDialogA11y }); await settle();
  page.open.value = true; await settle();
  expect(native.back).toHaveLength(0); expect(page.open.value).toBe(true);
});
