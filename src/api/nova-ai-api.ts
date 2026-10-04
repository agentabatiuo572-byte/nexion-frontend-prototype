import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface NovaAiStatus {
  available: boolean;
}

export interface NovaAiChatRequest {
  message: string;
  language: "en" | "zh" | "vi";
  conversationId: string;
  turnId: string;
}

export interface NovaAiChatResponse {
  reply: string;
  handoffReason?: string;
  conversationId: string;
  turnId: string;
}

export interface NovaAiHistoryMessage {
  id: string;
  sender: "user" | "nova";
  text: string;
  ts: number;
}

export interface NovaAiHistoryResponse {
  conversationId: string | null;
  messages: NovaAiHistoryMessage[];
  truncated: boolean;
  nextCursor: string | null;
}

export interface NovaAiApi {
  confirmHandoff(conversationId: string, turnId: string, idempotencyKey: string): Promise<string>;
  status(): Promise<NovaAiStatus>;
  chat(request: NovaAiChatRequest, signal?: AbortSignal): Promise<NovaAiChatResponse>;
  history(conversationId?: string, beforeTurnId?: string): Promise<NovaAiHistoryResponse>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function conversationId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

function parseStatus(value: unknown): NovaAiStatus {
  const row = record(value);
  if (!row || typeof row.available !== "boolean") {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_STATUS_RESPONSE_INVALID" });
  }
  return { available: row.available };
}

function parseChat(value: unknown): NovaAiChatResponse {
  const row = record(value);
  if (!row || !conversationId(row.conversationId)
      || !conversationId(row.turnId)
      || typeof row.reply !== "string" || !row.reply.trim() || row.reply.length > 8_000) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_RESPONSE_INVALID" });
  }
  return {
    reply: row.reply.trim(),
    ...(typeof row.handoffReason === "string" ? { handoffReason: row.handoffReason } : {}),
    conversationId: row.conversationId,
    turnId: row.turnId,
  };
}

function parseHistory(value: unknown): NovaAiHistoryResponse {
  const row = record(value);
  const rawMessages = row && Array.isArray(row.messages) ? row.messages : null;
  if (!row || (row.conversationId !== null && !conversationId(row.conversationId))
      || !rawMessages || rawMessages.length > 400 || typeof row.truncated !== "boolean"
      || (row.nextCursor !== null && row.nextCursor !== undefined && !conversationId(row.nextCursor))) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_HISTORY_RESPONSE_INVALID" });
  }
  const messages = rawMessages.map((value): NovaAiHistoryMessage => {
    const message = record(value);
    if (!message || typeof message.id !== "string" || !message.id.trim() || message.id.length > 96
        || !["user", "nova"].includes(String(message.sender))
        || typeof message.text !== "string" || !message.text.trim() || message.text.length > 16_000
        || typeof message.ts !== "number" || !Number.isSafeInteger(message.ts) || message.ts <= 0) {
      throw new ApiError({ kind: "protocol", message: "NOVA_AI_HISTORY_RESPONSE_INVALID" });
    }
    return { id: message.id, sender: message.sender as "user" | "nova", text: message.text.trim(), ts: message.ts };
  });
  if (row.conversationId === null && messages.length > 0) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_HISTORY_RESPONSE_INVALID" });
  }
  return {
    conversationId: row.conversationId,
    messages,
    truncated: row.truncated,
    nextCursor: row.nextCursor == null ? null : String(row.nextCursor).toLowerCase(),
  };
}

function safeRequest(request: NovaAiChatRequest): NovaAiChatRequest {
  const message = request.message.trim();
  if (!message || message.length > 2_000 || !["en", "zh", "vi"].includes(request.language)) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_INPUT_INVALID" });
  }
  if (!conversationId(request.conversationId)) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_CONVERSATION_INVALID" });
  }
  if (!conversationId(request.turnId)) {
    throw new ApiError({ kind: "protocol", message: "NOVA_AI_TURN_INVALID" });
  }
  return {
    message,
    language: request.language,
    conversationId: request.conversationId.toLowerCase(),
    turnId: request.turnId.toLowerCase(),
  };
}

export function createNovaAiApi(client: ApiClient): NovaAiApi {
  return {
    confirmHandoff: async (requestedConversationId, turnId, idempotencyKey) => {
      if (!conversationId(requestedConversationId) || !conversationId(turnId)) throw new ApiError({ kind: "protocol", message: "NOVA_HANDOFF_INPUT_INVALID" });
      const data = record(await client.request({
        method: "POST", path: "/api/app/support/ai/handoffs", idempotencyKey,
        body: { conversationId: requestedConversationId, turnId }, timeoutMs: 30_000,
      }));
      const conversation = record(data?.conversation);
      const id = conversation?.conversationNo;
      if (typeof id !== "string" || !/^CV-[A-Za-z0-9-]{1,80}$/.test(id)) throw new ApiError({ kind: "protocol", message: "NOVA_HANDOFF_RESPONSE_INVALID" });
      return id;
    },
    status: async () => parseStatus(await client.request({
      method: "GET",
      path: "/api/app/support/ai/status",
      timeoutMs: 10_000,
    })),
    chat: async (request, signal) => {
      const safe = safeRequest(request);
      const response = parseChat(await client.request({
        method: "POST",
        path: "/api/app/support/ai/chat",
        body: safe,
        timeoutMs: 120_000,
        signal,
      }));
      if (response.conversationId.toLowerCase() !== safe.conversationId) {
        throw new ApiError({ kind: "protocol", message: "NOVA_AI_CONVERSATION_MISMATCH" });
      }
      if (response.turnId.toLowerCase() !== safe.turnId) {
        throw new ApiError({ kind: "protocol", message: "NOVA_AI_TURN_MISMATCH" });
      }
      return response;
    },
    history: async (requestedConversationId, beforeTurnId) => {
      if (requestedConversationId !== undefined && !conversationId(requestedConversationId)) {
        throw new ApiError({ kind: "protocol", message: "NOVA_AI_CONVERSATION_INVALID" });
      }
      if (beforeTurnId !== undefined && !conversationId(beforeTurnId)) {
        throw new ApiError({ kind: "protocol", message: "NOVA_AI_HISTORY_CURSOR_INVALID" });
      }
      const params = new URLSearchParams();
      if (requestedConversationId) params.set("conversationId", requestedConversationId.toLowerCase());
      if (beforeTurnId) params.set("beforeTurnId", beforeTurnId.toLowerCase());
      const query = params.toString();
      const suffix = query ? `?${query}` : "";
      return parseHistory(await client.request({
        method: "GET",
        path: `/api/app/support/ai/history${suffix}`,
        timeoutMs: 10_000,
      }));
    },
  };
}
