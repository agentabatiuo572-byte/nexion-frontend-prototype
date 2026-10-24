import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
vi.mock("@/i18n/use-t", () => ({ getT: () => ({ conversations: { supportReply1: "Received" } }) }));
vi.mock("@/api/runtime", async () => {
  const { createMockSupportApi } = await import("@/api/mock-support-api");
  const data = new Map<string, any>();
  return { remoteApiEnabled: false, supportApi: createMockSupportApi({
    read: key => data.get(key) ?? null, write: (key, row) => { data.set(key, structuredClone(row)); return true; },
    seed: () => ["advisor", "support"].map((type, index) => ({
      id: type, type: type as "advisor" | "support", status: "closed", version: 1, agentName: index ? "Sarah" : "Mia",
      roleKey: type === "advisor" ? "roleAdvisor" : "roleSupport", avatarTint: "var(--v5-brand)",
      messages: [{ id: String(index + 1), ts: index + 1, sender: "agent", text: type, authorName: index ? "Sarah" : "Mia" }],
      unread: 1, lastTs: index + 1, lastMessage: type, lastPublicMessageId: index + 1, sessionStatus: "closed",
    })),
  }) };
});
import { useConversations } from "./conversations";
import { supportApi } from "@/api/runtime";

describe("prototype-sync support store scope and history", () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); });
  afterEach(() => { useConversations().reset(); vi.useRealTimers(); });
  it("merges both legacy categories and acknowledges all visible human history", async () => {
    const store = useConversations(); store.bindAccount("user:history");
    await store.refresh(); expect(store.totalUnread).toBe(2);
    await store.loadHumanHistory(); expect(store.totalUnread).toBe(0);
    expect(store.historyRows.flatMap(row => row.messages).map(row => row.authorName).sort()).toEqual(["Mia", "Sarah"]);
    for (const row of [...store.conversations]) await store.dismissConversation(row.id);
    await store.refresh(); expect(store.conversations).toHaveLength(0);
    await store.loadHumanHistory(); expect(store.historyRows).toHaveLength(2);
  });
  it("keeps drafts on reload and clears a delayed local reply on account switch", async () => {
    const store = useConversations(); store.bindAccount("user:first"); await store.refresh();
    store.saveDraft("advisor", "private draft");
    await store.sendUser("advisor", "only A");
    store.bindAccount("user:second"); await store.refresh();
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.readDraft("advisor")).toBe("");
    expect((await supportApi.history()).flatMap(row => row.messages).some(row => row.text === "only A" || row.text === "Received")).toBe(false);
    store.bindAccount("user:first"); expect(store.readDraft("advisor")).toBe("private draft");
    expect((await supportApi.conversation("advisor")).messages.some(row => row.text === "only A")).toBe(true);
  });
  it("replies into a closed session and updates delivered/read receipts with the local response", async () => {
    const store = useConversations(); store.bindAccount("user:reply"); await store.refresh();
    await store.sendUser("advisor", "continue");
    expect(store.get("advisor")?.status).toBe("open");
    expect(store.get("advisor")?.messages.at(-1)?.status).toBe("sent");
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.get("advisor")?.messages.find(row => row.text === "continue")?.status).toBe("read");
    expect(store.get("advisor")?.messages.at(-1)?.text).toBe("Received");
  });
});
