import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./card-stagger.vue?raw";
import * as lifecycle from "@/composables/use-tab-page-lifecycle";
const native = vi.hoisted(() => ({ hidden: [] as Array<() => void> }));
vi.mock("@dcloudio/uni-app", () => ({ onLoad: vi.fn(), onShow: vi.fn(), onUnload: vi.fn(), onHide: (callback: () => void) => native.hidden.push(callback) }));
const js = ts.transpileModule(compileScript(parse(source).descriptor, { id: "stagger-return", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" } },
}).content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {} as { default: Vue.Component };
new Function("require", "exports", js)((id: string) => id === "vue" ? Vue : lifecycle, exports);
type Node = { props: Record<string, unknown>; children: Node[]; parent: Node | null };
const node = (): Node => ({ props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Node, Node>({ createElement: node, createText: node, createComment: node,
  setText() {}, setElementText() {}, patchProp: (n, key, old, value) => { n.props[key] = value; },
  parentNode: n => n.parent, nextSibling: () => null,
  insert(n, p) { n.parent = p; p.children.push(n); }, remove(n) { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); },
});
const stops: Array<() => void> = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); native.hidden.length = 0; });
function mount(hosted = false) {
  const key = Vue.ref(0), content = Vue.ref("first");
  const app = renderer.createApp({ setup() { Vue.provide(lifecycle.TAB_HOST, hosted); return () => Vue.h(exports.default, { key: key.value }, { default: () => Vue.h("view", content.value) }); } });
  const root = node(); app.mount(root); stops.push(() => app.unmount());
  return { key, content, instant: () => String(root.children[0].props.class).includes("nx-card-stagger--instant") };
}
it("keeps first entrance and makes the same instance instant after its first page hide", async () => {
  const page = mount(); expect(page.instant()).toBe(false);
  native.hidden.forEach(hide => hide()); await Vue.nextTick(); expect(page.instant()).toBe(true);
  native.hidden.forEach(hide => hide()); await Vue.nextTick(); expect(page.instant()).toBe(true);
});
it("keeps native hosted content instant from its first frame", async () => {
  const page = mount(true); expect(page.instant()).toBe(true);
  native.hidden.forEach(hide => hide()); await Vue.nextTick(); expect(page.instant()).toBe(true);
});
it("does not share the return flag with a newly mounted instance", async () => {
  const page = mount(); native.hidden.forEach(hide => hide()); await Vue.nextTick();
  expect(page.instant()).toBe(true); page.key.value++; await Vue.nextTick(); expect(page.instant()).toBe(false);
});
it("does not suppress first entrance merely because existing slot content updates", async () => {
  const page = mount(); page.content.value = "updated"; await Vue.nextTick(); expect(page.instant()).toBe(false);
});
