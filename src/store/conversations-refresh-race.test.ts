import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ApiError } from "@/api/errors";
import { installSupportStorage } from "@/test/storage-setup";

installSupportStorage();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const runtime = vi.hoisted(() => ({
  remoteApiEnabled: true,
  supportApi: {
    authorityRevision: vi.fn(async () => "run-1"),
    commandResult: vi.fn(async () => null),
    conversations: vi.fn(),
    conversationDismissals: vi.fn(async () => []),
    conversation: vi.fn(),
    markConversationRead: vi.fn(),
    startConversation: vi.fn(),
    replyConversation: vi.fn(),
    convertConversationToTicket: vi.fn(),
    conversationCategories: vi.fn(),
  },
}));

vi.mock("@/api/runtime", () => runtime);

const { useConversations } = await import("./conversations");
afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  runtime.supportApi.authorityRevision.mockResolvedValue("run-1");
  runtime.supportApi.commandResult.mockResolvedValue(null);
  runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: true, support: true, ai: true });
});

describe("conversation list refresh generation fence", () => {
  const human = () => ({ id: "CV-cold", type: "support", status: "open", version: 1, lastTs: 1,
    messages: [], unread: 0, agentName: "Agent", roleKey: "roleSupport", avatarTint: "blue",
    lastMessage: "Confirmed history", sessionStatus: "active" });

  it("creates one support conversation for concurrent identical sends without Web Crypto", async () => {
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("TextEncoder", undefined);
    const store = useConversations();
    await store.refreshCategories();
    const created = deferred<any>();
    runtime.supportApi.startConversation.mockReturnValue(created.promise);

    const first = store.startConversation("support", "测试 🧪");
    const second = store.startConversation("support", "测试 🧪");
    await vi.waitFor(() => expect(runtime.supportApi.startConversation).toHaveBeenCalledTimes(1));
    expect(runtime.supportApi.startConversation).toHaveBeenCalledTimes(1);
    created.resolve(human());
    expect(await Promise.all([first, second])).toEqual(["CV-cold", "CV-cold"]);
  });

  it("shares recovered success across two concurrent replies with the same intent", async () => {
    const store = useConversations(); store.conversations.push(human() as never);
    const action = deferred<any>(); runtime.supportApi.replyConversation.mockReturnValueOnce(action.promise);
    runtime.supportApi.commandResult.mockResolvedValueOnce({ kind: "conversation", conversation: human() } as never);
    const first = store.sendUser("CV-cold", "same reply");
    await vi.waitFor(() => expect(runtime.supportApi.replyConversation).toHaveBeenCalledTimes(1));
    const second = store.sendUser("CV-cold", "same reply");
    const outcomes = Promise.allSettled([first, second]);
    await new Promise(done => setTimeout(done, 20));
    action.reject(new ApiError({ kind: "network", message: "unknown outcome" }));
    expect(await outcomes).toEqual([{ status: "fulfilled", value: true }, { status: "fulfilled", value: true }]);
    expect(runtime.supportApi.replyConversation).toHaveBeenCalledTimes(1);
  });

  it("does not let a pending probe discard the key of a concurrent same-intent command", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value) });
    const store = useConversations(); store.bindAccount("account-a");
    runtime.supportApi.conversation.mockResolvedValue(human()); await store.open("CV-cold");
    const unavailable = () => new ApiError({ kind: "network", message: "unknown outcome" });
    runtime.supportApi.replyConversation.mockRejectedValueOnce(unavailable());
    await store.sendUser("CV-cold", "same uncertain reply").catch(() => undefined);
    const key = runtime.supportApi.replyConversation.mock.calls[0][2], probe = deferred<any>();
    runtime.supportApi.commandResult.mockReturnValueOnce(probe.promise);
    store.bindAccount("account-a"); await store.open("CV-cold");
    await vi.waitFor(() => expect(runtime.supportApi.commandResult).toHaveBeenCalledTimes(2));
    const action = deferred<any>(); runtime.supportApi.replyConversation.mockReturnValueOnce(action.promise);
    const pending = store.sendUser("CV-cold", "same uncertain reply").catch(error => error);
    await vi.waitFor(() => expect(runtime.supportApi.replyConversation).toHaveBeenCalledTimes(2));
    probe.resolve({ kind: "conversation", conversation: human() }); await new Promise(done => setTimeout(done, 0));
    action.reject(unavailable()); await pending;
    setActivePinia(createPinia()); const restored = useConversations(); restored.bindAccount("account-a");
    await restored.open("CV-cold"); runtime.supportApi.replyConversation.mockResolvedValueOnce(human());
    await restored.sendUser("CV-cold", "same uncertain reply");
    expect(runtime.supportApi.replyConversation.mock.calls[2][2]).toBe(key);
  });

  it.each(["success", "recovered success", "pending recovery"])("preserves a newer durable command across A to B to A and old %s", async mode => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value) });
    const store = useConversations(); store.bindAccount("account-a");
    runtime.supportApi.conversation.mockResolvedValue(human()); await store.open("CV-cold");
    const old = deferred<any>();
    const unavailable = () => new ApiError({ kind: "network", message: "unknown outcome" });
    let oldDone: Promise<unknown>;
    if (mode === "success") {
      runtime.supportApi.replyConversation.mockReturnValueOnce(old.promise);
      oldDone = store.sendUser("CV-cold", "old request").catch(error => error);
      await vi.waitFor(() => expect(runtime.supportApi.replyConversation).toHaveBeenCalledTimes(1));
    } else if (mode === "recovered success") {
      runtime.supportApi.replyConversation.mockRejectedValueOnce(unavailable());
      runtime.supportApi.commandResult.mockReturnValueOnce(old.promise);
      oldDone = store.sendUser("CV-cold", "old request").catch(error => error);
      await vi.waitFor(() => expect(runtime.supportApi.commandResult).toHaveBeenCalledTimes(1));
    } else {
      runtime.supportApi.replyConversation.mockRejectedValueOnce(unavailable());
      await store.sendUser("CV-cold", "old request").catch(() => undefined);
      runtime.supportApi.commandResult.mockReturnValueOnce(old.promise);
      store.bindAccount("account-a");
      await vi.waitFor(() => expect(runtime.supportApi.commandResult).toHaveBeenCalledTimes(2));
      oldDone = Promise.resolve();
    }
    store.bindAccount("account-b"); store.bindAccount("account-a"); await store.open("CV-cold");
    const newer = deferred<any>(); runtime.supportApi.replyConversation.mockReturnValueOnce(newer.promise);
    const newDone = store.sendUser("CV-cold", "new uncertain request").catch(error => error);
    await vi.waitFor(() => expect(runtime.supportApi.replyConversation).toHaveBeenCalledTimes(2));
    const originalKey = runtime.supportApi.replyConversation.mock.calls[1][2];
    old.resolve(mode === "success" ? human() : { kind: "conversation", conversation: human() });
    await oldDone; await new Promise(done => setTimeout(done, 0));
    newer.reject(unavailable()); await newDone;
    setActivePinia(createPinia()); const restored = useConversations(); restored.bindAccount("account-a");
    await restored.open("CV-cold"); runtime.supportApi.replyConversation.mockResolvedValueOnce(human());
    await restored.sendUser("CV-cold", "new uncertain request");
    expect(runtime.supportApi.replyConversation.mock.calls[2][2]).toBe(originalKey);
  });

  it.each(["loading", "failed", "disabled"])("keeps existing human replies and ticket conversion available when entry is %s", async state => {
    const store = useConversations(); store.conversations.push(human() as never);
    if (state === "failed") runtime.supportApi.conversationCategories.mockRejectedValueOnce(new Error("unavailable"));
    if (state === "disabled") runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: false, support: false, ai: false });
    if (state !== "loading") await store.refreshCategories();
    expect(store.categoryEnabled("support")).toBe(false); expect(store.categoryReadable("support")).toBe(true);
    await expect(store.startConversation("support", "new")).rejects.toThrow("SUPPORT_CATEGORY_UNAVAILABLE");
    runtime.supportApi.replyConversation.mockResolvedValue(human());
    runtime.supportApi.convertConversationToTicket.mockResolvedValue({ conversation: human(), ticket: { id: "TK-existing" } });
    await expect(store.sendUser("CV-cold", "hello")).resolves.toBe(true);
    await expect(store.convertToTicket("CV-cold", "technical", "Need help")).resolves.toBe("TK-existing");
    expect(runtime.supportApi.replyConversation).toHaveBeenCalledTimes(1);
    expect(runtime.supportApi.convertConversationToTicket).toHaveBeenCalledTimes(1);
    expect(runtime.supportApi.startConversation).not.toHaveBeenCalled();
  });

  it("clears list loading on account rebind while an old refresh is pending", async () => {
    const old = deferred<any>(); runtime.supportApi.conversations.mockReturnValueOnce(old.promise);
    const store = useConversations(); const pending = store.refresh();
    await vi.waitFor(() => expect(runtime.supportApi.conversations).toHaveBeenCalledTimes(1));
    expect(store.loading).toBe(true); store.bindAccount("account-b");
    expect(store.loading).toBe(false);
    old.resolve({ items: [] }); await pending;
    expect(store.loading).toBe(false);
  });

  it("retains the recovered history when a racing read receipt requires another snapshot", async () => {
    const page=(first:number,last:number)=>({
      id:"CV-gap",type:"support",status:"open",version:1,lastTs:last,unread:1,
      messages:Array.from({length:last-first+1},(_,i)=>({id:String(first+i),sender:"agent",text:"hi",ts:first+i,status:"sent"})),
      historyTruncated:first>1,historyNextCursor:first>1?first:null,
    });
    const store=useConversations();store.conversations.push(page(1,1) as never);
    let rootReads=0;
    runtime.supportApi.conversation.mockImplementation(async (_id:string,before?:number)=>before
      ? page(Math.max(1,before-100),before-1)
      : ++rootReads===1?page(202,301):page(203,302));
    runtime.supportApi.markConversationRead.mockRejectedValueOnce(new ApiError({kind:"business",status:409,code:409,message:"CONVERSATION_STATE_CONFLICT"}));
    const recovered=await store.open("CV-gap");
    expect(recovered.messages).toHaveLength(302);
    expect(store.get("CV-gap")?.messages).toHaveLength(302);
    expect(runtime.supportApi.markConversationRead).toHaveBeenCalledWith(expect.anything(),301);
  });
  it("does not let an older failure overwrite a newer successful refresh", async () => {
    const older = deferred<{ items: [] }>();
    const newer = deferred<{ items: [] }>();
    runtime.supportApi.conversations
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const store = useConversations();

    const first = store.refresh();
    await vi.waitFor(() => expect(runtime.supportApi.conversations).toHaveBeenCalledTimes(1));
    const second = store.refresh();
    await vi.waitFor(() => expect(runtime.supportApi.conversations).toHaveBeenCalledTimes(2));

    newer.resolve({ items: [] });
    await expect(second).resolves.toBeUndefined();
    older.reject(new Error("older request failed"));
    await expect(first).rejects.toThrow("older request failed");

    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it("rejects a create result that belongs to the previously signed-in account", async () => {
    const created = deferred<any>();
    runtime.supportApi.startConversation.mockReturnValue(created.promise);
    const store = useConversations();
    await store.refreshCategories();
    const pending = store.startConversation("support", "hello");
    await vi.waitFor(() => expect(runtime.supportApi.startConversation).toHaveBeenCalledTimes(1));

    store.bindAccount("account-b");
    created.resolve({ id: "account-a-conversation", type: "support", version: 1, lastTs: 1, messages: [] });

    await expect(pending).rejects.toThrow("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    expect(store.conversations).toEqual([]);
  });

  it("reports an overtaken category request as stale without overwriting the newer PC truth", async () => {
    const older = deferred<any>();
    const newer = deferred<any>();
    runtime.supportApi.conversationCategories
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const store = useConversations();

    const first = store.refreshCategories();
    const second = store.refreshCategories();
    newer.resolve({ advisor: true, support: true, ai: false });
    await expect(second).resolves.toBe("applied");
    older.resolve({ advisor: false, support: false, ai: true });
    await expect(first).resolves.toBe("stale");

    expect(store.categoryAvailability).toEqual({ advisor: true, support: true, ai: false });
  });

  it("keeps a confirmed conversation replyable but blocks new entry after a category read failure", async () => {
    runtime.supportApi.conversations.mockResolvedValue({
      items: [{
        id: "support-confirmed", type: "support", status: "open", version: 1, lastTs: 1,
        messages: [], unread: 0, agentName: "Agent", roleKey: "roleSupport",
        avatarTint: "blue", lastMessage: "Confirmed server snapshot", sessionStatus: "active",
      }],
    });
    runtime.supportApi.conversationCategories.mockRejectedValue(new Error("category authority unavailable"));
    const store = useConversations();

    await store.refresh();
    await expect(store.refreshCategories()).resolves.toBe("failed");

    expect(store.categoryAvailabilityStatus).toBe("failed");
    expect(store.categoryReadable("support")).toBe(true);
    expect(store.categoryEnabled("support")).toBe(false);
    await expect(store.startConversation("support", "new request")).rejects.toThrow("SUPPORT_CATEGORY_UNAVAILABLE");
    runtime.supportApi.replyConversation.mockResolvedValue(store.get("support-confirmed"));
    await expect(store.sendUser("support-confirmed", "new message")).resolves.toBe(true);
    expect(runtime.supportApi.startConversation).not.toHaveBeenCalled();
    expect(runtime.supportApi.replyConversation).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a confirmed PC-disabled category from an unavailable category read", async () => {
    runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: false, support: false, ai: false });
    const store = useConversations();

    await expect(store.refreshCategories()).resolves.toBe("applied");

    expect(store.categoryAvailabilityStatus).toBe("ready");
    expect(store.categoryEnabled("support")).toBe(false);
    expect(store.categoryReadable("support")).toBe(false);
  });

  it("reports the initial category authority read as loading rather than an empty or failed category", async () => {
    const pending = deferred<any>();
    runtime.supportApi.conversationCategories.mockReturnValue(pending.promise);
    const store = useConversations();

    const request = store.refreshCategories();
    expect(store.categoryAvailabilityStatus).toBe("loading");
    expect(store.categoryLoading).toBe(true);
    expect(store.categoryEnabled("support")).toBe(false);

    pending.resolve({ advisor: true, support: false, ai: false });
    await expect(request).resolves.toBe("applied");
    expect(store.categoryAvailabilityStatus).toBe("ready");
    expect(store.categoryLoading).toBe(false);
  });

  it.each(["reply", "ticket"] as const)("never submits a stale opened conversation after an account switch (%s)", async (operation) => {
    const opened = deferred<any>();
    runtime.supportApi.conversation.mockReturnValue(opened.promise);
    const store = useConversations();
    store.bindAccount("account-a");

    const pending = operation === "reply"
      ? store.sendUser("account-a-conversation", "hello")
      : store.convertToTicket("account-a-conversation", "technical", "Need help");
    await vi.waitFor(() => expect(runtime.supportApi.conversation).toHaveBeenCalledTimes(1));

    store.bindAccount("account-b");
    opened.resolve({
      id: "account-a-conversation", type: "support", status: "open", version: 1,
      lastTs: 1, messages: [], unread: 0, agentName: "Agent", roleKey: "roleSupport",
      avatarTint: "blue", lastMessage: "", sessionStatus: "active",
    });

    await expect(pending).rejects.toThrow("SUPPORT_ACCOUNT_SCOPE_CHANGED");
    expect(runtime.supportApi.replyConversation).not.toHaveBeenCalled();
    expect(runtime.supportApi.convertConversationToTicket).not.toHaveBeenCalled();
  });
});
