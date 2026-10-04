import { describe, expect, it, vi } from "vitest";
import { attachManualScrollLoadMore } from "./use-manual-scroll-load-more";

function createScrollHost() {
  const listeners = new Map<string, EventListener>();
  return {
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 200,
    addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    fireScroll() { listeners.get("scroll")?.(new Event("scroll")); },
    fireInput(name = "wheel", fields: Record<string, unknown> = {deltaY:100}) { listeners.get(name)?.(fields as unknown as Event); },
  };
}

describe("manual scroll load-more attachment", () => {
  it("does not treat a blank-area click as a scrolling gesture", () => {
    const host = createScrollHost(); const loadMore = vi.fn();
    const stop = attachManualScrollLoadMore({closest:()=>host},{enabled:()=>true,hasMore:()=>true,loading:()=>false,loadMore});
    host.fireInput("pointerdown", {target:host,currentTarget:host});
    host.scrollTop=100; host.fireScroll();
    expect(loadMore).not.toHaveBeenCalled(); stop();
  });

  it("expires an unused gesture before a later restored scroll", () => {
    const now = vi.spyOn(Date,"now").mockReturnValue(1000);
    const host=createScrollHost(); const loadMore=vi.fn();
    const stop=attachManualScrollLoadMore({closest:()=>host},{enabled:()=>true,hasMore:()=>true,loading:()=>false,loadMore});
    try {
      host.fireInput(); now.mockReturnValue(2500); host.scrollTop=100; host.fireScroll();
      expect(loadMore).not.toHaveBeenCalled();
    } finally { stop(); now.mockRestore(); }
  });

  it("loads only after a real downward scroll reaches the chassis bottom", async () => {
    const host = createScrollHost();
    const loadMore = vi.fn().mockResolvedValue(undefined);
    const stop = attachManualScrollLoadMore(
      { $el: { closest: vi.fn(() => host) } },
      { enabled: () => true, hasMore: () => true, loading: () => false, loadMore },
    );

    host.fireScroll();
    host.fireInput();
    host.fireInput(); host.scrollTop = 100;
    host.fireScroll();
    await Promise.resolve();

    expect(loadMore).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not cascade on an unchanged or upward scroll, and detaches cleanly", async () => {
    const host = createScrollHost();
    const loadMore = vi.fn().mockResolvedValue(undefined);
    const stop = attachManualScrollLoadMore(
      { $el: { closest: vi.fn(() => host) } },
      { enabled: () => true, hasMore: () => true, loading: () => false, loadMore },
    );

    host.fireInput(); host.scrollTop = 100;
    host.fireScroll();
    await Promise.resolve();
    host.fireScroll();
    host.scrollTop = 80;
    host.fireScroll();
    await Promise.resolve();
    stop();
    host.scrollTop = 100;
    host.fireScroll();

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(host.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("keeps append retries possible after a rejected request", async () => {
    const host = createScrollHost();
    const loadMore = vi.fn()
      .mockRejectedValueOnce(new Error("append failed"))
      .mockResolvedValueOnce(undefined);
    const stop = attachManualScrollLoadMore(
      { $el: { closest: vi.fn(() => host) } },
      { enabled: () => true, hasMore: () => true, loading: () => false, loadMore },
    );

    host.fireInput(); host.scrollTop = 100;
    host.fireScroll();
    await Promise.resolve();
    host.fireInput(); host.scrollTop = 101;
    host.fireScroll();
    await Promise.resolve();

    expect(loadMore).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not load on restoration, or reuse a consumed gesture after a response", async () => {
    const host = createScrollHost(); const loadMore = vi.fn().mockResolvedValue(undefined);
    const stop = attachManualScrollLoadMore({closest:()=>host},{enabled:()=>true,hasMore:()=>true,loading:()=>false,loadMore});
    host.scrollTop = 99; host.fireScroll(); expect(loadMore).not.toHaveBeenCalled();
    host.fireInput(); host.scrollTop=100; host.fireScroll(); await Promise.resolve();
    host.scrollTop=101; host.fireScroll(); expect(loadMore).toHaveBeenCalledTimes(1); stop();
  });

  it("supports touch and keyboard input, and honors the error/disabled gate", async () => {
    const host = createScrollHost(); const loadMore = vi.fn().mockResolvedValue(undefined); let enabled=false;
    const stop=attachManualScrollLoadMore({closest:()=>host},{enabled:()=>enabled,hasMore:()=>true,loading:()=>false,loadMore});
    host.fireInput(); host.scrollTop=97;host.fireScroll();expect(loadMore).not.toHaveBeenCalled();
    enabled=true;host.fireInput("touchstart",{touches:[{clientY:150}]});host.fireInput("touchmove",{touches:[{clientY:100}]});host.scrollTop=98;host.fireScroll();await Promise.resolve();
    host.fireInput("keydown",{key:"PageDown"});host.scrollTop=99;host.fireScroll();await Promise.resolve();
    expect(loadMore).toHaveBeenCalledTimes(2);stop();
  });
});
