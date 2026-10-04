import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createProfileApi } from "./profile-api";

function client(data: unknown): ApiClient {
  return {
    request: vi.fn().mockResolvedValue(data),
    upload: vi.fn(),
    refreshSession: vi.fn(),
  } as unknown as ApiClient;
}

describe("profile API projection", () => {
  it("accepts an existing server nickname that predates the curated nickname editor", async () => {
    const api = createProfileApi(client({
      nickname: "NexGrid 5678",
      avatarUrl: "",
      avatarRevision: "",
      language: "vi",
    }));

    await expect(api.profile()).resolves.toMatchObject({ nickname: "NexGrid 5678", language: "vi" });
  });

  it("writes only a supported locale to the authenticated profile endpoint", async () => {
    const request = vi.fn().mockResolvedValue({ language: "zh" });
    const api = createProfileApi({ ...client({}), request } as unknown as ApiClient);

    await expect(api.updateLanguage("zh")).resolves.toBe("zh");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "PUT",
      path: "/api/app/profile/language",
      body: { language: "zh" },
    }));
    await expect(api.updateLanguage("zh-CN" as never)).rejects.toMatchObject({
      message: "PROFILE_LANGUAGE_INVALID",
    });
  });
});
