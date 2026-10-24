import { afterEach, describe, expect, it, vi } from "vitest";
import { mountChassis, segmentsView, type SegmentsConfiguration } from "./liquid-glass-view";

function harness(top = 0, maximum = 800) {
  const listeners = new Map<string, () => void>();
  const scroll = {
    scrollTop: top, scrollHeight: maximum + 600, clientHeight: 600,
    addEventListener: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    removeEventListener: vi.fn((event: string) => listeners.delete(event)),
  };
  const element = () => {
    const attributes = new Map<string, string>();
    return {
      dataset: {} as Record<string, string>,
      setAttribute: vi.fn((key: string, value: string) => attributes.set(key, value)),
      getAttribute: (key: string) => attributes.get(key) ?? null,
    };
  };
  const title = element(), navTitle = element(), logo = element();
  let targets = [title, navTitle, logo];
  const root = {
    querySelector: vi.fn(() => scroll),
    querySelectorAll: vi.fn(() => targets),
  };
  const disconnect = vi.fn(), observe = vi.fn();
  let mutation: (() => void) | undefined;
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { mutation = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  const controller = mountChassis(root as unknown as HTMLElement);
  return {
    title, navTitle, logo, controller, scroll, root, observe, disconnect,
    move(next: number) { scroll.scrollTop = next; listeners.get("scroll")?.(); },
    lateTitle() { const late = element(); targets = [...targets, late]; mutation?.(); return late; },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

function motionHarness() {
  const frames = new Map<number, FrameRequestCallback>();
  const hosts = new Map<string, unknown>();
  let serial = 0, now = 0;
  const resizeCallbacks: Array<() => void> = [];
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resizeCallbacks.push(callback); } observe() {} disconnect() {} });
  vi.stubGlobal("document", { getElementById: (id: string) => hosts.get(id) });
  let reduced = false;
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduced; }, addEventListener() {}, removeEventListener() {} }));
  const step = () => { now += 1000 / 60; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); };
  function mount(value: string, native: boolean, fromValue?: string, variant = "navigation") {
    const listeners = new Map<string, Function>();
    const lens = { style: {} as Record<string, string> };
    const values = ["home", "earn", "store", "team", "me"];
    const items = values.map((value, index) => ({
      offsetLeft: 5 + 60 * index, offsetTop: 5, offsetWidth: 58, offsetHeight: 58,
      dataset: { glassValue: value } as Record<string, string>,
      parentElement: null as unknown,
      getAttribute: () => null,
      closest() { return this; },
      click() { listeners.get("click")!({ target: this, detail: 0 }); activations.push({ ...this.dataset }); },
    }));
    const activations: Record<string, string>[] = [];
    const root = {
      offsetWidth: 310, clientWidth: 310, clientHeight: 68, scrollLeft: 0, dataset: {},
      querySelectorAll: () => items,
      querySelector: (selector: string) => selector === ":scope > .nx-glass-indicator" ? lens : null,
      addEventListener: (name: string, fn: Function) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
      getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 68 }),
      setPointerCapture() {}, hasPointerCapture: () => false,
    };
    items.forEach(item => { item.parentElement = root; });
    const hostId = `host-${hosts.size}`;
    hosts.set(hostId, root);
    const configuration: SegmentsConfiguration = { hostId, value, values, fromValue, layout: "equal", variant, navigationOnArrival: native };
    const instance = {};
    segmentsView.methods.update.call(instance, configuration);
    step(); step();
    return {
      lens, activations,
      x: () => Number(lens.style.transform.match(/translate3d\(([^p]+)/)![1]),
      click: (index: number) => items[index].click(),
      update: (value: string) => segmentsView.methods.update.call(instance, { ...configuration, value }),
      resize: () => resizeCallbacks.forEach(callback => callback()),
      drag: (from: number, toX: number) => {
        listeners.get("pointerdown")!({ target: items[from], isPrimary: true, button: 0, pointerId: 1, clientX: items[from].offsetLeft + 29, clientY: 30, timeStamp: now });
        listeners.get("pointermove")!({ pointerId: 1, clientX: toX, clientY: 30, timeStamp: now + 20, preventDefault() {} });
        listeners.get("pointerup")!({ type: "pointerup", pointerId: 1, clientX: toX, clientY: 30 });
      },
      destroy: () => segmentsView.beforeUnmount.call(instance),
    };
  }
  return { mount, step, reduce() { reduced = true; } };
}

describe("glass navigation animation ownership", () => {
  it("handles A to B to A before any model commit, followed by a fresh C tap", () => {
    const h = motionHarness(), shell = h.mount("home", false);
    shell.click(4); h.step(); shell.click(0);
    shell.update("home"); h.step(); h.step();
    for (let i = 0; i < 60; i++) h.step();
    expect(shell.x()).toBe(5);
    shell.click(2); shell.update("store"); h.step(); h.step();
    for (let i = 0; i < 60; i++) h.step();
    expect(shell.x()).toBe(125); shell.destroy();
  });
  it("keeps the clicked target through old-model updates and resize until the shell commits", () => {
    const h = motionHarness(), shell = h.mount("home", false);
    shell.click(4); h.step();
    const first = shell.x();
    shell.update("home"); shell.resize(); h.step(); h.step();
    expect(shell.x()).toBeGreaterThan(first);
    for (let i = 0; i < 60; i++) h.step();
    expect(shell.x()).toBe(245);
    shell.update("me"); h.step(); h.step();
    expect(shell.x()).toBe(245); shell.destroy();
  });
  it("keeps the newest tap when an earlier model commits, but accepts an external redirect", () => {
    const h = motionHarness(), shell = h.mount("home", false);
    shell.click(2); shell.click(4);
    shell.update("store"); h.step(); h.step();
    for (let i = 0; i < 60; i++) h.step();
    expect(shell.x()).toBe(245);
    shell.update("me"); h.step(); h.step();
    shell.click(0); shell.update("team"); h.step(); h.step();
    for (let i = 0; i < 60; i++) h.step();
    expect(shell.x()).toBe(185); shell.destroy();
  });
  it("keeps a native tap stationary until the destination plays one spring", () => {
    const h = motionHarness(), source = h.mount("me", true);
    source.click(0);
    for (let i = 0; i < 10; i++) h.step();
    expect(source.x()).toBe(245);
    source.destroy();
    const target = h.mount("home", true, "me");
    expect(target.x()).toBe(245);
    h.step(); expect(target.x()).toBeLessThan(245);
    for (let i = 0; i < 60; i++) h.step();
    expect(target.x()).toBe(5);
    target.destroy();
  });
  it("keeps H5 source and destination motion continuous", () => {
    const h = motionHarness(), source = h.mount("me", false);
    source.click(0);
    for (let i = 0; i < 4; i++) h.step();
    expect(source.x()).toBeLessThan(245);
    const departure = source.x(); source.destroy();
    const target = h.mount("home", false, "me");
    expect(target.x()).toBeCloseTo(departure);
    target.destroy();
  });
  it("retains native dragging and marks its one committed selection", () => {
    const h = motionHarness(), source = h.mount("me", true);
    source.drag(4, 34);
    expect(source.x()).toBeLessThan(20);
    expect(source.activations).toEqual([{ glassValue: "home", glassActivation: "drag" }]);
    source.destroy();
    const target = h.mount("home", true);
    expect(target.x()).toBe(5);
    target.destroy();
  });
  it("preserves ordinary selectors and respects reduced motion on native arrival", () => {
    const h = motionHarness(), selector = h.mount("me", true, undefined, "filter");
    selector.click(0); h.step(); expect(selector.x()).toBeLessThan(245); selector.destroy();
    h.reduce();
    const target = h.mount("home", true, "me");
    expect(target.x()).toBe(5); target.destroy();
  });
});

describe("chassis header title visibility", () => {
  it("keeps the product capsule title visible and accessible while scrolling", () => {
    const h = harness();
    h.navTitle.dataset.persistent = "true";
    for (const top of [16, 400, 100, 0]) {
      h.move(top);
      expect(h.navTitle.dataset.hidden).toBe("false");
      expect(h.navTitle.getAttribute("aria-hidden")).toBe("false");
    }
  });
  it("hides both sub-page title variants at 16px and restores only in the top gap", () => {
    const h = harness();
    for (const [top, hidden] of [[0, false], [12, false], [16, true], [12, true], [9, true], [8, false], [0, false]] as const) {
      h.move(top);
      expect(h.title.dataset.hidden).toBe(String(hidden));
      expect(h.navTitle.dataset.hidden).toBe(String(hidden));
      expect(h.logo.dataset.hidden).toBe(String(hidden));
      expect(h.title.getAttribute("aria-hidden")).toBe(String(hidden));
    }
    expect(h.root.querySelectorAll).toHaveBeenCalledWith(".nx-header__l, .spv-titlewrap, .nx-nav-titlewrap");
  });

  it("keeps the title hidden while scrolling back upward through content", () => {
    const h = harness(400);
    expect(h.title.dataset.hidden).toBe("true");
    h.move(100); expect(h.title.dataset.hidden).toBe("true");
    h.move(20); expect(h.title.dataset.hidden).toBe("true");
    h.move(8); expect(h.title.dataset.hidden).toBe("false");
  });

  it("updates a late mounted title without waiting for another scroll", () => {
    const h = harness(120);
    const late = h.lateTitle();
    expect(late.dataset.hidden).toBe("true");
    expect(late.getAttribute("aria-hidden")).toBe("true");
    h.move(0); expect(late.dataset.hidden).toBe("false");
    expect(h.observe).toHaveBeenCalledWith(expect.anything(), { childList: true, subtree: true });
  });

  it("clamps overscroll on a short page to the visible top state", () => {
    const h = harness(200, 0);
    expect(h.title.dataset.hidden).toBe("false");
    h.move(-40); expect(h.title.dataset.hidden).toBe("false");
  });

  it("removes listeners and observation when its page is destroyed", () => {
    const h = harness();
    h.controller.destroy();
    expect(h.scroll.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(h.disconnect).toHaveBeenCalledOnce();
    h.move(100); expect(h.title.dataset.hidden).toBe("false");
  });

  it("can refresh visibility when MutationObserver is unavailable", () => {
    const h = harness(); h.controller.destroy();
    vi.stubGlobal("MutationObserver", undefined);
    const controller = mountChassis(h.root as unknown as HTMLElement);
    h.scroll.scrollTop = 200; controller.update();
    expect(h.title.dataset.hidden).toBe("true");
    controller.destroy();
  });
});
