import { afterEach, describe, expect, it, vi } from "vitest";
import { mountChassis } from "./liquid-glass-view";

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

describe("chassis header title visibility", () => {
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
