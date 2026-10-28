import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { useUI, confirm } from "@/store/ui";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { zh } from "@/i18n/messages/zh";
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
const settle = async () => { await Vue.nextTick(); await Vue.nextTick(); };
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });

function mount(platform: "app" | "h5" = "app") {
  setActivePinia(createPinia());
  initPreContext(platform);
  const descriptor = parse(source).descriptor;
  const processed = source.replace(descriptor.scriptSetup!.content, preJs(descriptor.scriptSetup!.content, "preferences.vue"));
  const code = ts.transpileModule(compileScript(parse(processed).descriptor, { id: "preferences-back", inlineTemplate: true }).content,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const ui = useUI(), resolve = vi.spyOn(ui, "resolveConfirm");
  const account = Vue.reactive({ accountKey: "account-a", accountBindingEpoch: 1 });
  const epoch = createRemoteAccountEpoch("account-a");
  const notifications = Vue.reactive({ loading: false, error: null, refreshRemote: vi.fn(), clearRead: vi.fn(async () => {}) });
  const hooks = { show: [] as Array<() => void>, hide: [] as Array<() => void>, back: [] as Array<(event: { from: string }) => boolean> };
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
  const imports: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn), onBackPress: (fn: typeof hooks.back[number]) => hooks.back.push(fn) },
    "@/components/app-chassis.vue": { default: slot }, "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/components/liquid-glass.vue": { default: { render: () => null } }, "@/components/me/preference-toggle-row.vue": { default: { render: () => null } },
    "@/i18n/use-t": { useT: () => Vue.ref(zh) }, "@/store/preferences": { usePreferences: () => ({ remoteReady: false, error: null }), isMandatoryNotifKind: () => false },
    "@/store/notifications": { useNotifications: () => notifications }, "@/store/app": { useApp: () => account },
    "@/lib/remote-account-epoch": { remoteAccountScope: epoch }, "@/store/ui": { confirm, useUI: () => ui },
  };
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", code)((id: string) => imports[id], exports);
  const app = renderer.createApp(exports.default), root = node();
  app.mount(root); hooks.show.forEach(show => show());
  let mounted = true, navigation = 0;
  const dispose = () => { if (mounted) { app.unmount(); mounted = false; } };
  disposals.push(dispose);
  return { ui, resolve, account, epoch, notifications, hooks, dispose,
    text: () => all(root).map(item => item.text).join(""),
    clearProps: () => all(root).find(item => String(item.props.class).includes("notification-clear-read"))!.props,
    open: () => all(root).find(item => String(item.props.class).includes("notification-clear-read"))!.props.onClick() as Promise<void>,
    back: (from = "backbutton") => {
      const consumed = hooks.back.map(handler => handler({ from })).some(result => result === true);
      if (!consumed) navigation += 1;
      return consumed;
    },
    navigation: () => navigation,
    hide: () => hooks.hide.forEach(hide => hide()),
  };
}

it("keeps successful empty notification reads silent and rejects hidden or rebound read completion", async () => {
  const page = mount(); await settle();
  let finish!: () => void;
  page.notifications.refreshRemote.mockImplementationOnce(() => {
    page.notifications.loading = true;
    return new Promise<void>(resolve => { finish = () => { page.notifications.loading = false; resolve(); }; });
  });
  page.hooks.show.forEach(show => show()); await settle();
  expect(page.text()).not.toContain(zh.help.loadingMore);
  page.epoch.bind("account-b"); page.account.accountBindingEpoch++; page.account.accountKey = "account-b";
  await settle(); expect(page.text()).toContain(zh.help.loadingMore);
  page.hide(); finish(); await settle();
  page.notifications.refreshRemote.mockImplementationOnce(() => { page.notifications.loading = true; return new Promise<void>(() => {}); });
  page.hooks.show.forEach(show => show()); await settle();
  expect(page.text()).toContain(zh.help.loadingMore);
  expect(page.notifications.clearRead).not.toHaveBeenCalled();
});

it("keeps the static notification clear name at full read-pending contrast but preserves a real confirmation's disabled style", async () => {
  const page = mount(); await settle(); page.notifications.loading = true; await settle();
  expect(page.clearProps().style).toMatchObject({ opacity: 1 }); expect(page.clearProps()["aria-disabled"]).toBe(true);
  expect(page.text()).toContain(zh.notifs.clearReadAria);
  page.notifications.loading = false; const pending = page.open(); await settle();
  expect(page.clearProps().style?.opacity).not.toBe(1); expect(page.clearProps()["aria-disabled"]).toBe(true);
  page.back(); await pending;
});

it("cancels only the actual preferences confirmation on native Back and stays on the page without deleting read messages", async () => {
  const page = mount(); expect(page.hooks.back).toHaveLength(1);
  for (let i = 0; i < 2; i++) {
    const pending = page.open(); await settle();
    const id = page.ui.confirmQueue[0].id;
    expect(page.back()).toBe(true); await pending; await settle();
    expect(page.resolve).toHaveBeenLastCalledWith(id, false);
    expect(page.ui.confirmQueue).toHaveLength(0);
  }
  expect(page.navigation()).toBe(0); expect(page.notifications.clearRead).not.toHaveBeenCalled();
});

it("passes through programmatic and empty native Back, retaining the existing hide cancellation", async () => {
  const page = mount(); expect(page.back()).toBe(false);
  const pending = page.open(); await settle();
  expect(page.back("navigateBack")).toBe(false); expect(page.ui.confirmQueue).toHaveLength(1);
  expect(page.resolve).not.toHaveBeenCalled(); page.hide(); await pending;
  expect(page.ui.confirmQueue).toHaveLength(0); expect(page.notifications.clearRead).not.toHaveBeenCalled();
});

it.each(["hidden", "account change", "unmount"])("does not consume native Back after %s invalidates the local intent", async boundary => {
  const page = mount(), pending = page.open(); await settle();
  if (boundary === "hidden") page.hide();
  else if (boundary === "unmount") page.dispose();
  else { page.epoch.bind("account-b"); page.account.accountBindingEpoch += 1; page.account.accountKey = "account-b"; }
  await pending; await settle();
  expect(page.back()).toBe(false); expect(page.ui.confirmQueue).toHaveLength(0);
  expect(page.notifications.clearRead).not.toHaveBeenCalled();
});

it("does not cancel a foreign top confirmation or the page's own confirmation underneath it", async () => {
  const page = mount(), pending = page.open(); await settle();
  const foreign = page.ui.confirm({ owner: "another-page", title: "Foreign confirmation" });
  const foreignId = page.ui.confirmQueue[1].id;
  expect(page.back()).toBe(false); expect(page.resolve).not.toHaveBeenCalled();
  expect(page.ui.confirmQueue).toHaveLength(2);
  page.hide(); await pending; expect(page.ui.confirmQueue).toHaveLength(1);
  expect(page.ui.confirmQueue[0].id).toBe(foreignId);
  page.ui.resolveConfirm(foreignId, false); await foreign;
  expect(page.notifications.clearRead).not.toHaveBeenCalled();
});

it("preserves a retry-only global mask above the owned confirmation until the mask clears", async () => {
  const page = mount(), pending = page.open(); await settle();
  page.ui.showNetError({ title: "Network", message: "Retry", retryAfterMs: null });
  expect(page.back()).toBe(true); expect(page.navigation()).toBe(0);
  expect(page.resolve).not.toHaveBeenCalled(); expect(page.ui.confirmQueue).toHaveLength(1);
  expect(page.ui.netError.visible).toBe(true);
  page.ui.hideNetError(); expect(page.back()).toBe(true); await pending;
  expect(page.notifications.clearRead).not.toHaveBeenCalled();
});

it("keeps explicit acceptance of a current confirmation working", async () => {
  const page = mount(), pending = page.open(); await settle();
  page.ui.resolveConfirm(page.ui.confirmQueue[0].id, true); await pending;
  expect(page.notifications.clearRead).toHaveBeenCalledOnce();
});

it("does not register native Back in the H5 compiled preferences page", async () => {
  const page = mount("h5"), pending = page.open(); await settle();
  expect(page.hooks.back).toHaveLength(0);
  page.ui.resolveConfirm(page.ui.confirmQueue[0].id, false); await pending;
  expect(page.notifications.clearRead).not.toHaveBeenCalled();
});
