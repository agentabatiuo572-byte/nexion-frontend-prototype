import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./trial-device-row.vue?raw";
import { trialFleetCopy } from "@/i18n/trial-fleet";
import { formatTrialRemaining } from "@/i18n/trial-lifecycle";
import { formatAmount } from "@/lib/amount-display";
import { getProductMedia } from "@/lib/product-media";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const messages = { en, zh, vi: vietnamese };

const descriptor = parse(source).descriptor;
const code = ts.transpileModule(compileScript(descriptor, { id: "trial-device-row" }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true,
  isCustomElement: tag => ["view", "text", "image"].includes(tag) }).code)(Vue);

function nodes(node: Vue.VNode): Vue.VNode[] {
  return [node, ...(Array.isArray(node.children) ? node.children.flatMap(child => Vue.isVNode(child) ? nodes(child) : []) : [])];
}
function mount(variant: "home" | "earn" | "inventory" = "earn", locale: keyof typeof trialFleetCopy = "en") {
  const presentation = {
    active: Vue.ref(true), status: Vue.ref("active"), deviceName: Vue.ref("Server Trial B"), productId: Vue.ref<string | null>("stellarbox-s1"), remainingMs: Vue.ref<number | null>(48 * 3_600_000),
    offsetUSD: Vue.ref<number | null>(5), estimatedOffsetUSD: Vue.ref<number | null>(21), offsetProgress: Vue.ref<number | null>(5 / 21),
    actionsReady: Vue.ref(true), presentationReady: Vue.ref(true), refresh: vi.fn(),
  };
  const props = Vue.reactive({ variant, expanded: undefined as boolean | undefined, showCancel: true, cancelBusy: false });
  const navTo = vi.fn(), emit = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue,
    "@/composables/use-trial-presentation": { useTrialPresentation: () => presentation },
    "@/i18n/trial-fleet": { useTrialFleetCopy: () => Vue.ref(trialFleetCopy[locale]) },
    "@/i18n/use-t": { useT: () => Vue.ref(messages[locale]) },
    "@/i18n/trial-lifecycle": { formatTrialRemaining },
    "@/lib/amount-display": { formatAmount }, "@/lib/route": { navTo }, "@/lib/product-media": { getProductMedia },
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(id); return modules[id];
  }, exports);
  const view = exports.default.setup(props, { expose() {}, emit });
  const node = () => render(Vue.proxyRefs({ ...props, ...view }), []) as Vue.VNode;
  const byClass = (className: string) => nodes(node()).find(vnode => vnode.props?.class?.split(" ").includes(className));
  return { props, presentation, navTo, emit, node, byClass };
}

it("renders a collapsed trial row with the actual model image, trial image badge and countdown only", () => {
  const screen = mount(); const tree = nodes(screen.node());
  expect(tree.filter(node => node.props?.["data-trial-device-row"] === "true")).toHaveLength(1);
  expect(tree.filter(node => typeof node.children === "string").map(node => node.children)).toEqual(expect.arrayContaining([
    "Server Trial B", "Online", "2d 0h",
  ]));
  expect(screen.byClass("trial-device-row__image")!.props!.src).toBe(getProductMedia("stellarbox-s1")!.src);
  expect(screen.byClass("trial-device-row__heading")!.props).toMatchObject({ role: "button", tabindex: "0", "aria-expanded": false });
  expect(screen.byClass("trial-device-row__heading")!.props!["aria-label"]).toBe("Trial details: Server Trial B · Online · Remaining 2d 0h");
  expect(screen.byClass("trial-device-row__body")).toBeUndefined();
  expect(screen.byClass("trial-device-row__amount")).toBeUndefined();
  expect(screen.byClass("trial-device-row__buy")).toBeUndefined();
  expect(screen.byClass("trial-device-row__cancel")).toBeUndefined();
});

it("reveals actual credit, a distinct estimate and purchase restrictions in the expanded area", () => {
  const screen = mount(); screen.byClass("trial-device-row__heading")!.props!.onClick();
  expect(screen.byClass("trial-device-row__heading")!.props!["aria-expanded"]).toBe(true);
  expect(nodes(screen.node()).filter(node => typeof node.children === "string").map(node => node.children)).toEqual(expect.arrayContaining([
    "$5.00", "$21.00", "Available credit", "Estimated trial credit", trialFleetCopy.en.creditNote,
  ]));
  expect(screen.byClass("trial-device-row__progress")?.props?.["aria-valuenow"]).toBe(24);
  screen.byClass("trial-device-row__heading")!.props!.onClick();
  expect(screen.byClass("trial-device-row__body")).toBeUndefined();
});

it("keeps details reachable while unavailable purchase/cancel actions remain closed and amounts unknown", () => {
  const screen = mount(); screen.presentation.actionsReady.value = false; screen.presentation.presentationReady.value = false;
  screen.byClass("trial-device-row__heading")!.props!.onClick();
  screen.emit.mockClear();
  screen.presentation.offsetUSD.value = null; screen.presentation.estimatedOffsetUSD.value = null; screen.presentation.offsetProgress.value = null;
  screen.byClass("trial-device-row__buy")!.props!.onClick(); screen.byClass("trial-device-row__cancel")!.props!.onClick();
  expect(screen.navTo).not.toHaveBeenCalled(); expect(screen.emit).not.toHaveBeenCalled();
  expect(screen.byClass("trial-device-row__buy")!.props).toMatchObject({ tabindex: -1, "aria-disabled": true });
  expect(screen.byClass("trial-device-row__amount")!.children).toBe("—");
  expect(screen.byClass("trial-device-row__progress")!.props!["aria-valuenow"]).toBeUndefined();
  screen.byClass("trial-device-row__details")!.props!.onClick(); expect(screen.navTo).toHaveBeenCalledWith("/pages/me/trial");
  screen.byClass("trial-device-row__retry")!.props!.onClick(); expect(screen.presentation.refresh).toHaveBeenCalledTimes(1);
});

it("uses the existing trial detail purchase path and prevents cancellation while busy", () => {
  const screen = mount("inventory"); screen.byClass("trial-device-row__heading")!.props!.onClick(); screen.emit.mockClear(); screen.byClass("trial-device-row__buy")!.props!.onClick();
  expect(screen.navTo).toHaveBeenCalledWith("/pages/me/trial");
  screen.byClass("trial-device-row__cancel")!.props!.onClick(); expect(screen.emit).toHaveBeenCalledExactlyOnceWith("cancel");
  screen.props.cancelBusy = true; screen.byClass("trial-device-row__cancel")!.props!.onClick(); expect(screen.emit.mock.calls.filter(([event]) => event === "cancel")).toHaveLength(1);
  expect(screen.byClass("trial-device-row__cancel")!.props).toMatchObject({ tabindex: -1, "aria-disabled": true });
  screen.presentation.status.value = "grace"; expect(screen.byClass("trial-device-row__cancel")).toBeUndefined();
});

it("uses the Home device-row detail interaction and leaves local disclosure to management", () => {
  const screen = mount("home"); screen.byClass("trial-device-row__heading")!.props!.onClick();
  expect(screen.navTo).toHaveBeenCalledWith("/pages/me/trial");
  expect(screen.byClass("trial-device-row__heading")!.props!["aria-expanded"]).toBeUndefined();
  expect(screen.byClass("trial-device-row__body")).toBeUndefined();
});

it.each(["home", "earn", "inventory"] as const)("applies the normal glass surface only to the inventory host, including %s", variant => {
  const screen = mount(variant);
  expect(screen.byClass("trial-device-row")!.props!.class.split(" ").includes("nx-glass-card")).toBe(variant === "inventory");
});

it.each(["zh", "en", "vi"] as const)("anchors the %s trial badge inside each image slot and keeps the title as the model alone", locale => {
  for (const variant of ["home", "earn", "inventory"] as const) {
    const screen = mount(variant, locale);
    const imageSlot = screen.byClass("trial-device-row__art")!;
    const identity = screen.byClass("trial-device-row__identity")!;
    expect(nodes(imageSlot).filter(node => node.props?.class === "trial-device-row__image-badge").map(node => node.children)).toEqual([trialFleetCopy[locale].imageBadge]);
    expect(nodes(identity).some(node => String(node.props?.class).includes("badge"))).toBe(false);
    expect(screen.byClass("trial-device-row__name")!.children).toBe("Server Trial B");
    expect(screen.byClass("trial-device-row__status")!.children).toBe(messages[locale].earn.online);
  }
});

it.each(["zh", "en", "vi"] as const)("keeps full Home countdown text and its accessible label in %s", locale => {
  const screen = mount("home", locale);
  screen.presentation.remainingMs.value = (2 * 24 + 23) * 3_600_000;
  const fullTime = formatTrialRemaining(screen.presentation.remainingMs.value, trialFleetCopy[locale].longRemaining);
  expect(screen.byClass("trial-device-row__remaining")!.children).toBe(fullTime);
  expect(screen.byClass("trial-device-row__heading")!.props!["aria-label"]).toContain(fullTime);
});

it("lets the Earn parent control disclosure so another device can close the trial", () => {
  const screen = mount(); screen.props.expanded = false;
  screen.byClass("trial-device-row__heading")!.props!.onClick();
  expect(screen.emit).toHaveBeenCalledExactlyOnceWith("toggle");
  expect(screen.byClass("trial-device-row__body")).toBeUndefined();
  screen.props.expanded = true; expect(screen.byClass("trial-device-row__body")).toBeDefined();
  screen.props.expanded = false; expect(screen.byClass("trial-device-row__body")).toBeUndefined();
});

it.each(["zh", "en", "vi"] as const)("preserves active and grace semantics in %s without inventing an unknown product image", locale => {
  const screen = mount("earn", locale); const copy = trialFleetCopy[locale];
  expect(screen.byClass("trial-device-row__status")!.children).toBe(messages[locale].earn.online);
  screen.presentation.status.value = "grace";
  expect(screen.byClass("trial-device-row__status")!.children).toBe(messages[locale].earn.offline);
  screen.byClass("trial-device-row__heading")!.props!.onClick();
  expect(screen.byClass("trial-device-row__state")!.children).toBe(copy.grace);
  expect(screen.byClass("trial-device-row__cancel")).toBeUndefined();
  screen.presentation.productId.value = "unknown-sku";
  expect(screen.byClass("trial-device-row__image")).toBeUndefined();
});

it.each(["zh", "en", "vi"] as const)("keeps a confirmed refreshing snapshot readable but shows unknown after read failure in %s", locale => {
  for (const variant of ["home", "earn", "inventory"] as const) {
    const screen = mount(variant, locale);
    screen.presentation.actionsReady.value = false;
    expect(screen.byClass("trial-device-row__status")!.children).toBe(messages[locale].earn.online);
    screen.presentation.presentationReady.value = false;
    expect(screen.byClass("trial-device-row__status")!.children).toBe(trialFleetCopy[locale].statusUnknown);
    expect(screen.byClass("trial-device-row__heading")!.props!["aria-label"]).toContain(trialFleetCopy[locale].statusUnknown);
    screen.presentation.status.value = "grace";
    expect(screen.byClass("trial-device-row__status")!.children).toBe(trialFleetCopy[locale].statusUnknown);
    screen.presentation.presentationReady.value = true;
    expect(screen.byClass("trial-device-row__status")!.children).toBe(messages[locale].earn.offline);
  }
});

it("leaves no trial row after the confirmed lifecycle exits the active queue", () => {
  const screen = mount(); screen.presentation.active.value = false;
  expect(screen.byClass("trial-device-row")).toBeUndefined();
});
