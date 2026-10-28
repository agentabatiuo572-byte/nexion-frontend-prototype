import { compileScript, parse } from "@vue/compiler-sfc";
import { createPinia, setActivePinia } from "pinia";
import * as Vue from "vue";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as visibilityModule from "@/store/data-visibility";
import * as localeModule from "@/store/locale";
import { installKeyboardActivation, uninstallKeyboardActivation } from "@/lib/a11y-activate";
import source from "./data-visibility-toggle.vue?raw";

const { useDataVisibility } = visibilityModule;
const KEY = "uvel-data-visibility-v1";
const storage = new Map<string, unknown>();
const getStorageSync = vi.fn((key: string) => storage.get(key) ?? "");
const setStorageSync = vi.fn((key: string, value: unknown) => { storage.set(key, value); });
const listeners = new Map<string, (event: any) => void>();
let pinia: ReturnType<typeof createPinia>;
const mounted: Vue.App[] = [];

type Node = { tag: string; props: Record<string, any>; children: Node[]; parent: Node | null };
const node = (tag: string): Node => ({ tag, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Node, Node>({
  createElement: node, createText: () => node("#text"), createComment: () => node("#comment"),
  setText() {}, setElementText() {}, patchProp: (n, key, _old, value) => { n.props[key] = value; },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert(n, parent, anchor) {
    if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n);
    n.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(n); else parent.children.splice(index, 0, n);
  },
  remove(n) { if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n); },
});
const compiled = compileScript(parse(source).descriptor, {
  id: "data-visibility-toggle", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" } },
});
const js = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const Toggle = new Function("require", "exports", js + ";return exports.default;")((id: string) => {
  if (id === "vue") return Vue;
  if (id === "@/store/data-visibility") return visibilityModule;
  if (id === "@/store/locale") return localeModule;
  throw new Error("Unexpected toggle dependency: " + id);
}, {});

beforeEach(() => {
  storage.clear();
  getStorageSync.mockClear(); setStorageSync.mockClear();
  vi.stubGlobal("uni", { getStorageSync, setStorageSync });
  vi.stubGlobal("document", {
    addEventListener: (type: string, handler: (event: any) => void) => listeners.set(type, handler),
    removeEventListener: (type: string) => listeners.delete(type),
  });
  pinia = createPinia(); setActivePinia(pinia);
  installKeyboardActivation();
});
afterEach(() => {
  mounted.splice(0).forEach(app => app.unmount());
  uninstallKeyboardActivation();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function mountToggle() {
  const outerClick = vi.fn(), outerKeydown = vi.fn();
  const root = node("root");
  const app = renderer.createApp({ render: () => Vue.h("view", {
    onClick: outerClick, onKeydown: outerKeydown,
  }, [Vue.h(Toggle)]) });
  app.use(pinia); app.mount(root); mounted.push(app);
  return { button: root.children[0].children[0], outerClick, outerKeydown };
}

function dispatch(button: Node, type: "Click" | "Keydown", extra: Record<string, unknown> = {}) {
  const event = {
    ...extra, stopped: false, defaultPrevented: false,
    stopPropagation() { this.stopped = true; },
    preventDefault() { this.defaultPrevented = true; },
    target: { tagName: "UNI-VIEW", getAttribute: (name: string) => button.props[name], click: () => dispatch(button, "Click") },
  };
  for (let current: Node | null = button; current && !event.stopped; current = current.parent) {
    const handlers = current.props["on" + type];
    for (const handler of Array.isArray(handlers) ? handlers : handlers ? [handlers] : []) handler(event);
  }
  if (type === "Keydown" && !event.stopped) listeners.get("keydown")?.(event);
  return event;
}

describe("data visibility preference", () => {
  it("starts visible and preserves formatted values, zero and unknown without changing their source", () => {
    const store = useDataVisibility();
    expect(store.hidden).toBe(false);
    expect(["$1,234.50", 0, "—", -12.5].map(store.mask)).toEqual(["$1,234.50", "0", "—", "-12.5"]);
    expect(setStorageSync).not.toHaveBeenCalled();
  });

  it("uses one shared reactive preference and restores both choices on a fresh Pinia", () => {
    const store = useDataVisibility();
    const values = ["52,800.64 USDT", "6.75 USDT", "180 TH/s", 12];
    const displays = values.map(value => Vue.computed(() => useDataVisibility(pinia).mask(value)));
    store.toggle();
    expect(displays.map(value => value.value)).toEqual(Array(4).fill("••••"));
    expect(values).toEqual(["52,800.64 USDT", "6.75 USDT", "180 TH/s", 12]);
    expect(setStorageSync).toHaveBeenLastCalledWith(KEY, true);
    const reloaded = useDataVisibility(createPinia());
    expect(reloaded.hidden).toBe(true); expect(reloaded.mask("new value")).toBe("••••");
    reloaded.toggle();
    expect(setStorageSync).toHaveBeenLastCalledWith(KEY, false);
    expect(useDataVisibility(createPinia()).hidden).toBe(false);
  });

  it("accepts only a stored boolean and does not treat truthy malformed values as a choice", () => {
    for (const value of ["true", "false", 1, {}, { hidden: true }, null, false]) {
      storage.set(KEY, value);
      expect(useDataVisibility(createPinia()).hidden).toBe(false);
    }
    storage.set(KEY, true);
    expect(useDataVisibility(createPinia()).hidden).toBe(true);
  });

  it("keeps the display usable on storage failure and reports failed persistence", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getStorageSync.mockImplementationOnce(() => { throw new Error("unavailable"); });
    const store = useDataVisibility();
    expect(store.hidden).toBe(false); expect(warn).toHaveBeenCalledTimes(1);
    setStorageSync.mockImplementationOnce(() => { throw new Error("quota"); });
    store.toggle(); expect(store.hidden).toBe(true); expect(store.mask(10)).toBe("••••");
    expect(warn).toHaveBeenCalledTimes(2);
    store.toggle(); expect(storage.get(KEY)).toBe(false);
  });
});

describe("data visibility toggle", () => {
  it("updates multiple buttons and their eye state without activating the outer card", async () => {
    const first = mountToggle(), second = mountToggle();
    expect(first.button.props.role).toBe("button"); expect(first.button.props.tabindex).toBe("0");
    expect(first.button.props["aria-pressed"]).toBe("false");
    const icon = first.button.children[0];
    expect(icon.props.width).toBe("20"); expect(icon.props.height).toBe("20");
    expect(icon.props["aria-hidden"]).toBe("true");
    expect(icon.children.filter(n => n.tag === "path")).toHaveLength(1);
    dispatch(first.button, "Click"); await Vue.nextTick();
    expect(first.button.props["aria-pressed"]).toBe("true");
    expect(second.button.props["aria-pressed"]).toBe("true");
    expect(icon.children.filter(n => n.tag === "path")).toHaveLength(2);
    expect(first.outerClick).not.toHaveBeenCalled();
    expect(setStorageSync.mock.calls.filter(([key]) => key === KEY)).toEqual([[KEY, true]]);
  });

  it.each(["Enter", " "])("activates once on %j without scrolling, bubbling or repeat toggles", async key => {
    const h = mountToggle();
    const event = dispatch(h.button, "Keydown", { key, repeat: false }); await Vue.nextTick();
    expect(useDataVisibility().hidden).toBe(true);
    expect(event.defaultPrevented).toBe(true); expect(event.stopped).toBe(true);
    expect(h.outerClick).not.toHaveBeenCalled(); expect(h.outerKeydown).not.toHaveBeenCalled();
    listeners.get("keydown")?.(event);
    dispatch(h.button, "Keydown", { key, repeat: true });
    dispatch(h.button, "Keydown", { key, ctrlKey: true });
    expect(setStorageSync.mock.calls.filter(([savedKey]) => savedKey === KEY)).toEqual([[KEY, true]]);
    dispatch(h.button, "Keydown", { key, repeat: false });
    expect(useDataVisibility().hidden).toBe(false);
  });

  it("changes semantic action labels with the real locale store while keeping the privacy choice", async () => {
    const h = mountToggle(), locale = localeModule.useLocaleStore();
    expect(h.button.props["aria-label"]).toBe("隐藏资产、收益、算力和团队统计");
    dispatch(h.button, "Click"); await Vue.nextTick();
    expect(h.button.props["aria-label"]).toBe("显示资产、收益、算力和团队统计");
    locale.setLocale("en"); await Vue.nextTick();
    expect(h.button.props["aria-label"]).toBe("Show assets, earnings, compute and team statistics");
    locale.setLocale("vi"); await Vue.nextTick();
    expect(h.button.props["aria-label"]).toBe("Hiện tài sản, thu nhập, sức mạnh tính toán và thống kê nhóm");
    expect(h.button.props["aria-pressed"]).toBe("true");
    dispatch(h.button, "Click"); await Vue.nextTick();
    expect(h.button.props["aria-label"]).toBe("Ẩn tài sản, thu nhập, sức mạnh tính toán và thống kê nhóm");
    locale.setLocale("en"); await Vue.nextTick();
    expect(h.button.props["aria-label"]).toBe("Hide assets, earnings, compute and team statistics");
  });
});
