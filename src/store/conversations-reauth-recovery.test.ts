import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import { computed, effectScope, nextTick, reactive, ref, watch, type Ref } from "vue";
import { ApiError } from "@/api/errors";
import { isSettledRejection } from "@/api/errors";
import { isSupportAttachmentNotReady } from "@/api/support-api";
import type { TicketCreationPolicy } from "@/api/support-ticket-policy";
import appSource from "../App.vue?raw";
import meSource from "../pages/me/me.vue?raw";
import securitySource from "../pages/me/security.vue?raw";
import chatSource from "../pages/support/chat.vue?raw";

const runtime = vi.hoisted(() => ({ remoteApiEnabled: true, supportApi: {
  authorityRevision: vi.fn(), commandResult: vi.fn(), conversation: vi.fn(),
  markConversationRead: vi.fn(), replyConversation: vi.fn(), conversations: vi.fn(),
  conversationDismissals: vi.fn(), conversationCategories: vi.fn(),
} }));
vi.mock("@/api/runtime", () => runtime);
afterEach(() => vi.unstubAllGlobals());
const { useConversations } = await import("./conversations");
const row = () => ({ id: "CV-1", type: "support", status: "open", version: 1, lastTs: 1,
  messages: [], unread: 0, agentName: "Agent", roleKey: "roleSupport", avatarTint: "blue",
  lastMessage: "", sessionStatus: "active" });
function storage() {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
beforeEach(() => {
  vi.unstubAllGlobals(); vi.resetAllMocks(); setActivePinia(createPinia());
  vi.stubGlobal("sessionStorage", storage()); vi.stubGlobal("localStorage", storage());
  runtime.supportApi.authorityRevision.mockResolvedValue("run-1");
  runtime.supportApi.commandResult.mockResolvedValue(null);
  runtime.supportApi.conversation.mockResolvedValue(row());
  runtime.supportApi.markConversationRead.mockResolvedValue(row());
  runtime.supportApi.conversations.mockResolvedValue({ items: [] });
  runtime.supportApi.conversationDismissals.mockResolvedValue([]);
  runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: true, support: true, ai: false });
});
async function uncertainReply() {
  const store = useConversations(); store.bindAccount("user:1");
  await store.open("CV-1");
  const unknown = new ApiError({ kind: "network", message: "lost response" });
  runtime.supportApi.replyConversation.mockRejectedValueOnce(unknown);
  await expect(store.sendUser("CV-1", "original")).rejects.toBe(unknown);
  store.saveComposer("conversation:CV-1", { text: "next draft", imageDraft: null,
    failedSend: { text: "original", kind: "unknown", settled: false, retryable: true, attempts: 1 } }, true);
  return { store, key: runtime.supportApi.replyConversation.mock.calls[0][2] };
}

function installComposerWatches(store: ReturnType<typeof useConversations>, key: Ref<string>, draft: Ref<string>, failed: Ref<any>, image: Ref<any>, busy: Ref<boolean>) {
  const start = chatSource.indexOf("watch(humanComposerKey");
  const code = ts.transpileModule("let humanComposerResetting = false;\n" + chatSource.slice(start, chatSource.indexOf("const humanRealtime =", start)),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = effectScope();
  scope.run(() => new Function("watch", "convStore", "humanComposerKey", "draftText", "failedHumanSend", "imageDraft", "humanSendBusy", "restoreRecoveredComposer",
    code)(watch, store, key, draft, failed, image, busy, vi.fn()));
  return scope;
}

it.each(["h5", "app"])("keeps same-account intent/key/draft through expiry and reload (%s)", async platform => {
  if (platform === "app") {
    const native = storage(); vi.stubGlobal("plus", {});
    vi.stubGlobal("uni", { getStorageSync: (key: string) => native.getItem(key) ?? "", setStorageSync: native.setItem,
      removeStorageSync: native.removeItem, getStorageInfoSync: () => ({ keys: Array.from({ length: native.length }, (_, i) => native.key(i)) }) });
  }
  const { store, key } = await uncertainReply();
  store.suspendForReauthentication();
  // The real page clears these refs synchronously when app.bindAccount bumps its epoch.
  store.saveComposer("conversation:CV-1", { text: "", imageDraft: null, failedSend: null });
  store.bindAccount("default");
  expect(store.humanComposers).toEqual({}); expect(store.conversations).toEqual([]);
  expect(runtime.supportApi.commandResult).toHaveBeenCalledTimes(1);
  setActivePinia(createPinia()); const restored = useConversations(); restored.bindAccount("default");
  expect(restored.humanComposers).toEqual({});
  restored.bindAccount("user:1");
  expect(restored.composer("conversation:CV-1")).toMatchObject({ text: "next draft", failedSend: { text: "original" } });
  runtime.supportApi.replyConversation.mockResolvedValueOnce(row());
  await restored.open("CV-1"); await restored.sendUser("CV-1", "original");
  expect(runtime.supportApi.replyConversation.mock.calls[1][2]).toBe(key);
});

it("keeps the next draft if authoritative readback finishes before the chat mounts", async () => {
  const { store } = await uncertainReply(); store.suspendForReauthentication(); store.bindAccount("default");
  runtime.supportApi.commandResult.mockResolvedValue({ kind: "conversation", conversation: row() });
  store.bindAccount("user:1");
  await vi.waitFor(() => expect(store.composer("conversation:CV-1").failedSend).toBeNull());
  expect(store.composer("conversation:CV-1").text).toBe("next draft");
  setActivePinia(createPinia()); const reloaded = useConversations(); reloaded.bindAccount("user:1");
  expect(reloaded.composer("conversation:CV-1").text).toBe("next draft");
  expect(reloaded.composer("conversation:CV-1").failedSend).toBeNull();
});

it.each(["switch", "logout"])("removes old account recovery data after %s, never reviving it on a later login", async action => {
  const { store, key } = await uncertainReply(); store.suspendForReauthentication(); store.bindAccount("default");
  if (action === "logout") store.discardHumanOutbox();
  else store.bindAccount("user:2");
  expect(sessionStorage.getItem("support-human-outbox:user:1")).toBeNull();
  expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!)).some(raw => raw?.includes(key))).toBe(false);
  store.bindAccount("user:1"); expect(store.composer("conversation:CV-1").text).toBe("");
});

it("cleans the old durable owner when a fresh boot logs into another account", async () => {
  const { key } = await uncertainReply();
  // An earlier same-account recovery with readback still pending must retain its owner.
  setActivePinia(createPinia()); useConversations().bindAccount("user:1");
  setActivePinia(createPinia()); const fresh = useConversations();
  fresh.suspendForReauthentication(); fresh.bindAccount("default"); fresh.bindAccount("user:2");
  expect(fresh.humanComposers).toEqual({});
  expect(sessionStorage.getItem("support-human-outbox:user:1")).toBeNull();
  expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!)).some(raw => raw?.includes(key))).toBe(false);
  fresh.bindAccount("user:1"); expect(fresh.composer("conversation:CV-1").text).toBe("");
});

it("same-account epoch reset clears private Blob/input without writing empties over recovery data", async () => {
  const { store } = await uncertainReply();
  const app = reactive({ accountBindingEpoch: 1 });
  const draft = ref("next draft"), failed = ref(store.composer("conversation:CV-1").failedSend);
  const images = ref({ image: "blob:private" }), failures = ref({}), imageDraft = ref(null);
  const ticketCreationBlock = ref<TicketCreationPolicy | null>({ allowed: false, reasonCode: "SUPPORT_TICKET_CREATE_ACTIVE_LIMIT",
    retryAfterSeconds: 0, retryAt: null, existingTicketNo: "TK-old-account", cooldownSeconds: 60,
    windowHours: 24, maxCreatedInWindow: 10, maxActiveTickets: 3, createdInWindow: 3, activeTickets: 3 });
  const revoke = vi.fn(); vi.stubGlobal("URL", { revokeObjectURL: revoke });
  const clearStart = chatSource.indexOf("let imageEpoch = 0;");
  const clearEnd = chatSource.indexOf("async function loadPrivateImages", clearStart);
  const saveStart = chatSource.indexOf("watch([draftText, imageDraft, failedHumanSend]");
  const saveEnd = chatSource.indexOf("const humanRealtime =", saveStart);
  const code = ts.transpileModule(chatSource.slice(clearStart, clearEnd) + chatSource.slice(saveStart, saveEnd),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = effectScope();
  scope.run(() => new Function("watch", "app", "convStore", "imageSources", "imageFailures", "imageDraft", "failedHumanSend", "draftText",
    "attachmentPolicy", "attachmentPolicyError", "novaPageVisible", "isAi", "remoteApiEnabled", "loadAttachmentPolicy", "humanComposerKey", "humanSendBusy", "restoreRecoveredComposer", "ticketCreationBlock",
    code)(watch, app, store, images, failures, imageDraft, failed, draft, ref(null), ref(false), false, ref(false), true, vi.fn(), ref("conversation:CV-1"), ref(false), vi.fn(), ticketCreationBlock));
  try {
    app.accountBindingEpoch++;
    expect(draft.value).toBe(""); expect(failed.value).toBeNull(); expect(images.value).toEqual({});
    expect(ticketCreationBlock.value).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:private");
    expect(store.composer("conversation:CV-1").text).toBe("next draft");
    store.bindAccount("user:1"); await nextTick();
    expect(draft.value).toBe("next draft"); expect(failed.value?.text).toBe("original");
  } finally { scope.stop(); }
});

it("old recovery navigation callbacks cannot clear a newer account's composer", async () => {
  const start = chatSource.indexOf("function restoreRecoveredComposer");
  const end = chatSource.indexOf("watch(humanComposerKey", start);
  const code = ts.transpileModule(chatSource.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const app = { accountBindingEpoch: 1 }, store = { scopeInvalidated: 0, clearComposer: vi.fn() };
  let release!: (value: boolean) => void;
  const navigation = new Promise<boolean>(resolve => { release = resolve; });
  const recover = new Function("app", "convStore", "startType", "cid", "novaPageVisible", "recoveredNavigation", "navReplace",
    code + "\nreturn restoreRecoveredComposer;")(app, store, ref("support"), ref(""), true, "", () => navigation);
  recover({ recoveredId: "CV-1" }, "start:support"); app.accountBindingEpoch++;
  release(true); await navigation; await nextTick(); expect(store.clearComposer).not.toHaveBeenCalled();
});

it.each(["reply", "opening"] as const)("fences both held success and failure after a same-account support transfer (%s)", async mode => {
  for (const outcome of ["success", "failure"] as const) {
    setActivePinia(createPinia()); const store = useConversations(); store.bindAccount("user:1");
    let resolve!: (value: any) => void, reject!: (cause: unknown) => void;
    const held = new Promise((done, fail) => { resolve = done; reject = fail; });
    vi.spyOn(store, "sendUser").mockReturnValue(held as Promise<boolean>);
    vi.spyOn(store, "startConversation").mockReturnValue(held as Promise<string>);
    vi.spyOn(store, "categoryEnabled").mockReturnValue(true);
    const draft = ref("next draft"), failed = ref<any>(null), image = ref(null);
    const key = mode === "reply" ? "conversation:CV-1" : "start:support";
    const script = chatSource.slice(chatSource.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length, chatSource.indexOf("</script>"));
    const ast = ts.createSourceFile("chat.ts", script, ts.ScriptTarget.ES2022, true);
    const functions = ["sendHumanMessage", "stageHumanSend", "humanSendFailed"].map(name => {
      const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
      expect(node).toBeDefined(); return node!.getText(ast);
    }).join("\n");
    const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const recovery = { begin: vi.fn(() => ({})), isCurrent: () => true, complete: vi.fn(), finish: vi.fn() };
    const send = new Function("convStore", "app", "cid", "startType", "humanCreateRecovery", "remoteApiEnabled", "imageDraft", "humanComposerKey", "draftText", "failedHumanSend",
      "isReplyAllowed", "isTransferredSession", "restoreCompletedHumanCreate", "toast", "t", "isSupportAttachmentNotReady", "isSettledRejection", "supportSessionReady",
      code + "\nreturn sendHumanMessage;")(store, { accountBindingEpoch: 1 }, ref(mode === "reply" ? "CV-1" : ""), ref("support"), recovery, true,
      image, ref(key), draft, failed, ref(true), ref(false), vi.fn(), { info: vi.fn(), error: vi.fn() }, ref({}), isSupportAttachmentNotReady, isSettledRejection, ref(true));
    const pending = send("old scope intent");
    store.discardHumanOutbox(); store.bindAccount("user:1"); store.scopeInvalidated++;
    draft.value = "new scope draft"; failed.value = null;
    store.saveComposer(key, { text: draft.value, imageDraft: null, failedSend: null });
    const saves = vi.spyOn(store, "saveComposer"); saves.mockClear();
    if (outcome === "success") resolve(mode === "reply" ? true : "CV-new");
    else reject(new Error("SUPPORT_ACCOUNT_SCOPE_CHANGED"));
    await pending;
    expect(saves).not.toHaveBeenCalled(); expect(failed.value).toBeNull();
    expect(store.composer(key)).toMatchObject({ text: "new scope draft", failedSend: null });
    expect(recovery.complete).not.toHaveBeenCalled();
  }
});

it.each(["reply", "opening"] as const)("keeps the next draft visible while a real send is held (%s)", async mode => {
  for (const outcome of ["success", "failure"] as const) {
    setActivePinia(createPinia()); const store = useConversations(); store.bindAccount("user:1");
    let resolve!: (value: any) => void, reject!: (cause: unknown) => void;
    const held = new Promise((done, fail) => { resolve = done; reject = fail; });
    vi.spyOn(store, "sendUser").mockReturnValue(held as Promise<boolean>);
    vi.spyOn(store, "startConversation").mockReturnValue(held as Promise<string>);
    vi.spyOn(store, "categoryEnabled").mockReturnValue(true);
    const key = ref(mode === "reply" ? "conversation:CV-1" : "start:support");
    const draft = ref(""), failed = ref<any>(null), image = ref(null), busy = ref(true);
    const scope = installComposerWatches(store, key, draft, failed, image, busy);
    const script = chatSource.slice(chatSource.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length, chatSource.indexOf("</script>"));
    const ast = ts.createSourceFile("chat.ts", script, ts.ScriptTarget.ES2022, true);
    const functions = ["sendHumanMessage", "stageHumanSend", "humanSendFailed"].map(name => ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name)!.getText(ast)).join("\n");
    const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const send = new Function("convStore", "app", "cid", "startType", "humanCreateRecovery", "remoteApiEnabled", "imageDraft", "humanComposerKey", "draftText", "failedHumanSend",
      "isReplyAllowed", "isTransferredSession", "restoreCompletedHumanCreate", "toast", "t", "isSupportAttachmentNotReady", "isSettledRejection", "supportSessionReady",
      code + "\nreturn sendHumanMessage;")(store, { accountBindingEpoch: 1 }, ref(mode === "reply" ? "CV-1" : ""), ref("support"),
      { begin: () => ({}), isCurrent: () => true, complete: vi.fn(), finish: vi.fn() }, true, image, key, draft, failed,
      ref(true), ref(false), vi.fn(), { info: vi.fn(), error: vi.fn() }, ref({}), isSupportAttachmentNotReady, isSettledRejection, ref(true));
    try {
      const work = send("original"); await nextTick();
      expect(failed.value).toBeNull();
      draft.value = "next draft"; await nextTick(); draft.value = "next draft continued"; await nextTick();
      expect(failed.value).toBeNull();
      expect(store.composer(key.value)).toMatchObject({ text: "next draft continued", failedSend: { text: "original", kind: "unknown" } });
      expect(sessionStorage.getItem("support-human-outbox:user:1")).toContain("next draft continued");
      if (outcome === "success") resolve(mode === "reply" ? true : "CV-new");
      else reject(new ApiError({ kind: "network", message: "lost response" }));
      await work; busy.value = false; await nextTick();
      expect(draft.value).toBe("next draft continued");
      if (outcome === "success") expect(failed.value).toBeNull();
      else expect(failed.value).toMatchObject({ text: "original", kind: "unknown" });
    } finally { scope.stop(); }
  }
});

it("recovers a saved unknown send when its old busy request finishes without another store write", async () => {
  const { store } = await uncertainReply();
  const draft = ref(""), failed = ref<any>(null), image = ref(null), busy = ref(true), key = ref("conversation:CV-1");
  const scope = installComposerWatches(store, key, draft, failed, image, busy);
  try {
    store.saveComposer(key.value, { ...store.composer(key.value) }); await nextTick();
    expect(failed.value).toBeNull(); expect(draft.value).toBe("next draft");
    busy.value = false; await nextTick();
    expect(failed.value).toMatchObject({ text: "original", kind: "unknown" });
    store.saveComposer(key.value, { ...store.composer(key.value), failedSend: null }); await nextTick();
    expect(failed.value).toBeNull(); expect(draft.value).toBe("next draft");
  } finally { scope.stop(); }
});

it("the actual opening recovery key switch keeps the next draft without promoting a failed send", async () => {
  const store = useConversations(); store.bindAccount("user:1");
  const cid = ref(""), startType = ref<string | null>("support");
  const key = computed(() => cid.value ? `conversation:${cid.value}` : `start:${startType.value}`);
  const draft = ref("next draft"), failed = ref<any>(null), image = ref(null), busy = ref(true);
  const scope = installComposerWatches(store, key, draft, failed, image, busy);
  try {
    store.saveComposer(key.value, { text: draft.value, imageDraft: null, failedSend: { text: "original", settled: false, retryable: true, attempts: 1, kind: "unknown" } });
    await nextTick();
    store.saveComposer(key.value, { text: draft.value, imageDraft: null, failedSend: null, recoveredId: "CV-new" });
    const start = chatSource.indexOf("restore: id => {");
    const tail = chatSource.slice(start + "restore: ".length);
    const arrow = tail.slice(0, tail.search(/},\r?\n\}\);/) + 1);
    const code = ts.transpileModule("const restore = " + arrow, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const restore = new Function("cid", "startType", "revealTick", code + "\nreturn restore;")(cid, startType, ref(0));
    restore("CV-new"); await nextTick();
    expect(key.value).toBe("conversation:CV-new"); expect(draft.value).toBe("next draft"); expect(failed.value).toBeNull();
    busy.value = false; await nextTick();
    expect(store.composer(key.value)).toMatchObject({ text: "next draft", failedSend: null });
  } finally { scope.stop(); }
});

it.each([false, true])("retires held retry admission after same-account transfer (pending=%s)", async pendingResult => {
  const script = chatSource.slice(chatSource.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length, chatSource.indexOf("</script>"));
  const ast = ts.createSourceFile("chat.ts", script, ts.ScriptTarget.ES2022, true);
  const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "retryHumanSend")!;
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let release!: (value: boolean) => void;
  const held = new Promise<boolean>(resolve => { release = resolve; });
  const store = { scopeInvalidated: 0, hasPendingHumanSend: vi.fn(() => held) };
  const failed = ref<any>({ text: "old intent", retryable: true, settled: false, attempts: 1 });
  const busy = ref(false), send = vi.fn();
  const retry = new Function("convStore", "app", "humanComposerKey", "failedHumanSend", "humanSendBusy", "sendHumanMessage", "supportSessionReady",
    code + "\nreturn retryHumanSend;")(store, { accountBindingEpoch: 1 }, ref("start:support"), failed, busy, send, ref(true));
  const work = retry(); store.scopeInvalidated++; failed.value = null;
  release(pendingResult); await work;
  expect(failed.value).toBeNull(); expect(send).not.toHaveBeenCalled(); expect(busy.value).toBe(false);
});

it("retires an opening send waiting for category admission after support transfer", async () => {
  const script = chatSource.slice(chatSource.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length, chatSource.indexOf("</script>"));
  const ast = ts.createSourceFile("chat.ts", script, ts.ScriptTarget.ES2022, true);
  const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "onSend")!;
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let release!: (value: string) => void;
  const held = new Promise<string>(resolve => { release = resolve; });
  const store = { scopeInvalidated: 0, categoryAvailabilityStatus: "loading", refreshCategories: () => held, categoryEnabled: () => true };
  const send = vi.fn(), busy = ref(false);
  const onSend = new Function("isAi", "remoteApiEnabled", "humanSendBusy", "humanOpenRequest", "cid", "startType", "app", "convStore", "novaPageVisible", "acquireSendSlot", "imageDraft", "sendHumanMessage", "supportSessionReady",
    code + "\nreturn onSend;")(ref(false), true, busy, null, ref(""), ref("support"), { accountBindingEpoch: 1 }, store, true, () => true, ref(null), send, ref(true));
  const work = onSend("old opening intent"); store.scopeInvalidated++;
  release("applied"); await work;
  expect(send).not.toHaveBeenCalled(); expect(busy.value).toBe(false);
});

it("preserves the original draft/key before auth readiness and admits only one opening send afterward", async () => {
  const store = useConversations(); store.bindAccount("user:1"); store.categoryAvailabilityStatus = "ready";
  vi.spyOn(store, "categoryEnabled").mockReturnValue(true);
  const original = { text: "original", kind: "unknown" as const, settled: false, retryable: true, attempts: 1 };
  store.saveComposer("start:support", { text: "next draft", imageDraft: null, failedSend: original }, true);
  const before = sessionStorage.getItem("support-human-outbox:user:1"), writes = vi.spyOn(store, "saveComposer"); writes.mockClear();
  const pending = vi.spyOn(store, "hasPendingHumanSend"), busy = ref(false), failed = ref<any>(original), ready = ref(false);
  let release!: (id: string) => void;
  const start = vi.spyOn(store, "startConversation").mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const script = chatSource.split('<script setup lang="ts">')[1].split("</script>")[0];
  const ast = ts.createSourceFile("chat.ts", script, ts.ScriptTarget.ES2022, true);
  const code = ts.transpileModule(["onSend", "retryHumanSend", "sendHumanMessage", "stageHumanSend", "humanSendFailed"].map(name =>
    ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!.getText(ast)).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { convStore: store, app: { accountBindingEpoch: 1 }, isAi: ref(false), remoteApiEnabled: true,
    cid: ref(""), startType: ref("support"), humanOpenRequest: null, novaPageVisible: true, supportSessionReady: ready,
    humanSendBusy: busy, failedHumanSend: failed, draftText: ref("next draft"), imageDraft: ref(null), humanComposerKey: ref("start:support"),
    acquireSendSlot: () => true, humanCreateRecovery: { begin: () => ({}), isCurrent: () => true, complete: vi.fn(), finish: vi.fn() },
    restoreCompletedHumanCreate: vi.fn(), toast: { info: vi.fn(), error: vi.fn() }, t: ref({}), isSupportAttachmentNotReady, isSettledRejection };
  const ops = new Function("deps", `const {${Object.keys(deps).join(",")}} = deps; ${code}\nreturn { onSend, retryHumanSend, sendHumanMessage };`)(deps);
  await ops.onSend("early"); await ops.sendHumanMessage("early"); await ops.retryHumanSend();
  expect(writes).not.toHaveBeenCalled(); expect(pending).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  expect(failed.value).toMatchObject(original); expect(busy.value).toBe(false);
  expect(sessionStorage.getItem("support-human-outbox:user:1")).toBe(before);
  ready.value = true; failed.value = null;
  const first = ops.onSend("fresh"), second = ops.onSend("fresh");
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  release("CV-new"); await Promise.all([first, second]);
  expect(busy.value).toBe(false); expect(store.composer("start:support").text).toBe("next draft");
});

it("allows new uncertain sends after voluntary logout to recover on later expiry", async () => {
  const { store } = await uncertainReply(); store.discardHumanOutbox(); store.bindAccount("default");
  store.bindAccount("user:1");
  store.saveComposer("conversation:CV-1", { text: "fresh next draft", imageDraft: null,
    failedSend: { text: "fresh original", kind: "unknown", settled: false, retryable: true, attempts: 1 } }, true);
  store.suspendForReauthentication(); store.bindAccount("default"); store.bindAccount("user:1");
  expect(store.composer("conversation:CV-1")).toMatchObject({ text: "fresh next draft", failedSend: { text: "fresh original" } });
});

it("migrates the opening next draft to the recovered thread before start navigation clears its composer", async () => {
  const store = useConversations(); store.bindAccount("user:1");
  store.saveComposer("start:support", { text: "opening next draft", imageDraft: null,
    failedSend: { text: "opening original", kind: "unknown", settled: false, retryable: true, attempts: 1 } }, true);
  store.saveComposer("start:support", { ...store.composer("start:support"), failedSend: null, recoveredId: "CV-1" });
  store.clearComposer("start:support");
  setActivePinia(createPinia()); const restored = useConversations(); restored.bindAccount("user:1");
  expect(restored.composer("conversation:CV-1")).toMatchObject({ text: "opening next draft", failedSend: null });
});

it.each(["h5-remove", "app-enumerate", "app-remove"])("cache failure never preserves old visible memory on account switch (%s)", async fault => {
  const { store } = await uncertainReply();
  if (fault === "h5-remove") vi.stubGlobal("sessionStorage", { ...sessionStorage, removeItem: () => { throw Error("denied"); } });
  else {
    vi.stubGlobal("plus", {});
    vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(),
      getStorageInfoSync: () => { if (fault === "app-enumerate") throw Error("denied"); return { keys: ["support-pending-commands:user:1:run-1:conversations"] }; },
      removeStorageSync: () => { throw Error("denied"); } });
  }
  expect(() => store.discardHumanOutbox()).not.toThrow();
  expect(store.humanComposers).toEqual({}); expect(store.conversations).toEqual([]);
  expect(() => store.bindAccount("user:2")).not.toThrow();
  expect(store.humanComposers).toEqual({}); expect(store.conversations).toEqual([]);
});

it("a denied reauth-marker write cannot interrupt the actual App invalidation function", async () => {
  const { store } = await uncertainReply();
  const denied = sessionStorage.setItem;
  sessionStorage.setItem = (key, value) => { if (key === "support-human-reauth-account") throw Error("denied"); denied(key, value); };
  const start = appSource.indexOf("function clearInvalidRemoteSessionState");
  const source = appSource.slice(start, appSource.indexOf("// ── Account session guard", start));
  const body = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const vault = { clear: vi.fn() }; const session = { signOutSession: vi.fn() }; const auth = { signOut: vi.fn() };
  const app = { bindAccount: vi.fn() }; const loops = vi.fn();
  const invalidate = new Function("useConversations", "sessionVault", "useSession", "useApp", "rebindAccountScopedStores", "stopBusinessLoops",
    body + "\nreturn clearInvalidRemoteSessionState;")(() => store, vault, () => session, () => app, (key: string) => store.bindAccount(key), loops);
  expect(() => invalidate(auth)).not.toThrow();
  expect(vault.clear).toHaveBeenCalledOnce(); expect(session.signOutSession).toHaveBeenCalledOnce();
  expect(auth.signOut).toHaveBeenCalledOnce(); expect(app.bindAccount).toHaveBeenCalledWith("default"); expect(loops).toHaveBeenCalledOnce();
  expect(store.humanComposers).toEqual({}); expect(store.conversations).toEqual([]);
});

it("arms the store before private UI reset and purges voluntary logout before remote awaits", () => {
  const invalidation = appSource.slice(appSource.indexOf("function clearInvalidRemoteSessionState"), appSource.indexOf("// ── Account session guard"));
  expect(invalidation.indexOf("suspendForReauthentication()")).toBeGreaterThan(-1);
  expect(invalidation.indexOf("suspendForReauthentication()")).toBeLessThan(invalidation.indexOf('app.bindAccount("default")'));
  const logout = meSource.slice(meSource.indexOf("async function handleSignOut()"), meSource.indexOf("const signOutStyle"));
  expect(logout.indexOf("discardHumanOutbox()")).toBeGreaterThan(-1);
  expect(logout.indexOf("discardHumanOutbox()")).toBeLessThan(logout.indexOf("await authApi.logout()"));
  expect(securitySource).toContain("useConversations().discardHumanOutbox()");
  const remoteDelete = securitySource.slice(securitySource.indexOf("const request = await accountApi.requestAccountDeletion"));
  expect(remoteDelete.indexOf("discardHumanOutbox()")).toBeLessThan(remoteDelete.indexOf("await app.pauseLocalPhoneRuntimeBeforeSignOut()"));
});
