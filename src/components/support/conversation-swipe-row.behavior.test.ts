import { compileScript, parse } from "@vue/compiler-sfc";
// @ts-expect-error Node-only SFC test harness, consistent with the existing review tests.
import { readFileSync } from "node:fs";
import * as Vue from "vue";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./conversation-swipe-row.vue?raw";

type Node = { tag: string; text: string; props: Record<string, any>; parent: Node | null; children: Node[] };
const node = (tag: string, text = ""): Node => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Node, Node>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: text => node("#comment", text),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  patchProp: (n, key, _old, value) => { n.props[key] = value; },
  insert(n, parent, anchor) {
    if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n);
    n.parent = parent; const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(n); else parent.children.splice(index, 0, n);
  },
  remove(n) { if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n); },
});
const flatten = (n: Node): Node[] => [n, ...n.children.flatMap(flatten)];
const compiled = compileScript(parse(source).descriptor, { id: "swipe-review", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } } });
const js = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const Component = new Function("require", "exports", js + ";return exports.default;")(
  (name: string) => { if (name === "vue") return Vue; throw new Error("Unexpected swipe dependency " + name); }, {});
const mounted: Vue.App<Node>[] = [];
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); vi.useRealTimers(); });
function mount() {
  const props = Vue.reactive({ open: false, busy: false, disabled: false, label: "Support A", deleteLabel: "Delete" });
  const changed = vi.fn((open: boolean) => { props.open = open; }), remove = vi.fn(), navigate = vi.fn();
  const root = node("root"), app = renderer.createApp({ setup: () => () => Vue.h(Component, {
    ...props, "onUpdate:open": changed, onDelete: remove,
  }, { default: () => Vue.h("button", { onClick: navigate }, "Conversation") }) });
  app.mount(root); mounted.push(app);
  const find = (name: string) => flatten(root).find(n => String(n.props.class).split(/\s+/).includes(name))!;
  return { root, props, changed, remove, navigate, swipe: () => find("conversation-swipe"),
    content: () => find("conversation-swipe__content"), deletion: () => find("conversation-swipe__delete") };
}
function touch(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }], preventDefault: vi.fn(), stopPropagation: vi.fn() };
}
// Use the installed Uni implementation instead of assuming the native MouseEvent
// reaches a <view> unchanged. The extracted section also contains createTouchEvent.
const uniSource = readFileSync(new URL("../../../node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js", import.meta.url), "utf8");
const mouseStart = uniSource.indexOf("function normalizeMouseEvent(");
const mouseEnd = uniSource.indexOf("function normalizeTouchEvent(", mouseStart);
if (mouseStart < 0 || mouseEnd < mouseStart) throw new Error("Installed Uni mouse normalizer was not found");
const normalizeMouseEvent = new Function("getWindowTop",
  uniSource.slice(mouseStart, mouseEnd) + ";return normalizeMouseEvent;")(() => 0);
function normalizedMouse(x: number, y: number, buttons = 1) {
  const event: Record<string, any> = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
  normalizeMouseEvent(event, { clientX: x, clientY: y, pageX: x, pageY: y, button: 0, buttons });
  return event;
}
function key(n: Node, value: string) {
  const event = { key: value, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  for (const handler of [n.props.onKeydown].flat()) handler(event);
  return event;
}
function clickContent(h: ReturnType<typeof mount>) {
  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
  h.content().props.onClickCapture(event);
  if (!event.stopPropagation.mock.calls.length) flatten(h.root).find(n => n.tag === "button")!.props.onClick();
  return event;
}

describe("actual conversation swipe row", () => {
  it("keeps the slot usable and the hidden delete action out of keyboard navigation", () => {
    const h = mount();
    expect(h.deletion()).toBeDefined();
    expect(String(h.deletion().props.class)).not.toContain("conversation-swipe__delete--visible");
    expect(h.deletion().props.tabindex).toBe(-1); expect(h.deletion().props["aria-hidden"]).toBe(true);
    clickContent(h); expect(h.navigate).toHaveBeenCalledOnce(); expect(h.remove).not.toHaveBeenCalled();
  });
  it("reveals by horizontal touch, never deletes on gesture end, and suppresses the trailing click", async () => {
    vi.useFakeTimers(); const h = mount();
    const deletion = h.deletion();
    h.swipe().props.onTouchstart(touch(180, 100));
    const move = touch(90, 103); h.swipe().props.onTouchmove(move); await Vue.nextTick();
    expect(move.preventDefault).toHaveBeenCalledOnce();
    expect(h.content().props.style.transform).toBe("translateX(-80px)");
    expect(h.deletion()).toBe(deletion);
    expect(String(deletion.props.class)).toContain("conversation-swipe__delete--visible");
    expect(deletion.props.tabindex).toBe(-1); expect(deletion.props["aria-hidden"]).toBe(true);
    h.swipe().props.onTouchend(); await Vue.nextTick();
    expect(h.changed).toHaveBeenCalledExactlyOnceWith(true); expect(h.remove).not.toHaveBeenCalled();
    expect(h.deletion().props.tabindex).toBe(0);
    expect(deletion.props["aria-hidden"]).toBe(false);
    clickContent(h); expect(h.navigate).not.toHaveBeenCalled(); expect(h.props.open).toBe(true);
    vi.advanceTimersByTime(301);
    clickContent(h); await Vue.nextTick();
    expect(h.props.open).toBe(false); expect(h.navigate).not.toHaveBeenCalled();
    expect(h.deletion()).toBe(deletion);
    expect(String(deletion.props.class)).not.toContain("conversation-swipe__delete--visible");
    expect(deletion.props.tabindex).toBe(-1); expect(deletion.props["aria-hidden"]).toBe(true);
    clickContent(h); expect(h.navigate).toHaveBeenCalledOnce();
  });
  it("leaves vertical scrolling to the page without preventing default or exposing delete", async () => {
    const h = mount(); h.swipe().props.onTouchstart(touch(100, 100));
    const vertical = touch(105, 150); h.swipe().props.onTouchmove(vertical);
    h.swipe().props.onTouchend(); await Vue.nextTick();
    expect(vertical.preventDefault).not.toHaveBeenCalled(); expect(h.changed).not.toHaveBeenCalled();
    expect(h.content().props.style.transform).toBe("translateX(0px)"); expect(h.remove).not.toHaveBeenCalled();
  });
  it("snaps a short horizontal drag closed and cancels an interrupted swipe without opening it", async () => {
    const h = mount(); h.swipe().props.onTouchstart(touch(100, 100));
    h.swipe().props.onTouchmove(touch(80, 100)); h.swipe().props.onTouchend(); await Vue.nextTick();
    expect(h.changed).toHaveBeenCalledExactlyOnceWith(false);
    h.changed.mockClear(); h.swipe().props.onTouchstart(touch(100, 100));
    h.swipe().props.onTouchmove(touch(10, 100)); h.swipe().props.onTouchcancel(); await Vue.nextTick();
    expect(h.changed).not.toHaveBeenCalled(); expect(h.content().props.style.transform).toBe("translateX(0px)");
    expect(h.deletion()).toBeDefined();
    expect(String(h.deletion().props.class)).not.toContain("conversation-swipe__delete--visible");
    expect(h.deletion().props.tabindex).toBe(-1);
  });
  it("supports primary mouse dragging and ignores a secondary mouse press", async () => {
    const h = mount();
    h.swipe().props.onMousedown({ button: 2, clientX: 100, clientY: 0 });
    h.swipe().props.onMousemove({ buttons: 2, clientX: 10, clientY: 0, preventDefault: vi.fn() });
    h.swipe().props.onMouseup(); expect(h.changed).not.toHaveBeenCalled();
    h.swipe().props.onMousedown({ button: 0, clientX: 100, clientY: 0 });
    h.swipe().props.onMousemove({ buttons: 1, clientX: 10, clientY: 0, preventDefault: vi.fn() });
    h.swipe().props.onMouseup(); await Vue.nextTick(); expect(h.props.open).toBe(true);
  });
  it.each(["onMouseup", "onMouseleave"])("drags with actual Uni-normalized events, suppresses navigation and clears the origin on %s", async finish => {
    vi.useFakeTimers(); const h = mount();
    const down = normalizedMouse(180, 100), move = normalizedMouse(90, 103);
    expect(down).not.toHaveProperty("button"); expect(move).not.toHaveProperty("buttons");
    h.swipe().props.onMousedown(down); h.swipe().props.onMousemove(move); await Vue.nextTick();
    expect(move.preventDefault).toHaveBeenCalledOnce();
    expect(h.content().props.style.transform).toBe("translateX(-80px)");
    h.swipe().props[finish](normalizedMouse(90, 103, 0)); await Vue.nextTick();
    expect(h.changed).toHaveBeenCalledExactlyOnceWith(true);
    expect(h.deletion().props.tabindex).toBe(0); expect(h.remove).not.toHaveBeenCalled();
    const click = clickContent(h);
    expect(click.preventDefault).toHaveBeenCalledOnce(); expect(click.stopPropagation).toHaveBeenCalledOnce();
    expect(h.navigate).not.toHaveBeenCalled();

    // A new hover after release/leave must not continue the retired drag.
    h.changed.mockClear();
    const hover = normalizedMouse(260, 104, 0);
    h.swipe().props.onMousemove(hover); h.swipe().props[finish](hover); await Vue.nextTick();
    expect(hover.preventDefault).not.toHaveBeenCalled(); expect(h.changed).not.toHaveBeenCalled();
    expect(String(h.content().props.class)).not.toContain("conversation-swipe__content--dragging");
    expect(h.content().props.style.transform).toBe("translateX(-80px)");
    vi.advanceTimersByTime(301);
    clickContent(h); await Vue.nextTick(); expect(h.props.open).toBe(false);
    expect(h.navigate).not.toHaveBeenCalled();
    clickContent(h); expect(h.navigate).toHaveBeenCalledOnce();
  });
  it("does not start a drag from normalized hover with no mousedown, even though buttons is absent", async () => {
    const h = mount(), hover = normalizedMouse(20, 100, 0);
    expect(hover).not.toHaveProperty("buttons");
    h.swipe().props.onMousemove(hover); await Vue.nextTick();
    expect(hover.preventDefault).not.toHaveBeenCalled();
    expect(h.content().props.style.transform).toBe("translateX(0px)");
    expect(String(h.content().props.class)).not.toContain("conversation-swipe__content--dragging");
    h.swipe().props.onMouseup(hover); expect(h.changed).not.toHaveBeenCalled(); expect(h.remove).not.toHaveBeenCalled();
    clickContent(h); expect(h.navigate).toHaveBeenCalledOnce();
  });
  it("preserves an ordinary normalized mouse click without displacement", async () => {
    const h = mount();
    h.swipe().props.onMousedown(normalizedMouse(180, 100));
    h.swipe().props.onMouseup(normalizedMouse(180, 100, 0)); await Vue.nextTick();
    clickContent(h);
    expect(h.changed).not.toHaveBeenCalled(); expect(h.remove).not.toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledOnce();
  });
  it.each(["Enter", " "])("invokes delete from the visible action using %s without activating the row", async activation => {
    const h = mount(); key(h.swipe(), "ArrowLeft"); await Vue.nextTick();
    const event = key(h.deletion(), activation);
    expect(h.remove).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(h.navigate).not.toHaveBeenCalled();
  });
  it("offers keyboard reveal, close and delete without relying on a touch gesture", async () => {
    const h = mount(); key(h.swipe(), "ArrowLeft"); await Vue.nextTick(); expect(h.props.open).toBe(true);
    key(h.swipe(), "ArrowRight"); await Vue.nextTick(); expect(h.props.open).toBe(false);
    key(h.swipe(), "ArrowLeft"); await Vue.nextTick(); key(h.swipe(), "Escape"); await Vue.nextTick();
    expect(h.props.open).toBe(false); key(h.swipe(), "Delete");
    expect(h.remove).toHaveBeenCalledOnce(); expect(h.navigate).not.toHaveBeenCalled();
  });
  it.each(["disabled", "busy"] as const)("blocks gesture and delete while %s", async state => {
    const h = mount(); h.props[state] = true; await Vue.nextTick();
    h.swipe().props.onTouchstart(touch(100, 0)); h.swipe().props.onTouchmove(touch(10, 0));
    h.swipe().props.onTouchend(); key(h.swipe(), "ArrowLeft"); key(h.swipe(), "Delete"); await Vue.nextTick();
    const normalizedMove = normalizedMouse(10, 0);
    h.swipe().props.onMousedown(normalizedMouse(100, 0));
    h.swipe().props.onMousemove(normalizedMove); h.swipe().props.onMouseup(); await Vue.nextTick();
    expect(normalizedMove.preventDefault).not.toHaveBeenCalled();
    expect(h.changed).not.toHaveBeenCalled(); expect(h.remove).not.toHaveBeenCalled();
    if (state === "disabled") expect(h.deletion()).toBeUndefined();
    else { expect(h.deletion().props["aria-disabled"]).toBe(true); expect(h.deletion().props.tabindex).toBe(-1); }
  });
});
