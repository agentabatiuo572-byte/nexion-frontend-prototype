import { describe, expect, it, vi } from "vitest";
import { classifyPageLoadError, createPageReload } from "./page-load-recovery";

describe("async page load recovery", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://example.invalid/assets/page.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
  ])("identifies module loading failures without inventing an HTTP status: %s", (message) => {
    expect(classifyPageLoadError(new TypeError(message))).toBe("module");
  });
  it("distinguishes the Vue page-loader deadline from API errors", () => {
    expect(classifyPageLoadError(new Error("Async component timed out after 60000ms."))).toBe("timeout");
    for (const error of [new Error("HTTP 500"), new Error("request timeout"), null, {}, "server timeout"]) {
      expect(classifyPageLoadError(error)).toBe("unknown");
    }
  });
  it("never reloads until explicitly invoked, and coalesces repeated gestures", () => {
    const reload = vi.fn();
    const retry = createPageReload(reload);
    expect(reload).not.toHaveBeenCalled();
    expect(retry()).toBe(true);
    expect(retry()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith();
  });
  it("allows a new user attempt if the browser rejects reload", () => {
    const reload = vi.fn().mockImplementationOnce(() => { throw new Error("blocked"); });
    const retry = createPageReload(reload);
    expect(retry()).toBe(false);
    expect(retry()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
