// @ts-expect-error Node-only test harness; App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as vue from "vue";
import { formatConversationTime } from '@/components/support/conversation-time';
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNova } from "@/store/nova";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { catalogSkuBrandText, catalogSkuRecommendationBody } from "@/lib/brand-copy";
import { localizedIdleClose } from "@/lib/support-idle-message";
import * as thinking from "@/lib/nova-thinking";
import * as failure from "@/lib/nova-failure";
import * as limiter from "@/lib/send-limiter";
import * as messagePolicy from '@/lib/message-length-policy';
import * as secureId from "@/lib/secure-command-id";
import * as format from "@/i18n/format";
import { ApiError } from "@/api/errors";
import * as apiErrors from "@/api/errors";
import * as deliveryPolicy from '@/lib/conversation-delivery-policy';
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
  const sendUser = vi.fn(async () => true);
  const openConversation = vi.fn(async () => conversation);
  const watchRealtime=vi.fn();
  const humanComposers = vue.reactive<Record<string, any>>({});
  const toast = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const modules: Record<string, unknown> = {
    vue: { ...vue, onUnmounted: (fn: () => void) => { hooks.unmount = fn; } },
    "@dcloudio/uni-app": Object.fromEntries(["onLoad", "onUnload", "onShow", "onHide"].map(name => [name, (fn: () => void) => { hooks[name] = fn; }])),
    "@/i18n/use-t": { useT: () => currentLocale },
    "@/i18n/format": format,
    "@/lib/support-idle-message": { localizedIdleClose },
    "@/lib/brand-copy": { catalogSkuBrandText, catalogSkuRecommendationBody },
    "@/lib/route": { navTo: vi.fn(), navBack: vi.fn(), navReplace: vi.fn(async () => true) },
    "@/lib/nova-visibility": { NOVA_SUPPORT_VISIBLE: true },
    "@/lib/send-limiter": { ...limiter, conversationSendLimiter: limiter.createConversationSendBudgets() },
    '@/lib/message-length-policy': messagePolicy,
    "@/lib/device-preview": { h5DevicePreviewStatusBarHeight: () => 0 },
    "@/lib/hashpower": { isDeviceOnline: () => false },
    "@/store/conversations": { useConversations: () => ({
      humanComposers,
      conversations: conversation ? [{ id: query.cid, messages: [], ...conversation }] : [],
      refresh: vi.fn(async () => undefined),
      composer: (key: string) => humanComposers[key] ?? { text: "", imageDraft: null, failedSend: null },
      saveComposer: (key: string, value: any) => { humanComposers[key] = value; },
      clearComposer: (key: string) => { delete humanComposers[key]; },
      refreshAdvisor: vi.fn(async () => undefined),
      hasPendingHumanCreate: vi.fn(async () => false),
      advisor: null,
      advisorLoading: false,
      advisorError: false,
      scopeInvalidated: 0,
      get: () => conversation ? { id: query.cid, messages: [], ...conversation } : undefined,
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
      sendUser,
    }) },
    "@/store/nova": { useNova },
    "@/store/auth": { useAuth: () => auth },
    "@/lib/binary-session-ready": { binarySessionReady },
    "@/store/app": { useApp: () => app },
    "@/store/ui": { toast, confirm: async () => true,
      useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/mock/nova-templates": {},
    "@/api/runtime": { novaAiApi: api, remoteApiEnabled: realtime.remote ?? true, sessionVault,
      supportApi: { attachmentPolicy: vi.fn(async () => ({ available: false })) } },
    "@/api/errors": apiErrors,
    '@/lib/conversation-delivery-policy': deliveryPolicy,
    "@/api/support-api": { isSupportAttachmentNotReady: () => false },
    '@/api/support-ticket-policy': ticketPolicy,
    "@/lib/nova-failure": failure,
    "@/store/locale": { useLocaleStore: () => locale },
    "@/lib/secure-command-id": secureId,
    "@/lib/nova-thinking": thinking,
    "./conversation-realtime-page": realtimePage,
  };
  const scope = vue.effectScope();
  const page = scope.run(() => new Function("require", "exports", script + "; return { isClosedSession, headerRole, dotStyle, onRestart, onSend, onQueueAction, onQueueSave, onStartNewConversation, threadMessages, loadEarlierNovaHistory, conversationThread, novaHistoryLoading, sendSuccessRevision, cleanup };")(
    (name: string) => {
      if (name.endsWith(".vue")) return {};
      if (!(name in modules)) throw new Error(`Unmocked dependency: ${name}`);
      return modules[name];
    }, {},
  ));
  cleanups.push(() => { page.cleanup(); scope.stop(); });
  hooks.onLoad(query);
  return { page, hooks, app, rebind, api, startConversation, sendUser, openConversation,watchRealtime, nova: useNova(), currentLocale, locale, toast, navigation: modules["@/lib/route"] as { navTo: ReturnType<typeof vi.fn>; navBack: ReturnType<typeof vi.fn> } };
}

const cleanups: Array<() => void> = [];
beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); });
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it.each(['success', 'failure'])('settles the human send visual only after the actual %s result', async result => {
  const current = mount({ cid: 'support-1' }, { type: 'support', status: 'open', agentName: 'Support' });
  await current.hooks.onShow();
  const reply = deferred<boolean>(); current.sendUser.mockReturnValueOnce(reply.promise);
  const settled = vi.fn(); const pending = current.page.onSend('Please check', undefined, settled);
  await vi.waitFor(() => expect(current.sendUser).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(1000); expect(settled).not.toHaveBeenCalled();
  if (result === 'success') reply.resolve(true); else reply.reject(new Error('offline'));
  await pending; expect(settled).toHaveBeenCalledExactlyOnceWith(result === 'success'); current.page.cleanup();
});

it('keeps queued Nova sends turning until their own outcome and settles remaining visuals on hide', async () => {
  const current = mount(); await current.hooks.onShow();
  const reply = deferred<{ reply: string }>(); current.api.chat.mockReturnValueOnce(reply.promise);
  const first = vi.fn(), second = vi.fn();
  await current.page.onSend('First', undefined, first);
  await current.page.onSend('Second', undefined, second);
  expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled();
  const turnId = current.nova.pendingRemote[0].turnId!;
  current.nova.failRemote(turnId, 'timeout');
  expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled();
  current.hooks.onHide(); expect(second).toHaveBeenCalledOnce(); current.page.cleanup();
  expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
});

it('counts two queued Nova successes independently more than 400ms apart and never recounts duplicate completions', async () => {
  const current = mount(); await current.hooks.onShow();
  const first = deferred<{ reply: string }>(), second = deferred<{ reply: string }>();
  current.api.chat.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const firstVisual = vi.fn(), secondVisual = vi.fn();
  await current.page.onSend('First original', undefined, firstVisual);
  await current.page.onSend('Second original', undefined, secondVisual);
  const ids = current.nova.pendingRemote.map(row => row.turnId!);
  expect(current.page.sendSuccessRevision.value).toBe(0);
  await vi.advanceTimersByTimeAsync(1800); first.resolve({ reply: 'First answer' }); await vi.advanceTimersByTimeAsync(0);
  expect(current.page.sendSuccessRevision.value).toBe(1);
  expect(firstVisual).toHaveBeenCalledExactlyOnceWith(true); expect(secondVisual).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1800); second.resolve({ reply: 'Second answer' }); await vi.advanceTimersByTimeAsync(0);
  expect(current.page.sendSuccessRevision.value).toBe(2);
  expect(secondVisual).toHaveBeenCalledExactlyOnceWith(true);
  for (const id of ids) current.nova.completeRemote(id, 'Duplicate delivery');
  await vue.nextTick();
  expect(current.page.sendSuccessRevision.value).toBe(2);
  expect(firstVisual).toHaveBeenCalledOnce(); expect(secondVisual).toHaveBeenCalledOnce();
  expect(current.nova.messages.map(row => row.text)).toEqual(['First original', 'First answer', 'Second original', 'Second answer']);
});

it.each([true, false])('counts Nova retry success with the original request even without a new visual callback (initial callback=%s)', async hasVisual => {
  const current = mount(); await current.hooks.onShow();
  current.api.chat.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 429, message: 'NOVA_AI_BUSY' }))
    .mockResolvedValueOnce({ reply: 'Recovered answer' });
  const visual = vi.fn(); await current.page.onSend('Original retry text', undefined, hasVisual ? visual : undefined);
  await vi.advanceTimersByTimeAsync(0);
  const request = current.api.chat.mock.calls[0][0], id = current.nova.pendingRemote[0].turnId!;
  expect(current.page.sendSuccessRevision.value).toBe(0);
  expect(current.nova.pendingRemote[0].delivery).toBe('failed');
  if (hasVisual) expect(visual).toHaveBeenCalledExactlyOnceWith(false);
  current.page.onQueueAction(id, 'retry'); current.page.onQueueAction(id, 'retry');
  await vi.advanceTimersByTimeAsync(3000);
  expect(current.api.chat).toHaveBeenCalledTimes(2);
  expect(current.api.chat.mock.calls[1][0]).toEqual(request);
  expect(current.page.sendSuccessRevision.value).toBe(1);
  expect(visual).toHaveBeenCalledTimes(hasVisual ? 1 : 0);
  current.page.onQueueAction(id, 'retry'); current.nova.completeRemote(id, 'Duplicate answer'); await vue.nextTick();
  expect(current.page.sendSuccessRevision.value).toBe(1); expect(current.api.chat).toHaveBeenCalledTimes(2);
});

it.each(['hide', 'account', 'binding', 'conversation', 'dispose'] as const)('does not sound a late Nova success after %s', async boundary => {
  const current = mount(); await current.hooks.onShow();
  const reply = deferred<{ reply: string }>(); current.api.chat.mockReturnValue(reply.promise);
  const visual = vi.fn(); await current.page.onSend('Old private question', undefined, visual);
  if (boundary === 'hide') current.hooks.onHide();
  if (boundary === 'account') current.rebind('user:2');
  if (boundary === 'binding') current.app.accountBindingEpoch++;
  if (boundary === 'conversation') await current.page.onStartNewConversation();
  if (boundary === 'dispose') current.page.cleanup();
  await vue.nextTick(); reply.resolve({ reply: 'Old private answer' }); await vi.advanceTimersByTimeAsync(2000);
  expect(current.page.sendSuccessRevision.value).toBe(0);
  expect(visual).toHaveBeenCalledExactlyOnceWith(false);
  if (boundary === 'hide') {
    await current.hooks.onShow(); await vi.advanceTimersByTimeAsync(2000);
    expect(current.page.sendSuccessRevision.value).toBe(0);
  }
});

it('keeps the shared history path unchanged after failed anchor preparation and permits a successful retry', async () => {
  const current = mount(); await current.hooks.onShow();
  const loadEarlier = vi.spyOn(current.nova, 'loadEarlierRemote').mockResolvedValue(undefined);
  const prepare = vi.fn(async () => false); current.page.conversationThread.value = { prepareHistoryPrepend: prepare };
  try {
    await current.page.loadEarlierNovaHistory(); expect(loadEarlier).not.toHaveBeenCalled();
    expect(current.page.novaHistoryLoading.value).toBe(false);
    prepare.mockResolvedValueOnce(true); await current.page.loadEarlierNovaHistory();
    expect(loadEarlier).toHaveBeenCalledTimes(1);
  } finally { current.page.cleanup(); }
});

describe("human message timestamp projection", () => {
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
        ["en", en, ["18:57", "18:57", "18:59", "19:00"]],
      ] as const) {
        current.locale.code = code;
        current.currentLocale.value = dictionary;
        expect(current.page.threadMessages.value.map((message: { meta: string }) => message.meta)).toEqual([
          dictionary.conversations.image.you, ...times.slice(1).map(() => 'superadmin'),
        ]);
        expect(current.page.threadMessages.value.map((message: { timestamp: number }) => message.timestamp)).toEqual(messages.map(message => message.ts));
        expect(current.page.threadMessages.value.map((message: { timestamp: number }) => formatConversationTime(message.timestamp, { locale: code, now: Date.now() })?.clock)).toEqual(times);
        expect(current.page.threadMessages.value.map((message: { id: string; text: string; side: string }) =>
          ({ id: message.id, text: message.text, side: message.side }))).toEqual(messages.map(message =>
          ({ id: message.id, text: message.text, side: message.sender === "user" ? "right" : "left" })));
        expect(JSON.stringify(messages)).toBe(before);
      }
      expect(current.startConversation).not.toHaveBeenCalled();
      expect(current.api.chat).not.toHaveBeenCalled();
    } finally { current.page.cleanup(); }
  });

  it("uses the shared 24-hour clock through midnight and noon in all three languages", () => {
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("00:07:45 GMT+0900 (JST)");
    const messages = [0, 12, 23].map((hour, index) => ({ id: `time-${index}`, sender: "agent", authorName: "Agent",
      text: "Reply", ts: new Date(2026, 9, 4, hour, 7, 45).getTime() }));
    const current = mount({ cid: "CV-boundaries" }, { type: "support", status: "open", agentName: "Agent", messages });
    try {
      for (const [code, expected] of [
        ["en", ["00:07", "12:07", "23:07"]],
        ["zh", ["00:07", "12:07", "23:07"]],
        ["vi", ["00:07", "12:07", "23:07"]],
      ] as const) {
        current.locale.code = code;
        expect(current.page.threadMessages.value.map((message: { timestamp: number }) => formatConversationTime(message.timestamp, { locale: code, now: Date.now() })?.clock)).toEqual(expected);
      }
    } finally { current.page.cleanup(); }
  });

  it("does not replace an unknown message time with a current or 1970 timestamp", () => {
    const current = mount({ cid: "CV-invalid-time" }, { type: "support", status: "open", agentName: "Agent",
      messages: [{ id: "invalid-time", sender: "agent", authorName: "Agent", text: "Reply", ts: NaN }] });
    try {
      for (const code of ["zh", "vi", "en"] as const) {
        current.locale.code = code;
        expect(current.page.threadMessages.value[0].meta).toBe('Agent');
        expect(formatConversationTime(current.page.threadMessages.value[0].timestamp, { locale: code, now: Date.now() })).toBeNull();
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
    const sending=current.page.onSend('Hello');
    await vi.waitFor(() => expect(current.startConversation).toHaveBeenCalledTimes(1));
    current.hooks.onHide();
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
    await vi.waitFor(() => expect(current.startConversation).toHaveBeenCalledTimes(1));
    if (boundary === "leave") current.hooks.onHide();
    else if (boundary === "switch-account") current.rebind("user:2");
    else current.app.accountBindingEpoch += 1;
    pending.resolve("old-account-conversation");
    await sending;
    await vi.advanceTimersByTimeAsync(10000);
    expect(current.openConversation).not.toHaveBeenCalled();
    expect(current.watchRealtime).not.toHaveBeenCalledWith("old-account-conversation");
    current.page.cleanup();
  });

  it.each(["advisor", "support"])("keeps server-ended %s history replyable in the same window", async type => {
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
    expect(current.page.isClosedSession.value).toBe(false);
    expect(current.navigation.navTo).not.toHaveBeenCalled();
    expect(current.startConversation).not.toHaveBeenCalled();
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
    expect(next.startConversation).toHaveBeenCalledExactlyOnceWith("advisor", "Please help with my question", undefined, expect.any(Function));
    expect(next.navigation.navBack).not.toHaveBeenCalled();
    old.page.cleanup();
    next.page.cleanup();
  });

  it.each(["advisor", "support"])("restarts an unassigned ended %s conversation through dedicated support", type => {
    const { page, navigation } = mount({ cid: "ended-thread" }, { type, status: "ended", agentName: "unassigned" });
    page.onRestart();
    expect(navigation.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?start=advisor");
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
  ] as const)("shows latest USER %s and explicitly provided AGENT receipts", async (status, label) => {
    const conversation = await conversationWithReceipts(status);
    const current = mount({ cid: conversation.id }, conversation);

    expect(current.page.threadMessages.value.map((message: { tone: string; receipt?: string }) => ({ tone: message.tone, receipt: message.receipt }))).toEqual([
      { tone: "user", receipt: undefined },
      { tone: "agent", receipt: zh.conversations.receiptRead },
      { tone: "user", receipt: label },
    ]);
    current.page.cleanup();
  });

  it("does not invent a human receipt when the backend omits the latest USER receipt", async () => {
    const conversation = await conversationWithReceipts(null);
    const current = mount({ cid: conversation.id }, conversation);

    expect(current.page.threadMessages.value.filter((message: { tone: string }) => message.tone === "user").every((message: { receipt?: string }) => message.receipt === undefined)).toBe(true);
    expect(current.page.threadMessages.value.find((message: { tone: string }) => message.tone === "agent")?.receipt).toBe(zh.conversations.receiptRead);
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
    expect(online.page.dotStyle.value.background).toBe('var(--nx-presence-green)');
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
    expect(closed.page.isClosedSession.value).toBe(false);
    expect(closed.page.headerRole.value).toBe(zh.conversations.agentTyping);
    expect(transferred.page.headerRole.value).toBe(zh.conversations.sessionTransferred);
    unknown.page.cleanup(); local.page.cleanup(); ai.page.cleanup(); closed.page.cleanup(); transferred.page.cleanup();
  });
});

describe('Nova page confirmed input rejection recovery', () => {
  const inputRejected = () => new ApiError({ kind: 'http', status: 400, code: 400, message: 'NOVA_AI_INPUT_INVALID' });

  describe('NOVA-RECOVERY-UX-01 save feedback', () => {
    for (const [language, copy] of [['zh', zh], ['en', en], ['vi', vietnamese]] as const) {
      it.each(['unavailable', 'duplicate'])(`${language}: preserves a valid edit after %s UUID failure and permits a later save`, async reason => {
        const current = mount(); current.currentLocale.value = copy; await current.hooks.onShow();
        current.api.chat.mockRejectedValueOnce(inputRejected()).mockResolvedValue({ reply: 'Corrected answer' });
        await current.page.onSend('Original question'); await vi.advanceTimersByTimeAsync(0);
        const turnId = current.nova.pendingRemote[0].turnId!;
        current.page.onQueueAction(turnId, 'edit');
        const before = JSON.stringify(current.nova.pendingRemote);
        const generate = vi.spyOn(secureId, 'requireCryptoUuid').mockImplementation(() => {
          if (reason === 'unavailable') throw new Error('CRYPTO_RANDOM_UUID_UNAVAILABLE');
          return turnId;
        });
        current.page.onQueueSave(turnId, 'Corrected question'); await vi.advanceTimersByTimeAsync(5000);
        expect(current.toast.warn).toHaveBeenCalledExactlyOnceWith(copy.security.opFailed);
        expect(current.toast.warn).not.toHaveBeenCalledWith(copy.nova.queue.invalid);
        expect(JSON.stringify(current.nova.pendingRemote)).toBe(before);
        expect(current.api.chat).toHaveBeenCalledOnce();
        expect(current.nova.pendingRemote[0].delivery).toBe('editing');
        generate.mockRestore(); current.toast.warn.mockClear();
        current.page.onQueueSave(turnId, 'Corrected question'); await vi.advanceTimersByTimeAsync(2000);
        expect(current.api.chat).toHaveBeenCalledTimes(2);
        expect(current.api.chat.mock.calls[1][0].message).toBe('Corrected question');
        expect(current.api.chat.mock.calls[1][0].turnId).not.toBe(turnId);
        expect(current.nova.pendingRemote).toEqual([]); expect(current.toast.warn).not.toHaveBeenCalled();
      });

      it.each([' \n\t', 'x'.repeat(2001)])(`${language}: reserves the input hint for invalid text %#`, async text => {
        const current = mount(); current.currentLocale.value = copy; await current.hooks.onShow();
        current.api.chat.mockRejectedValue(inputRejected());
        await current.page.onSend('Original question'); await vi.advanceTimersByTimeAsync(0);
        const turnId = current.nova.pendingRemote[0].turnId!; current.page.onQueueAction(turnId, 'edit');
        const generate = vi.spyOn(secureId, 'requireCryptoUuid');
        current.page.onQueueSave(turnId, text);
        expect(current.toast.warn).toHaveBeenCalledExactlyOnceWith(copy.nova.queue.invalid);
        expect(generate).not.toHaveBeenCalled(); expect(current.api.chat).toHaveBeenCalledOnce();
        expect(current.nova.pendingRemote[0]).toMatchObject({ turnId, text: 'Original question', delivery: 'editing' });
      });
    }

    it('saves unchanged text without allocating a UUID or retrying the rejected turn', async () => {
      const current = mount(); await current.hooks.onShow(); current.api.chat.mockRejectedValue(inputRejected());
      await current.page.onSend('Original question'); await vi.advanceTimersByTimeAsync(0);
      const turnId = current.nova.pendingRemote[0].turnId!; current.page.onQueueAction(turnId, 'edit');
      const generate = vi.spyOn(secureId, 'requireCryptoUuid').mockImplementation(() => { throw new Error('CRYPTO_RANDOM_UUID_UNAVAILABLE'); });
      current.page.onQueueSave(turnId, ' Original question '); await vi.advanceTimersByTimeAsync(5000);
      expect(generate).not.toHaveBeenCalled(); expect(current.toast.warn).not.toHaveBeenCalled();
      expect(current.nova.pendingRemote[0]).toMatchObject({ turnId, text: 'Original question', delivery: 'failed', failure: 'input-rejected' });
      expect(current.api.chat).toHaveBeenCalledOnce();
    });

    it('ignores a late save after editing ends without blaming its text', async () => {
      const current = mount(); await current.hooks.onShow(); current.api.chat.mockRejectedValue(inputRejected());
      await current.page.onSend('Original question'); await vi.advanceTimersByTimeAsync(0);
      const turnId = current.nova.pendingRemote[0].turnId!; current.page.onQueueAction(turnId, 'edit');
      current.page.onQueueAction(turnId, 'cancel-edit'); current.page.onQueueSave(turnId, 'Corrected question');
      expect(current.toast.warn).not.toHaveBeenCalled(); expect(current.api.chat).toHaveBeenCalledOnce();
      expect(current.nova.pendingRemote[0]).toMatchObject({ turnId, text: 'Original question', delivery: 'failed' });
    });
  });

  it.each(['edit', 'cancel', 'retry'])('allows %s after confirmed rejection and resumes the waiting question', async action => {
    const current = mount(); await current.hooks.onShow();
    const first = deferred(); current.api.chat.mockReturnValueOnce(first.promise).mockResolvedValue({ reply: 'Answer' });
    await current.page.onSend('Original question'); await current.page.onSend('Next question');
    const original = current.api.chat.mock.calls[0][0];
    first.reject(inputRejected()); await vi.advanceTimersByTimeAsync(0);
    expect(current.nova.pendingRemote[0]).toMatchObject({ delivery: 'failed', failure: 'input-rejected' });
    expect(current.page.threadMessages.value[0].queue).toMatchObject({ state: 'failed', editable: true, label: zh.nova.queue.failed });
    expect(current.api.chat).toHaveBeenCalledOnce();
    current.page.onQueueAction(original.turnId, action);
    if (action === 'edit') {
      expect(current.nova.pendingRemote[0].delivery).toBe('editing');
      await vi.advanceTimersByTimeAsync(1000); expect(current.api.chat).toHaveBeenCalledOnce();
      current.page.onQueueSave(original.turnId, 'Corrected question');
    }
    await vi.advanceTimersByTimeAsync(5000);
    const requests = current.api.chat.mock.calls.map(([request]) => request);
    if (action === 'edit') {
      expect(requests[1]).toMatchObject({ message: 'Corrected question', conversationId: original.conversationId, language: original.language });
      expect(requests[1].turnId).not.toBe(original.turnId);
    } else if (action === 'retry') expect(requests[1]).toEqual(original);
    expect(requests.at(-1).message).toBe('Next question');
    expect(requests).toHaveLength(action === 'cancel' ? 2 : 3);
    expect(current.nova.pendingRemote).toEqual([]);
    expect(current.page.sendSuccessRevision.value).toBe(action === 'cancel' ? 1 : 2);
  });

  it('keeps rejected edits paused when abandoned, unchanged, or hidden', async () => {
    const current = mount(); await current.hooks.onShow(); current.api.chat.mockRejectedValue(inputRejected());
    await current.page.onSend('Original question'); await vi.advanceTimersByTimeAsync(0);
    const turnId = current.nova.pendingRemote[0].turnId!;
    current.page.onQueueAction(turnId, 'edit'); current.page.onQueueAction(turnId, 'cancel-edit');
    current.page.onQueueAction(turnId, 'edit'); current.page.onQueueSave(turnId, ' Original question ');
    expect(current.nova.pendingRemote[0]).toMatchObject({ turnId, delivery: 'failed' });
    current.page.onQueueAction(turnId, 'edit'); current.hooks.onHide(); await current.hooks.onShow();
    await vi.advanceTimersByTimeAsync(2000);
    expect(current.nova.pendingRemote[0]).toMatchObject({ turnId, delivery: 'failed' });
    expect(current.api.chat).toHaveBeenCalledOnce();
  });

  it.each([
    new ApiError({ kind: 'http', status: 400, code: 400, message: 'UNRECOGNIZED_REJECTION' }),
    new ApiError({ kind: 'http', status: 400, message: 'NOVA_AI_INPUT_INVALID' }),
    new ApiError({ kind: 'http', status: 500, code: 500, message: 'UNKNOWN' }),
    new ApiError({ kind: 'network', message: 'NETWORK_UNAVAILABLE' }),
    new ApiError({ kind: 'http', status: 504, message: 'NOVA_AI_TIMEOUT' }),
  ])('blocks edit and removal for unconfirmed failure %# without changing the request', async cause => {
    const current = mount(); await current.hooks.onShow(); current.api.chat.mockRejectedValue(cause);
    await current.page.onSend('Original question'); await current.page.onSend('Next question');
    await vi.advanceTimersByTimeAsync(0);
    const original = current.api.chat.mock.calls[0][0], state = current.nova.pendingRemote[0].delivery;
    expect(current.page.threadMessages.value[0].queue.editable).toBe(false);
    current.page.onQueueAction(original.turnId, 'edit'); current.page.onQueueSave(original.turnId, 'Unsafe replacement');
    current.page.onQueueAction(original.turnId, 'cancel');
    expect(current.nova.pendingRemote.map(row => row.text)).toEqual(['Original question', 'Next question']);
    expect(current.nova.pendingRemote[0]).toMatchObject({ turnId: original.turnId, delivery: state });
    expect(current.api.chat).toHaveBeenCalledOnce();
  });

  it('cannot reinterpret an unknown result as safe to replace when validation precedes replay', async () => {
    const current = mount(); await current.hooks.onShow();
    current.api.chat.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'NETWORK_UNAVAILABLE' }))
      .mockRejectedValue(inputRejected());
    await current.page.onSend('Original question'); await current.page.onSend('Next question');
    await vi.advanceTimersByTimeAsync(3000);
    const original = current.api.chat.mock.calls[0][0];
    expect(current.api.chat.mock.calls[1][0]).toEqual(original);
    expect(current.page.threadMessages.value[0].queue).toMatchObject({ state: 'failed', editable: false });
    current.page.onQueueAction(original.turnId, 'edit'); current.page.onQueueAction(original.turnId, 'cancel');
    current.page.onQueueSave(original.turnId, 'Unsafe replacement');
    current.page.onQueueAction(original.turnId, 'retry'); await vi.advanceTimersByTimeAsync(1000);
    expect(current.api.chat.mock.calls[2][0]).toEqual(original);
    expect(current.nova.pendingRemote.map(row => row.text)).toEqual(['Original question', 'Next question']);
  });

  it.each(['other account', 'A to B to A'])('discards a stale rejection and edit/remove actions after %s', async boundary => {
    const current = mount(); await current.hooks.onShow();
    const old = deferred(); current.api.chat.mockReturnValueOnce(old.promise).mockReturnValue(new Promise(() => {}));
    await current.page.onSend('Old question'); const oldId = current.api.chat.mock.calls[0][0].turnId;
    current.rebind('user:2'); await vi.advanceTimersByTimeAsync(0);
    if (boundary === 'A to B to A') { current.rebind('user:1'); await vi.advanceTimersByTimeAsync(0); }
    await current.page.onSend('New question');
    old.reject(inputRejected()); await vi.advanceTimersByTimeAsync(0);
    current.page.onQueueAction(oldId, 'edit'); current.page.onQueueSave(oldId, 'Old private edit'); current.page.onQueueAction(oldId, 'cancel');
    expect(current.nova.pendingRemote).toHaveLength(1);
    expect(current.nova.pendingRemote[0]).toMatchObject({ text: 'New question', delivery: 'processing' });
    expect(current.page.threadMessages.value[0].queue.editable).toBe(false);
    expect(current.api.chat).toHaveBeenCalledTimes(2);
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

  it('respects server cooldown and retains the attempt deadline after hide and return', async () => {
    const { page, hooks, api, nova } = mount(); await hooks.onShow();
    api.chat.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'NETWORK_UNAVAILABLE', retryAfterMs: 30_000 }))
      .mockReturnValue(new Promise(() => {}));
    await page.onSend('cooldown'); await vi.advanceTimersByTimeAsync(0);
    const deadline = nova.pendingRemote[0].replyDeadlineAt;
    expect(nova.pendingRemote[0].delivery).toBe('tracking');
    hooks.onHide(); await vi.advanceTimersByTimeAsync(1000); await hooks.onShow();
    expect(api.chat).toHaveBeenCalledTimes(1);
    expect(nova.pendingRemote[0].replyDeadlineAt).toBe(deadline);
    await vi.advanceTimersByTimeAsync(28_999); expect(api.chat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(api.chat).toHaveBeenCalledTimes(2);
    expect(nova.pendingRemote[0].replyDeadlineAt).toBe(deadline);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: 'failed', failure: 'timeout' });
    expect(api.chat).toHaveBeenCalledTimes(2); page.cleanup();
  });

  it("retains the original deadline across hide/return and requires manual retry after it expires", async () => {
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
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: 'failed', failure: 'timeout' });
    expect(api.chat).toHaveBeenCalledTimes(1);
    page.onQueueAction(nova.pendingRemote[0].turnId, 'retry');
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
