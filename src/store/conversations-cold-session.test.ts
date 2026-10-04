import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import ts from "typescript";
import { createApiClient } from "@/api/api-client";
import { createSessionVault } from "@/api/session-vault";
import { ApiError } from "@/api/errors";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { createHumanThreadRealtimeLifecycle, createHumanConversationCreationRecovery } from "@/pages/support/conversation-realtime-page";
import chat from "../pages/support/chat.vue?raw";
import { installSupportStorage } from "@/test/storage-setup";

installSupportStorage();
const runtime = vi.hoisted(() => ({ remoteApiEnabled: true, supportApi: {
  authorityRevision: vi.fn(), commandResult: vi.fn(), conversation: vi.fn(), markConversationRead: vi.fn(),
  conversations: vi.fn(), conversationDismissals: vi.fn(), conversationCategories: vi.fn(), advisor: vi.fn(),
} }));
vi.mock("@/api/runtime", () => runtime);
const { useConversations } = await import("./conversations");
const row = (version = 1) => ({ id: "CV-1", type: "support", status: "open", version, lastTs: version,
  messages: [], unread: 0, agentName: "Agent", roleKey: "roleSupport", avatarTint: "blue", lastMessage: "", sessionStatus: "active" });
const snapshot = (userId = 1) => ({ accessToken: "test-access", refreshToken: "test-refresh", tokenType: "Bearer",
  user: { userId, countryCode: "+86", phone: "13800000001", nickname: "Test", onboardingComplete: true } });
beforeEach(() => {
  setActivePinia(createPinia()); vi.resetAllMocks();
  runtime.supportApi.authorityRevision.mockResolvedValue("run-1"); runtime.supportApi.commandResult.mockResolvedValue(null);
  runtime.supportApi.conversations.mockResolvedValue({ items: [] }); runtime.supportApi.conversationDismissals.mockResolvedValue([]);
  runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: true, support: true, ai: false });
  runtime.supportApi.advisor.mockResolvedValue({ assignmentState: "UNBOUND" });
});
afterEach(() => vi.unstubAllGlobals());

function pageHarness() {
  const store = useConversations(); store.bindAccount("user:1");
  const vault = createSessionVault(), app = reactive({ accountKey: "user:1", accountBindingEpoch: 0 });
  const auth = reactive({ isAuthenticated: true, accountId: "user:1" });
  const transport = vi.fn(async () => ({ status: 200, data: { code: 0, message: "OK", data: row() }, headers: {} }));
  const client = createApiClient({ baseUrl: "https://example.test", vault, transport: { request: transport } });
  runtime.supportApi.conversation.mockImplementation(id => client.request({ path: `/api/app/support/conversations/${id}` }));
  const cid = ref("CV-1"), startType = ref<string | null>(null), isAi = ref(false), nav = vi.fn(), policy = vi.fn(), images = vi.fn();
  const navigation = vi.fn(async () => false);
  const watchRealtime = vi.spyOn(store, "watchRealtime");
  const realtime = createHumanThreadRealtimeLifecycle({ currentId: () => cid.value, isAi: () => isAi.value,
    watch: store.watchRealtime, setTyping: vi.fn() });
  const ast = ts.createSourceFile("chat.ts", chat.split('<script setup lang="ts">')[1].split("</script>")[0], ts.ScriptTarget.ES2022, true);
  const names = new Set(["openHumanConversation", "startHumanThreadPolling", "stopHumanThreadPolling", "activateHumanPage", "cleanup", "restoreCompletedHumanCreate", "restoreRecoveredComposer"]);
  const parts = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? "")).map(node => node.getText(ast));
  const declaration = (name: string) => ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name))?.getText(ast);
  // The fallback is unused by the old page and lets the same executable test prove its missing guard.
  parts.unshift(declaration("humanShowRevision") ?? "const humanShowRevision = ref(0);");
  parts.unshift(declaration("humanCreateRecovery")!);
  parts.unshift(declaration("chatDisposed") ?? "let chatDisposed = false;");
  parts.unshift(declaration("supportSessionReady") ?? `const supportSessionReady = computed(() => {
    void app.accountBindingEpoch; return accountSessionReady({remote: true, authenticated: auth.isAuthenticated,
      accountId: auth.accountId, appAccountKey: app.accountKey, sessionUserId: sessionVault.read()?.user.userId ?? null}); });`);
  for (const node of ast.statements) {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) continue;
    const call = node.expression.expression.getText(ast), text = node.getText(ast);
    if (call === "onShow" || call === "onHide" || (call === "watch" && text.includes("stopHumanThreadPolling"))) parts.push(text);
  }
  let show!: () => Promise<void>, hide!: () => void;
  const deps = { computed, ref, watch, app, auth, sessionVault: vault, accountSessionReady, ApiError, convStore: store,
    cid, humanComposerKey: computed(() => cid.value ? `conversation:${cid.value}` : startType.value ? `start:${startType.value}` : ""),
    startType, isAi, humanRealtime: realtime, hiddenAiRoute: ref(false), createHumanConversationCreationRecovery, navReplace: navigation,
    revealTick: ref(0), novaHistoryLoading: ref(false), remoteApiEnabled: true, navBack: nav,
    loadAttachmentPolicy: policy, loadPrivateImages: images,
    clearPrivateImages: vi.fn(), cancelNovaThinking: vi.fn(), useUI: () => ({ clearConfirmsBy: vi.fn() }),
    toast: { info: vi.fn() }, t: ref({ conversations: { categoryDisabled: "disabled" } }),
    onShow: (callback: () => Promise<void>) => { show = callback; }, onHide: (callback: () => void) => { hide = callback; } };
  const code = ts.transpileModule(parts.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = effectScope();
  const result = scope.run(() => new Function("deps", `const {${Object.keys(deps).join(",")}} = deps;
    let humanOpenRequest = null, novaPageVisible = false, categoryGate = null, recoveredNavigation = '';
    let handoffAttemptEpoch = 0, novaStatusEpoch = 0, novaHistoryEpoch = 0;
    const handoffBusy = ref(false), dialogOwner = 'test', pendingTimers = [];
    ${code}\nreturn { ready: supportSessionReady, unmount: cleanup, creation: humanCreateRecovery };`)(deps)) as {
      ready: { value: boolean }; unmount(): void; creation: ReturnType<typeof createHumanConversationCreationRecovery<string>> };
  return { store, vault, app, auth, transport, client, nav, navigation, cid, startType, policy, images, watchRealtime, scope, ...result, show: () => show(), hide: () => hide() };
}

it("cold show sends no protected HTTP or navigation, then a same-ID bound restore opens once", async () => {
  const h = pageHarness();
  try {
    expect(h.ready.value).toBe(false); await h.show(); await nextTick();
    expect(h.transport).not.toHaveBeenCalled(); expect(h.nav).not.toHaveBeenCalled(); expect(h.policy).not.toHaveBeenCalled();
    h.vault.save(snapshot()); h.store.bindAccount("user:1"); h.app.accountBindingEpoch++;
    await nextTick(); await vi.waitFor(() => expect(h.store.get("CV-1")?.id).toBe("CV-1"));
    expect(h.transport).toHaveBeenCalledTimes(1); expect(h.nav).not.toHaveBeenCalled();
  } finally { h.scope.stop(); }
});

it.each(["hide", "unmount"] as const)("a late cookie restore cannot revive a page after %s", async leave => {
  const h = pageHarness();
  try {
    await h.show(); h[leave](); h.vault.save(snapshot()); h.app.accountBindingEpoch++;
    await nextTick(); await Promise.resolve();
    expect(h.transport).not.toHaveBeenCalled(); expect(h.nav).not.toHaveBeenCalled();
  } finally { h.scope.stop(); }
});

it("a restored vault for a different identity cannot reopen the old page", async () => {
  const h = pageHarness();
  try {
    await h.show(); expect(h.nav).not.toHaveBeenCalled(); h.vault.save(snapshot(2)); h.app.accountBindingEpoch++;
    await nextTick(); expect(h.ready.value).toBe(false); expect(h.transport).not.toHaveBeenCalled();
  } finally { h.scope.stop(); }
});

it("a warm same-ID superseded read does not navigate away from the newer snapshot", async () => {
  const h = pageHarness(); h.vault.save(snapshot()); h.app.accountBindingEpoch++;
  await nextTick();
  let release!: (value: ReturnType<typeof row>) => void;
  runtime.supportApi.conversation.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValueOnce(row(2));
  try {
    const showing = h.show(); await vi.waitFor(() => expect(runtime.supportApi.conversation).toHaveBeenCalledTimes(1));
    await h.store.open("CV-1"); release(row(1)); await showing; await nextTick();
    expect(h.nav).not.toHaveBeenCalled(); expect(h.store.get("CV-1")?.version).toBe(2);
    await vi.waitFor(() => expect(h.watchRealtime).toHaveBeenLastCalledWith("CV-1"));
    expect(h.watchRealtime.mock.calls.filter(([id]) => id === "CV-1")).toHaveLength(1);
  } finally { h.scope.stop(); }
});

it.each([401, 403, 404])("an actual API denial still exits the current page (%s)", async status => {
  const h = pageHarness(); h.vault.save(snapshot()); h.app.accountBindingEpoch++;
  await nextTick();
  vi.spyOn(h.store, "open").mockRejectedValue(new ApiError({ kind: status === 404 ? "http" : "auth", status, message: "SUPPORT_ACCOUNT_SCOPE_CHANGED" }));
  try { await h.show(); await nextTick(); await vi.waitFor(() => expect(h.nav).toHaveBeenCalledWith("/pages/support/messages")); }
  finally { h.scope.stop(); }
});

it("the real API client still rejects an empty vault without HTTP or unauthorized mutation", async () => {
  const h = pageHarness();
  try { await expect(h.client.request({ path: "/api/app/support/conversations/CV-1" })).rejects.toMatchObject({ message: "AUTH_SESSION_REQUIRED" });
    expect(h.transport).not.toHaveBeenCalled(); }
  finally { h.scope.stop(); }
});

it("returning after hidden creation opens the recovered ID even when route replacement fails", async () => {
  const h = pageHarness(); h.vault.save(snapshot()); h.app.accountBindingEpoch++; await nextTick();
  h.cid.value = ""; h.startType.value = "support";
  const creation = h.creation.begin("support")!; h.creation.complete("CV-recovered", creation);
  h.store.saveComposer("start:support", { text: "next draft", imageDraft: null, failedSend: null, recoveredId: "CV-recovered" });
  runtime.supportApi.conversation.mockResolvedValue({ ...row(), id: "CV-recovered" });
  try {
    await h.show(); await nextTick();
    await vi.waitFor(() => expect(h.store.get("CV-recovered")?.id).toBe("CV-recovered"));
    expect(h.navigation).toHaveBeenCalled(); expect(h.cid.value).toBe("CV-recovered");
    expect(h.store.composer("conversation:CV-recovered").text).toBe("next draft"); expect(h.nav).not.toHaveBeenCalled();
  } finally { h.scope.stop(); }
});

it("a real support scope retirement clears private data and cannot be treated as a warm read cancellation", async () => {
  const h = pageHarness(); h.vault.save(snapshot()); h.app.accountBindingEpoch++; await nextTick();
  h.store.saveComposer("conversation:CV-1", { text: "private draft", imageDraft: null, failedSend: null });
  let release!: (value: ReturnType<typeof row>) => void;
  runtime.supportApi.conversation.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  try {
    await h.show(); await vi.waitFor(() => expect(runtime.supportApi.conversation).toHaveBeenCalledTimes(1));
    h.store.discardHumanOutbox(); h.store.bindAccount("user:1"); h.store.scopeInvalidated++;
    release(row()); await nextTick(); await vi.waitFor(() => expect(h.nav).toHaveBeenCalledWith("/pages/support/messages"));
    expect(h.store.humanComposers).toEqual({}); expect(h.store.get("CV-1")).toBeUndefined();
  } finally { h.scope.stop(); }
});

function attachmentHarness(waitAt: "policy" | "picker") {
  const app = { accountBindingEpoch: 1 }, convStore = { scopeInvalidated: 0 }, key = ref("conversation:CV-1");
  const imageDraft = ref<any>(null), policy = ref<any>(waitAt === "picker" ? { available: true } : null);
  let releasePolicy!: (value: any) => void, selected!: (value: any) => void;
  const api = { attachmentPolicy: vi.fn(() => new Promise(resolve => { releasePolicy = resolve; })),
    uploadAttachment: vi.fn(async () => ({ id: "ATT-1" })), cancelAttachment: vi.fn() };
  const chooseImage = vi.fn((options: any) => { selected = options.success; });
  vi.stubGlobal("uni", { chooseImage });
  const ast = ts.createSourceFile("chat.ts", chat.split('<script setup lang="ts">')[1].split("</script>")[0], ts.ScriptTarget.ES2022, true);
  const names = new Set(["chooseSupportImage", "retrySupportUpload", "cancelSupportAttachment", "replaceSupportAttachment"]);
  const code = ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? ""))
    .map(node => node.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { app, convStore, humanComposerKey: key, imageDraft, attachmentPolicy: policy, supportApi: api,
    supportSessionReady: ref(true), isAi: ref(false), failedHumanSend: ref(null), humanSendBusy: ref(false),
    requireCryptoUuid: () => "test-upload", asApiError: (cause: any) => cause, toast: { info: vi.fn(), error: vi.fn() },
    t: ref({ conversations: { image: {} } }) };
  const ops = new Function("deps", `const {${Object.keys(deps).join(",")}} = deps;
    let chatDisposed = false, novaPageVisible = true; ${code}
    return { chooseSupportImage, replaceSupportAttachment, dispose: () => { chatDisposed = true; }, hide: () => { novaPageVisible = false; } };`)(deps);
  return { app, convStore, key, imageDraft, policy, api, chooseImage, ...ops,
    releasePolicy: () => releasePolicy({ available: true }), select: () => selected({ tempFilePaths: ["old-account-private.jpg"], tempFiles: [{ size: 10 }] }) };
}

it.each(["policy", "picker"] as const)("stale %s completion cannot upload or write a new account/intent", async waitAt => {
  for (const change of ["account", "scope", "intent", "unmount"]) {
    const h = attachmentHarness(waitAt), choosing = h.chooseSupportImage();
    if (waitAt === "picker") await vi.waitFor(() => expect(h.chooseImage).toHaveBeenCalled());
    if (change === "account") h.app.accountBindingEpoch++;
    if (change === "scope") h.convStore.scopeInvalidated++;
    if (change === "intent") h.key.value = "conversation:CV-2";
    if (change === "unmount") h.dispose();
    if (waitAt === "policy") { h.releasePolicy(); await Promise.resolve(); await Promise.resolve(); if (h.chooseImage.mock.calls.length) h.select(); }
    else h.select();
    await choosing;
    expect(h.api.uploadAttachment).not.toHaveBeenCalled(); expect(h.imageDraft.value).toBeNull();
    if (waitAt === "policy") expect(h.policy.value).toBeNull();
  }
});

it("normal native-picker hiding does not invalidate the same account's selected image", async () => {
  const h = attachmentHarness("picker"), choosing = h.chooseSupportImage();
  await vi.waitFor(() => expect(h.chooseImage).toHaveBeenCalled()); h.hide(); h.select(); await choosing;
  expect(h.api.uploadAttachment).toHaveBeenCalledTimes(1); expect(h.imageDraft.value?.attachmentId).toBe("ATT-1");
});

it("an old replacement cannot open a picker after its cancellation returns in a new account", async () => {
  const h = attachmentHarness("picker"); h.imageDraft.value = { attachmentId: "ATT-old", clientUploadId: "old", state: "ready" };
  let release!: () => void; h.api.cancelAttachment.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const replacing = h.replaceSupportAttachment(); await vi.waitFor(() => expect(h.api.cancelAttachment).toHaveBeenCalled());
  h.app.accountBindingEpoch++; h.imageDraft.value = null; release(); await Promise.resolve(); await Promise.resolve();
  if (h.chooseImage.mock.calls.length) h.select(); await replacing;
  expect(h.chooseImage).not.toHaveBeenCalled(); expect(h.api.uploadAttachment).not.toHaveBeenCalled();
});
