import { describe, expect, it, vi } from "vitest";
import { createSupportApi } from "./support-api";

const notice = "会话已因用户闲置 5 分钟自动结束,可重新发起会话。";
function detail(type: string, senderType = "system", receiptStatus: unknown = null) {
  return {
    conversation: { conversationNo: "CV-ended", conversationType: type, status: "CLOSED", version: 2,
      ownerAgentName: "", unreadCount: 0, lastMessage: notice, lastMessageAt: "2026-09-01T00:00:00Z" },
    messages: [{ id: 1, senderType: "user", content: "Hello", createdAt: "2026-09-01T00:00:00Z", receiptStatus: null },
      { id: 2, senderType, content: notice, createdAt: "2026-09-01T00:05:00Z", receiptStatus }],
    historyTruncated: false, nextCursor: null,
  };
}

// Current App history excludes internal SYSTEM bodies. These synthetic SYSTEM
// fixtures test parser forward compatibility only, not backend visibility.
describe("conversation message parser compatibility", () => {
  it.each(["advisor", "support"])("accepts the first user message when creating a new %s conversation", async type => {
    const response = detail(type);
    response.conversation.status = "OPEN";
    response.messages = response.messages.slice(0, 1);
    const request = vi.fn(async () => response);
    const result = await createSupportApi({ request } as never).startConversation(type as "advisor" | "support", "Hello", "create-conversation-key");
    expect(result.messages[0]).toMatchObject({ sender: "user", text: "Hello", status: undefined });
    expect(result.sessionStatus).toBe("active");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/app/support/conversations",
      body: { conversationType: type.toUpperCase(), openingText: "Hello", clientMessageId: "create-conversation-key" } }));
  });

  it("interprets unzoned business timestamps as UTC+08 and preserves explicit UTC", async () => {
    const response = detail("support");
    response.conversation.lastMessageAt = "2026-09-24 13:24:00";
    response.messages[0].createdAt = "2026-09-24 13:24:00";
    response.messages[1].createdAt = "2026-09-24T05:24:00Z";
    const conversation = await createSupportApi({ request: async () => response } as never).conversation("CV-ended");
    const instant = Date.parse("2026-09-24T05:24:00Z");
    expect(conversation.lastTs).toBe(instant);
    expect(conversation.messages.map(message => message.ts)).toEqual([instant, instant]);
  });

  it.each(["agent", "user"])("accepts sent and read receipts for %s messages", async sender => {
    for (const receipt of [undefined, null, "sent", "READ"]) {
      const response = detail("support", sender);
      response.messages[1].receiptStatus = receipt;
      const api = createSupportApi({ request: async () => response } as never);
      expect((await api.conversation("CV-ended")).messages[1].status).toBe(receipt == null ? undefined : receipt.toLowerCase());
    }
  });

  it.each([123, false, {}, "", "delivered"])("rejects malformed receipt %j", async receipt => {
    const api = createSupportApi({ request: async () => detail("support", "agent", receipt) } as never);
    await expect(api.conversation("CV-ended")).rejects.toThrow("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  });
  it.each(["advisor", "support"])("parses a synthetic ended %s payload including a system notice", async type => {
    const api = createSupportApi({ request: vi.fn(async () => detail(type)) } as never);
    const conversation = await api.conversation("CV-ended");
    expect(conversation).toMatchObject({ type, status: "closed", sessionStatus: "closed", agentName: "Unassigned" });
    expect(conversation.messages).toEqual([
      expect.objectContaining({ sender: "user", text: "Hello" }),
      expect.objectContaining({ sender: "system", text: notice, status: undefined }),
    ]);
  });

  it("normalizes uppercase SYSTEM from the server", async () => {
    const api = createSupportApi({ request: async () => detail("advisor", "SYSTEM") } as never);
    expect((await api.conversation("CV-ended")).messages[1].sender).toBe("system");
  });

  it.each([["unknown", null], ["system", "read"]])("rejects unsupported sender/receipt %s %s", async (sender, receipt) => {
    const api = createSupportApi({ request: async () => detail("support", sender!, receipt) } as never);
    await expect(api.conversation("CV-ended")).rejects.toThrow("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  });
  it("keeps a private image message with no text and sends the same attachment intent", async () => {
    const response = detail("support");
    response.conversation.status = "OPEN";
    response.messages = [{ id: 1, senderType: "user", content: null, kind: "IMAGE", attachmentId: "private-1",
      createdAt: "2026-09-01T00:00:00Z", receiptStatus: null }] as unknown as typeof response.messages;
    const request = vi.fn(async () => response);
    const api = createSupportApi({ request } as never);
    const conversation = await api.startConversation("support", "", "create-image-key", "private-1");
    expect(conversation.messages[0]).toMatchObject({ kind: "IMAGE", attachmentId: "private-1", text: "" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      body: { conversationType: "SUPPORT", openingText: "", clientMessageId: "create-image-key", kind: "IMAGE", attachmentId: "private-1" },
    }));
  });
  it("requires an explicit unbound advisor state with no identity", async () => {
    const request = vi.fn(async (): Promise<unknown> => ({ assignmentId: null, currentAdvisorId: null, currentAdvisorName: null,
      assignmentState: "UNBOUND", availability: "UNBOUND" }));
    const api = createSupportApi({ request } as never);
    expect((await api.advisor()).assignmentState).toBe("UNBOUND");
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/app/support/advisor" });
    request.mockResolvedValueOnce({ assignmentId: null, currentAdvisorId: 9, currentAdvisorName: "Wrong",
      assignmentState: "UNBOUND", availability: "UNKNOWN" });
    await expect(api.advisor()).rejects.toThrow("SUPPORT_ADVISOR_RESPONSE_INVALID");
  });
});
