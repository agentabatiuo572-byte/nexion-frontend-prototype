import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./preference-toggle-row.vue?raw";

const descriptor = parse(source).descriptor;
const code = ts.transpileModule(compileScript(descriptor, { id: "unknown-toggle" }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true }).code)(Vue);
const nodes = (node: Vue.VNode): Vue.VNode[] => [node, ...(Array.isArray(node.children) ? node.children.flatMap(child => Vue.isVNode(child) ? nodes(child) : []) : [])];

it("renders unknown as an inert labelled group, without an invented off value or pointer/keyboard action", async () => {
  const props = Vue.reactive({ label: "System", value: null as boolean | null, unknownLabel: "Unknown", locked: true, last: false });
  const exports: any = {}, emit = vi.fn();
  new Function("require", "exports", code)(() => Vue, exports);
  const state = exports.default.setup(props, { expose() {}, emit });
  const tree = async () => {
    let result!: Vue.VNode;
    await renderToString(Vue.createSSRApp({ render() { result = render(Vue.proxyRefs({ ...Vue.toRefs(props), ...state, $slots: {} }), []); return result; } }));
    return nodes(result);
  };
  const unknown = (await tree()).find(node => node.props?.role === "group")!;
  expect(unknown).toBeDefined();
  expect(unknown.props).toMatchObject({ "aria-disabled": "true", "aria-label": "System · Unknown", tabindex: "-1" });
  expect(unknown.props!["aria-checked"]).toBeUndefined(); expect(unknown.props!.onClick).toBeUndefined(); expect(unknown.props!.onKeydown).toBeUndefined();
  expect((await tree()).some(node => node.children === "—")).toBe(true); expect(emit).not.toHaveBeenCalled();
  props.value = true; const locked = (await tree()).find(node => node.props?.role === "switch")!;
  locked.props!.onClick(); expect(emit).not.toHaveBeenCalled(); expect(locked.props!["aria-checked"]).toBe("true");
  props.locked = false; props.value = false; const unlocked = (await tree()).find(node => node.props?.role === "switch")!;
  unlocked.props!.onClick(); expect(emit).toHaveBeenCalledExactlyOnceWith("toggle"); expect(unlocked.props!["aria-checked"]).toBe("false");
});
