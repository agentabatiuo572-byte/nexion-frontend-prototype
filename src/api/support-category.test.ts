import { describe, expect, it, vi } from "vitest";
import { createSupportApi } from "./support-api";

describe("support conversation category authority", () => {
  it("reads the PC-controlled category availability contract", async () => {
    const request = vi.fn().mockResolvedValue([
      { type: "advisor", enabled: false },
      { type: "support", enabled: true },
      { type: "ai", enabled: true },
    ]);
    const result = await createSupportApi({ request } as never).conversationCategories();
    expect(result).toEqual({ advisor: false, support: true, ai: true });
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/app/support/conversation-categories" });
  });

  it.each([
    [{ type: "advisor", enabled: true }],
    [{ type: "advisor", enabled: "true" }, { type: "support", enabled: true }, { type: "ai", enabled: true }],
    [{ type: "advisor", enabled: true }, { type: "advisor", enabled: false }, { type: "support", enabled: true }],
  ])("rejects incomplete, malformed, or duplicate category facts", async (...rows) => {
    await expect(createSupportApi({ request: async () => rows } as never).conversationCategories())
      .rejects.toThrow("SUPPORT_CATEGORY_RESPONSE_INVALID");
  });
});
