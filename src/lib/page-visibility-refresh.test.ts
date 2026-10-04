import { describe, expect, it, vi } from "vitest";
import {
  bindPageVisibilityRefresh,
  createPageVisibilityRefresh,
} from "./page-visibility-refresh";

describe("page visibility refresh", () => {
  it("refreshes once when mounted runs before the initial show", () => {
    const refresh = vi.fn();
    const lifecycle = createPageVisibilityRefresh(refresh);

    lifecycle.mounted();
    lifecycle.shown();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes once when show runs before mounted", () => {
    const refresh = vi.fn();
    const lifecycle = createPageVisibilityRefresh(refresh);

    lifecycle.shown();
    lifecycle.mounted();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes when returning from a child page, but not for duplicate show events", () => {
    const refresh = vi.fn();
    const lifecycle = createPageVisibilityRefresh(refresh);

    lifecycle.mounted();
    lifecycle.shown();
    lifecycle.hidden();
    lifecycle.shown();
    lifecycle.shown();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not lose the first real return when an initial show hook was absent", () => {
    const refresh = vi.fn();
    const lifecycle = createPageVisibilityRefresh(refresh);

    lifecycle.mounted();
    lifecycle.hidden();
    lifecycle.shown();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("wires the lifecycle callbacks to a page instance and preserves a child-return refresh", () => {
    const refresh = vi.fn();
    const lifecycle = createPageVisibilityRefresh(refresh);
    let mounted: (() => void) | undefined;
    let shown: (() => void) | undefined;
    let hidden: (() => void) | undefined;

    bindPageVisibilityRefresh(lifecycle, {
      mounted: (callback) => {
        mounted = callback;
      },
      shown: (callback) => {
        shown = callback;
      },
      hidden: (callback) => {
        hidden = callback;
      },
    });

    mounted?.();
    shown?.();
    hidden?.();
    shown?.();

    expect(refresh).toHaveBeenNthCalledWith(1, "initial");
    expect(refresh).toHaveBeenNthCalledWith(2, "return");
  });
});
