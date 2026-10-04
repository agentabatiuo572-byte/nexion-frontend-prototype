// @ts-expect-error Node-only test harness; App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNova } from "@/store/nova";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { localizedIdleClose } from "@/lib/support-idle-message";
import * as thinking from "@/lib/nova-thinking";
import * as failure from "@/lib/nova-failure";
import * as limiter from "@/lib/send-limiter";
import * as secureId from "@/lib/secure-command-id";
import * as format from "@/i18n/format";
import { ApiError } from "@/api/errors";
import * as apiErrors from "@/api/errors";
import * as realtimePage from "./conversation-realtime-page";
import { createSupportApi } from "@/api/support-api";
import * as ticketPolicy from '@/api/support-ticket-policy';
import { useAuth } from "@/store/auth";
import { createSessionVault } from "@/api/session-vault";
import { binarySessionReady } from "@/lib/binary-session-ready";

// Execute the actual SFC script with transport/lifecycle boundaries substituted.
// This tests the page worker, not a second implementation of its algorithm.
const source = readFileSync(new URL("./chat.vue", import.meta.url), "utf8").split('<script setup lang="ts">')[1].split("</script>")[0];
const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function mount(query: Record<string, string> = { type: "ai" }, conversation?: {
  type: string;
  status: string;
  agentName: string;
  messages?: Array<unknown>;
  roleKey?: string;
}, enabled = ["ai", "advisor", "support"], realtime: { ready?: boolean; online?: boolean; typing?: boolean; remote?: boolean } = {}) {
  const hooks: Record<string, (...args: any[]) => any> = {};
  const app = vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1, visibleDevices: [], earnings: { today: 0 } });
  const auth = useAuth(), sessionVault = createSessionVault();
  function rebind(key: string) {
    auth.$patch({ isAuthenticated: true, accountId: key });
    sessionVault.save({ accessToken: "test-access", refreshToken: "test-refresh", tokenType: "Bearer",
      user: { userId: Number(key.slice(5)), countryCode: "+86", phone: "13800000001", nickname: "Test", onboardingComplete: true } });
    app.accountKey = key;
  }
  rebind(app.accountKey);
  const currentLocale = vue.ref(zh);
  const locale = vue.reactive({ code: "zh" });
  const api = { status: vi.fn(async () => ({ available: true })),
    history: vi.fn(async () => ({ conversationId: null, messages: [] })), chat: vi.fn() };
  const startConversation = vi.fn(async (_type: string, _text: string) => "new-conversation");
  const openConversation = vi.fn(async () => conversation);
  const watchRealtime=vi.fn();
  const humanComposers = vue.reactive<Record<string, any>>({});
  const modules: Record<string, unknown> = {
    vue: { ...vue, onUnmounted: (fn: () => void) => { hooks.unmount = fn; } },
    "@dcloudio/uni-app": Object.fromEntries(["onLoad", "onUnload", "onShow", "onHide"].map(name => [name, (fn: () => void) => { hooks[name] = fn; }])),
    "@/i18n/use-t": { useT: () => currentLocale },
    "@/i18n/format": format,
    "@/lib/support-idle-message": { localizedIdleClose },
    "@/lib/route": { navTo: vi.fn(), navBack: vi.fn(), navReplace: vi.fn(async () => true) },
    "@/lib/nova-visibility": { NOVA_SUPPORT_VISIBLE: true },
    "@/lib/send-limiter": limiter,
    "@/lib/device-preview": { h5DevicePreviewStatusBarHeight: () => 0 },
    "@/lib/hashpower": { isDeviceOnline: () => false },
    "@/store/conversations": { useConversations: () => ({
      humanComposers,
      composer: (key: string) => humanComposers[key] ?? { text: "", imageDraft: null, failedSend: null },
      saveComposer: (key: string, value: any) => { humanComposers[key] = value; },
      clearComposer: (key: string) => { delete humanComposers[key]; },
      refreshAdvisor: vi.fn(async () => undefined),
      advisor: null,
      advisorLoading: false,
      advisorError: false,
      scopeInvalidated: 0,
      get: () => conversation,
      open: openConversation,
      watchRealtime,
      setTyping: vi.fn(),
      loadEarlier: vi.fn(async () => conversation),
      realtimeReady: realtime.ready ?? false,
      onlineIds: realtime.online === undefined ? {} : { [query.cid ?? ""]: realtime.online },
      typingIds: realtime.typing === true ? { [query.cid ?? ""]: true } : {},
      categoryAvailabilityStatus: "ready",
      refreshCategories: async () => "applied",
      categoryEnabled: (type: string) => enabled.includes(type),
      startConversation,
    }) },
    "@/store/nova": { useNova },
    "@/store/auth": { useAuth: () => auth },
    "@/lib/binary-session-ready": { binarySessionReady },
    "@/store/app": { useApp: () => app },
    "@/store/ui": { toast: { warn: vi.fn(), info: vi.fn(), error: vi.fn() }, confirm: async () => true,
      useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/mock/nova-templates": {},
    "@/api/runtime": { novaAiApi: api, remoteApiEnabled: realtime.remote ?? true, sessionVault,
      supportApi: { attachmentPolicy: vi.fn(async () => ({ available: false })) } },
    "@/api/errors": apiErrors,
    "@/api/support-api": { isSupportAttachmentNotReady: () => false },
    '@/api/support-ticket-policy': ticketPolicy,
    "@/lib/nova-failure": failure,
    "@/store/locale": { useLocaleStore: () => locale },
    "@/lib/secure-command-id": secureId,
    "@/lib/nova-thinking": thinking,
    "./conversation-realtime-page": realtimePage,
  };
  const page = new Function("require", "exports", script + "; return { isClosedSession, headerRole, dotStyle, onRestart, onSend, onQueueAction, onQueueSave, onStartNewConversation, threadMessages, cleanup };")(
    (name: string) => {
      if (name.endsWith(".vue")) return {};
      if (!(name in modules)) throw new Error(`Unmocked dependency: ${name}`);
      return modules[name];
    }, {},
  );
  hooks.onLoad(query);
  return { page, hooks, app, rebind, api, startConversation, openConversation,watchRealtime, nova: useNova(), currentLocale, locale, navigation: modules["@/lib/route"] as { navTo: ReturnType<typeof vi.fn>; navBack: ReturnType<typeof vi.fn> } };
}

beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("human message native clock", () => {
  it.each(["support", "advisor"])("keeps compact local times and the original %s history when native locale options are ignored", type => {
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("18:57:08 GMT+0900 (JST)");
    const messages = [
      { id: "user-1", sender: "user", text: "Opening message", ts: new Date(2026, 9, 4, 18, 57, 8).getTime() },
      { id: "agent-1", sender: "agent", authorName: "superadmin", text: "First reply", ts: new Date(2026, 9, 4, 18, 57, 40).getTime() },
      { id: "agent-2", sender: "agent", authorName: "superadmin", text: "Second reply", ts: new Date(2026, 9, 4, 18, 59, 14).getTime() },
      { id: "agent-3", sender: "agent", authorName: "superadmin", text: "Third reply", ts: new Date(2026, 9, 4, 19, 0, 59).getTime() },
    ];
    const before = JSON.stringify(messages);
    const current = mount({ cid: "CV-time" }, { type, status: "open", agentName: "superadmin", messages });
    try {
      for (const [code, dictionary, times] of [
        ["zh", zh, ["18:57", "18:57", "18:59", "19:00"]],
        ["vi", vietnamese, ["18:57", "18:57", "18:59", "19:00"]],
        ["en", en, ["06:57 PM", "06:57 PM", "06:59 PM", "07:00 PM"]],
      ] as const) {
        current.locale.code = code;
        current.currentLocale.value = dictionary;
        expect(current.page.threadMessages.value.map((message: { meta: string }) => message.meta)).toEqual([
          `${dictionary.conversations.image.you} · ${times[0]}`,
          ...times.slice(1).map(time => `superadmin · ${time}`),
        ]);
        expect(current.page.threadMessages.value.map((message: { id: string; text: string; side: string }) =>
          ({ id: message.id, text: message.text, side: message.side }))).toEqual(messages.map(message =>
          ({ id: message.id, text: message.text, side: message.sender === "user" ? "right" : "left" })));
        expect(JSON.stringify(messages)).toBe(before);
      }
      expect(current.startConversation).not.toHaveBeenCalled();
      expect(current.api.chat).not.toHaveBeenCalled();
    } finally { current.page.cleanup(); }
  });

  it("preserves English AM/PM through midnight and noon while Chinese and Vietnamese use 24 hours", () => {
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("00:07:45 GMT+0900 (JST)");
    const messages = [0, 12, 23].map((hour, index) => ({ id: `time-${index}`, sender: "agent", authorName: "Agent",
      text: "Reply", ts: new Date(2026, 9, 4, hour, 7, 45).getTime() }));
    const current = mount({ cid: "CV-boundaries" }, { type: "support", status: "open", agentName: "Agent", messages });
    try {
      for (const [code, expected] of [
        ["en", ["12:07 AM", "12:07 PM", "11:07 PM"]],
        ["zh", ["00:07", "12:07", "23:07"]],
        ["vi", ["00:07", "12:07", "23:07"]],
      ] as const) {
        current.locale.code = code;
        expect(current.page.threadMessages.value.map((message: { meta: string }) => message.meta))
          .toEqual(expected.map(time => `Agent · ${time}`));
      }
    } finally { current.page.cleanup(); }
  });

  it("uses the existing compact-clock placeholder for an invalid message date", () => {
    const current = mount({ cid: "CV-invalid-time" }, { type: "support", status: "open", agentName: "Agent",
      messages: [{ id: "invalid-time", sender: "agent", authorName: "Agent", text: "Reply", ts: NaN }] });
    try {
      for (const code of ["zh", "vi", "en"]) {
        current.locale.code = code;
        expect(current.page.threadMessages.value[0].meta).toBe("Agent · —");
      }
    } finally { current.page.cleanup(); }
  });
});

describe("human conversation restart", () => {
  it("shows the server-owned idle-close header after older public history and switches language", async () => {
    const text = "会话已因用户闲置 5 分钟自动结束,可重新发起会话。";
    const raw = {
      conversation: { conversationNo: "CV-idle", conversationType: "support", status: "CLOSED", version: 2,
        ownerAgentName: "", unreadCount: 0, lastMessage: text, lastMessageAt: "2026-09-01T00:05:00Z",
        lastMessageKind: "IDLE_TIMEOUT_CLOSE" },
      messages: [{ id: 1, senderType: "user", content: "Old message", createdAt: "2026-09-01T00:00:00Z", receiptStatus: null }],
      historyTruncated: false, nextCursor: null,
    };
    const conversation = await createSupportApi({ request: async () => raw } as never).conversation("CV-idle");
    const current = mount({ cid: conversation.id }, conversation);
    expect(current.page.threadMessages.value[current.page.threadMessages.value.length - 1])
      .toMatchObject({ tone: "system", text: expect.stringContaining("5 分钟") });
    current.currentLocale.value = vietnamese;
    await vue.nextTick();
    expect(current.page.threadMessages.value[current.page.threadMessages.value.length - 1])
      .toMatchObject({ tone: "system", text: expect.stringContaining("5 phút") });
    current.page.cleanup();
  });
  it("does not create a system notice for manually archived exact-copy user text", async () => {
    const text = "会话已因用户闲置 5 分钟自动结束,可重新发起会话。";
    const raw = {
      conversation: { conversationNo: "CV-copy", conversationType: "support", status: "CLOSED", version: 2,
        ownerAgentName: "", unreadCount: 0, lastMessage: text, lastMessageAt: "2026-09-01T00:05:00Z" },
      messages: [{ id: 1, senderType: "user", content: text, createdAt: "2026-09-01T00:04:59Z", receiptStatus: null }],
      historyTruncated: false, nextCursor: null,
    };
    const conversation = await createSupportApi({ request: async () => raw } as never).conversation("CV-copy");
    const current = mount({ cid: conversation.id }, conversation);
    current.currentLocale.value = vietnamese;
    await vue.nextTick();
    expect(current.page.threadMessages.value).toHaveLength(1);
    expect(current.page.threadMessages.value[0]).toMatchObject({ tone: "user", text });
    current.page.cleanup();
  });
  it.each([true,false])('resumes the original first-message creation after foreground, responseBeforeShow=%s',async responseBeforeShow=>{
    const current=mount({start:'advisor'});await current.hooks.onShow();
    const pending=deferred<string>();current.startConversation.mockReturnValueOnce(pending.promise);
    const sending=current.page.onSend('Hello');current.hooks.onHide();
    if(responseBeforeShow){pending.resolve('same-conversation');await sending;await current.hooks.onShow();}
    else {await current.hooks.onShow();pending.resolve('same-conversation');await sending;}
    expect(current.startConversation).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(current.watchRealtime).toHaveBeenCalledWith('same-conversation'));current.page.cleanup();
  });
  it("preserves a second draft while the first conversation is being created", async () => {
    const current = mount({ start: "advisor" });
    const pending = deferred<string>();
    current.startConversation.mockReturnValue(pending.promise);
    await current.hooks.onShow();
    const first = current.page.onSend("First question");
    await vi.advanceTimersByTimeAsync(1500);
    const restore = vi.fn();
    await current.page.onSend("Second draft", restore);
    expect(restore).toHaveBeenCalledOnce();
    expect(current.startConversation).toHaveBeenCalledOnce();
    pending.resolve("new-conversation");
    await first;
    current.page.cleanup();
  });

  it.each(["advisor", "support"])("watches the new %s conversation and never starts a page polling loop", async type => {
    const current = mount({ start: type });
    await current.hooks.onShow();
    await current.page.onSend("Hello");
    await vi.advanceTimersByTimeAsync(5000);
    expect(current.watchRealtime).toHaveBeenCalledWith("new-conversation");
    expect(current.openConversation).not.toHaveBeenCalled();
    current.hooks.onHide();
    expect(current.watchRealtime).toHaveBeenLastCalledWith(null);
    const calls = current.openConversation.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(current.openConversation).toHaveBeenCalledTimes(calls);
    current.page.cleanup();
  });

  it.each(["leave", "switch-account", "rebind-account"])("does not attach a late created conversation after %s", async boundary => {
    const current = mount({ start: "advisor" });
    const pending = deferred<string>();
    current.startConversation.mockReturnValue(pending.promise);
    await current.hooks.onShow();
    const sending = current.page.onSend("Hello");
    if (boundary === "leave") current.hooks.onHide();
    else if (boundary === "switch-account") current.rebind("user:2");
    else current.app.accountBindingEpoch += 1;
    pending.resolve("old-account-conversation");
    await sending;
    await vi.advanceTimersByTimeAsync(10000);
    expect(current.openConversation).not.toHaveBeenCalled();
    current.page.cleanup();
  });

  it.each(["advisor", "support"])("opens server-ended %s history and restarts without returning to the center", async type => {
    const raw = {
      conversation: { conversationNo: "CV-ended", conversationType: type, status: "CLOSED", version: 2,
        ownerAgentName: "", unreadCount: 0, lastMessage: "Session ended", lastMessageAt: "2026-09-01T00:05:00Z" },
      // The App projection filters internal system messages; the user's null
      // receipt alone must not reject the whole closed conversation.
      messages: [{ id: 1, senderType: "user", content: "Hello", createdAt: "2026-09-01T00:00:00Z", receiptStatus: null }],
      historyTruncated: false, nextCursor: null,
    };
    const conversation = await createSupportApi({ request: async () => raw } as never).conversation("CV-ended");
    const current = mount({ cid: conversation.id }, conversation);
    await current.hooks.onShow();
    expect(current.navigation.navBack).not.toHaveBeenCalled();
    expect(current.page.threadMessages.value[0]).toMatchObject({ tone: "user", text: "Hello" });
    expect(current.page.isClosedSession.value).toBe(true);
    current.page.onRestart();
    expect(current.navigation.navTo).toHaveBeenCalledExactlyOnceWith(`/pages/support/chat?start=${type}`);
    current.page.cleanup();
  });

  it("keeps advisor restart usable when the independent support category is disabled", async () => {
    const old = mount({ cid: "ended-thread" }, { type: "advisor", status: "ended", agentName: "unassigned" }, ["advisor"]);
    old.page.onRestart();
    const type = new URL(old.navigation.navTo.mock.calls[0][0], "https://test.local").searchParams.get("start")!;
    const next = mount({ start: type }, undefined, ["advisor"]);
    await next.hooks.onShow();
    expect(next.navigation.navBack).not.toHaveBeenCalled();
    await next.page.onSend("Please help with my question");
    expect(next.startConversation).toHaveBeenCalledExactlyOnceWith("advisor", "Please help with my question", undefined);
    expect(next.navigation.navBack).not.toHaveBeenCalled();
    old.page.cleanup();
    next.page.cleanup();
  });

  it.each(["advisor", "support"])("restarts an unassigned ended %s conversation in the same category", type => {
    const { page, navigation } = mount({ cid: "ended-thread" }, { type, status: "ended", agentName: "unassigned" });
    page.onRestart();
    expect(navigation.navTo).toHaveBeenCalledExactlyOnceWith(`/pages/support/chat?start=${type}`);
    page.cleanup();
  });

  it("does not silently switch an unavailable conversation to support", () => {
    const { page, navigation } = mount({ cid: "missing-thread" });
    page.onRestart();
    expect(navigation.navTo).not.toHaveBeenCalled();
    page.cleanup();
  });
});

describe("human chat receipt projection", () => {
  async function conversationWithReceipts(latestUserReceipt: "SENT" | "READ" | null) {
    return createSupportApi({ request: async () => ({
      conversation: {
        conversationNo: "CV-receipts", conversationType: "SUPPORT", status: "OPEN", version: 1,
        ownerAgentName: "Ava", unreadCount: 0, lastMessage: "Newest question",
        lastMessageAt: "2026-09-10T00:00:00Z",
      },
      messages: [
        { id: 1, senderType: "user", content: "Older question", createdAt: "2026-09-10T00:00:00Z", receiptStatus: "READ" },
        { id: 2, senderType: "agent", content: "Agent reply", createdAt: "2026-09-10T00:01:00Z", receiptStatus: "READ" },
        { id: 3, senderType: "user", content: "Newest question", createdAt: "2026-09-10T00:02:00Z", receiptStatus: latestUserReceipt },
      ],
      historyTruncated: false, nextCursor: null,
    }) } as never).conversation("CV-receipts");
  }

  it.each([
    ["SENT", zh.conversations.receiptSent],
    ["READ", zh.conversations.receiptRead],
  ] as const)("shows the latest USER backend %s receipt without placing one under an AGENT message", async (status, label) => {
    const conversation = await conversationWithReceipts(status);
    const current = mount({ cid: conversation.id }, conversation);

    expect(current.page.threadMessages.value.map((message: { tone: string; receipt?: string }) => ({ tone: message.tone, receipt: message.receipt }))).toEqual([
      { tone: "user", receipt: undefined },
      { tone: "agent", receipt: undefined },
      { tone: "user", receipt: label },
    ]);
    current.page.cleanup();
  });

  it("does not invent a human receipt when the backend omits the latest USER receipt", async () => {
    const conversation = await conversationWithReceipts(null);
    const current = mount({ cid: conversation.id }, conversation);

    expect(current.page.threadMessages.value.every((message: { receipt?: string }) => message.receipt === undefined)).toBe(true);
    current.page.cleanup();
  });

  it("keeps Nova's own latest-user receipt projection", () => {
    const current = mount({ type: "ai" });
    current.nova.sendUser("Nova question");

    expect(current.page.threadMessages.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ tone: "user", text: "Nova question", receipt: zh.conversations.receiptSent }),
    ]));
    current.page.cleanup();
  });
});

describe("human chat realtime presence", () => {
  const assigned = { type: "support", status: "open", agentName: "Ava", roleKey: "roleSupport" as const };

  it.each(["Unassigned", "备勤池"])("shows waiting assignment for %s without claiming online", agentName => {
    const current = mount({ cid: "CV-live" }, { ...assigned, agentName }, undefined, { ready: true, online: true });
    expect(current.page.headerRole.value).toBe(zh.conversations.waitingAgent);
    expect(current.page.dotStyle.value).toMatchObject({ animation: "none" });
    current.page.cleanup();
  });

  it("derives reconnecting, online, and offline from live websocket state", () => {
    const reconnecting = mount({ cid: "CV-live" }, assigned, undefined, { ready: false, online: true });
    const online = mount({ cid: "CV-live" }, assigned, undefined, { ready: true, online: true });
    const offline = mount({ cid: "CV-live" }, assigned, undefined, { ready: true, online: false });
    expect(reconnecting.page.headerRole.value).toBe(zh.conversations.connecting);
    expect(reconnecting.page.dotStyle.value).toMatchObject({ animation: "none" });
    expect(online.page.headerRole.value).toBe(zh.conversations.online);
    expect(online.page.dotStyle.value.animation).toBeUndefined();
    expect(offline.page.headerRole.value).toBe(zh.conversations.offline);
    expect(offline.page.dotStyle.value).toMatchObject({ animation: "none" });
    reconnecting.page.cleanup(); online.page.cleanup(); offline.page.cleanup();
  });

  it("keeps unknown presence neutral, local mode on the role, AI isolated, and closed states first", () => {
    const unknown = mount({ cid: "CV-live" }, assigned, undefined, { ready: true });
    const local = mount({ cid: "CV-live" }, assigned, undefined, { ready: false, online: false, remote: false });
    const ai = mount({ type: "ai" }, undefined, undefined, { ready: false, online: false });
    const closed = mount({ cid: "CV-live" }, { ...assigned, status: "closed" }, undefined, { ready: true, online: true, typing: true });
    const transferred = mount({ cid: "CV-live" }, { ...assigned, status: "transferred" }, undefined, { ready: true, online: true, typing: true });
    expect(unknown.page.headerRole.value).toBe(zh.conversations.roleSupport);
    expect(unknown.page.dotStyle.value).toMatchObject({ animation: "none" });
    expect(local.page.headerRole.value).toBe(zh.conversations.roleSupport);
    expect(local.page.dotStyle.value).toMatchObject({ animation: "none" });
    expect(ai.page.headerRole.value).toBe(zh.nova.localRole);
    expect(ai.page.dotStyle.value).toEqual({ background: "var(--v5-brand-2)" });
    expect(closed.page.headerRole.value).toBe(zh.conversations.sessionEnded);
    expect(transferred.page.headerRole.value).toBe(zh.conversations.sessionTransferred);
    unknown.page.cleanup(); local.page.cleanup(); ai.page.cleanup(); closed.page.cleanup(); transferred.page.cleanup();
  });
});

describe("real Nova page queue worker", () => {
  it("waits for canonical history before sending the first question", async () => {
    const { page, hooks, api, nova } = mount();
    const history = deferred<{ conversationId: string; messages: Array<{ id: string; sender: "nova"; text: string; ts: number }> }>();
    api.history.mockReturnValue(history.promise as never);
    api.chat.mockResolvedValue({ reply: "new answer" });

    const showing = hooks.onShow();
    const sending = page.onSend("new question");
    expect(api.chat).not.toHaveBeenCalled();
    expect(nova.messages).toEqual([]);

    history.resolve({
      conversationId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
      messages: [{ id: "old:nova", sender: "nova", text: "old answer", ts: 100 }],
    });
    await showing;
    await sending;

    expect(api.chat).toHaveBeenCalledTimes(1);
    expect(api.chat.mock.calls[0][0].conversationId)
      .toBe("8c12eaf3-744d-405e-b2fb-64b3d81267be");
    expect(nova.messages.map(message => message.text)).toEqual(["old answer", "new question"]);
    page.cleanup();
  });

  it("does not move a draft into a new conversation while history is loading", async () => {
    const { page, hooks, api, nova } = mount();
    const history = deferred<{ conversationId: string; messages: Array<{ id: string; sender: "nova"; text: string; ts: number }> }>();
    api.history.mockReturnValue(history.promise as never);
    api.chat.mockResolvedValue({ reply: "new answer" });
    const restore = vi.fn();

    const showing = hooks.onShow();
    const sending = page.onSend("old-conversation draft", restore);
    await page.onStartNewConversation();
    history.resolve({
      conversationId: "8c12eaf3-744d-405e-b2fb-64b3d81267be",
      messages: [{ id: "old:nova", sender: "nova", text: "old answer", ts: 100 }],
    });
    await showing;
    await sending;

    expect(restore).toHaveBeenCalledOnce();
    expect(api.chat).not.toHaveBeenCalled();
    expect(nova.messages).toEqual([]);
    page.cleanup();
  });

  it("limits actual dispatch while keeping input, and does not inherit another account's quota", async () => {
    const { page, hooks, api, nova, rebind } = mount();
    await hooks.onShow(); api.chat.mockResolvedValue({ reply: "answer" });
    for (let n = 0; n < 5; n++) {
      await page.onSend(`question-${n}`);
      await vi.advanceTimersByTimeAsync(1800);
    }
    await page.onSend("sixth");
    expect(api.chat).toHaveBeenCalledTimes(5);
    expect(nova.pendingRemote[0].delivery).toBe("queued");
    rebind("user:2");
    await vi.advanceTimersByTimeAsync(0);
    await page.onSend("first-b");
    expect(api.chat).toHaveBeenCalledTimes(6);
    expect(api.chat.mock.calls[5][0].message).toBe("first-b");
    page.cleanup();
    await vi.advanceTimersByTimeAsync(15000);
    expect(api.chat).toHaveBeenCalledTimes(6);
  });
  it("serializes two immediate questions, keeps the response floor and anchors answers", async () => {
    const { page, hooks, api, nova } = mount();
    await hooks.onShow();
    api.chat.mockImplementation(async (request) => ({ reply: `answer:${request.message}` }));
    await page.onSend("one"); await page.onSend("two");
    expect(api.chat).toHaveBeenCalledTimes(1);
    expect(nova.messages.map(m => m.text)).toEqual(["one", "two"]);
    expect(page.threadMessages.value[1].queue.label).toContain("1");
    await vi.advanceTimersByTimeAsync(1799);
    expect(api.chat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.chat).toHaveBeenCalledTimes(2);
    expect(nova.messages.map(m => m.text)).toEqual(["one", "answer:one", "two"]);
    await vi.advanceTimersByTimeAsync(1800);
    expect(nova.messages.map(m => m.text)).toEqual(["one", "answer:one", "two", "answer:two"]);
    page.cleanup();
  });

  it("pauses on error; retry keeps turn ID and resumes the waiting question", async () => {
    const { page, hooks, api, nova } = mount();
    await hooks.onShow();
    const first = deferred(); api.chat.mockReturnValueOnce(first.promise).mockResolvedValue({ reply: "answer" });
    await page.onSend("one"); await page.onSend("two");
    first.reject(new ApiError({ kind: "http", message: "NOVA_AI_BUSY", status: 429 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(nova.pendingRemote[0].failure).toBe("busy");
    expect(api.chat).toHaveBeenCalledTimes(1);
    page.onQueueAction(nova.pendingRemote[0].turnId, "retry");
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.chat.mock.calls[1][0].turnId).toBe(api.chat.mock.calls[0][0].turnId);
    await vi.advanceTimersByTimeAsync(3600);
    expect(api.chat).toHaveBeenCalledTimes(3);
    expect(nova.pendingRemote).toHaveLength(0);
    page.cleanup();
  });

  it("tracks a timed-out request with one turn id until the server can replay it", async () => {
    const { page, hooks, api, nova } = mount();
    await hooks.onShow();
    api.chat
      .mockRejectedValueOnce(new ApiError({ kind: "http", message: "NOVA_AI_TIMEOUT", status: 504 }))
      .mockRejectedValueOnce(new ApiError({ kind: "http", message: "NOVA_AI_TURN_IN_PROGRESS", status: 429 }))
      .mockResolvedValueOnce({ reply: "authoritative answer" })
      .mockResolvedValueOnce({ reply: "answer:two" });

    await page.onSend("one"); await page.onSend("two");
    await vi.advanceTimersByTimeAsync(0);
    const turnId = nova.pendingRemote[0].turnId;
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "tracking", serverPending: true });
    expect(page.threadMessages.value[0].queue).toMatchObject({ state: "tracking", label: zh.nova.queue.tracking });
    expect(api.chat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(api.chat).toHaveBeenCalledTimes(2);
    expect(api.chat.mock.calls[1][0].turnId).toBe(turnId);
    expect(nova.pendingRemote[0].delivery).toBe("tracking");
    expect(api.chat.mock.calls.some(([request]) => request.message === "two")).toBe(false);

    await vi.advanceTimersByTimeAsync(3000);
    expect(api.chat).toHaveBeenCalledTimes(3);
    expect(api.chat.mock.calls[2][0].turnId).toBe(turnId);
    await vi.advanceTimersByTimeAsync(1800);
    expect(api.chat.mock.calls[3][0].message).toBe("two");
    await vi.advanceTimersByTimeAsync(1800);
    expect(nova.messages.map(message => message.text)).toEqual(["one", "authoritative answer", "two", "answer:two"]);
    page.cleanup();
  });

  it("ends each silent attempt within 75 seconds and lets the same turn recover", async () => {
    const { page, hooks, api, nova } = mount();
    await hooks.onShow();
    const first = deferred();
    const second = deferred();
    api.chat.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce({ reply: "recovered" });
    await page.onSend("one");
    const turnId = nova.pendingRemote[0].turnId;
    await vi.advanceTimersByTimeAsync(75_000);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "failed", failure: "timeout", serverPending: true });
    expect(nova.typing).toBe(false);
    expect(api.chat.mock.calls[0][1].aborted).toBe(true);
    page.onQueueAction(turnId, "retry");
    page.onQueueAction(turnId, "retry");
    expect(api.chat).toHaveBeenCalledTimes(2);
    expect(api.chat.mock.calls[1][0].turnId).toBe(turnId);
    await vi.advanceTimersByTimeAsync(75_000);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "failed", failure: "timeout", serverPending: true });
    expect(nova.typing).toBe(false);
    expect(api.chat.mock.calls[1][1].aborted).toBe(true);
    first.resolve({ reply: "late one" }); second.resolve({ reply: "late two" });
    await vi.advanceTimersByTimeAsync(0);
    expect(nova.messages.some(message => message.sender === "nova")).toBe(false);
    page.onQueueAction(turnId, "retry");
    await vi.advanceTimersByTimeAsync(1800);
    expect(nova.messages.map(message => message.text)).toEqual(["one", "recovered"]);
    page.cleanup();
  });

  it("tracks a busy server after the first silent timeout, then replays the same turn", async () => {
    const { page, hooks, api, nova } = mount();
    await hooks.onShow();
    const first = deferred();
    api.chat.mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new ApiError({ kind: "http", message: "NOVA_AI_TURN_IN_PROGRESS", status: 429 }))
      .mockResolvedValueOnce({ reply: "server replay" });
    await page.onSend("one");
    const turnId = nova.pendingRemote[0].turnId;
    await vi.advanceTimersByTimeAsync(75_000);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "failed", failure: "timeout", serverPending: true });
    page.onQueueAction(turnId, "retry");
    await vi.advanceTimersByTimeAsync(0);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "tracking", serverPending: true });
    expect(api.chat.mock.calls[1][0].turnId).toBe(turnId);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(1800);
    first.resolve({ reply: "stale" });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.chat.mock.calls[2][0].turnId).toBe(turnId);
    expect(nova.messages.map(message => message.text)).toEqual(["one", "server replay"]);
    page.cleanup();
  });

  it.each([
    ["timeout", new ApiError({ kind: "http", message: "NOVA_AI_TIMEOUT", status: 504 })],
    ["network", new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" })],
    ["server busy", new ApiError({ kind: "http", message: "NOVA_AI_TURN_IN_PROGRESS", status: 429 })],
  ])("bounds repeated %s while preserving the same turn for manual retry", async (_kind, repeatedError) => {
    const { page, hooks, api, nova } = mount();
    await hooks.onShow();
    api.chat.mockRejectedValueOnce(new ApiError({ kind: "http", message: "NOVA_AI_TIMEOUT", status: 504 }))
      .mockRejectedValue(repeatedError);
    await page.onSend("one");
    const turnId = nova.pendingRemote[0].turnId;
    await vi.advanceTimersByTimeAsync(75_000);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "failed", failure: "timeout", serverPending: true });
    expect(nova.typing).toBe(false);
    expect(page.threadMessages.value[0].queue).toMatchObject({ state: "failed", label: zh.nova.queue.timeout });
    expect(api.chat.mock.calls.every(([request]) => request.turnId === turnId)).toBe(true);
    const calls = api.chat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.chat).toHaveBeenCalledTimes(calls);
    api.chat.mockResolvedValue({ reply: "replayed answer" });
    page.onQueueAction(turnId, "retry");
    await vi.advanceTimersByTimeAsync(1800);
    expect(nova.messages.map(message => message.text)).toEqual(["one", "replayed answer"]);
    page.cleanup();
  });

  it("retains interrupted work, resumes tracking, and rejects the cancelled call's late answer", async () => {
    const { page, hooks, api, nova } = mount();
    await hooks.onShow();
    const old = deferred(); api.chat.mockReturnValueOnce(old.promise).mockResolvedValue({ reply: "retried" });
    await page.onSend("one"); await page.onSend("two");
    hooks.onHide();
    expect(api.chat.mock.calls[0][1].aborted).toBe(true);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "tracking", serverPending: true });
    await vi.advanceTimersByTimeAsync(75_000);
    expect(api.chat).toHaveBeenCalledTimes(1);
    await hooks.onShow();
    expect(nova.pendingRemote).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(0);
    old.resolve({ reply: "stale" });
    await vi.advanceTimersByTimeAsync(3600);
    expect(nova.messages.some(m => m.text === "stale")).toBe(false);
    expect(api.chat.mock.calls[1][0].turnId).toBe(api.chat.mock.calls[0][0].turnId);
    page.cleanup();
  });

  it("editing blocks dispatch until saved, cancellation removes a waiting bubble, overflow restores draft", async () => {
    const { page, hooks, api, nova } = mount();
    await hooks.onShow(); api.chat.mockResolvedValue({ reply: "answer" });
    for (const text of ["one", "two", "three", "four"]) await page.onSend(text);
    const restore = vi.fn(); await page.onSend("five", restore);
    expect(restore).toHaveBeenCalledOnce();
    const second = nova.pendingRemote[1].turnId;
    page.onQueueAction(second, "edit");
    page.onQueueAction(nova.pendingRemote[2].turnId, "cancel");
    await vi.advanceTimersByTimeAsync(1800);
    expect(api.chat).toHaveBeenCalledTimes(1);
    page.onQueueSave(second, "changed");
    expect(api.chat.mock.calls[1][0].message).toBe("changed");
    expect(nova.messages.some(m => m.text === "three")).toBe(false);
    page.cleanup();
  });

  it("discards old responses and pending text across account and new-conversation boundaries", async () => {
    const { page, hooks, api, nova, rebind } = mount();
    await hooks.onShow(); const old = deferred(); api.chat.mockReturnValue(old.promise);
    await page.onSend("account-a-question");
    rebind("user:2");
    await vi.advanceTimersByTimeAsync(0);
    old.resolve({ reply: "account-a-reply" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(nova.messages).toHaveLength(0);
    api.chat.mockResolvedValue({ reply: "new" });
    await page.onSend("account-b-question");
    await page.onStartNewConversation();
    await vi.advanceTimersByTimeAsync(2000);
    expect(nova.messages).toHaveLength(0);
    page.cleanup();
  });
});
