import { createRenderer, computed, h, nextTick, ref, watch } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { useDialogA11y } from "./use-dialog-a11y";

type HostNode = { parent: HostNode | null; children: HostNode[] };
const node = (): HostNode => ({ parent: null, children: [] });
const renderer = createRenderer<HostNode, HostNode>({
  createElement: node, createText: node, createComment: node,
  setText: () => {}, setElementText: () => {}, patchProp: () => {},
  parentNode: (child) => child.parent,
  nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent) => { child.parent = parent; parent.children.push(child); },
  remove: (child) => { if (child.parent) child.parent.children = child.parent.children.filter((entry) => entry !== child); },
});

function mountDialog(kind: "HTML" | "SVG", closeEnabled = true) {
  const state = { activeElement: null as FocusNode | null };
  class FocusNode {
    connected = true;
    visible = true;
    focus() { if (this.connected) state.activeElement = this; }
    getClientRects() { return this.connected && this.visible ? [{}] : []; }
    querySelectorAll(): FocusNode[] { return []; }
  }
  // Separate classes model the browser's independent HTML and SVG namespaces.
  class HtmlNode extends FocusNode {}
  class SvgNode extends FocusNode {}
  const body = new HtmlNode();
  const trigger = kind === "SVG" ? new SvgNode() : new HtmlNode();
  const first = new HtmlNode();
  const last = new HtmlNode();
  const hidden = new HtmlNode();
  hidden.visible = false;
  class DialogRoot extends HtmlNode {
    querySelectorAll() { return [first, last, hidden]; }
  }
  const root = new DialogRoot();
  const listeners = new Set<(event: KeyboardEvent) => void>();
  vi.stubGlobal("HTMLElement", HtmlNode);
  vi.stubGlobal("SVGElement", SvgNode);
  vi.stubGlobal("document", {
    get activeElement() { return state.activeElement; },
    addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => listeners.delete(listener),
  });
  const open = ref(false);
  const app = renderer.createApp({
    setup() {
      useDialogA11y(open, () => root as unknown as HTMLElement, closeEnabled ? () => { open.value = false; } : undefined);
      watch(open, (isOpen) => {
        for (const entry of [root, first, last, hidden]) entry.connected = isOpen;
        if (!isOpen && [first, last, hidden].includes(state.activeElement as HtmlNode)) body.focus();
      }, { flush: "post" });
      return () => h("view");
    },
  });
  app.mount(node());
  const settle = async () => { await nextTick(); await nextTick(); };
  const key = (key: string, shiftKey = false) => {
    const event = { key, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    for (const listener of listeners) listener(event as unknown as KeyboardEvent);
    return event;
  };
  let mounted = true;
  const dispose = () => { if (mounted) { app.unmount(); mounted = false; } };
  return { state, open, body, trigger, first, last, listeners, settle, key, dispose };
}

it.each(["HTML", "SVG"] as const)("restores the connected %s opener after Escape or direct close", async (kind) => {
  for (const escape of [true, false]) {
    const f = mountDialog(kind);
    try {
      await f.settle();
      f.trigger.focus();
      f.open.value = true;
      await f.settle();
      expect(f.state.activeElement).toBe(f.first);
      if (escape) {
        const event = f.key("Escape");
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
      } else f.open.value = false;
      await f.settle();
      expect(f.state.activeElement).toBe(f.trigger);
      expect(f.listeners.size).toBe(0);
    } finally { f.dispose(); }
  }
});

it.each(["HTML", "SVG"] as const)("does not focus a removed %s opener", async (kind) => {
  const f = mountDialog(kind);
  try {
    await f.settle();
    f.trigger.focus();
    f.open.value = true;
    await f.settle();
    f.trigger.connected = false;
    f.key("Escape");
    await f.settle();
    expect(f.state.activeElement).toBe(f.body);
    expect(f.listeners.size).toBe(0);
  } finally { f.dispose(); }
});

it("keeps visible Tab wrapping and removes listeners on unmount", async () => {
  const f = mountDialog("SVG");
  try {
    await f.settle();
    f.trigger.focus();
    f.open.value = true;
    await f.settle();
    f.last.focus();
    expect(f.key("Tab").preventDefault).toHaveBeenCalledOnce();
    expect(f.state.activeElement).toBe(f.first);
    expect(f.key("Tab", true).preventDefault).toHaveBeenCalledOnce();
    expect(f.state.activeElement).toBe(f.last);
    f.dispose();
    expect(f.listeners.size).toBe(0);
    expect(f.key("Escape").preventDefault).not.toHaveBeenCalled();
    expect(f.open.value).toBe(true);
  } finally { f.dispose(); }
});

it("preserves previous HTML focus when a pointer opener does not receive focus", async () => {
  const f = mountDialog("SVG");
  try {
    await f.settle();
    f.body.focus();
    f.open.value = true;
    await f.settle();
    f.open.value = false;
    await f.settle();
    expect(f.state.activeElement).toBe(f.body);
  } finally { f.dispose(); }
});

it("does not consume Escape without a close callback", async () => {
  const f = mountDialog("SVG", false);
  try {
    await f.settle();
    f.trigger.focus();
    f.open.value = true;
    await f.settle();
    const event = f.key("Escape");
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(f.open.value).toBe(true);
  } finally { f.dispose(); }
});

it("has no focus or listener effects without document during SSR", async () => {
  const f = mountDialog("SVG");
  try {
    await f.settle();
    f.body.focus();
    vi.stubGlobal("document", undefined);
    f.open.value = true;
    await f.settle();
    expect(f.state.activeElement).toBe(f.body);
    expect(f.listeners.size).toBe(0);
  } finally { f.dispose(); }
});

afterEach(() => vi.unstubAllGlobals());

it("keeps focus in the success dialog during a purchase-sheet handoff and restores the trigger only afterward", async () => {
  const documentState = { activeElement: null as FocusNode | null };
  class FocusNode {
    focus() { documentState.activeElement = this; }
    getClientRects() { return [{}]; }
    querySelectorAll() { return [] as FocusNode[]; }
  }
  class DialogRoot extends FocusNode {
    constructor(private readonly action: FocusNode) { super(); }
    querySelectorAll() { return [this.action]; }
  }
  const trigger = new FocusNode();
  const sheetAction = new FocusNode();
  const successAction = new FocusNode();
  const sheetRoot = new DialogRoot(sheetAction);
  const successRoot = new DialogRoot(successAction);
  trigger.focus();
  vi.stubGlobal("HTMLElement", FocusNode);
  vi.stubGlobal("document", {
    get activeElement() { return documentState.activeElement; },
    addEventListener: () => {}, removeEventListener: () => {},
  });

  const sheetOpen = ref(false);
  const successOpen = ref(false);
  const app = renderer.createApp({
    setup() {
      useDialogA11y(computed(() => sheetOpen.value || successOpen.value),
        () => (successOpen.value ? successRoot : sheetRoot) as unknown as HTMLElement);
      watch(successOpen, async (open) => {
        if (open) { await nextTick(); successAction.focus(); }
      });
      return () => h("view");
    },
  });
  app.mount(node());
  try {
    await nextTick();
    sheetOpen.value = true;
    await nextTick();
    await nextTick();
    expect(documentState.activeElement).toBe(sheetAction);

    sheetOpen.value = false;
    successOpen.value = true;
    await nextTick();
    await nextTick();
    expect(documentState.activeElement).toBe(successAction);

    successOpen.value = false;
    await nextTick();
    await nextTick();
    expect(documentState.activeElement).toBe(trigger);
  } finally {
    app.unmount();
  }
});
