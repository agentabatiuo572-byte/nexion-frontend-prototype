import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createContentCopyApi } from "./content-copy-api";

describe("managed content copy API", () => {
  it("loads a visible position and records an idempotent conversion key", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        copyKey: "home.conversion-banner.v1",
        version: "2026-08-15",
        zh: "Simplified Chinese",
        en: "English",
        vi: "Tiếng Việt",
        experimentId: "home-banner",
        variant: "control",
      })
      .mockResolvedValueOnce({
        experimentId: "home-banner",
        conversionKey: "ORDER-42",
        counted: true,
      });
    const api = createContentCopyApi({ request } as unknown as ApiClient);

    await expect(api.byPosition("home.conversion-banner")).resolves.toMatchObject({ experimentId: "home-banner" });
    await expect(api.convert("home-banner", "ORDER-42")).resolves.toMatchObject({ counted: true });

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/api/content/positions/home.conversion-banner",
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/api/content/experiments/home-banner/convert",
      body: { conversionKey: "ORDER-42" },
    });
  });
});
