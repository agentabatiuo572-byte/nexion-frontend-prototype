import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createNovaAiApi } from "./nova-ai-api";

function fakeClient(result: unknown): ApiClient {
  return {
    request: vi.fn().mockResolvedValue(result),
    upload: vi.fn(),
    refreshSession: vi.fn(),
  } as unknown as ApiClient;
}

describe("Nova AI API", () => {
  it("accepts the customer-safe availability status", async () => {
    const api = createNovaAiApi(fakeClient({ available: true }));

    await expect(api.status()).resolves.toEqual({ available: true });
  });

  it("sends a conversation UUID without client-authored history and parses the returned conversation", async () => {
    const client = fakeClient({
      reply: "Local answer",
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    });
    const api = createNovaAiApi(client);

    await expect(api.chat({
      message: "How do I open a ticket?",
      language: "en",
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    })).resolves.toMatchObject({
      reply: "Local answer",
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
    });
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/api/app/support/ai/chat",
      body: {
        message: "How do I open a ticket?",
        language: "en",
        conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
        turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
      },
      timeoutMs: 120_000,
    }));
  });

  it("forwards cancellation to the long-running model request", async () => {
    const client = fakeClient({
      reply: "Local answer",
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    });
    const api = createNovaAiApi(client);
    const controller = new AbortController();

    await api.chat({
      message: "hello",
      language: "en",
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    }, controller.signal);

    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it("restores the latest canonical server transcript", async () => {
    const client = fakeClient({
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      truncated: true,
      messages: [
        { id: "8c12eaf3-744d-405e-b2fb-64b3d81267be:user", sender: "user", text: "Question", ts: 1_777_000_000_000 },
        { id: "8c12eaf3-744d-405e-b2fb-64b3d81267be:nova", sender: "nova", text: "Answer", ts: 1_777_000_000_001 },
      ],
    });
    const api = createNovaAiApi(client);

    await expect(api.history()).resolves.toMatchObject({
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      truncated: true,
      messages: [{ sender: "user", text: "Question" }, { sender: "nova", text: "Answer" }],
    });
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      path: "/api/app/support/ai/history",
    }));
  });

  it("rejects a response without the customer-facing conversation identifiers", async () => {
    const api = createNovaAiApi(fakeClient({ reply: "fake" }));
    await expect(api.chat({
      message: "hello",
      language: "en",
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    }))
      .rejects.toThrow("NOVA_AI_RESPONSE_INVALID");
  });

  it("rejects a malformed conversation identifier before the request leaves the App", async () => {
    const client = fakeClient({});
    const api = createNovaAiApi(client);

    await expect(api.chat({
      message: "hello",
      language: "en",
      conversationId: "user-42",
      turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    }))
      .rejects.toThrow("NOVA_AI_CONVERSATION_INVALID");
    expect(client.request).not.toHaveBeenCalled();
  });
});
