import { createRenderer, defineComponent, h, nextTick, provide, ref } from "vue";
import { expect, it, vi } from "vitest";
vi.mock("@dcloudio/uni-app", () => ({ onLoad: vi.fn(), onShow: vi.fn(), onHide: vi.fn(), onUnload: vi.fn() }));
import { createTabLifecycle, onHide, onLoad, onShow, onUnload, TAB_LIFECYCLE } from "./use-tab-page-lifecycle";

type Node = { children: Node[]; parent?: Node };
const node = (): Node => ({ children: [] });
const renderer = createRenderer<Node, Node>({
  createElement: node, createText: node, createComment: node,
  setText() {}, setElementText() {}, patchProp() {},
  parentNode: item => item.parent ?? null, nextSibling: () => null,
  insert(item, parent) { item.parent = parent; parent.children.push(item); },
  remove(item) { if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item); },
});

it("delivers load before show, one hide/unload, late-child visibility, and real return-to-page refresh", async () => {
  const events: string[] = [], late = ref(false), active = ref(true);
  const lifecycle = createTabLifecycle({ activityId: "a" }, true);
  const child = (name: string) => defineComponent({ setup() {
    onLoad(query => events.push(`${name}:load:${query?.activityId}`));
    onShow(() => events.push(`${name}:show`));
    onHide(() => events.push(`${name}:hide`));
    onUnload(() => events.push(`${name}:unload`));
    return () => h("view");
  } });
  const Main = child("main"), Late = child("late");
  const app = renderer.createApp({ setup() {
    provide(TAB_LIFECYCLE, lifecycle);
    return () => h("view", active.value ? [h(Main), ...(late.value ? [h(Late)] : [])] : []);
  } });
  app.mount(node());
  expect(events).toEqual(["main:load:a", "main:show"]);
  lifecycle.setVisible(false); lifecycle.setVisible(false);
  expect(events.filter(value => value === "main:hide")).toHaveLength(1);
  late.value = true; await nextTick();
  expect(events.at(-1)).toBe("late:load:a");
  lifecycle.setVisible(true); lifecycle.setVisible(true);
  expect(events.slice(-2)).toEqual(["main:show", "late:show"]);
  active.value = false; await nextTick();
  expect(events.slice(-4)).toEqual(["main:hide", "main:unload", "late:hide", "late:unload"]);
  expect(lifecycle.listeners.size).toBe(0);
  lifecycle.setVisible(false); lifecycle.setVisible(true);
  expect(events.at(-1)).toBe("late:unload");
  app.unmount();
});
