import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const ids = [
  "6f0b5c55-0ec5-4a31-85eb-1d4531c1e8df",
  "8c12eaf3-744d-405e-b2fb-64b3d81267be",
  "b150350c-fdbf-4c7c-a663-477dd9afe098",
];

const { useNova } = await import("./nova");

beforeEach(() => {
  setActivePinia(createPinia());
  let index = 0;
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => ids[index++] ?? ids.at(-1)) });
});

describe("Nova conversation scope", () => {
  it("retains existing mock messages, cooldowns and read receipts alongside remote queues", () => {
    const nova = useNova();
    nova.open(); nova.setTyping(true);
    expect(nova.isOpen).toBe(true);
    nova.sendUser("question"); nova.markUserRead(); nova.markUserRead();
    expect(nova.messages[0].status).toBe("read");
    expect(nova.push({ kind: "nova-reply", text: "answer" }, { cooldownKey: "test" })).toBe(true);
    expect(nova.push({ kind: "nova-reply", text: "suppressed" }, { cooldownKey: "test" })).toBe(false);
    expect(nova.unread).toBe(0);
    nova.close();
    nova.push({ kind: "nova-reply", text: "notification" });
    expect(nova.unread).toBe(1);
    nova.reset();
    expect(nova.typing).toBe(false);
  });
  it("keeps one UUID within a conversation and rotates it for a new conversation or account", () => {
    const nova = useNova();

    nova.bindRemoteAccount("account-a");
    expect(nova.conversationId).toBe(ids[0]);
    nova.bindRemoteAccount("account-a");
    expect(nova.conversationId).toBe(ids[0]);

    nova.sendUser("old question");
    nova.startNewConversation();
    expect(nova.messages).toEqual([]);
    expect(nova.conversationId).toBe(ids[1]);

    nova.bindRemoteAccount("account-b");
    expect(nova.conversationId).toBe(ids[2]);
  });

  it("fails closed instead of creating a predictable conversation id", () => {
    vi.stubGlobal("crypto", {});
    const nova = useNova();

    expect(() => nova.bindRemoteAccount("account-a"))
      .toThrow("CRYPTO_RANDOM_UUID_UNAVAILABLE");
    expect(nova.conversationId).toBe("");
  });

  it("hydrates a canonical remote transcript after an H5 reload", () => {
    const nova = useNova();
    nova.bindRemoteAccount("account-a");

    nova.hydrateRemote("account-a", ids[1], [
      { id: "turn:user", sender: "user", text: "Question", ts: 100 },
      { id: "turn:nova", sender: "nova", text: "Answer", ts: 101 },
    ]);

    expect(nova.conversationId).toBe(ids[1]);
    expect(nova.messages.map((message) => [message.sender, message.text]))
      .toEqual([["user", "Question"], ["nova", "Answer"]]);
  });

  it("loads remote history once and hydrates the conversation-center preview", async () => {
    const nova = useNova();
    const loader = vi.fn().mockResolvedValue({
      conversationId: ids[1],
      messages: [
        { id: "turn:user", sender: "user" as const, text: "Question", ts: 100 },
        { id: "turn:nova", sender: "nova" as const, text: "Answer", ts: 101 },
      ],
    });

    await Promise.all([
      nova.ensureRemoteHistory("account-a", loader),
      nova.ensureRemoteHistory("account-a", loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(nova.historyLoaded).toBe(true);
    expect(nova.conversationId).toBe(ids[1]);
    expect(nova.messages.at(-1)?.text).toBe("Answer");
  });

  it("preserves the server truncation marker so the UI can disclose an incomplete transcript", async () => {
    const nova = useNova();

    await nova.ensureRemoteHistory("account-a", async () => ({
      conversationId: ids[1],
      messages: [{ id: "recent", sender: "nova", text: "Recent answer", ts: 101 }],
      truncated: true,
    }));

    expect(nova.historyTruncated).toBe(true);
    nova.startNewConversation();
    expect(nova.historyTruncated).toBe(false);
  });

  it("ignores a late history response after the account changes", async () => {
    const nova = useNova();
    let resolveHistory!: (value: {
      conversationId: string;
      messages: Array<{ id: string; sender: "user" | "nova"; text: string; ts: number }>;
    }) => void;
    const pending = new Promise<Parameters<typeof resolveHistory>[0]>((resolve) => {
      resolveHistory = resolve;
    });

    const loading = nova.ensureRemoteHistory("account-a", () => pending);
    nova.bindRemoteAccount("account-b");
    resolveHistory({
      conversationId: ids[2],
      messages: [{ id: "late", sender: "nova", text: "Wrong account", ts: 100 }],
    });
    await loading;

    expect(nova.messages).toEqual([]);
    expect(nova.conversationId).toBe(ids[1]);
    expect(nova.historyLoaded).toBe(false);
  });

  it("allows a failed history load to retry", async () => {
    const nova = useNova();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ conversationId: "", messages: [] });

    await expect(nova.ensureRemoteHistory("account-a", loader)).rejects.toThrow("offline");
    expect(nova.historyLoaded).toBe(false);
    await nova.ensureRemoteHistory("account-a", loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(nova.historyLoaded).toBe(true);
  });
});
