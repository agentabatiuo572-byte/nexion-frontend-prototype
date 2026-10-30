import { afterEach, describe, expect, it, vi } from "vitest";
import { useScrollGrowProgress } from "./use-scroll-grow-progress";
import { nextTick } from 'vue';

const hooks = vi.hoisted(() => ({ mounted: [] as Array<() => void>, unmounted: [] as Array<() => void> }));
vi.mock("vue", async (original) => ({
  ...await original<typeof import("vue")>(),
  onMounted: (callback: () => void) => hooks.mounted.push(callback),
  onUnmounted: (callback: () => void) => hooks.unmounted.push(callback),
}));

afterEach(() => {
  hooks.unmounted.forEach((callback) => callback());
  hooks.mounted.length = 0;
  hooks.unmounted.length = 0;
  vi.unstubAllGlobals();
});

describe("visibility fallback for network readers", () => {
  it("binds an API-backed card that mounts later and disconnects when it leaves", async () => {
    class ViewElement {}
    vi.stubGlobal('Element', ViewElement);
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', vi.fn(function () { return { observe, disconnect }; }));
    const card = useScrollGrowProgress();
    hooks.mounted[0]();
    expect(observe).not.toHaveBeenCalled();
    const element = new ViewElement();
    card.elRef.value = { $el: element } as unknown as HTMLElement;
    await nextTick();
    expect(observe).toHaveBeenCalledWith(element);
    expect(card.inView.value).toBe(false);
    card.elRef.value = null;
    await nextTick();
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("keeps progress bars visible without IO while network readers remain inactive", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const bar = useScrollGrowProgress();
    const card = useScrollGrowProgress({ fallbackInView: false });
    hooks.mounted.forEach((callback) => callback());
    expect(bar.inView.value).toBe(true);
    expect(card.inView.value).toBe(false);
  });

  it("does not treat an unresolved uni view as visible", () => {
    vi.stubGlobal("IntersectionObserver", vi.fn());
    vi.stubGlobal("Element", class {});
    const card = useScrollGrowProgress({ fallbackInView: false });
    hooks.mounted[0]();
    expect(card.inView.value).toBe(false);
    expect(IntersectionObserver).not.toHaveBeenCalled();
  });

  it("observes the real uni $el and disconnects, with offscreen cards inactive until intersection", () => {
    class ViewElement {}
    vi.stubGlobal("Element", ViewElement);
    const observe = vi.fn(), disconnect = vi.fn();
    let intersect!: (entries: Array<{ isIntersecting: boolean }>) => void;
    const observer = vi.fn(function (callback: typeof intersect) {
      intersect = callback;
      return { observe, disconnect };
    });
    vi.stubGlobal("IntersectionObserver", observer);
    const card = useScrollGrowProgress({ threshold: 0.01, fallbackInView: false });
    const node = new ViewElement();
    card.elRef.value = { $el: node } as unknown as HTMLElement;
    hooks.mounted[0]();
    expect(observe).toHaveBeenCalledWith(node);
    expect(observer).toHaveBeenCalledWith(expect.any(Function), { threshold: 0.01 });
    expect(card.inView.value).toBe(false);
    intersect([{ isIntersecting: true }]);
    expect(card.inView.value).toBe(true);
    intersect([{ isIntersecting: false }]);
    expect(card.inView.value).toBe(false);
    hooks.unmounted[0]();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
