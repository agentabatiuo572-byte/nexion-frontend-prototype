import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./compute-share-entry.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const messages = { en, zh, vi: vietnamese };
const descriptor = parse(source).descriptor;
const code = ts.transpileModule(compileScript(descriptor, { id: "compute-share-entry" }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, {
  mode: "function", prefixIdentifiers: true, isCustomElement: () => true,
}).code)(Vue);
function nodes(node: Vue.VNode): Vue.VNode[] {
  return [node, ...(Array.isArray(node.children) ? node.children.flatMap(child => Vue.isVNode(child) ? nodes(child) : []) : [])];
}
function mount(locale: keyof typeof messages = "en") {
  const config = Vue.reactive({ configStatus: "ready", allowed: true, isEnabled: () => config.allowed });
  const app = Vue.reactive({ activeSlotCount: 2, slotCap: 6 });
  const props = Vue.reactive({ context: "devices", compact: true }), navTo = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue, "@/lib/route": { navTo }, "@/store/app": { useApp: () => app }, "@/store/config": { useConfig: () => config },
    "@/store/free-trial": { trialReservesSlotNow: () => true }, "@/i18n/use-t": { useT: () => Vue.ref(messages[locale]) },
    "@/i18n/remainder-ui": { useRemainderUiCopy: () => Vue.ref({ earnWays: { gpuTitle: "GPU", gpuBody: "PC", gpuAction: "Open" } }) },
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((id: string) => {
    if (id.endsWith(".vue")) return { default: id };
    if (!(id in modules)) throw new Error(id); return modules[id];
  }, exports);
  const view = exports.default.setup(props, { expose() {} });
  const node = () => render(Vue.proxyRefs({ ...props, ...view }), []) as Vue.VNode;
  return { props, app, config, navTo, node };
}

it.each(["zh", "en", "vi"] as const)("keeps the compact %s connection content and original download route", locale => {
  const screen = mount(locale), tree = nodes(screen.node());
  expect(screen.node().props!.class).toBe("compute-share-entry compute-share-entry--compact");
  expect(tree.some(node => node.children === messages[locale].computeShare.entryTitle)).toBe(true);
  expect(tree.some(node => node.children === messages[locale].computeShare.entryBody)).toBe(true);
  expect(tree.some(node => node.children === messages[locale].computeShare.entryEyebrow)).toBe(false);
  const button = tree.find(node => node.props?.role === "button")!;
  expect(button.props).toMatchObject({ tabindex: "0" });
  button.props!.onClick(); expect(screen.navTo).toHaveBeenCalledExactlyOnceWith("/pages/compute-share/download");
  screen.app.activeSlotCount = 5;
  expect(nodes(screen.node()).some(node => node.children === messages[locale].computeShare.entryFull)).toBe(true);
  screen.config.allowed = false;
  expect(nodes(screen.node()).some(node => node.props?.role === "button")).toBe(false);
  button.props!.onClick(); expect(screen.navTo).toHaveBeenCalledTimes(1);
});

it("preserves the default devices card and Earn presentation", () => {
  const screen = mount(); screen.props.compact = false;
  expect(screen.node().props!.class).toBe("nx-glass-card compute-share-entry mx-4");
  expect(nodes(screen.node()).some(node => node.type === "NxButton")).toBe(true);
  screen.props.context = "earn"; screen.props.compact = true;
  expect(screen.node().type).toBe("EarnWayCard");
  screen.config.configStatus = "loading"; expect(screen.node().type).toBe(Vue.Comment);
});
