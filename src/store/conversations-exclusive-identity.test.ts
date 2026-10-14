import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ApiError } from "@/api/errors";
const runtime = vi.hoisted(() => ({ remoteApiEnabled: true, supportApi: {
  authorityRevision: vi.fn(), commandResult: vi.fn(), conversationCategories: vi.fn(),
  startConversation: vi.fn(), conversations: vi.fn(), conversationDismissals: vi.fn(),
} }));
vi.mock("@/api/runtime", () => runtime);
const { useConversations } = await import("./conversations");
function storage() {
  const rows = new Map<string, string>();
  return { get length() { return rows.size; }, key: (i: number) => [...rows.keys()][i] ?? null,
    getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value),
    removeItem: (key: string) => rows.delete(key) };
}
beforeEach(() => {
  vi.resetAllMocks(); setActivePinia(createPinia());
  vi.stubGlobal("sessionStorage", storage()); vi.stubGlobal("localStorage", storage());
  runtime.supportApi.authorityRevision.mockResolvedValue("run-original");
  runtime.supportApi.commandResult.mockResolvedValue(null);
  runtime.supportApi.conversations.mockResolvedValue({ items: [] });
  runtime.supportApi.conversationDismissals.mockResolvedValue([]);
  runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: true, support: false, ai: false });
});
afterEach(() => vi.unstubAllGlobals());
it("replays the original SUPPORT payload and key after the single human gate closes, without admitting a new create", async () => {
  const store = useConversations(); store.bindAccount("user:42"); await store.refreshCategories();
  const unknown = new ApiError({ kind: "network", message: "response lost" });
  runtime.supportApi.startConversation.mockRejectedValueOnce(unknown);
  await expect(store.startConversation("support", "original text")).rejects.toBe(unknown);
  const original = [...runtime.supportApi.startConversation.mock.calls[0]];
  expect(await store.hasPendingHumanCreate("support", "original text")).toBe(true);
  expect(await store.hasPendingHumanCreate("advisor", "original text")).toBe(false);
  expect(await store.hasPendingHumanCreate("support", "different text")).toBe(false);
  expect(await store.hasPendingHumanCreate("support", "original text", "different-attachment")).toBe(false);
  runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: false, support: false, ai: false });
  await store.refreshCategories();
  runtime.supportApi.startConversation.mockResolvedValueOnce({ id: "CV-original", type: "support", status: "open", version: 1,
    lastTs: 1, messages: [], unread: 0, agentName: "Historical owner", roleKey: "roleSupport", avatarTint: "blue", lastMessage: "original text", sessionStatus: "active" });
  await expect(store.startConversation("support", "original text")).resolves.toBe("CV-original");
  expect(runtime.supportApi.startConversation.mock.calls[1]).toEqual(original);
  expect(await store.hasPendingHumanCreate("support", "original text")).toBe(false);
  await expect(store.startConversation("support", "different text")).rejects.toThrow("SUPPORT_CATEGORY_UNAVAILABLE");
  await expect(store.startConversation("advisor", "different text")).rejects.toThrow("SUPPORT_CATEGORY_UNAVAILABLE");
  expect(runtime.supportApi.startConversation).toHaveBeenCalledTimes(2);
});
function completedConversation() {
  return { id: "CV-original", type: "support" as const, status: "open" as const, version: 1, lastTs: 1,
    messages: [], unread: 0, agentName: "Original owner", roleKey: "roleSupport" as const,
    avatarTint: "blue", lastMessage: "original text", sessionStatus: "active" as const };
}
async function originalPendingWithClosedGate() {
  const store = useConversations(); store.bindAccount("user:42"); await store.refreshCategories();
  runtime.supportApi.startConversation.mockRejectedValueOnce(new ApiError({ kind: "network", message: "response lost" }));
  await expect(store.startConversation("support", "original text")).rejects.toThrow("response lost");
  runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: false, support: false, ai: false });
  await store.refreshCategories();
  expect(await store.hasPendingHumanCreate("support", "original text")).toBe(true);
  return store;
}
function pauseFinalAuthority() {
  let reads = 0, entered!: () => void, resume!: (run: string) => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const resumed = new Promise<string>(resolve => { resume = resolve; });
  runtime.supportApi.authorityRevision.mockImplementation(async () => {
    reads += 1;
    if (reads === 2) { entered(); return resumed; }
    return "run-original";
  });
  return { entered: enteredPromise, resume };
}
it("does not mint or send when the run changes after finding the original pending key", async () => {
  const store = await originalPendingWithClosedGate();
  const pause = pauseFinalAuthority();
  const writes = vi.spyOn(sessionStorage, "setItem");
  const result = expect(store.startConversation("support", "original text")).rejects.toThrow("SUPPORT_PENDING_RECOVERY_SCOPE_CHANGED");
  await pause.entered; pause.resume("run-new"); await result;
  expect(runtime.supportApi.startConversation).toHaveBeenCalledTimes(1);
  expect(writes).not.toHaveBeenCalled();
});
it("does not mint or send when a real readback retires the original slot during the authority await", async () => {
  const store = await originalPendingWithClosedGate();
  const pause = pauseFinalAuthority();
  const result = expect(store.startConversation("support", "original text")).rejects.toThrow("SUPPORT_PENDING_RECOVERY_SCOPE_CHANGED");
  await pause.entered;
  runtime.supportApi.commandResult.mockResolvedValue({ kind: "conversation", conversation: completedConversation() });
  await store.refresh();
  expect(await store.hasPendingHumanCreate("support", "original text")).toBe(false);
  const writes = vi.spyOn(sessionStorage, "setItem");
  pause.resume("run-original"); await result;
  expect(runtime.supportApi.startConversation).toHaveBeenCalledTimes(1);
  expect(writes).not.toHaveBeenCalled();
});
it("does not send across an account change during the final authority await", async () => {
  const store = await originalPendingWithClosedGate();
  const pause = pauseFinalAuthority();
  const result = expect(store.startConversation("support", "original text")).rejects.toThrow("SUPPORT_ACCOUNT_SCOPE_CHANGED");
  await pause.entered; store.bindAccount("user:99"); pause.resume("run-original"); await result;
  expect(runtime.supportApi.startConversation).toHaveBeenCalledTimes(1);
});
it("rejects changed type, text and attachment without any closed-gate pending write or new API call", async () => {
  const store = await originalPendingWithClosedGate();
  const writes = vi.spyOn(sessionStorage, "setItem");
  const variants: Array<["advisor" | "support", string, string?]> = [["advisor", "original text"], ["support", "changed text"], ["support", "original text", "image-99"]];
  for (const args of variants) {
    await expect(store.startConversation(args[0], args[1], args[2])).rejects.toThrow("SUPPORT_CATEGORY_UNAVAILABLE");
  }
  expect(runtime.supportApi.startConversation).toHaveBeenCalledTimes(1);
  expect(writes).not.toHaveBeenCalled();
});
it("rechecks the current gate before a fresh command can persist a new key", async () => {
  const store = useConversations(); store.bindAccount("user:42"); await store.refreshCategories();
  const pause = pauseFinalAuthority();
  const writes = vi.spyOn(sessionStorage, "setItem");
  const result = expect(store.startConversation("advisor", "new text")).rejects.toThrow("SUPPORT_CATEGORY_UNAVAILABLE");
  await pause.entered;
  runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: false, support: false, ai: false });
  await store.refreshCategories(); pause.resume("run-original"); await result;
  expect(runtime.supportApi.startConversation).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
});