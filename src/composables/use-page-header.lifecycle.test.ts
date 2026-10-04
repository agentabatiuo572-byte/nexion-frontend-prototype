import * as Vue from "vue";
import type { Component, ComponentInternalInstance } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import chassisSource from "@/components/app-chassis.vue?raw";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { useSetPageHeader } from "./use-page-header";
import { usePageHeader } from "@/store/page-header";

// Uni's page-event dispatcher uses a private Vue build unavailable in Node.
// Adapt only notification registration; KeepAlive, watch, teardown and Pinia are real.
vi.mock("@dcloudio/uni-app", async () => {
  const { getCurrentInstance } = await import("vue");
  const register = (name: string, callback: () => void) => {
    const instance = getCurrentInstance() as unknown as Record<string, Array<() => void>>;
    (instance[name] ??= []).push(callback);
  };
  return { onShow: (callback: () => void) => register("onShow", callback),
    onHide: (callback: () => void) => register("onHide", callback) };
});

type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _old, value) => { target.props[key] = value; },
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
const unmounts: Array<() => void> = [];
beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("getCurrentPages", () => [{ route: "pages/store/bundle" }]);
  vi.stubGlobal("uni", { getSystemInfoSync: () => ({ statusBarHeight: 0 }) });
});
afterEach(() => { unmounts.splice(0).forEach(close => close()); vi.unstubAllGlobals(); });

function chassis(translations: Vue.Ref<typeof en>, back: ReturnType<typeof vi.fn>, messages: ReturnType<typeof vi.fn>) {
  const blank = { setup: () => () => null };
  const idle = () => undefined;
  const sheet = { open: false, closeTransient: idle, bindScope: idle, sessionShownCount: 0 };
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@/i18n/use-t": { useT: () => translations },
    "@/store/page-header": { usePageHeader }, "@/store/notifications": { useNotifications: () => ({ unread: 0 }) },
    "@/store/message-drawer": { useMessageDrawer: () => ({ show: messages }) },
    "@/store/refresh": { useRefresh: () => ({ isRefreshing: false }) },
    "@/store/trial-claim-sheet": { useTrialClaimSheet: () => sheet },
    "@/store/free-trial": { useFreeTrial: () => ({}) },
    "@/store/trial-config": { useTrialConfig: () => ({ config: {} }) },
    "@/store/voucher": { useVoucher: () => ({}) },
    "@/store/voucher-claim-sheet": { useVoucherClaimSheet: () => sheet },
    "@/store/pending-checkout": { usePendingCheckout: () => ({ barSession: null }) },
    "@/store/pending-checkout-core": { PENDING_BAR_INSET_KEY: Symbol("pending") },
    "@/store/popup-arbiter": { usePopupArbiter: () => ({ release: idle }), runPriorityRound: idle },
    "@/lib/route": { navBack: back, navTo: idle },
    "@/lib/unread-badge": { formatUnreadBadge },
    "@/lib/static-review-routes": { isStaticReviewRoute: () => false },
    "@/lib/device-preview": { h5DevicePreviewStatusBarHeight: () => 0 },
    "@/lib/scroll-memory": { saveScrollPos: idle, getScrollPos: idle, dropScrollPos: idle },
    "@/lib/chassis-scroll": { resolveChassisScrollElement: () => null },
    "@/lib/liquid-glass-core": { rememberGlassNavigation: idle, consumeGlassNavigation: idle },
    "@/lib/voucher-popup-scheduler": { createVoucherPopupScheduler: () => ({ cancel: idle, schedule: idle }) },
    "@/lib/account-scope": { captureAccountScope: () => ({}), isCurrentAccountScope: () => true },
    "@/api/order-api": { captureRuntimeRevision: () => ({}), isCurrentRuntimeRevision: () => true, subscribeRuntimeRevision: idle },
    "@/services/behavior-analytics": { isAcceptanceObservationModalOpen: () => false },
  };
  const { descriptor } = parse(chassisSource);
  // Uni handles renderjs in the view layer; it is unrelated to header registration.
  descriptor.script = null;
  const script = compileScript(descriptor, { id: "header-chassis", inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } } });
  const code = ts.transpileModule(script.content, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = { default: {} as Component };
  new Function("require", "exports", "chromeView", code)((id: string) => {
    if (id === "@/components/liquid-glass.vue") return { default: Vue.defineComponent({
      props: { radius: { type: Number, required: true } },
      setup: props => () => Vue.h("glass", { "data-radius": props.radius }),
    }) };
    if (id.endsWith(".vue")) return { default: blank };
    if (!(id in dependencies)) throw new Error(`Unexpected chassis dependency: ${id}`);
    return dependencies[id];
  }, exports, { update: idle });
  return exports.default;
}

async function navigation() {
  const translations = Vue.ref(en), back = vi.fn(), messages = vi.fn();
  const Chassis = chassis(translations, back, messages);
  const instances = new Map<string, ComponentInternalInstance>();
  const title = Vue.reactive<Record<string, string>>({ bundle: "Bundle", pro: "Pro", quota: "Quota", rack: "Rack" });
  const draft = Vue.ref("original empty draft");
  const pages = new Map<string, Component>();
  for (const key of ["bundle", "bundleAgain", "pro", "quota", "rack"]) {
    pages.set(key, Vue.defineComponent({
      name: `HeaderPage_${key}`,
      setup() {
        instances.set(key, Vue.getCurrentInstance()!);
        useSetPageHeader(() => ({
          title: key.startsWith("bundle") ? translations.value.headerTitles.storeBundle : title[key], backHref: "/store",
        }));
        return () => Vue.h(Chassis, { active: "store", id: key === "pro" ? "stellarbox-s1" : undefined,
          class: "route-shell", style: { color: "rgb(1, 2, 3)" }, "data-route-attr": key },
          { default: () => Vue.h("draft", draft.value) });
      },
    }));
  }
  const current = Vue.ref("bundle"), cached = Vue.ref([...pages.keys()].map(key => `HeaderPage_${key}`));
  const root = node("root");
  const app = renderer.createApp({ setup: () => () => Vue.h(Vue.KeepAlive, { include: cached.value },
    [Vue.h(pages.get(current.value)!, { key: current.value })]) });
  app.config.globalProperties.chromeView = { update: () => undefined };
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  const uni = (key: string, hook: "onShow" | "onHide") => {
    // Deliver Uni page notifications registered by the real header composable.
    const callbacks = (instances.get(key) as unknown as Record<string, Array<() => void>>)[hook] ?? [];
    expect(callbacks.length).toBeGreaterThan(0);
    callbacks.forEach(callback => callback());
  };
  const go = async (key: string) => { current.value = key; await Vue.nextTick(); };
  const controls = () => all(root).filter(item => item.props.role === "button");
  const expectHeader = (value: string) => {
    const headers = all(root).filter(item => item.props.class === "nx-navheader");
    expect(headers).toHaveLength(1);
    expect(headers[0].children.filter(item => item.tag === "glass")).toHaveLength(0);
    const surfaces = all(headers[0]).filter(item => item.props.class === "nx-nav-glass");
    expect(surfaces).toHaveLength(2);
    for (const surface of surfaces) {
      const glass = surface.children.filter(item => item.tag === "glass");
      expect(glass).toHaveLength(1);
      expect(glass[0].props["data-radius"]).toBe(18);
    }
    const titleWrap = all(headers[0]).find(item => item.props.class === "nx-nav-titlewrap")!;
    expect(all(titleWrap).filter(item => item.tag === "glass")).toHaveLength(0);
    expect(controls().filter(item => item.props["aria-label"] === translations.value.privacy.back)).toHaveLength(1);
    expect(controls().filter(item => item.props["aria-label"] === translations.value.notifs.drawerTitle)).toHaveLength(1);
    expect(all(root).filter(item => item.props.class === "nx-nav-title").map(text)).toEqual([value]);
  };
  return { root, translations, back, messages, instances, title, draft, cached, current, uni, go, controls, expectHeader,
    close: () => { const close = unmounts.pop()!; close(); } };
}

it("cold Uni show renders the actual chassis controls; repeated keyboard activation stays guarded", async () => {
  const p = await navigation(); p.uni("bundle", "onShow"); p.uni("bundle", "onShow"); await Vue.nextTick();
  p.expectHeader("Bundle");
  const back = p.controls().find(item => item.props["aria-label"] === en.privacy.back)!;
  const keyboard = Array.isArray(back.props.onKeydown) ? back.props.onKeydown : [back.props.onKeydown];
  keyboard.forEach((handler: (event: unknown) => void) => handler({ key: "Enter", repeat: true, preventDefault: vi.fn() }));
  expect(p.back).not.toHaveBeenCalled();
  back.props.onClick(); expect(p.back).toHaveBeenCalledExactlyOnceWith("/store");
  p.controls().find(item => item.props["aria-label"] === en.notifs.drawerTitle)!.props.onClick();
  expect(p.messages).toHaveBeenCalledOnce();
  p.translations.value = vietnamese; await Vue.nextTick(); p.expectHeader(vietnamese.headerTitles.storeBundle);
});

it("keeps the view adapter's host ID when a product ID falls through the route root", async () => {
  const p = await navigation(); await p.go("pro"); p.uni("pro", "onShow"); await Vue.nextTick();
  p.expectHeader("Pro");
  const host = all(p.root).find(item => String(item.props.class).split(" ").includes("nx-chassis"))!;
  expect(host.props.id).toMatch(/^nx-chassis-host-\d+$/);
  expect(host.props.id).not.toBe("stellarbox-s1");
  expect(host.props["chrome-config"].hostId).toBe(host.props.id);
  expect(host.props.class).toContain("route-shell");
  expect(host.props.style).toEqual(expect.objectContaining({ color: "rgb(1, 2, 3)" }));
  expect(host.props["data-route-attr"]).toBe("pro");
});

it.each(["pro", "quota", "rack"])("cached Bundle returns from %s through real KeepAlive activation with its draft and controls", async key => {
  const p = await navigation(); p.uni("bundle", "onShow"); p.uni("bundle", "onHide");
  const original = p.instances.get("bundle"); await p.go(key); p.uni(key, "onShow");
  p.expectHeader(p.title[key]); p.uni(key, "onHide"); await p.go("bundle");
  expect(p.instances.get("bundle")).toBe(original); expect(text(p.root)).toContain("original empty draft");
  p.expectHeader("Bundle");
});

it("Vue deactivation gates hidden getter/locale updates; nested returns and dual notifications remain stable", async () => {
  const p = await navigation(); await p.go("pro"); p.title.bundle = "hidden stale";
  p.translations.value = vietnamese; await Vue.nextTick(); p.expectHeader("Pro");
  await p.go("quota"); p.title.pro = "late Pro response"; await Vue.nextTick(); p.expectHeader("Quota");
  await p.go("pro"); p.expectHeader("late Pro response");
  p.uni("pro", "onShow"); p.uni("pro", "onShow"); p.uni("pro", "onHide"); p.uni("pro", "onHide");
  await p.go("bundle"); p.uni("bundle", "onShow"); p.uni("bundle", "onShow"); await Vue.nextTick();
  p.expectHeader(vietnamese.headerTitles.storeBundle);
});

it("a popped owner's late teardown and async getter cannot wipe the restored owner", async () => {
  const p = await navigation(); p.uni("bundle", "onShow"); p.uni("bundle", "onHide");
  await p.go("pro"); p.uni("pro", "onShow"); p.uni("pro", "onHide"); await p.go("bundle");
  p.uni("bundle", "onShow"); p.cached.value = ["HeaderPage_bundle"]; await Vue.nextTick();
  p.title.pro = "late disposed reply"; await Vue.nextTick(); p.expectHeader("Bundle");
  expect(p.instances.get("pro")!.isUnmounted).toBe(true);
});

it("same-route instances have separate owners across a repeated push, return, and late unmount", async () => {
  const p = await navigation(); p.uni("bundle", "onShow"); p.uni("bundle", "onHide");
  await p.go("bundleAgain"); p.uni("bundleAgain", "onShow");
  expect(p.instances.get("bundleAgain")).not.toBe(p.instances.get("bundle"));
  p.uni("bundleAgain", "onHide"); await p.go("bundle");
  p.uni("bundle", "onShow"); p.cached.value = ["HeaderPage_bundle"]; await Vue.nextTick(); p.expectHeader("Bundle");
});

it("closing the cached tree clears its own registration and disposed watchers cannot republish", async () => {
  const p = await navigation(); p.uni("bundle", "onShow"); await p.go("pro"); p.uni("pro", "onShow");
  p.close(); expect(usePageHeader().header).toBeNull();
  p.title.pro = "disposed update"; p.translations.value = vietnamese; await Vue.nextTick();
  expect(usePageHeader().header).toBeNull();
});
