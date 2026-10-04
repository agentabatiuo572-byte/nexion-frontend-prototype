import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createNovaAiApi } from "./nova-ai-api";

const conversationId = "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df";
const turnId = "8c12eaf3-744d-405e-b2fb-64b3d81267be";
const idempotencyKey = "d2719a2d-55e6-4b80-9cd2-da366822a0c5";

function fakeClient(result: unknown): ApiClient {
  return {
    request: vi.fn().mockResolvedValue(result), upload: vi.fn(), refreshSession: vi.fn(),
  } as unknown as ApiClient;
}

describe("Nova human-handoff API", () => {
  it("sends only fixed server-turn identifiers and the retry key", async () => {
    const client = fakeClient({ conversation: { conversationNo: "CV-20260905-01" } });
    const api = createNovaAiApi(client);

    await expect(api.confirmHandoff(conversationId, turnId, idempotencyKey)).resolves.toBe("CV-20260905-01");
    expect(client.request).toHaveBeenCalledWith({
      method: "POST", path: "/api/app/support/ai/handoffs", idempotencyKey,
      body: { conversationId, turnId }, timeoutMs: 30_000,
    });
  });

  it("blocks malformed fixed-turn identifiers before any request", async () => {
    const client = fakeClient({});
    await expect(createNovaAiApi(client).confirmHandoff("not-a-uuid", turnId, idempotencyKey))
      .rejects.toThrow("NOVA_HANDOFF_INPUT_INVALID");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rejects a response that cannot identify the human conversation", async () => {
    await expect(createNovaAiApi(fakeClient({ conversation: { conversationNo: "unsafe path" } }))
      .confirmHandoff(conversationId, turnId, idempotencyKey)).rejects.toThrow("NOVA_HANDOFF_RESPONSE_INVALID");
  });
});
