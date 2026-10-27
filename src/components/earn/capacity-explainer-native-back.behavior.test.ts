import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCapacityExplainer } from "@/composables/use-capacity-explainer";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import * as lifecycle from "@/composables/use-tab-page-lifecycle";
import { useUI } from "@/store/ui";
import { zh } from "@/i18n/messages/zh";
import sheetSource from "./capacity-explainer-sheet.vue?raw";
import globalSource from "@/components/global-ui.vue?raw";
import dialogSource from "@/composables/use-dialog-a11y.ts?raw";

const native = vi.hoisted(() => ({ back: [] as Array<{ callback: (event: { from: string }) => boolean; target: unknown }>,
  show: [] as Array<{ callback: () => void; target: unknown }>, hide: [] as Array<{ callback: () => void; target: unknown }> }));
vi.mock("@dcloudio/uni-app", () => ({
  onBackPress: (callback: typeof native.back[number]["callback"], target: unknown) => native.back.push({ callback, target }),
  onShow: (callback: () => void, target: unknown) => native.show.push({ callback, target }),
  onHide: (callback: () => void, target: unknown) => native.hide.push({ callback, target }), onLoad: vi.fn(), onUnload: vi.fn(),
}));
type Host = { props: Record<string, any>; children: Host[]; parent: Host | null };
const node = (): Host => ({ props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Host, Host>({ createElement: node, createText: node, createComment: node,
  setText() {}, setElementText() {}, patchProp: (n, k, _p, v) => { n.props[k] = v; },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert(n, p, a) { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); n.parent = p; const i = a ? p.children.indexOf(a) : -1; if (i < 0) p.children.push(n); else p.children.splice(i, 0, n); },
  remove(n) { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const cleanups: Array<() => void> = [];
const settle = async () => { await Vue.nextTick(); await Vue.nextTick(); };
const js = (s: string) => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function component(source: string, modules: Record<string, unknown>): Vue.Component {
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", js(compileScript(parse(source).descriptor, { id: "capacity-native-back", inlineTemplate: true, templateOptions: { compilerOptions: { hoistStatic: false } } }).content))((id: string) => {
    if (!(id in modules)) throw new Error("Unexpected component import: " + id); return modules[id];
  }, exports);
  return exports.default;
}
function mount(options: { hosted?: boolean; hidden?: boolean; global?: boolean; dialog?: typeof useDialogA11y } = {}) {
  const dialog = options.dialog ?? useDialogA11y, ui = useUI(), navTo = vi.fn(), extra = Vue.ref(false), extraClose = vi.fn(() => { extra.value = false; });
  const mounted = Vue.ref(true), revision = Vue.ref(0), hostState = Vue.reactive({ expanded: true, scrollTop: 420 });
  const modules: Record<string, unknown> = { vue: Vue, "@/i18n/use-t": { useT: () => Vue.ref(zh) },
    "@/composables/use-capacity-explainer": { useCapacityExplainer }, "@/composables/use-dialog-a11y": { useDialogA11y: dialog }, "@/lib/route": { navTo },
    "@/store/ui": { useUI: () => ui }, "@/lib/native-tab-navigation": { logicalNativePage: () => ({ route: "pages/tabs/tabs" }) },
    "@/lib/static-review-routes": { isStaticReviewRoute: () => false }, "@/components/milestone-celebration.vue": { default: { render: () => null } } };
  const sheet = component(sheetSource, modules), global = options.global ? component(globalSource, modules) : null;
  const tab = lifecycle.createTabLifecycle({}, !options.hidden);
  const extraComponent = Vue.defineComponent({ setup() { dialog(extra, () => null, extraClose); return () => Vue.h("view"); } });
  const provider = Vue.defineComponent({ setup() { if (options.hosted) Vue.provide(lifecycle.TAB_LIFECYCLE, tab);
    return () => Vue.h("view", [mounted.value ? Vue.h(sheet, { key: revision.value }) : null, Vue.h(extraComponent)]); } });
  let owner: unknown;
  const app = renderer.createApp({ setup() { owner = Vue.getCurrentInstance(); return () => Vue.h("view", [Vue.h(provider), global ? Vue.h(global) : null]); } });
  const root = node(); app.mount(root); cleanups.push(() => app.unmount());
  return { app, root, owner, tab, ui, navTo, mounted, revision, extra, extraClose, hostState };
}
function back(page: ReturnType<typeof mount>, from = "backbutton") {
  // Actual Uni evaluates every current-page hook, then some(Boolean).
  return native.back.filter(h => h.target === page.owner).map(h => h.callback({ from })).some(Boolean);
}
function pageVisibility(page: ReturnType<typeof mount>, visible: boolean) {
  (visible ? native.show : native.hide).filter(h => h.target === page.owner).forEach(h => h.callback());
}
function click(target: Host) { const handlers = Array.isArray(target.props.onClick) ? target.props.onClick : [target.props.onClick]; handlers.forEach(fn => fn({ stopPropagation() {}, preventDefault() {} })); }
beforeEach(() => { native.back.length = 0; native.show.length = 0; native.hide.length = 0; vi.useFakeTimers(); setActivePinia(createPinia());
  vi.stubGlobal("document", undefined); vi.stubGlobal("getCurrentPages", () => [{ route: "pages/tabs/tabs" }]); useCapacityExplainer().close(); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); useCapacityExplainer().close(); useUI().clearAllConfirms(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("actual capacity sheet first Android Back closes only the sheet and second Back passes to the page", async () => {
  const page = mount(); await settle(); const state = JSON.stringify(page.hostState);
  expect(native.back).toHaveLength(1); expect(native.back[0].target).toBe(page.owner); expect(back(page)).toBe(false);
  useCapacityExplainer().open(); await settle(); expect(all(page.root).some(n => n.props.role === "dialog")).toBe(true);
  expect(back(page)).toBe(true); await settle(); expect(useCapacityExplainer().visible.value).toBe(false); expect(back(page)).toBe(false);
  expect(JSON.stringify(page.hostState)).toBe(state); expect(page.navTo).not.toHaveBeenCalled();
});
it("closed, hidden page, hidden hosted tab and programmatic Back never consume capacity return", async () => {
  const page = mount({ hosted: true, hidden: true }); useCapacityExplainer().open(); await settle(); expect(back(page)).toBe(false);
  page.tab.setVisible(true); await settle(); expect(back(page, "navigateBack")).toBe(false); expect(useCapacityExplainer().visible.value).toBe(true);
  pageVisibility(page, false); expect(back(page)).toBe(false); pageVisibility(page, true); page.tab.setVisible(false); await settle(); expect(back(page)).toBe(false);
  page.tab.setVisible(true); await settle(); expect(back(page)).toBe(true); await settle(); expect(back(page)).toBe(false); expect(page.navTo).not.toHaveBeenCalled();
});
it("same-root sheets are LIFO and replacement/unmount reuse one page Back hook", async () => {
  const page = mount(); useCapacityExplainer().open(); await settle(); page.extra.value = true; await settle(); expect(back(page)).toBe(true);
  expect(page.extraClose).toHaveBeenCalledOnce(); expect(useCapacityExplainer().visible.value).toBe(true);
  page.revision.value++; await settle(); expect(native.back).toHaveLength(1); expect(back(page)).toBe(true); expect(useCapacityExplainer().visible.value).toBe(false);
  useCapacityExplainer().open(); await settle(); page.mounted.value = false; await settle(); expect(back(page)).toBe(false);
});
it.each([true, false])("actual GlobalUi confirmation stays above capacity, confirm first=%s", async first => {
  const page = mount({ global: true }); let answer: boolean | undefined;
  if (first) void page.ui.confirm({ title: "Confirm" }).then(ok => { answer = ok; });
  useCapacityExplainer().open(); await settle(); if (!first) { void page.ui.confirm({ title: "Confirm" }).then(ok => { answer = ok; }); await settle(); }
  expect(back(page)).toBe(true); await settle(); expect(answer).toBe(false); expect(useCapacityExplainer().visible.value).toBe(true);
  expect(page.navTo).not.toHaveBeenCalled(); expect(back(page)).toBe(true); expect(useCapacityExplainer().visible.value).toBe(false);
});
it("retry-only mask stays above actual confirmation and capacity across hosted hide/show", async () => {
  const page = mount({ hosted: true, global: true }); useCapacityExplainer().open(); await settle(); page.tab.setVisible(false);
  let answer: boolean | undefined; void page.ui.confirm({ title: "Confirm" }).then(ok => { answer = ok; }); page.ui.netError.visible = true; await settle();
  page.tab.setVisible(true); await settle(); expect(back(page)).toBe(true); expect(page.ui.netError.visible).toBe(true); expect(answer).toBeUndefined();
  expect(useCapacityExplainer().visible.value).toBe(true); page.ui.netError.visible = false; await settle(); expect(back(page)).toBe(true); await settle(); expect(answer).toBe(false);
  expect(useCapacityExplainer().visible.value).toBe(true); expect(back(page)).toBe(true); expect(page.navTo).not.toHaveBeenCalled();
});
it("different page roots keep their callbacks separate while the hidden old page cannot consume Back", async () => {
  const older = mount(), current = mount(); pageVisibility(older, false); useCapacityExplainer().open(); await settle();
  expect(native.back).toHaveLength(2); expect(back(older)).toBe(false); expect(useCapacityExplainer().visible.value).toBe(true);
  expect(back(current)).toBe(true); expect(useCapacityExplainer().visible.value).toBe(false); expect(older.navTo).not.toHaveBeenCalled(); expect(current.navTo).not.toHaveBeenCalled();
});
it("existing close and store CTA retain their actual handlers without adding business actions", async () => {
  const page = mount(); useCapacityExplainer().open(); await settle(); click(all(page.root).find(n => n.props["aria-label"] === zh.ui.close)!);
  expect(useCapacityExplainer().visible.value).toBe(false); expect(page.navTo).not.toHaveBeenCalled();
  useCapacityExplainer().open(); await settle(); click(all(page.root).find(n => n.props["aria-label"] === zh.earn.capExplainCta)!);
  expect(useCapacityExplainer().visible.value).toBe(false); expect(page.navTo).toHaveBeenCalledExactlyOnceWith("/pages/store/store");
});
it("actual H5-preprocessed dialog keeps capacity local and registers no native Back callback", async () => {
  initPreContext("h5"); const exports = {} as { useDialogA11y: typeof useDialogA11y };
  new Function("require", "exports", js(preJs(dialogSource, "use-dialog-a11y.ts")))((id: string) => id === "vue" ? Vue : undefined, exports);
  const page = mount({ dialog: exports.useDialogA11y }); useCapacityExplainer().open(); await settle(); expect(native.back).toHaveLength(0);
  expect(back(page)).toBe(false); expect(useCapacityExplainer().visible.value).toBe(true);
});
