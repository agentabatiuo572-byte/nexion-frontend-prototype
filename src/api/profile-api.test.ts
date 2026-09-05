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
    }));

    await expect(api.profile()).resolves.toMatchObject({ nickname: "NexGrid 5678" });
  });
});
