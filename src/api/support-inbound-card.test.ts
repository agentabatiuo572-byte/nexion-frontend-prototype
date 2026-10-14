import { describe, expect, it, vi } from "vitest";
import { createSupportApi } from "./support-api";

const avatar = { assetId: "c87c520a-0748-4cef-a790-9c8646a29083", version: 3 };
const message = (kind: string, extra: Record<string, unknown> = {}) => ({ id: 2, senderType: "agent", senderId: 19,
  senderName: "Historical advisor", authorConfidence: "VERIFIED", senderAvatar: avatar, kind,
  content: "Original recommendation", createdAt: "2026-10-09T08:00:00Z", receiptStatus: "sent", ...extra });
const sku = (extra: Record<string, unknown> = {}) => message("SKU", { skuId: "stellarbox-s1", skuName: "Snapshot name", targetAvailability: "AVAILABLE", ...extra });
const link = (extra: Record<string, unknown> = {}) => message("LINK", { linkTarget: { type: "HOME", params: {} }, targetAvailability: "AVAILABLE", ...extra });
const detail = (messages: unknown[]) => ({ conversation: { conversationNo: "CV-legacy", conversationType: "support", status: "OPEN", version: 3,
  ownerAgentName: "Historical advisor", unreadCount: 2, lastMessage: "Original recommendation", lastMessageAt: "2026-10-09T08:00:00Z" },
  messages, historyTruncated: false, nextCursor: null });
const apiFor = (messages: unknown[]) => createSupportApi({ request: async () => detail(messages) } as never);

describe("existing ADMIN inbound cards", () => {
  it.each(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"])("preserves SKU body, snapshot and %s availability", async availability => {
    const result = await apiFor([sku({ targetAvailability: availability })]).conversation("CV-legacy");
    expect(result.messages[0]).toMatchObject({ kind: "SKU", text: "Original recommendation", skuId: "stellarbox-s1", skuName: "Snapshot name",
      targetAvailability: availability, authorName: "Historical advisor", senderId: 19, senderAvatar: avatar, authorConfidence: "VERIFIED", status: "sent" });
  });
  it.each(["HOME", "WALLET", "SUPPORT"])("accepts only the published %s link target with empty params", async type => {
    expect((await apiFor([link({ linkTarget: { type, params: {} } })]).conversation("CV-legacy")).messages[0])
      .toMatchObject({ kind: "LINK", linkTarget: { type, params: {} }, targetAvailability: "AVAILABLE" });
  });
  it.each([sku({ content: null }), link({ content: null })])("accepts the server's optional card body without losing the target", async card => {
    expect((await apiFor([card]).conversation("CV-legacy")).messages[0].text).toBe("");
  });
  it("uses the same mixed-history parser for pagination, read, send and command recovery", async () => {
    const response = detail([message("TEXT"), message("IMAGE", { id: 3, attachmentId: "private-image", content: null }), sku({ id: 4 }), link({ id: 5 })]);
    const request = vi.fn(async () => response as unknown);
    const api = createSupportApi({ request } as never);
    const conversation = await api.conversation("CV-legacy", 9);
    expect(conversation.messages.map(m => m.kind)).toEqual(["TEXT", "IMAGE", "SKU", "LINK"]);
    expect((await api.markConversationRead(conversation, 5)).messages).toEqual(conversation.messages);
    expect((await api.replyConversation(conversation, " Reply ", "same-message-key")).messages).toEqual(conversation.messages);
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey: "same-message-key",
      body: { body: "Reply", expectedStatus: "OPEN", expectedVersion: 3, clientMessageId: "same-message-key" } }));
    await api.startConversation("support", "Hello", "same-start-key", "private-image");
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ body: { conversationType: "SUPPORT", openingText: "Hello",
      clientMessageId: "same-start-key", kind: "IMAGE", attachmentId: "private-image" } }));
    request.mockResolvedValueOnce({ resultType: "conversation", result: response });
    expect((await api.commandResult("same-message-key"))?.kind).toBe("conversation");
  });
  it.each([
    sku({ senderType: "user" }), link({ senderType: "system", receiptStatus: null }), message("VIDEO"),
    sku({ skuId: "bad?redirect=x" }), sku({ skuName: null }), sku({ targetAvailability: "BROKEN" }),
    link({ linkTarget: { type: "URL", params: {} } }), link({ linkTarget: { type: "HOME", params: { url: "https://example.com" } } }),
    link({ linkTarget: { type: "HOME", params: [] } }), link({ linkTarget: { type: "HOME", params: null } }),
    link({ linkTarget: { type: "HOME", params: {}, url: "https://example.com" } }),
  ])("rejects unsupported or unsafe card payload %#", async card => {
    await expect(apiFor([card]).conversation("CV-legacy")).rejects.toThrow("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  });
});

describe("verified historical author avatar", () => {
  it.each([{}, { assetId: "https://example.com/photo", version: 1 }, { ...avatar, version: -1 }, { ...avatar, version: 1.5 }])
    ("rejects malformed avatar %#", async senderAvatar => {
      await expect(apiFor([message("TEXT", { senderAvatar })]).conversation("CV-legacy")).rejects.toThrow("SUPPORT_CONVERSATION_RESPONSE_INVALID");
    });
  it.each([{ senderType: "user" }, { authorConfidence: "UNKNOWN" }, { senderId: null }, { senderId: true }, { senderId: "19" }])("rejects unverified avatar attribution %#", async extra => {
    await expect(apiFor([message("TEXT", extra)]).conversation("CV-legacy")).rejects.toThrow("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  });
  it("downloads only the existing guarded author endpoint", async () => {
    const download = vi.fn(async () => "blob:author-photo");
    const api = createSupportApi({ download } as never);
    expect(await api.authorAvatarContent(19)).toBe("blob:author-photo");
    expect(download).toHaveBeenCalledWith({ path: "/api/app/support/advisor/avatar/19", signal: undefined });
    await expect(api.authorAvatarContent(0)).rejects.toThrow("SUPPORT_AVATAR_AUTHOR_INVALID");
    expect(download).toHaveBeenCalledTimes(1);
  });
});

describe("JSON enum values must be primitive strings", () => {
  it.each(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"])("rejects array availability %s", async value => {
    await expect(apiFor([sku({ targetAvailability: [value] })]).conversation("CV-legacy")).rejects.toThrow("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  });
  it.each(["HOME", "WALLET", "SUPPORT"])("rejects array link type %s", async value => {
    await expect(apiFor([link({ linkTarget: { type: [value], params: {} } })]).conversation("CV-legacy")).rejects.toThrow("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  });
  it.each(["VERIFIED", "UNKNOWN"])("rejects array author confidence %s", async value => {
    await expect(apiFor([message("TEXT", { authorConfidence: [value], senderAvatar: null })]).conversation("CV-legacy")).rejects.toThrow("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  });
});
