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
