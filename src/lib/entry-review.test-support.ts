import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";

export type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
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
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
export const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
export const text = (root: Host): string => root.text + root.children.map(text).join("");
export const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await Vue.nextTick(); };
export const slot = { default: Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("shell", {}, slots.default?.()) }) };
export function mountEntry(source: string, dependencies: Record<string, unknown>) {
  const descriptor = parse(source, { filename: "entry.vue" }).descriptor;
  const compiled = compileScript(descriptor, { id: "entry-review", inlineTemplate: true,
    templateOptions: { compilerOptions: { hoistStatic: false, isCustomElement: tag => ["view", "text", "scroll-view", "input"].includes(tag) } },
  });
  const code = ts.transpileModule(compiled.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", code)((id: string) => {
    if (id === "vue") return Vue;
    if (!(id in dependencies)) throw new Error(`Missing entry test dependency: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node("root"), app = renderer.createApp(exports.default);
  app.component("scroll-view", slot.default);
  app.mount(root);
  return { root, unmount: () => app.unmount(), control: (label: string) => all(root).find(n => ["button", "link"].includes(n.props.role) && text(n) === label),
    nodes: (className: string) => all(root).filter(n => String(n.props.class).split(" ").includes(className)) };
}
