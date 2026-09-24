import { afterEach, expect, it, vi } from "vitest";
import { brandProductName, brandOrderNote, loadPosterBrand } from "./brand";

afterEach(() => vi.unstubAllGlobals());

it("updates only known old catalog labels, preserving custom names and identifiers", () => {
  expect(["NexGridBox S1", "NexGridBox Pro", "NexGridBox Pro v2", "NexGridRack P1", "NexGridRack P2"].map(brandProductName))
    .toEqual(["UVELBox S1", "UVELBox Pro", "UVELBox Pro v2", "UVELRack P1", "UVELRack P2"]);
  for (const text of ["My NexGridBox S1", "NEXGRID-8K9X", "NEX", "NexionBox S1", "Cloud Share", "UVELBox S1"])
    expect(brandProductName(text)).toBe(text);
  expect(brandOrderNote("Device live · joined NexGrid network")).toBe("Device live · joined UVEL network");
  expect(brandOrderNote("Custom NexGrid note")).toBe("Custom NexGrid note");
  expect(brandOrderNote(undefined)).toBeUndefined();
});

it("resolves the platform image path and propagates image failure", async () => {
  vi.stubGlobal("uni", { getImageInfo: ({ src, success }: { src: string; success: (result: { path: string }) => void }) => {
    expect(src).toBe("/static/img/brand/header-logo-dark.png");
    success({ path: "resolved-logo.png" });
  } });
  await expect(loadPosterBrand()).resolves.toBe("resolved-logo.png");
  vi.stubGlobal("uni", { getImageInfo: ({ fail }: { fail: (error: Error) => void }) => fail(new Error("missing logo")) });
  await expect(loadPosterBrand()).rejects.toThrow("missing logo");
});
