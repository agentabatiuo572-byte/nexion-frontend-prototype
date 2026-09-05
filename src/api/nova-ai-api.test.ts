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

describe("Nova local AI API", () => {
  it("strictly accepts the local Ollama status proof", async () => {
    const api = createNovaAiApi(fakeClient({
      available: true,
      provider: "OLLAMA_LOCAL",
      model: "gemma4-e4b-ctx32k:latest",
      privacy: "LOCAL_MACHINE",
    }));

    await expect(api.status()).resolves.toEqual({
      available: true,
      provider: "OLLAMA_LOCAL",
      model: "gemma4-e4b-ctx32k:latest",
      privacy: "LOCAL_MACHINE",
    });
  });

  it("sends bounded user/assistant history and parses a non-empty local reply", async () => {
    const client = fakeClient({
      reply: "Local answer",
      provider: "OLLAMA_LOCAL",
      model: "gemma4-e4b-ctx32k:latest",
    });
    const api = createNovaAiApi(client);

    await expect(api.chat({
      message: "How do I open a ticket?",
      language: "en",
      history: [{ role: "assistant", content: "Earlier answer" }],
    })).resolves.toMatchObject({ reply: "Local answer" });
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/api/app/support/ai/chat",
      timeoutMs: 120_000,
    }));
  });

  it("rejects a response that does not prove the local provider", async () => {
    const api = createNovaAiApi(fakeClient({ reply: "fake", provider: "REMOTE", model: "gemma" }));
    await expect(api.chat({ message: "hello", language: "en", history: [] }))
      .rejects.toThrow("NOVA_AI_RESPONSE_INVALID");
  });
});
