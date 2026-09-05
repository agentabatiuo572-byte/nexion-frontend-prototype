import { describe, expect, it } from "vitest";
import { bundleCatalogReady } from "./bundle-catalog-guard";

describe("bundle catalog cold-start contract", () => {
  it("fails closed for remote and explicit sandbox loading/error states", () => {
    expect(bundleCatalogReady(true, "loading")).toBe(false);
    expect(bundleCatalogReady(true, "error")).toBe(false);
    expect(bundleCatalogReady(true, "ready")).toBe(true);
  });

  it("keeps local mock mode available without a server snapshot", () => {
    expect(bundleCatalogReady(false, "ready")).toBe(true);
  });
});
