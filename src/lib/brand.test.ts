import { afterEach, expect, it, vi } from "vitest";
import { brandProductName, brandOrderNote, containsLegacyBrand, displayReferralCode, isLegacyBrandUrl, loadPosterBrand } from "./brand";

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

it("masks only the legacy invite code on display", () => {
  expect(displayReferralCode("NEXGRID-8K9X")).toBe("••••-8K9X");
  expect(displayReferralCode("nexgrid-ab12")).toBe("••••-ab12");
  for (const code of ["UVEL-8K9X", "NXAB12CD34EF", "CUSTOM-8K9X", "NEXGRID-8K9XY", ""]) {
    expect(displayReferralCode(code)).toBe(code);
  }
});

it("rejects old brand copy and hosts without rejecting unrelated domains", () => {
  expect(containsLegacyBrand("Contact @nexgrid_official")).toBe(true);
  expect(containsLegacyBrand("UVEL support")).toBe(false);
  for (const url of ["https://nexgrid.ai/ref/", "https://nexgrid.ai./ref/", "https://go.cdn.nexgrid.ai/ref/", "https://nexgrid.io/", "https://%6eexgrid.ai/ref/", "https://nexgrid.ai:bad", "https://uvel.example/nexgrid.ai"]) {
    expect(isLegacyBrandUrl(url)).toBe(true);
  }
  for (const url of ["https://uvel.example/ref/", "https://grid.example/ref/", ""]) {
    expect(isLegacyBrandUrl(url)).toBe(false);
  }
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
