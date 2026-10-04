import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { en } from "@/i18n/messages/en";
import type { PublishedTrustSection } from "@/api/trust-section-api";
import { resolvePublishedNexNarrative, type PublishedTrustStatus } from "@/lib/nex-published-content";
import * as headerTitle from "@/lib/header-title";
import { installKeyboardActivation, uninstallKeyboardActivation } from "@/lib/a11y-activate";
import source from "./nex.vue?raw";
import headerSource from "@/components/sub-page-header.vue?raw";

const overlays = vi.hoisted(() => ({ trial: vi.fn(), voucher: vi.fn() }));
vi.mock("@/store/trial-claim-sheet", () => ({ useTrialClaimSheet: () => ({ closeTransient: overlays.trial }) }));
vi.mock("@/store/voucher-claim-sheet", () => ({ useVoucherClaimSheet: () => ({ closeTransient: overlays.voucher }) }));
vi.mock("@/store/ui", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/i18n/use-t", () => ({ getT: () => en }));
import { navBack, navReplace, navTo } from "@/lib/route";

// Compile and mount both real SFCs. Navigation remains the real route module;
// only the uni SDK, published reads and presentation dependencies are controlled.
function compileSfc(raw: string, filename: string): string {
  const { descriptor } = parse(raw, { filename });
  const script = compileScript(descriptor, {
    id: filename, inlineTemplate: true,
    templateOptions: { compilerOptions: {
      hoistStatic: false, isCustomElement: tag => tag === "view" || tag === "text",
    } },
  });
  return ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const nexCode = compileSfc(source, "nex.vue"), headerCode = compileSfc(headerSource, "sub-page-header.vue");
function component(code: string, dependencies: Record<string, unknown>): Component {
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected actual SFC import: ${id}`);
    return dependencies[id];
  }, exports);
  return exports.default;
}
type HostNode = { tag: string; text: string; props: Record<string, any>; parent: HostNode | null; children: HostNode[] };
const node = (text = "", tag = ""): HostNode => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: tag => node("", tag), createText: node, createComment: () => node(),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child);
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => {
    if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child);
    child.parent = null;
  },
});
const textContent = (target: HostNode): string => target.text + target.children.map(textContent).join("");
function find(root: HostNode, predicate: (entry: HostNode) => boolean): HostNode | undefined {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = find(child, predicate); if (found) return found;
  }
}
const unmounts: Array<() => void> = [];
function mountComponent(value: Component, props?: Record<string, unknown>): HostNode {
  const root = node(), app = renderer.createApp(value, props);
  app.mount(root); unmounts.push(() => app.unmount()); return root;
}
const presentation = Vue.defineComponent({ setup: (_props, { slots }) => () => Vue.h("presentation", slots.default?.()) });
const common = {
  vue: Vue, "@/lib/route": { navBack, navReplace, navTo }, "@/i18n/use-t": { useT: () => Vue.ref(en) },
};
const Header = component(headerCode, {
  ...common,
  "@/store/pending-checkout-core": { PENDING_BAR_INSET_KEY: Symbol("pending-inset") },
  "@/store/message-drawer": { useMessageDrawer: () => ({ show: vi.fn() }) },
  "@/store/notifications": { useNotifications: () => ({ unread: 0 }) },
  "@/lib/header-title": headerTitle,
  "@/lib/device-preview": { h5DevicePreviewStatusBarHeight: () => 0 },
  "@/components/liquid-glass.vue": { default: presentation },
});
const published: PublishedTrustSection[] = [{
  sectionKey: "nexNarrative", version: "v1", description: "Published fixture", structure: "fields",
  fields: [{ key: "hero.en", label: "Hero", value: "Published NEX narrative" }],
}];
async function mountNex(status: PublishedTrustStatus = "ready", sections = published) {
  const shown: Array<() => void> = [], hidden: Array<() => void> = [];
  const refresh = vi.fn().mockResolvedValue(true), recordView = vi.fn();
  const Page = component(nexCode, {
    ...common,
    "@dcloudio/uni-app": { onShow: (fn: () => void) => shown.push(fn), onHide: (fn: () => void) => hidden.push(fn) },
    "@/components/app-chassis.vue": { default: presentation },
    "@/components/sub-page-header.vue": { default: Header },
    "@/components/how/how-hero.vue": { default: presentation },
    "@/components/how/how-section.vue": { default: presentation },
    "@/components/how/how-faq-row.vue": { default: presentation },
    "@/components/how/how-icon-row.vue": { default: presentation },
    "@/components/how/how-callout-box.vue": { default: presentation },
    "@/store/locale": { useLocaleStore: () => ({ code: "en" }) },
    "@/i18n/format": { fmt: (text: string, values: Record<string, number>) => text.replace(/\{(\w+)\}/g, (_match, key) => String(values[key])) },
    "@/store/config": { useConfig: () => ({ config: { rewards: { welcomeGift: { nexAmount: 5 } } } }) },
    "@/store/market": { useMarket: () => ({ isMockMode: false, syncRemote: vi.fn(), remoteReady: true, nexPriceUSDT: 0.124 }) },
    "@/composables/use-published-trust": {
      usePublishedTrust: () => ({ sections: Vue.ref(sections), status: Vue.ref(status), refresh }),
      recordPublishedTrustViews: recordView,
    },
    "@/api/order-api": { subscribeRuntimeRevision: () => () => {} },
    "@/lib/nex-published-content": { resolvePublishedNexNarrative },
  });
  const root = mountComponent(Page);
  shown.forEach(fn => fn()); await Promise.resolve(); await Vue.nextTick();
  const button = (label: string) => {
    const found = find(root, entry => entry.props.role === "button"
      && (entry.props["aria-label"] === label || textContent(entry) === label));
    if (!found) throw new Error(`Missing mounted control: ${label}`);
    return found;
  };
  return { root, button, hide: () => hidden.forEach(fn => fn()), refresh, recordView };
}
type Page = { route: string; scrollTop?: number; expanded?: string };
type NavigationOptions = { url: string; success?: () => void; fail?: () => void };
function sdk(initial: Page[]) {
  const pages = [...initial];
  const uni = {
    navigateTo: vi.fn((options: NavigationOptions) => { pages.push({ route: options.url }); options.success?.(); }),
    navigateBack: vi.fn((_options?: { fail?: () => void }) => { pages.pop(); }),
    redirectTo: vi.fn((options: NavigationOptions) => { pages.splice(-1, 1, { route: options.url }); options.success?.(); }),
    reLaunch: vi.fn((options: NavigationOptions) => { pages.splice(0, pages.length, { route: options.url }); options.success?.(); }),
    getSystemInfoSync: () => ({ statusBarHeight: 0 }), showToast: vi.fn(),
  };
  vi.stubGlobal("getCurrentPages", () => pages); vi.stubGlobal("uni", uni);
  return { pages, uni };
}
function warm() {
  const me = { route: "/pages/me/me" }, trust = { route: "/pages/trust/trust", scrollTop: 432, expanded: "audit" };
  return { ...sdk([me, trust, { route: "/pages/trust/nex" }]), me, trust };
}
function trustHeaderBack() {
  const root = mountComponent(Header, { back: "/pages/me/me" });
  const back = find(root, entry => entry.props["aria-label"] === en.profile.back)!;
  back.props.onClick();
}
function keyboard(control: HostNode, key: "Enter" | " ", repeat = false) {
  let bubble!: (event: object) => void;
  vi.stubGlobal("document", {
    addEventListener: (_name: string, callback: typeof bubble) => { bubble = callback; }, removeEventListener: vi.fn(),
  });
  installKeyboardActivation();
  const syntheticClick = vi.fn(() => control.props.onClick());
  const event = {
    key, repeat, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false,
    target: { tagName: "VIEW", getAttribute: (key: string) => control.props[key], click: syntheticClick },
    preventDefault() { this.defaultPrevented = true; },
  };
  const handlers = Array.isArray(control.props.onKeydown) ? control.props.onKeydown : [control.props.onKeydown];
  handlers.forEach(handler => handler(event)); bubble(event);
  uninstallKeyboardActivation();
  return { event, syntheticClick };
}
afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount());
  uninstallKeyboardActivation(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe("mounted NEX Back to Trust Center", () => {
  it("restores the existing Trust page and its state, then its header returns to Me", async () => {
    const s = warm(), page = await mountNex();
    page.button(en.nexHowItWorks.ctaBack).props.onClick();
    expect(s.pages).toEqual([s.me, s.trust]); expect(s.pages.at(-1)).toBe(s.trust);
    expect(s.trust).toMatchObject({ scrollTop: 432, expanded: "audit" });
    expect(s.uni.navigateBack).toHaveBeenCalledOnce(); expect(s.uni.navigateTo).not.toHaveBeenCalled();
    expect(overlays.trial).toHaveBeenCalledOnce(); expect(overlays.voucher).toHaveBeenCalledOnce();
    trustHeaderBack(); expect(s.pages).toEqual([s.me]);
  });

  it.each(["Enter", " "] as const)("activates once for %s without the global keyboard layer clicking again", async key => {
    const s = warm(), page = await mountNex();
    const { event, syntheticClick } = keyboard(page.button(en.nexHowItWorks.ctaBack), key);
    expect(event.defaultPrevented).toBe(true); expect(syntheticClick).not.toHaveBeenCalled();
    expect(s.uni.navigateBack).toHaveBeenCalledOnce(); expect(s.pages).toEqual([s.me, s.trust]);
    trustHeaderBack(); expect(s.pages).toEqual([s.me]);
  });

  it.each(["Enter", " "] as const)("ignores held %s repeats instead of consuming another Back", async key => {
    const s = warm(), page = await mountNex();
    keyboard(page.button(en.nexHowItWorks.ctaBack), key, true);
    expect(s.pages).toEqual([s.me, s.trust, { route: "/pages/trust/nex" }]);
    expect(s.uni.navigateBack).not.toHaveBeenCalled(); expect(s.uni.navigateTo).not.toHaveBeenCalled();
    expect(s.uni.reLaunch).not.toHaveBeenCalled();
  });

  it.each([0, 1])("uses a replacing cold fallback at depth %i, including a repeated cold activation", async depth => {
    const s = sdk(depth ? [{ route: "/pages/trust/nex" }] : []), page = await mountNex();
    for (let activation = 0; activation < 2; activation++) {
      page.button(en.nexHowItWorks.ctaBack).props.onClick();
      expect(s.pages).toEqual([{ route: "/pages/trust/trust" }]);
    }
    expect(s.uni.navigateTo).not.toHaveBeenCalled(); expect(s.uni.navigateBack).not.toHaveBeenCalled();
    expect(s.uni.reLaunch).toHaveBeenCalledTimes(2);
    trustHeaderBack(); expect(s.pages).toEqual([{ route: "/pages/me/me" }]);
  });

  it("leaves no NEX or duplicate Trust entry after repeated warm visits", async () => {
    const s = warm();
    for (let visit = 0; visit < 2; visit++) {
      if (visit) s.pages.push({ route: "/pages/trust/nex" });
      const page = await mountNex(); page.button(en.nexHowItWorks.ctaBack).props.onClick(); page.hide();
      expect(s.pages).toEqual([s.me, s.trust]); expect(s.pages.at(-1)).toBe(s.trust);
    }
    trustHeaderBack(); expect(s.pages).toEqual([s.me]);
  });

  it.each(["warm", "cold"] as const)("uses existing route recovery after a %s SDK return failure", async mode => {
    const s = mode === "warm" ? warm() : sdk([{ route: "/pages/trust/nex" }]);
    if (mode === "warm") s.uni.navigateBack.mockImplementationOnce(options => options?.fail?.());
    else s.uni.reLaunch.mockImplementationOnce(options => options.fail?.());
    const page = await mountNex(); page.button(en.nexHowItWorks.ctaBack).props.onClick();
    expect(s.uni.navigateTo).not.toHaveBeenCalled();
    expect(s.uni.redirectTo).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/trust/trust" }));
    expect(s.pages.at(-1)?.route).toBe("/pages/trust/trust");
    expect(s.pages.some(entry => entry.route === "/pages/trust/nex")).toBe(false);
    expect(s.uni.showToast).not.toHaveBeenCalled();
  });

  it.each(["click", "Enter", " "] as const)("keeps Open Exchange navigation and its header return unchanged: %s", async activation => {
    const s = warm(), page = await mountNex(), exchange = page.button(en.nexHowItWorks.ctaExchange);
    if (activation === "click") exchange.props.onClick(); else keyboard(exchange, activation);
    expect(s.uni.navigateTo).toHaveBeenCalledWith(expect.objectContaining({ url: "/pages/me/wallet-exchange" }));
    expect(s.pages.at(-1)?.route).toBe("/pages/me/wallet-exchange");
    const root = mountComponent(Header, { back: "/pages/trust/nex" });
    find(root, entry => entry.props["aria-label"] === en.profile.back)!.props.onClick();
    expect(s.pages.at(-1)?.route).toBe("/pages/trust/nex");
    page.button(en.nexHowItWorks.ctaBack).props.onClick();
    expect(s.pages).toEqual([s.me, s.trust]);
  });

  it.each(["loading", "error", "unpublished"] as const)("does not invent a ready-content CTA when narrative is %s", async state => {
    sdk([{ route: "/pages/trust/nex" }]);
    const page = await mountNex(state === "unpublished" ? "ready" : state, state === "unpublished" ? [] : published);
    expect(find(page.root, entry => entry.props.role === "button" && textContent(entry) === en.nexHowItWorks.ctaBack)).toBeUndefined();
    expect(find(page.root, entry => entry.props.role === "button" && textContent(entry) === en.nexHowItWorks.ctaExchange)).toBeUndefined();
  });
});

describe("mounted NEX synchronous SDK exception recovery", () => {
  it.each(["warm", "cold"] as const)("recovers to declared Trust when the first SDK call throws: %s", async mode => {
    const s = mode === "warm" ? warm() : sdk([{ route: "/pages/trust/nex" }]), page = await mountNex();
    let first = true;
    for (const name of ["navigateTo", "navigateBack", "redirectTo", "reLaunch"] as const) {
      const original = s.uni[name].getMockImplementation()!;
      s.uni[name].mockImplementation(options => {
        if (first) { first = false; throw new Error("Controlled first SDK synchronous exception"); }
        return original(options);
      });
    }
    expect(() => page.button(en.nexHowItWorks.ctaBack).props.onClick()).not.toThrow();
    await Promise.resolve();
    expect(s.pages.at(-1)?.route).toBe("/pages/trust/trust");
    expect(s.pages.some(entry => entry.route === "/pages/trust/nex")).toBe(false);
    expect(s.uni.navigateTo).not.toHaveBeenCalled(); expect(s.uni.redirectTo).toHaveBeenCalledOnce();
    expect(s.uni.showToast).not.toHaveBeenCalled();
  });

  it.each(["warm", "cold"] as const)("keeps replacement/reset recovery bounded when the next fallback also throws: %s", async mode => {
    const s = mode === "warm" ? warm() : sdk([{ route: "/pages/trust/nex" }]), page = await mountNex();
    if (mode === "warm") s.uni.navigateBack.mockImplementationOnce(() => { throw new Error("Back SDK exception"); });
    else s.uni.reLaunch.mockImplementationOnce(() => { throw new Error("Cold SDK exception"); });
    s.uni.redirectTo.mockImplementationOnce(() => { throw new Error("Replacement SDK exception"); });
    expect(() => page.button(en.nexHowItWorks.ctaBack).props.onClick()).not.toThrow();
    await Promise.resolve();
    expect(s.pages.at(-1)?.route).toBe("/pages/trust/trust");
    expect(s.pages.some(entry => entry.route === "/pages/trust/nex")).toBe(false);
    expect(s.uni.navigateTo).not.toHaveBeenCalled(); expect(s.uni.redirectTo).toHaveBeenCalledOnce();
    expect(s.uni.reLaunch).toHaveBeenCalledTimes(mode === "cold" ? 2 : 1);
    expect(s.uni.showToast).not.toHaveBeenCalled();
  });

  it.each(["warm", "cold"] as const)("reports safe failure after all SDK attempts throw, preserves the page and permits retry: %s", async mode => {
    const s = mode === "warm" ? warm() : sdk([{ route: "/pages/trust/nex" }]), page = await mountNex();
    const originalPages = [...s.pages];
    let throwsRemaining = 3;
    for (const name of ["navigateTo", "navigateBack", "redirectTo", "reLaunch"] as const) {
      const original = s.uni[name].getMockImplementation()!;
      s.uni[name].mockImplementation(options => {
        if (throwsRemaining > 0) { throwsRemaining--; throw new Error("Controlled SDK chain exception"); }
        return original(options);
      });
    }
    expect(() => page.button(en.nexHowItWorks.ctaBack).props.onClick()).not.toThrow();
    await Promise.resolve();
    expect(s.pages).toEqual(originalPages); expect(s.pages.at(-1)).toBe(originalPages.at(-1));
    expect(s.uni.navigateTo).not.toHaveBeenCalled(); expect(s.uni.redirectTo).toHaveBeenCalledOnce();
    expect(s.uni.reLaunch).toHaveBeenCalledTimes(mode === "cold" ? 2 : 1);
    expect(s.uni.showToast).toHaveBeenCalledOnce();
    expect(s.uni.showToast).toHaveBeenCalledWith({ title: en.ui.navigationFailed, icon: "none" });
    page.button(en.nexHowItWorks.ctaBack).props.onClick();
    expect(s.pages.at(-1)?.route).toBe("/pages/trust/trust");
    expect(s.pages.some(entry => entry.route === "/pages/trust/nex")).toBe(false);
    expect(s.uni.showToast).toHaveBeenCalledOnce();
  });
});
