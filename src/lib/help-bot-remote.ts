import type { NovaAiChatRequest } from "@/api/nova-ai-api";

export function buildRemoteHelpRequest(
  message: string,
  language: NovaAiChatRequest["language"],
  conversationId: string,
  turnId: string,
): NovaAiChatRequest {
  return {
    message: message.trim(),
    language,
    conversationId,
    turnId,
  };
}
