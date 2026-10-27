import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, effectScope, nextTick, reactive, ref, shallowRef, watch } from "vue";
import ts from "typescript";
import { initPreContext, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import { createApiClient } from "@/api/api-client";
import { createSessionVault } from "@/api/session-vault";
import { ApiError, asApiError } from "@/api/errors";
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
const attachmentScopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { attachmentScopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); });

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
  const names = new Set(["openHumanConversation", "startHumanThreadPolling", "stopHumanThreadPolling", "activateHumanPage", "cleanup", "restoreCompletedHumanCreate", "restoreRecoveredComposer", "resetAttachmentPolicy"]);
  const parts = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? "")).map(node => node.getText(ast));
  const declaration = (name: string) => ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name))?.getText(ast);
  for (const name of ["humanHistoryListError", "humanShowRevision", "humanCreateRecovery", "chatDisposed", "supportSessionReady",
    "humanOpenRequest", "attachmentPolicy", "attachmentPolicyError", "attachmentPolicyGeneration", "supportImagePicker"]) {
    const source = declaration(name);
    expect(source, `Missing production declaration: ${name}`).toBeDefined();
    parts.unshift(source!);
  }
  for (const node of ast.statements) {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) continue;
    const call = node.expression.expression.getText(ast), text = node.getText(ast);
    if (call === "onShow" || call === "onHide" || (call === "watch" && text.includes("stopHumanThreadPolling"))) parts.push(text);
  }
  let show!: () => Promise<void>, hide!: () => void;
  const deps = { computed, ref, shallowRef, watch, app, auth, sessionVault: vault, accountSessionReady, ApiError, convStore: store,
    cid, humanComposerKey: computed(() => cid.value ? `conversation:${cid.value}` : startType.value ? `start:${startType.value}` : ""),
    startType, isAi, humanRealtime: realtime, hiddenAiRoute: ref(false), createHumanConversationCreationRecovery, navReplace: navigation,
    revealTick: ref(0), novaHistoryLoading: ref(false), remoteApiEnabled: true, navBack: nav,
    loadAttachmentPolicy: policy, loadPrivateImages: images,
    // Layout and Nova effects are outside this human-session harness.
    measureTopOverlay: vi.fn(), clearQueuedSendVisuals: vi.fn(), cancelHistoryRetry: vi.fn(),
    clearPrivateImages: vi.fn(), cancelNovaThinking: vi.fn(), useUI: () => ({ clearConfirmsBy: vi.fn() }),
    toast: { info: vi.fn() }, t: ref({ conversations: { categoryDisabled: "disabled" } }),
    onShow: (callback: () => Promise<void>) => { show = callback; }, onHide: (callback: () => void) => { hide = callback; } };
  const code = ts.transpileModule(parts.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = effectScope();
  const result = scope.run(() => new Function("deps", `const {${Object.keys(deps).join(",")}} = deps;
    let novaPageVisible = false, categoryGate = null, recoveredNavigation = '', topOverlayMeasureEpoch = 0;
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

function attachmentHarness(waitAt: "policy" | "picker", platform: "app" | "h5" = "app", lifecycle = false) {
  const app = reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
  const convStore = reactive({ scopeInvalidated: 0, refreshAdvisor: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined),
    composer: vi.fn(() => ({ text: "", imageDraft: null, failedSend: null })), saveComposer: vi.fn() });
  const key = ref("conversation:CV-1");
  const imageDraft = ref<any>(null), policy = ref<any>(waitAt === "picker" ? { available: true } : null);
  const policyReads: { resolve(value: any): void; reject(cause: unknown): void }[] = [];
  let selected!: (value: any) => void, failed!: (cause: unknown) => void;
  const api = { attachmentPolicy: vi.fn(() => new Promise((resolve, reject) => { policyReads.push({ resolve, reject }); })),
    uploadAttachment: vi.fn(async () => ({ id: "ATT-1" })), cancelAttachment: vi.fn() };
  const chooseImage = vi.fn((options: any) => { selected = options.success; failed = options.fail; });
  vi.stubGlobal("uni", { chooseImage });
  initPreContext(platform);
  const ast = ts.createSourceFile("chat.ts", preJs(chat.split('<script setup lang="ts">')[1].split("</script>")[0], "chat.vue"), ts.ScriptTarget.ES2022, true);
  const names = new Set(["chooseSupportImage", "retrySupportUpload", "cancelSupportAttachment", "replaceSupportAttachment", "loadAttachmentPolicy", "resetAttachmentPolicy", "attachmentPolicyGeneration", "supportImagePicker"]);
  if (lifecycle) for (const name of ["activateHumanPage", "cleanup", "humanShowRevision", "humanHistoryListError"]) names.add(name);
  const lifecycleStatement = (node: ts.Statement) => {
    if (!lifecycle || !ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false;
    const call = node.expression.expression.getText(ast), source = node.getText(ast);
    return call === "onShow" || call === "onHide" || call === "watch" && (source.includes("stopHumanThreadPolling")
      || source.startsWith("watch(humanComposerKey,")
      || source.startsWith("watch(() => [app.accountBindingEpoch, convStore.scopeInvalidated]"));
  };
  const code = ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name?.text ?? "")
    : ts.isVariableStatement(node) ? node.declarationList.declarations.some(item => names.has(item.name.getText(ast))) : lifecycleStatement(node))
    .map(node => node.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let show!: () => Promise<void>, hide!: () => void;
  const deps = { ref, watch, app, convStore, humanComposerKey: key, imageDraft, attachmentPolicy: policy, attachmentPolicyError: ref(false), supportApi: api,
    supportSessionReady: ref(true), isAi: ref(false), failedHumanSend: ref(null), humanSendBusy: ref(false),
    remoteApiEnabled: true, requireCryptoUuid: () => "test-upload", asApiError, toast: { info: vi.fn(), error: vi.fn() },
    // Keep the actual human lifecycle and policy transaction; unrelated layout,
    // message history, creation recovery and Nova effects have no host here.
    cid: ref("CV-1"), startType: ref(null), hiddenAiRoute: ref(false), revealTick: ref(0),
    draftText: ref(""), ticketCreationBlock: ref(null), measureTopOverlay: vi.fn(),
    humanRealtime: { show: vi.fn(() => 1) }, stopHumanThreadPolling: vi.fn(), openHumanConversation: vi.fn(),
    restoreCompletedHumanCreate: vi.fn(), restoreRecoveredComposer: vi.fn(), loadPrivateImages: vi.fn(), clearPrivateImages: vi.fn(),
    clearQueuedSendVisuals: vi.fn(), cancelHistoryRetry: vi.fn(), cancelNovaThinking: vi.fn(), useUI: () => ({ clearConfirmsBy: vi.fn() }),
    onShow: (callback: () => Promise<void>) => { show = callback; }, onHide: (callback: () => void) => { hide = callback; },
    t: ref({ conversations: { image: { uploadFailed: "upload-failed" } } }) };
  const scope = effectScope(); attachmentScopes.push(scope);
  const ops = scope.run(() => new Function("deps", `const {${Object.keys(deps).join(",")}} = deps;
    let chatDisposed = false, novaPageVisible = ${!lifecycle}, humanComposerResetting = false;
    let categoryGate = null, topOverlayMeasureEpoch = 0, handoffAttemptEpoch = 0, novaStatusEpoch = 0, novaHistoryEpoch = 0;
    const handoffBusy = ref(false), pendingTimers = [], dialogOwner = 'attachment-test'; ${code}
    return { chooseSupportImage, retrySupportUpload, replaceSupportAttachment, loadAttachmentPolicy,
      dispose: ${lifecycle ? "cleanup" : "() => { chatDisposed = true; }"} };`)(deps))!;
  return { app, convStore, key, imageDraft, policy, policyError: deps.attachmentPolicyError, api, chooseImage, toast: deps.toast, ...ops,
    show: async () => { await show(); await nextTick(); }, hide: () => hide(),
    releasePolicy: (value: any = { available: true }, index = policyReads.length - 1) => policyReads[index]!.resolve(value),
    rejectPolicy: (cause: unknown, index = policyReads.length - 1) => policyReads[index]!.reject(cause),
    fail: (cause: unknown) => failed(cause),
    select: (result = { tempFilePaths: ["old-account-private.jpg"], tempFiles: [{ size: 10 }] }) => selected(result) };
}

async function shownAttachmentHarness(platform: "app" | "h5" = "app") {
  const h = attachmentHarness("policy", platform, true);
  await h.show();
  expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(1);
  h.releasePolicy({ available: true, maxBytes: 1024 });
  await nextTick();
  expect(h.policy.value).toMatchObject({ available: true, maxBytes: 1024 });
  return h;
}

it.each([
  ["app", { errMsg: "chooseImage:fail", code: 0 }], // Installed native actionSheet cancellation; also covered by profile's runtime-derived fixture.
  ["app", new Error("chooseImage:fail cancel")],
  ["h5", { errMsg: "chooseImage:fail cancel" }],
] as const)("support media picker cancellation on %s stays silent and allows another choice", async (platform, cause) => {
  const h = attachmentHarness("picker", platform), choosing = h.chooseSupportImage();
  await vi.waitFor(() => expect(h.chooseImage).toHaveBeenCalled()); h.fail(cause); await choosing;
  expect(h.toast.error).not.toHaveBeenCalled(); expect(h.api.uploadAttachment).not.toHaveBeenCalled(); expect(h.imageDraft.value).toBeNull();
  const retry = h.chooseSupportImage(); await vi.waitFor(() => expect(h.chooseImage).toHaveBeenCalledTimes(2)); h.select(); await retry;
  expect(h.api.uploadAttachment).toHaveBeenCalledTimes(1); expect(h.imageDraft.value?.state).toBe("ready");
});

it.each([
  ["app", { errMsg: "chooseImage:fail permission denied: cannot cancel operation", code: 0 }],
  ["app", { errMsg: "chooseImage:fail", code: 0, detail: "IO_FAILURE" }],
  ["h5", { errMsg: "chooseImage:fail", code: 0 }],
] as const)("support media genuine failure on %s remains visible and allows retry", async (platform, cause) => {
  const h = attachmentHarness("picker", platform), choosing = h.chooseSupportImage();
  await vi.waitFor(() => expect(h.chooseImage).toHaveBeenCalled()); h.fail(cause); await choosing;
  expect(h.toast.error).toHaveBeenCalledWith("upload-failed", ""); expect(h.api.uploadAttachment).not.toHaveBeenCalled(); expect(h.imageDraft.value).toBeNull();
  const retry = h.chooseSupportImage(); await vi.waitFor(() => expect(h.chooseImage).toHaveBeenCalledTimes(2)); h.select(); await retry;
  expect(h.api.uploadAttachment).toHaveBeenCalledTimes(1); expect(h.imageDraft.value?.state).toBe("ready");
});

it("support media failed upload remains a retryable draft rather than a sent message", async () => {
  const h = attachmentHarness("picker"); h.api.uploadAttachment.mockRejectedValueOnce(new ApiError({ kind: "network", message: "upload cancelled by transport" }));
  const choosing = h.chooseSupportImage(); await vi.waitFor(() => expect(h.chooseImage).toHaveBeenCalled()); h.select(); await choosing;
  expect(h.imageDraft.value).toMatchObject({ state: "failed", error: "uploadFailed", clientUploadId: "test-upload" });
  expect(h.imageDraft.value?.attachmentId).toBeUndefined();
  await h.retrySupportUpload();
  expect(h.api.uploadAttachment).toHaveBeenNthCalledWith(2, "old-account-private.jpg", "test-upload", "support-upload-test-upload");
  expect(h.imageDraft.value).toMatchObject({ state: "ready", attachmentId: "ATT-1" });
});

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

it.each(["before-show", "after-show"] as const)("native-picker success %s survives real hide/show and its policy lifecycle", async order => {
  const h = await shownAttachmentHarness(), choosing = h.chooseSupportImage();
  expect(h.chooseImage).toHaveBeenCalledOnce();
  await h.chooseSupportImage(); expect(h.chooseImage).toHaveBeenCalledOnce();
  h.hide();
  expect(h.policy.value).toMatchObject({ available: true, maxBytes: 1024 });
  if (order === "after-show") { await h.show(); h.hide(); await h.show(); }
  expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(1);
  h.select(); await choosing;
  expect(h.api.uploadAttachment).toHaveBeenCalledTimes(1); expect(h.imageDraft.value?.attachmentId).toBe("ATT-1");
  if (order === "before-show") await h.show();
  expect(h.imageDraft.value).toMatchObject({ state: "ready", attachmentId: "ATT-1" });
  expect(h.toast.error).not.toHaveBeenCalled();
  // Once the picker settles, ordinary page navigation must invalidate/reload
  // policy again; a picker exception must never become a permanent bypass.
  h.hide(); expect(h.policy.value).toBeNull();
  const reads = h.api.attachmentPolicy.mock.calls.length;
  await h.show(); expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(reads + 1);
  h.releasePolicy({ available: false }); await nextTick();
  expect(h.policy.value).toEqual({ available: false });
});

it.each(["cancel", "failure"] as const)("native-picker %s after real hide releases its policy hold and allows a new choice", async outcome => {
  const h = await shownAttachmentHarness(), choosing = h.chooseSupportImage();
  h.hide();
  h.fail(outcome === "cancel" ? { errMsg: "chooseImage:fail", code: 0 }
    : { errMsg: "chooseImage:fail permission denied", code: 12 });
  await choosing;
  expect(h.api.uploadAttachment).not.toHaveBeenCalled(); expect(h.imageDraft.value).toBeNull();
  expect(h.policy.value).toBeNull();
  expect(h.toast.error).toHaveBeenCalledTimes(outcome === "cancel" ? 0 : 1);
  if (outcome === "failure") expect(h.toast.error).toHaveBeenCalledWith("upload-failed", "");
  await h.chooseSupportImage(); expect(h.chooseImage).toHaveBeenCalledOnce();
  await h.show(); expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(2);
  h.releasePolicy(); await nextTick();
  const retry = h.chooseSupportImage(); expect(h.chooseImage).toHaveBeenCalledTimes(2);
  h.select(); await retry;
  expect(h.api.uploadAttachment).toHaveBeenCalledTimes(1);
  expect(h.imageDraft.value).toMatchObject({ state: "ready", attachmentId: "ATT-1" });
});

it.each(["account", "scope", "key", "unmount"] as const)("real native-picker hide/show never admits the retired %s owner", async change => {
  const h = await shownAttachmentHarness(), choosing = h.chooseSupportImage();
  h.hide();
  if (change === "account") { h.app.accountKey = "user:2"; h.app.accountBindingEpoch++; }
  if (change === "scope") h.convStore.scopeInvalidated++;
  if (change === "key") h.key.value = "conversation:CV-2";
  if (change === "unmount") h.dispose();
  else {
    await h.show();
    expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(2);
    h.releasePolicy({ available: false }); await nextTick();
  }
  h.imageDraft.value = { attachmentId: "ATT-new", filePath: "new-owner.jpg", state: "ready" };
  const nextDraft = h.imageDraft.value;
  h.select(); await choosing;
  expect(h.api.uploadAttachment).not.toHaveBeenCalled();
  expect(h.imageDraft.value).toBe(nextDraft); expect(h.toast.error).not.toHaveBeenCalled();
  expect(h.policy.value).toEqual(change === "unmount" ? null : { available: false });
});

it("a native picker cannot revive after a real hidden composer A-to-B-to-A switch or release its replacement", async () => {
  const h = await shownAttachmentHarness(), oldChoice = h.chooseSupportImage();
  const oldSuccess = h.chooseImage.mock.calls[0]![0].success;
  h.hide();
  h.key.value = "conversation:CV-2";
  h.key.value = "conversation:CV-1";
  expect(h.policy.value).toBeNull();
  await h.show(); expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(2);
  h.releasePolicy(); await nextTick();
  const replacement = h.chooseSupportImage(); expect(h.chooseImage).toHaveBeenCalledTimes(2);
  oldSuccess({ tempFilePaths: ["retired-owner.jpg"], tempFiles: [{ size: 10 }] }); await oldChoice;
  expect(h.api.uploadAttachment).not.toHaveBeenCalled(); expect(h.imageDraft.value).toBeNull();
  h.select({ tempFilePaths: ["replacement.jpg"], tempFiles: [{ size: 10 }] }); await replacement;
  expect(h.api.uploadAttachment).toHaveBeenCalledExactlyOnceWith("replacement.jpg", "test-upload", "support-upload-test-upload");
  expect(h.imageDraft.value).toMatchObject({ state: "ready", filePath: "replacement.jpg", attachmentId: "ATT-1" });
});

it("a retired native-picker failure stays silent after composer A-to-B-to-A and preserves the new draft", async () => {
  const h = await shownAttachmentHarness(), oldChoice = h.chooseSupportImage();
  h.hide();
  h.key.value = "conversation:CV-2";
  h.key.value = "conversation:CV-1";
  await h.show(); h.releasePolicy(); await nextTick();
  h.imageDraft.value = { filePath: "new-draft.jpg", attachmentId: "ATT-new", state: "ready" };
  const nextDraft = h.imageDraft.value;
  h.fail({ errMsg: "chooseImage:fail permission denied", code: 12 }); await oldChoice;
  expect(h.toast.error).not.toHaveBeenCalled();
  expect(h.imageDraft.value).toBe(nextDraft); expect(h.api.uploadAttachment).not.toHaveBeenCalled();
});

it.each(["success", "failure"] as const)("ordinary hide invalidates a pending policy %s even after a later show has loaded new policy", async outcome => {
  const h = await shownAttachmentHarness(), oldRead = h.loadAttachmentPolicy();
  expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(2);
  h.hide(); expect(h.policy.value).toBeNull();
  await h.show(); expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(3);
  h.releasePolicy({ available: false }, 2); await nextTick();
  if (outcome === "success") h.releasePolicy({ available: true }, 1);
  else h.rejectPolicy(new ApiError({ kind: "network", message: "old request failed" }), 1);
  await oldRead;
  expect(h.policy.value).toEqual({ available: false }); expect(h.policyError.value).toBe(false);
  expect(h.chooseImage).not.toHaveBeenCalled(); expect(h.api.uploadAttachment).not.toHaveBeenCalled();
});

it("H5 real hide/show retires the old picker without cancelling a new visible picker", async () => {
  const h = await shownAttachmentHarness("h5"), oldChoice = h.chooseSupportImage();
  const oldSuccess = h.chooseImage.mock.calls[0]![0].success;
  h.hide(); expect(h.policy.value).toBeNull();
  await h.show(); expect(h.api.attachmentPolicy).toHaveBeenCalledTimes(2);
  h.releasePolicy(); await nextTick();
  const newChoice = h.chooseSupportImage(); expect(h.chooseImage).toHaveBeenCalledTimes(2);
  oldSuccess({ tempFilePaths: ["old-hidden.jpg"], tempFiles: [{ size: 10 }] }); await oldChoice;
  expect(h.imageDraft.value).toBeNull(); expect(h.api.uploadAttachment).not.toHaveBeenCalled();
  h.select({ tempFilePaths: ["new-visible.jpg"], tempFiles: [{ size: 10 }] }); await newChoice;
  expect(h.api.uploadAttachment).toHaveBeenCalledExactlyOnceWith("new-visible.jpg", "test-upload", "support-upload-test-upload");
  expect(h.imageDraft.value).toMatchObject({ state: "ready", attachmentId: "ATT-1" });
  expect(h.toast.error).not.toHaveBeenCalled();
});

it("an old replacement cannot open a picker after its cancellation returns in a new account", async () => {
  const h = attachmentHarness("picker"); h.imageDraft.value = { attachmentId: "ATT-old", clientUploadId: "old", state: "ready" };
  let release!: () => void; h.api.cancelAttachment.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const replacing = h.replaceSupportAttachment(); await vi.waitFor(() => expect(h.api.cancelAttachment).toHaveBeenCalled());
  h.app.accountBindingEpoch++; h.imageDraft.value = null; release(); await Promise.resolve(); await Promise.resolve();
  if (h.chooseImage.mock.calls.length) h.select(); await replacing;
  expect(h.chooseImage).not.toHaveBeenCalled(); expect(h.api.uploadAttachment).not.toHaveBeenCalled();
});


function attachmentCancelBoundaryHarness() {
  const app = reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
  const convStore = reactive({ scopeInvalidated: 0, refreshAdvisor: vi.fn() });
  const imageDraft = ref<any>({ attachmentId: "ATT-old", clientUploadId: "old", key: "conversation:CV-1", state: "ready" });
  const supportSessionReady = ref(true), humanComposerKey = ref("conversation:CV-1");
  const toast = { error: vi.fn() };
  let resolve!: () => void, reject!: (cause: unknown) => void;
  const api = { cancelAttachment: vi.fn(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; })) };
  const ast = ts.createSourceFile("chat.ts", chat.split('<script setup lang="ts">')[1].split("</script>")[0], ts.ScriptTarget.ES2022, true);
  const names = new Set(["cancelSupportAttachment", "clearPrivateImages", "cleanup", "resetAttachmentPolicy", "attachmentPolicyGeneration", "supportImagePicker"]);
  const reset = ast.statements.find(node => ts.isExpressionStatement(node)
    && node.getText(ast).startsWith("watch(() => [app.accountBindingEpoch, convStore.scopeInvalidated]"));
  if (!reset) throw new Error("Missing actual synchronous account/scope reset watcher");
  const code = ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name?.text ?? "")
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(ast))))
    .map(node => node.getText(ast)).join("\n") + "\n" + reset.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { app, convStore, imageDraft, supportSessionReady, humanComposerKey, toast, supportApi: api, asApiError, watch,
    clearQueuedSendVisuals: vi.fn(),
    failedHumanSend: ref(null), draftText: ref(""), attachmentPolicy: ref(null), attachmentPolicyError: ref(false), ticketCreationBlock: ref(null),
    imageSources: ref({}), imageFailures: ref({}), isAi: ref(false), t: ref({ conversations: { image: { cancelFailed: "CANCEL_FAILED" } } }) };
  const scope = effectScope();
  const ops = scope.run(() => new Function("deps", `const {${Object.keys(deps).join(",")}} = deps;
    const remoteApiEnabled=true, loadAttachmentPolicy=()=>{}, dialogOwner="offline-cancel", pendingTimers=[];
    const useUI=()=>({clearConfirmsBy:()=>{}}), stopHumanThreadPolling=()=>{}, cancelNovaThinking=()=>{}, nova={close:()=>{}};
    let imageEpoch=0, imageLoads=new Set(), humanComposerResetting=false, novaPageVisible=true, chatDisposed=false;
    let categoryGate=null, novaStatusEpoch=0, novaHistoryEpoch=0;
    ${code} return {cancel:cancelSupportAttachment, dispose:cleanup};`)(deps))!;
  return { app, convStore, imageDraft, supportSessionReady, humanComposerKey, toast, api, scope, ...ops,
    resolve: () => resolve(), reject: (status=503) => reject(new ApiError({ kind: "http", message: "CANCEL_FAILURE", status })),
    nextDraft: () => { imageDraft.value = { attachmentId: "ATT-new", clientUploadId: "new", key: "conversation:CV-2", state: "ready" }; return imageDraft.value; } };
}

it.each(["account", "scope", "intent", "unmount"])("attachment cancel failure cannot reach a retired %s UI", async change => {
  const h = attachmentCancelBoundaryHarness();
  try {
    const pending = h.cancel();
    expect(h.api.cancelAttachment).toHaveBeenCalledWith("ATT-old", "support-cancel-old");
    if (change === "account") { h.app.accountKey = "user:2"; h.app.accountBindingEpoch++; expect(h.imageDraft.value).toBeNull(); }
    if (change === "scope") { h.convStore.scopeInvalidated++; expect(h.imageDraft.value).toBeNull(); }
    if (change === "intent") h.humanComposerKey.value = "conversation:CV-2";
    if (change === "unmount") h.dispose();
    const next = h.nextDraft(); h.reject(change === "scope" ? 403 : 503); await pending;
    expect(h.toast.error).not.toHaveBeenCalled(); expect(h.imageDraft.value).toBe(next);
    expect(h.api.cancelAttachment).toHaveBeenCalledTimes(1);
  } finally { h.scope.stop(); }
});
it("current attachment cancellation succeeds with the original key", async () => {
  const h = attachmentCancelBoundaryHarness();
  try { const pending=h.cancel(); h.resolve(); await pending; expect(h.imageDraft.value).toBeNull(); expect(h.toast.error).not.toHaveBeenCalled(); expect(h.api.cancelAttachment).toHaveBeenCalledWith("ATT-old", "support-cancel-old"); }
  finally { h.scope.stop(); }
});
it("current attachment cancellation failure keeps the draft and reports once", async () => {
  const h = attachmentCancelBoundaryHarness();
  try { const original=h.imageDraft.value, pending=h.cancel(); h.reject(); await pending; expect(h.imageDraft.value).toBe(original); expect(h.toast.error).toHaveBeenCalledTimes(1); expect(h.toast.error).toHaveBeenCalledWith("CANCEL_FAILED", ""); }
  finally { h.scope.stop(); }
});
it("current attachment cancellation 404 still clears the original draft", async () => {
  const h = attachmentCancelBoundaryHarness();
  try { const pending=h.cancel(); h.reject(404); await pending; expect(h.imageDraft.value).toBeNull(); expect(h.toast.error).not.toHaveBeenCalled(); }
  finally { h.scope.stop(); }
});
it("late successful attachment cancellation preserves the new account draft", async () => {
  const h = attachmentCancelBoundaryHarness();
  try { const pending=h.cancel(); h.app.accountKey="user:2"; h.app.accountBindingEpoch++; const next=h.nextDraft(); h.resolve(); await pending; expect(h.imageDraft.value).toBe(next); expect(h.toast.error).not.toHaveBeenCalled(); }
  finally { h.scope.stop(); }
});
it("cold session cannot dispatch an attachment cancellation", async () => {
  const h = attachmentCancelBoundaryHarness();
  try { h.supportSessionReady.value=false; await h.cancel(); expect(h.api.cancelAttachment).not.toHaveBeenCalled(); expect(h.toast.error).not.toHaveBeenCalled(); }
  finally { h.scope.stop(); }
});

it.each(["draft", "session"])("late attachment cancel failure respects the current %s fence", async change => {
  const h = attachmentCancelBoundaryHarness();
  try {
    const pending=h.cancel();
    const next=change === "draft" ? h.nextDraft() : h.imageDraft.value;
    if (change === "session") h.supportSessionReady.value=false;
    h.reject(); await pending;
    expect(h.toast.error).not.toHaveBeenCalled(); expect(h.imageDraft.value).toBe(next);
    expect(h.api.cancelAttachment).toHaveBeenCalledTimes(1);
  } finally { h.scope.stop(); }
});
