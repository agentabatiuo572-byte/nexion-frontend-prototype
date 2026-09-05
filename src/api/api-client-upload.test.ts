import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { createSessionVault } from "./session-vault";

describe("API multipart upload", () => {
  it("sends the in-memory bearer and idempotency key and decodes uni.uploadFile JSON", async () => {
    const vault = createSessionVault();
    vault.save({
      accessToken: "access",
      refreshToken: "refresh",
      tokenType: "Bearer",
      user: { userId: 42, countryCode: "+81", phone: "9012345678", nickname: "NexGrid 5678" },
    });
    const upload = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify({ code: 0, message: "OK", data: { status: "UPDATED" } }),
      headers: {},
    });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      vault,
      transport: { request: vi.fn(), upload },
    });

    await expect(api.upload({
      path: "/api/app/profile/avatar",
      filePath: "blob:avatar",
      idempotencyKey: "avatar-key",
    })).resolves.toEqual({ status: "UPDATED" });
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://127.0.0.1:8110/api/app/profile/avatar",
      filePath: "blob:avatar",
      name: "file",
      headers: { Authorization: "Bearer access", "Idempotency-Key": "avatar-key" },
    }));
  });
});
