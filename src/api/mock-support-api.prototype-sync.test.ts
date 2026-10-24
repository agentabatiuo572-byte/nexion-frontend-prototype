import { describe, expect, it, vi } from "vitest";
import type { Conversation } from "@/domain/support";
vi.mock("@/i18n/use-t", () => ({ getT: () => ({ conversations: {} }) }));
import { createMockSupportApi, type SupportSnapshot } from "./mock-support-api";

function fixture(count = 2) {
  const accounts = new Map<string, SupportSnapshot>();
  const messages = Array.from({ length: count }, (_, i) => ({ id: String(i + 1), sender: "agent" as const, text: `reply ${i + 1}`, ts: 1000 + i, authorName: i ? "Mia" : "Sarah" }));
  const rows: Conversation[] = [{ id: "old-support", type: "support", status: "closed", version: 1, agentName: "Sarah", roleKey: "roleSupport", avatarTint: "var(--v5-brand)", messages, unread: 2, lastTs: 1000 + count, lastMessage: "reply", lastPublicMessageId: count, sessionStatus: "closed" }];
  const options = { read: (key: string) => accounts.get(key) ?? null, write: (key: string, value: SupportSnapshot) => { accounts.set(key, structuredClone(value)); return true; }, seed: () => structuredClone(rows), now: () => 5000 };
  return { api: createMockSupportApi(options), options, accounts };
}

describe("prototype-sync local continuous human support", () => {
  it('fails closed on a transient storage read without reseeding over history, drafts or commands', async () => {
    const { options } = fixture();
    const disk: Record<string, unknown> = {};
    let failRead = false;
    const setStorageSync = vi.fn((key: string, value: unknown) => { disk[key] = structuredClone(value); });
    vi.stubGlobal('uni', { getStorageInfoSync: () => ({ keys: Object.keys(disk) }), getStorageSync: (key: string) => { if (failRead) { failRead = false; throw new Error('temporary read failure'); } return disk[key] === undefined ? '' : structuredClone(disk[key]); }, setStorageSync });
    try {
      const api = createMockSupportApi({ seed: options.seed, now: options.now }); api.bindAccount('user:a');
      const thread = await api.conversation('old-support');
      await api.replyConversation(thread, 'durable history', 'durable-command'); api.saveDraft('human', 'durable draft');
      const before = structuredClone(disk); const writeCount = setStorageSync.mock.calls.length;
      failRead = true;
      await expect(api.replyConversation(thread, 'must not seed', 'failed-command')).rejects.toThrow();
      expect(disk).toEqual(before); expect(setStorageSync).toHaveBeenCalledTimes(writeCount);
      const reloaded = createMockSupportApi({ seed: options.seed }); reloaded.bindAccount('user:a');
      expect(reloaded.readDraft('human')).toBe('durable draft');
      expect((await reloaded.conversation('old-support')).messages.at(-1)?.text).toBe('durable history');
      expect((await reloaded.commandResult('durable-command'))?.kind).toBe('conversation');
      expect(await reloaded.commandResult('failed-command')).toBeNull();
      disk['nexgrid-support-accounts-v1'] = [];
      await expect(reloaded.history()).rejects.toThrow('SUPPORT_STORAGE_UNAVAILABLE');
      expect(disk['nexgrid-support-accounts-v1']).toEqual([]);
    } finally { vi.unstubAllGlobals(); }
  });
  it('does not overwrite another account when the mutation merge read fails after its snapshot read', async () => {
    const { options } = fixture();
    const disk: Record<string, unknown> = {};
    let readsUntilFailure = 0;
    const setStorageSync = vi.fn((key: string, value: unknown) => { disk[key] = structuredClone(value); });
    vi.stubGlobal('uni', { getStorageInfoSync: () => ({ keys: Object.keys(disk) }), getStorageSync: (key: string) => { if (readsUntilFailure && --readsUntilFailure === 0) throw new Error('merge read failed'); return disk[key] === undefined ? '' : structuredClone(disk[key]); }, setStorageSync });
    try {
      const api = createMockSupportApi({ seed: options.seed });
      api.bindAccount('user:a'); api.saveDraft('human', 'private A');
      api.bindAccount('user:b'); api.saveDraft('human', 'private B');
      const before = structuredClone(disk); const writeCount = setStorageSync.mock.calls.length;
      readsUntilFailure = 2;
      expect(() => api.saveDraft('human', 'new B')).toThrow();
      expect(disk).toEqual(before); expect(setStorageSync).toHaveBeenCalledTimes(writeCount);
      api.bindAccount('user:a'); expect(api.readDraft('human')).toBe('private A');
      api.bindAccount('user:b'); expect(api.readDraft('human')).toBe('private B');
    } finally { vi.unstubAllGlobals(); }
  });
  it("reopens the same closed thread, persists a single idempotent send and keeps original authors", async () => {
    const { api, options } = fixture(); api.bindAccount("user:a");
    const original = await api.conversation("old-support");
    const sent = await api.replyConversation(original, "continue", "same-command");
    await api.replyConversation(original, "continue", "same-command");
    expect(sent.id).toBe(original.id); expect(sent.status).toBe("open");
    const reloaded = createMockSupportApi(options); reloaded.bindAccount("user:a");
    const stored = await reloaded.conversation(original.id);
    expect(stored.messages.filter(row => row.text === "continue")).toHaveLength(1);
    expect(stored.messages[0].authorName).toBe("Sarah");
    expect((await reloaded.commandResult("same-command"))?.kind).toBe("conversation");
  });
  it("dismissal hides the list without erasing history and a new reply restores it after reload", async () => {
    const { api, options } = fixture();
    await api.dismissConversation("old-support"); expect((await api.conversations()).items).toHaveLength(0);
    const reloaded = createMockSupportApi(options);
    expect((await reloaded.history())[0].messages).toHaveLength(2);
    expect((await reloaded.conversations()).items).toHaveLength(0);
    await reloaded.receiveMessage("old-support", { text: "new response", kind: "TEXT" });
    expect((await reloaded.conversations()).items).toHaveLength(1);
  });
  it("read acknowledgement does not erase later unseen messages", async () => {
    const { api } = fixture(); const before = await api.conversation("old-support");
    await api.receiveMessage(before.id, { text: "late" });
    const result = await api.markConversationRead(before, 2);
    expect(result.unread).toBe(1);
    expect((await api.markConversationRead(result, 3)).unread).toBe(0);
  });
  it("drafts, commands, reads and replies are account-scoped and survive a new adapter", async () => {
    const { api, options } = fixture(); api.bindAccount("user:a");
    api.saveDraft("human", "private A");
    await api.replyConversation(await api.conversation("old-support"), "A reply", "key-a");
    api.bindAccount("user:b");
    expect(api.readDraft("human")).toBe("");
    expect(await api.commandResult("key-a")).toBeNull();
    expect((await api.conversation("old-support")).messages.some(row => row.text === "A reply")).toBe(false);
    const reloaded = createMockSupportApi(options); reloaded.bindAccount("user:a");
    expect(reloaded.readDraft("human")).toBe("private A");
  });
  it("refuses success when persistence fails and retains the durable previous message", async () => {
    const { api, options } = fixture(); const before = await api.conversation("old-support");
    const failing = createMockSupportApi({ ...options, write: () => false });
    await expect(failing.replyConversation(before, "must not appear", "key-fail")).rejects.toThrow("SUPPORT_STORAGE_UNAVAILABLE");
    expect((await api.conversation(before.id)).messages.some(row => row.text === "must not appear")).toBe(false);
    expect(await api.commandResult("key-fail")).toBeNull();
  });
  it("paginates all earlier messages without dropping original identity", async () => {
    const { api } = fixture(220); const first = await api.conversation("old-support");
    expect(first.messages).toHaveLength(100); expect(first.historyNextCursor).toBe(121);
    const second = await api.earlier(first.id, first.historyNextCursor!);
    const third = await api.earlier(first.id, second.historyNextCursor!);
    expect([...third.messages, ...second.messages, ...first.messages].map(row => row.id)).toEqual(Array.from({ length: 220 }, (_, i) => String(i + 1)));
    expect(third.historyNextCursor).toBeNull();
  });
  it("rejects arbitrary links and extra parameters while preserving unavailable card content", async () => {
    const { api } = fixture();
    await expect(api.receiveMessage("old-support", { text: "unsafe", kind: "LINK", linkTarget: { type: "HOME", params: { url: "https://example.org" } as never } })).rejects.toThrow("SUPPORT_LINK_INVALID");
    const result = await api.receiveMessage("old-support", { text: "old product", kind: "SKU", skuId: "retired", targetAvailability: "UNAVAILABLE" });
    expect(result.messages.at(-1)?.targetAvailability).toBe("UNAVAILABLE");
    expect(result.messages.at(-1)?.text).toBe("old product");
  });
  it("refuses transferred-thread replies and retired tickets", async () => {
    const { api, accounts } = fixture(); await api.conversations();
    const data = accounts.get("default")!; data.rows[0].status = "transferred";
    await expect(api.replyConversation(data.rows[0], "wrong thread", "key-x")).rejects.toThrow("TRANSFERRED");
    await expect(api.createTicket({ category: "technical", subject: "x", body: "x" }, "key-t")).rejects.toThrow("RETIRED");
    expect((await api.tickets()).total).toBe(0);
  });
});
