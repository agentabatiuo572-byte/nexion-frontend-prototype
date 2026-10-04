import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveChassisScrollElement, scrollCurrentTabToTop, scrollNativeCurrentTabToTop } from "./chassis-scroll";

afterEach(() => vi.unstubAllGlobals());

describe("current tab reselection", () => {
  it("scrolls the active App WebView when the service layer has no document", () => {
    vi.stubGlobal("document", undefined);
    const actual = { scrollTop: 783 };
    const proxy = { $el: { scrollTop: 783 } };
    const evalJS = vi.fn((script: string) => {
      new Function("document", script)({ querySelector: (selector: string) => selector === ".nx-content" ? actual : null });
    });
    expect(scrollNativeCurrentTabToTop({ $getAppWebview: () => ({ evalJS }) })).toBe(true);
    expect(evalJS).toHaveBeenCalledOnce();
    expect(actual.scrollTop).toBe(0);
    expect(proxy.$el.scrollTop).toBe(783);
  });

  it("ignores a page whose native WebView has already closed", () => {
    expect(scrollNativeCurrentTabToTop(null)).toBe(false);
    expect(scrollNativeCurrentTabToTop({ $getAppWebview: () => { throw Error("closed"); } })).toBe(false);
  });

  it("keeps the H5 ref's own scroll node", () => {
    class H5Element {
      classList = { contains: (name: string) => name === "nx-content" };
    }
    vi.stubGlobal("HTMLElement", H5Element);
    const actual = new H5Element();
    const fallback = vi.fn(() => null);
    expect(resolveChassisScrollElement({ $el: actual }, fallback)).toBe(actual);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("resets native Android view scrollTop when scrollTo is absent or unsupported", () => {
    const native = { scrollTop: 640 };
    scrollCurrentTabToTop(native, false);
    expect(native.scrollTop).toBe(0);
    const partial = { scrollTop: 420, scrollTo: vi.fn(() => { throw Error("unsupported"); }) };
    scrollCurrentTabToTop(partial, false);
    expect(partial.scrollTop).toBe(0);
  });

  it("preserves H5 smooth scrolling and reduced-motion behavior", () => {
    const scrollTo = vi.fn();
    const h5 = { scrollTop: 640, scrollTo };
    scrollCurrentTabToTop(h5, false);
    scrollCurrentTabToTop(h5, true);
    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 0, behavior: "smooth" });
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 0, behavior: "auto" });
  });
});
