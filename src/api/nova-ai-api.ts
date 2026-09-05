import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type NovaAiRole = "user" | "assistant";

export interface NovaAiHistoryMessage {
  role: NovaAiRole;
  content: string;
}

export interface NovaAiStatus {
  available: boolean;
  provider: "OLLAMA_LOCAL";
  model: string;
  privacy: "LOCAL_MACHINE";
}

export interface NovaAiChatRequest {
  message: string;
  language: "en" | "zh" | "vi";
  history: NovaAiHistoryMessage[];
}

export interface NovaAiChatResponse {
  reply: string;
  provider: "OLLAMA_LOCAL";
  model: string;
}

export interface NovaAiApi {
  status(): Promise<NovaAiStatus>;
  chat(request: NovaAiChatRequest): Promise<NovaAiChatResponse>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function model(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

function parseStatus(value: unknown): NovaAiStatus {
  const row = record(value);
  if (!row || typeof row.available !== "boolean" || row.provider !== "OLLAMA_LOCAL"
      || !model(row.model) || row.privacy !== "LOCAL_MACHINE") {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_STATUS_RESPONSE_INVALID" });
  }
  return {
    available: row.available,
    provider: "OLLAMA_LOCAL",
    model: row.model,
    privacy: "LOCAL_MACHINE",
  };
}

function parseChat(value: unknown): NovaAiChatResponse {
  const row = record(value);
  if (!row || row.provider !== "OLLAMA_LOCAL" || !model(row.model)
      || typeof row.reply !== "string" || !row.reply.trim() || row.reply.length > 8_000) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_RESPONSE_INVALID" });
  }
  return { reply: row.reply.trim(), provider: "OLLAMA_LOCAL", model: row.model };
}

function safeRequest(request: NovaAiChatRequest): NovaAiChatRequest {
  const message = request.message.trim();
  if (!message || message.length > 2_000 || !["en", "zh", "vi"].includes(request.language)) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_INPUT_INVALID" });
  }
  const history = request.history.slice(-10).map((item) => ({
    role: item.role,
    content: item.content.trim(),
  }));
  if (history.some((item) => !["user", "assistant"].includes(item.role)
      || !item.content || item.content.length > 2_000)) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_HISTORY_INVALID" });
  }
  return { message, language: request.language, history };
}

export function createNovaAiApi(client: ApiClient): NovaAiApi {
  return {
    status: async () => parseStatus(await client.request({
      method: "GET",
      path: "/api/app/support/ai/status",
      timeoutMs: 10_000,
    })),
    chat: async (request) => parseChat(await client.request({
      method: "POST",
      path: "/api/app/support/ai/chat",
      body: safeRequest(request),
      timeoutMs: 120_000,
    })),
  };
}
