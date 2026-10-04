import { describe, expect, it } from "vitest";
import type { NovaAiChatResponse } from "@/api/nova-ai-api";
import { buildRemoteHelpRequest, novaHelpSource } from "./help-bot-remote";

describe("remote inline help bot", () => {
  it("keeps the selected locale and conversation while excluding client history", () => {
    expect(buildRemoteHelpRequest(
      "  How do I check my order?  ",
      "zh",
      "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    )).toEqual({
      message: "How do I check my order?",
      language: "zh",
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    });
  });

  it("uses a customer-safe source label without runtime implementation details", () => {
    const response: NovaAiChatResponse = {
      reply: "Use My Orders.",
      conversationId: "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
      turnId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
    };

    expect(novaHelpSource(response)).toBe("UVEL AI");
  });
});
