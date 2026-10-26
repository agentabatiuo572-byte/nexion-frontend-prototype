// @ts-expect-error Node-only SFC test harness.
import { readFileSync } from "node:fs";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile as compileTemplate, parse as parseTemplate } from '@vue/compiler-dom';
import ts from "typescript";
import * as Vue from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { catalogSkuBrandText, catalogSkuRecommendationBody } from "@/lib/brand-copy";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { installSupportStorage } from "@/test/storage-setup";
import * as conversationEntrance from '@/components/support/conversation-entrance';
import * as conversationScroll from '@/components/support/conversation-scroll';
import * as conversationTime from '@/components/support/conversation-time';
import * as conversationBubbleLayout from '@/components/support/conversation-bubble-layout';
import * as conversationAudio from '@/lib/conversation-audio';

installSupportStorage();
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); }, removeItem: (key: string) => { values.delete(key); } });
});

const source = readFileSync(new URL("./messages.vue", import.meta.url), "utf8");
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, { id: "inbox-test", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text", "image"].includes(tag) } } });
const script = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

type Element = { tag: string; text: string; props: Record<string, any>; children: Element[]; parent: Element | null };
const element = (tag: string, text = ""): Element => ({ tag, text, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Element, Element>({
  createElement: tag => element(tag), createText: text => element("#text", text), createComment: text => element("#comment", text),
  setText: (node, text) => { node.text = text; }, setElementText: (node, text) => { node.text = text; node.children = []; },
  parentNode: node => node.parent, nextSibling: node => node.parent?.children[(node.parent.children.indexOf(node)) + 1] ?? null,
  patchProp: (node, key, _previous, next) => { node.props[key] = next; },
  insert: (node, parent, anchor) => { node.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1; if (at < 0) parent.children.push(node); else parent.children.splice(at, 0, node); },
  remove: node => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node); },
});
const mounted: Vue.App<Element>[] = [];
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); });
const flatten = (node: Element): Element[] => [node, ...node.children.flatMap(flatten)];

function mount(type: "advisor" | "support", state: "empty" | "ended" | "active" | "failed" | "loading" = "empty", locale = zh, providedStore?: ReturnType<typeof useConversations>) {
  const rows = Vue.reactive(state === "ended" || state === "active" ? [{ id: "CV-1", type, status: state === "ended" ? "closed" : "open", agentName: "Unassigned", messages: [], lastMessage: "Hello", lastTs: Date.now(), unread: 0, sessionStatus: state, roleKey: "roleAdvisor", avatarTint: "blue" }] : []);
  const store = Vue.reactive({
    categoryAvailabilityStatus: state === "loading" ? "loading" : state === "failed" ? "failed" : "ready",
    error: state === "failed" ? "unavailable" : null, enabled: true, typingIds: {},
    advisor: { assignmentState: "UNBOUND", availability: "UNBOUND", currentAdvisorName: null },
    advisorLoading: false, advisorError: false,
    conversations: rows, dismissingIds: {}, dismissalAvailable: true, dismissConversation: vi.fn(async () => undefined),
    hidden: false,
    byType: (key: string) => key === type && !store.hidden ? rows : [],
    categoryReadable: (key: string) => key === type && (state !== "loading" || rows.length > 0),
    categoryEnabled: (key: string): boolean => (key === "advisor" || key === "support") && store.enabled && store.categoryAvailabilityStatus === "ready",
    refresh: vi.fn(), refreshCategories: vi.fn(), startConversation: vi.fn(),
  });
  const navTo = vi.fn();
  const account = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
  const currentLocale = Vue.ref(locale);
  const shown: Array<() => Promise<void>> = [];
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: (fn: () => Promise<void>) => shown.push(fn), onHide: vi.fn() },
    "@/i18n/use-t": { useT: () => currentLocale }, "@/i18n/format": { fmt: (value: string) => value },
    "@/lib/support-idle-message": { localizedIdleClose },
    "@/lib/brand-copy": { catalogSkuBrandText, catalogSkuRecommendationBody },
    "@/lib/unread-badge": { formatUnreadBadge },
    "@/lib/nova-visibility": { NOVA_SUPPORT_VISIBLE: false },
    "@/lib/route": { navTo }, "@/store/conversations": { useConversations: () => providedStore ?? store },
    "@/store/nova": { useNova: () => ({ messages: [], unread: 0 }) }, "@/store/app": { useApp: () => account },
    "@/api/runtime": { remoteApiEnabled: true }, "@/lib/active-page-refresh": { registerActivePageRefresh: vi.fn(() => () => {}) },
    "@/components/app-chassis.vue": { default: { setup: (_props: unknown, { slots }: any) => () => Vue.h("main", slots.default?.()) } },
    "@/components/empty-state.vue": { default: { props: ["title", "desc", "ctaLabel"], setup: (props: any) => () => Vue.h("empty-state", props, [props.title, props.desc]) } },
  };
  const component = new Function("require", "exports", `${script}; return exports.default;`)((name: string) => {
    if (name in modules) return modules[name];
    if (name.endsWith(".vue")) return { default: { render: () => null } };
    throw new Error(`Unexpected dependency: ${name}`);
  }, {});
  const root = element("root"); const app = renderer.createApp(component); app.mount(root); mounted.push(app);
  return { root, store, navTo, account, rows, currentLocale, show: async () => { for (const fn of shown) await fn(); await Vue.nextTick(); } };
}

describe("human conversation contact entry", () => {
  it.each([
    ["support", "ended", "click"], ["support", "ended", "Enter"], ["support", "ended", " "],
    ["advisor", "empty", "click"], ["advisor", "empty", "Enter"], ["advisor", "empty", " "],
  ] as const)("recovers an advisor-only failure in %s/%s using %s without starting or sending", async (type, state, activation) => {
    setActivePinia(createPinia());
    const store = useConversations();
    chatTransport.advisor.mockReset().mockResolvedValue({ assignmentId: null, currentAdvisorId: null,
      currentAdvisorName: null, assignmentState: "UNBOUND", availability: "UNBOUND" });
    store.categoryAvailabilityStatus = "ready";
    store.categoryAvailability[type] = true;
    if (state === "ended") store.conversations.push({ id: "CV-existing", type, status: "closed", version: 1,
      agentName: "Former advisor", messages: [], lastMessage: "Existing history", lastTs: 2, unread: 0,
      sessionStatus: "closed", roleKey: "roleSupport", avatarTint: "blue", historyTruncated: false, historyNextCursor: null });
    chatTransport.advisor.mockRejectedValueOnce(new Error("RESOURCE_NOT_FOUND"));
    await store.refreshAdvisor();
    expect(store.advisorError).toBe(true);
    expect(store.error).toBeNull();
    expect(store.realtimeFallback).toBe(false);
    chatTransport.advisor.mockClear();
    chatTransport.startConversation.mockClear(); chatTransport.replyConversation.mockClear();
    const current = mount(type, state, en, store);
    await current.show(); store.advisorError = true; chatTransport.advisor.mockClear(); await Vue.nextTick();
    const warning = () => flatten(current.root).find(node => node.props.role === "alert"
      && node.props.class === "nx-conv-refresh-warning");
    expect(warning()).toBeDefined();
    expect(flatten(warning()!).some(node => node.text === en.conversations.image.advisorUnavailable)).toBe(true);
    const retry = flatten(warning()!).find(node => node.props.role === "button")!;
    expect(Number(retry.props.tabindex)).toBe(0);
    expect(retry.props["aria-label"]).toBe(en.conversations.retry);
    if (activation === "click") retry.props.onClick();
    else {
      const handlers = Array.isArray(retry.props.onKeydown) ? retry.props.onKeydown : [retry.props.onKeydown];
      handlers.forEach((handler: (event: { key: string; preventDefault: () => void }) => void) =>
        handler({ key: activation, preventDefault: vi.fn() }));
    }
    await Vue.nextTick();
    expect(chatTransport.advisor).toHaveBeenCalledTimes(1);
    expect(store.advisorError).toBe(false);
    expect(store.advisor?.assignmentState).toBe("UNBOUND");
    expect(warning()).toBeUndefined();
    expect(store.conversations).toHaveLength(state === "ended" ? 1 : 0);
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
    expect(chatTransport.replyConversation).not.toHaveBeenCalled();
    expect(current.navTo).not.toHaveBeenCalled();
  });

  it("keeps the server idle-close preview newer than loaded history and follows the selected language", async () => {
    const current = mount("support", "ended", vietnamese);
    const row = current.rows[0] as any;
    row.messages = [{ id: "1", sender: "user", text: "Older message", ts: Date.now() - 300_000 }];
    row.lastMessage = "会话已因用户闲置 5 分钟自动结束,可重新发起会话。";
    row.lastMessageKind = "IDLE_TIMEOUT_CLOSE";
    row.lastTs = Date.now();
    await Vue.nextTick();
    const preview = () => flatten(current.root).find(node => node.props.class === "nx-conv-rowprev")!.text;
    expect(preview()).toContain("5 phút");
    current.currentLocale.value = en;
    await Vue.nextTick();
    expect(preview()).toContain("5 minutes");
  });
  it("keeps a manually closed user's exact idle-close copy verbatim", async () => {
    const current = mount("support", "ended", vietnamese);
    const row = current.rows[0] as any;
    row.lastMessage = "会话已因用户闲置 5 分钟自动结束,可重新发起会话。";
    row.lastTs = Date.now();
    await Vue.nextTick();
    const preview = flatten(current.root).find(node => node.props.class === "nx-conv-rowprev")!.text;
    expect(preview).toContain("会话已因用户闲置 5 分钟自动结束");
    expect(preview).not.toContain("5 phút");
  });
  it.each(["same-user rebind", "A to B to A"])("ignores an old removal failure after %s", async scenario => {
    const current = mount("advisor", "active");
    let reject!: (error: Error) => void;
    current.store.dismissConversation.mockImplementationOnce(() => new Promise<undefined>((_resolve, fail) => { reject = fail; }));
    const pending = flatten(current.root).find(node => String(node.props["aria-label"]).startsWith("从列表移除 · "))!.props.onClick();
    if (scenario === "A to B to A") {
      current.account.accountKey = "user:2";
      current.account.accountBindingEpoch += 1;
      await Vue.nextTick();
      current.account.accountKey = "user:1";
    }
    current.account.accountBindingEpoch += 1;
    await Vue.nextTick();
    reject(new Error("old removal network failure"));
    await pending; await Vue.nextTick();
    expect(flatten(current.root).some(node => node.props.role === "alert")).toBe(false);
  });

  it("clears an already displayed removal error on same-account session rebinding", async () => {
    const current = mount("advisor", "active");
    current.store.dismissConversation.mockRejectedValueOnce(new Error("offline"));
    await flatten(current.root).find(node => String(node.props["aria-label"]).startsWith("从列表移除 · "))!.props.onClick();
    await Vue.nextTick();
    expect(flatten(current.root).some(node => node.props.role === "alert")).toBe(true);
    current.account.accountBindingEpoch += 1; await Vue.nextTick();
    expect(flatten(current.root).some(node => node.props.role === "alert")).toBe(false);
  });

  it.each(["loading", "failed", "ready"])("keeps a dismissed ongoing thread reachable when new entry is unavailable (%s)", async status => {
    const current = mount("advisor", "active"); current.store.hidden = true; current.store.enabled = false;
    current.store.categoryAvailabilityStatus = status; await Vue.nextTick();
    const contact = flatten(current.root).find(node => node.props["aria-label"] === zh.conversations.contactAdvisor);
    expect(contact).toBeDefined(); contact!.props.onClick();
    expect(current.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?cid=CV-1");
    expect(current.store.startConversation).not.toHaveBeenCalled();
  });

  it("keeps existing conversations usable while an older backend lacks removal support", async () => {
    const current = mount("advisor", "active"); current.store.dismissalAvailable = false; await Vue.nextTick();
    expect(flatten(current.root).some(node => String(node.props["aria-label"]).startsWith("从列表移除 · "))).toBe(false);
    expect(flatten(current.root).some(node => node.props["aria-label"] === zh.conversations.image.unassigned)).toBe(true);
  });
  it("removes via the row action without opening the chat and exposes the retained-history explanation", async () => {
    const current = mount("advisor", "active");
    const button = flatten(current.root).find(node => String(node.props["aria-label"]).startsWith("从列表移除 · "));
    expect(button).toBeDefined(); await button!.props.onClick();
    expect(current.store.dismissConversation).toHaveBeenCalledExactlyOnceWith("CV-1");
    expect(current.navTo).not.toHaveBeenCalled();
    expect(flatten(current.root).some(node => node.text.includes("移除后聊天记录仍保留"))).toBe(true);
  });
  it("reuses an ongoing removed conversation when the user contacts the advisor again", async () => {
    const current = mount("advisor", "active"); current.store.hidden = true; await Vue.nextTick();
    const button = flatten(current.root).find(node => node.props["aria-label"] === zh.conversations.contactAdvisor);
    expect(button).toBeDefined(); button!.props.onClick();
    expect(current.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?cid=CV-1");
    expect(current.store.startConversation).not.toHaveBeenCalled();
  });
  it("shows a retryable explanation if the removal fails", async () => {
    const current = mount("advisor", "active"); current.store.dismissConversation.mockRejectedValueOnce(new Error("offline"));
    await flatten(current.root).find(node => String(node.props["aria-label"]).startsWith("从列表移除 · "))!.props.onClick();
    await Vue.nextTick();
    expect(flatten(current.root).some(node => node.props.role === "alert" && node.text.includes("移除未确认"))).toBe(true);
  });
  it.each(["advisor", "support"] as const)("lets a new user contact %s without any existing conversation", async type => {
    const current = mount(type);
    const label = zh.conversations.contactAdvisor;
    const button = flatten(current.root).find(node => node.props["aria-label"] === label);
    expect(button).toBeDefined();
    button!.props.onClick();
    expect(current.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?start=advisor");
    expect(current.store.startConversation).not.toHaveBeenCalled();
  });
  it.each(["advisor", "support"] as const)("keeps contact %s available when every prior conversation has ended", type => {
    const current = mount(type, "ended");
    expect(flatten(current.root).some(node => node.props["aria-label"] === zh.conversations.contactAdvisor)).toBe(true);
  });
  it.each(["active", "failed", "loading"] as const)("does not expose a duplicate or unauthorised contact entry in %s state", state => {
    const current = mount("advisor", state);
    expect(flatten(current.root).some(node => node.props["aria-label"] === zh.conversations.contactAdvisor)).toBe(false);
  });
  it("rechecks category availability when an old click arrives after the category was disabled", () => {
    const current = mount("advisor");
    const button = flatten(current.root).find(node => node.props["aria-label"] === zh.conversations.contactAdvisor);
    expect(button).toBeDefined(); current.store.enabled = false; button!.props.onClick();
    expect(current.navTo).not.toHaveBeenCalled();
  });
  it.each([[en, "Contact dedicated support"], [vietnamese, "Liên hệ hỗ trợ riêng"]] as const)("provides a localised advisor action", (locale, label) => {
    expect(flatten(mount("advisor", "empty", locale as typeof zh).root).some(node => node.props["aria-label"] === label)).toBe(true);
  });
});

// Execute the real human chat SFC together with its real Pinia conversation store.
import { createPinia, setActivePinia } from "pinia";
import { useConversations } from "@/store/conversations";
import { useNova } from "@/store/nova";
import * as chatRealtime from "./conversation-realtime-page";
import * as chatThinking from "@/lib/nova-thinking";
import * as chatFailure from "@/lib/nova-failure";
import * as chatLimiter from "@/lib/send-limiter";
import * as messagePolicy from '@/lib/message-length-policy';
import * as chatSecure from "@/lib/secure-command-id";
import * as chatFormat from "@/i18n/format";
import * as chatApiErrors from "@/api/errors";
import * as deliveryPolicy from '@/lib/conversation-delivery-policy';
import { isSupportAttachmentNotReady, type CurrentAdvisor } from "@/api/support-api";
import * as ticketPolicy from '@/api/support-ticket-policy';
import { useAuth } from "@/store/auth";
import { createSessionVault } from "@/api/session-vault";
import { binarySessionReady } from "@/lib/binary-session-ready";

const chatTransport = vi.hoisted(() => ({
  authorityRevision: vi.fn(async () => "canonical-v1"), commandResult: vi.fn(async () => null),
  conversation: vi.fn(), replyConversation: vi.fn(), startConversation: vi.fn(), convertConversationToTicket: vi.fn(),
  conversationCategories: vi.fn(async () => ({ advisor: true, support: true, ai: false })),
  conversations: vi.fn(async () => ({ items: [] as ReturnType<typeof humanSnapshot>[] })), conversationDismissals: vi.fn(async () => []),
  advisor: vi.fn(async (): Promise<CurrentAdvisor> => ({ assignmentId: null, currentAdvisorId: null, currentAdvisorName: null, assignmentState: "UNBOUND", availability: "UNBOUND" })),
  attachmentPolicy: vi.fn(async () => ({ available: false })),
}));
vi.mock("@/api/runtime", () => ({ supportApi: chatTransport, remoteApiEnabled: true,
  apiClient: { request: vi.fn() }, apiRuntimeConfig: {}, novaAiApi: {} }));

const humanChatSource = readFileSync(new URL("./chat.vue", import.meta.url), "utf8").split('<script setup lang="ts">')[1].split("</script>")[0];
const humanChatScript = ts.transpileModule(humanChatSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const humanSnapshot = () => ({ id: "CV-cold", type: "support", status: "open", version: 1, lastTs: 1,
  messages: [{ id: "1", sender: "agent", text: "History", ts: 1, status: "sent" }], unread: 0,
  agentName: "Fixture", roleKey: "roleSupport", avatarTint: "blue", lastMessage: "History", sessionStatus: "active" });
function chatDeferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve };
}
const chatCleanups: Array<() => void> = [];
afterEach(() => { chatCleanups.splice(0).forEach(stop => stop()); });
function mountRealHumanChat(query: Record<string, string> = { cid: "CV-cold" }, messages = zh) {
  setActivePinia(createPinia()); vi.clearAllMocks();
  chatTransport.conversations.mockReset().mockResolvedValue({ items: [] });
  chatTransport.conversationDismissals.mockReset().mockResolvedValue([]);
  chatTransport.conversation.mockReset().mockResolvedValue(humanSnapshot());
  chatTransport.replyConversation.mockReset().mockResolvedValue(humanSnapshot());
  chatTransport.startConversation.mockReset().mockResolvedValue(humanSnapshot());
  chatTransport.commandResult.mockReset().mockResolvedValue(null);
  chatTransport.convertConversationToTicket.mockReset().mockResolvedValue({ conversation: humanSnapshot(), ticket: { id: "TK-fixture" } });
  chatTransport.conversationCategories.mockReset().mockResolvedValue({ advisor: true, support: true, ai: false });
  chatTransport.attachmentPolicy.mockReset().mockResolvedValue({ available: false });
  const store = useConversations(); store.bindAccount("user:1");
  const watchRealtime = vi.spyOn(store, "watchRealtime");
  const app = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1, visibleDevices: [], earnings: { today: 0 } });
  const auth = useAuth(), sessionVault = createSessionVault();
  function bindSession(key: string) {
    auth.$patch({ isAuthenticated: true, accountId: key });
    sessionVault.save({ accessToken: "test-access", refreshToken: "test-refresh", tokenType: "Bearer",
      user: { userId: Number(key.slice(5)), countryCode: "+86", phone: "13800000001", nickname: "Test", onboardingComplete: true } });
  }
  bindSession(app.accountKey);
  const hooks: Record<string, (...args: any[]) => any> = {};
  const navigation = { navTo: vi.fn(), navBack: vi.fn(), navReplace: vi.fn(async () => true) };
  const toast = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const sendBudgets = chatLimiter.createConversationSendBudgets();
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onUnmounted: (fn: () => void) => { hooks.unmount = fn; } },
    "@dcloudio/uni-app": Object.fromEntries(["onLoad", "onUnload", "onShow", "onHide"].map(name => [name, (fn: () => void) => { hooks[name] = fn; }])),
    "@/i18n/use-t": { useT: () => Vue.ref(messages) }, "@/i18n/format": chatFormat,
    "@/lib/support-idle-message": { localizedIdleClose },
    "@/lib/brand-copy": { catalogSkuBrandText, catalogSkuRecommendationBody },
    "@/lib/nova-visibility": { NOVA_SUPPORT_VISIBLE: false },
    "@/lib/route": navigation, "@/lib/send-limiter": { ...chatLimiter, conversationSendLimiter: sendBudgets },
    '@/lib/message-length-policy': messagePolicy,
    "@/lib/device-preview": { h5DevicePreviewStatusBarHeight: () => 0 }, "@/lib/hashpower": { isDeviceOnline: () => false },
    "@/store/conversations": { useConversations: () => store }, "@/store/nova": { useNova }, "@/store/app": { useApp: () => app },
    "@/store/auth": { useAuth: () => auth }, "@/lib/binary-session-ready": { binarySessionReady },
    "@/store/ui": { toast, confirm: vi.fn(), useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/mock/nova-templates": {}, "@/api/runtime": { novaAiApi: {}, remoteApiEnabled: true, sessionVault, supportApi: chatTransport },
    "@/api/errors": chatApiErrors,
    '@/lib/conversation-delivery-policy': deliveryPolicy,
    "@/api/support-api": { isSupportAttachmentNotReady },
    '@/api/support-ticket-policy': ticketPolicy,
    "@/lib/nova-failure": chatFailure, "@/store/locale": { useLocaleStore: () => ({ code: "zh" }) },
    "@/lib/secure-command-id": chatSecure, "@/lib/nova-thinking": chatThinking, "./conversation-realtime-page": chatRealtime,
  };
  const scope = Vue.effectScope();
  const page = scope.run(() => new Function("require", "exports", humanChatScript + ";return { onSend, onRestart, goBack, cleanup, loadAttachmentPolicy, attachmentPolicy, attachmentPolicyError, loadEarlierHumanHistory, conversationThread, humanEarlierBusy, ticketCreationBlock, ticketCreationBlockText, headerName, headerRole, emptyHint, humanType, isClosedSession, waitingForAgent, showUnassignedReceived, humanHistoryError, humanHistoryListError, retryHumanHistory, conv, threadMessages, retryHumanSend, sendSuccessRevision, sendSuccessOwner, cid, startType, draftText, failedHumanSend, failedHumanLabel, humanSendBusy, supportSessionReady, localHumanSend, measureTopOverlay, topOverlayHeight, get entranceScope() { return { isAi, novaHistoryLoading, humanOpenRequest, humanHistoryRetryBusy, humanEarlierBusy }; } };")((name: string) => {
    if (name.endsWith(".vue")) return {}; if (!(name in modules)) throw new Error(`Unexpected chat dependency: ${name}`); return modules[name];
  }, {}));
  hooks.onLoad(query); chatCleanups.push(() => { page.cleanup(); scope.stop(); });
  function rebind(key = app.accountKey) { bindSession(key); store.bindAccount(key); app.accountKey = key; app.accountBindingEpoch += 1; }
  const waitForHistory = () => vi.waitFor(() => expect(watchRealtime).toHaveBeenLastCalledWith(query.cid?.trim()));
  async function show() {
    await hooks.onShow(); await Vue.nextTick();
    // onShow now schedules the real post-flush watcher; observe its result.
    if (query.cid?.trim()) await waitForHistory();
    else if (page.startType.value) await vi.waitFor(() => expect(store.categoryAvailabilityStatus).toBe("ready"));
  }
  return { page, hooks, show, waitForHistory, store, app, navigation, rebind, watchRealtime, toast, sendBudgets };
}

describe('human chat route admission', () => {
  it.each<Record<string, string>>([{}, { cid: '' }, { cid: ' \t' }, { start: 'ai' }, { cid: '', start: 'invalid' }])(
    'redirects a route without a usable conversation or start target: %j', async query => {
      const current = mountRealHumanChat(query);
      expect(current.navigation.navReplace).toHaveBeenCalledExactlyOnceWith('/pages/support/messages');
      expect(current.page.cid.value).toBe(''); expect(current.page.startType.value).toBeNull();
      await current.show();
      expect(chatTransport.conversation).not.toHaveBeenCalled();
      expect(chatTransport.startConversation).not.toHaveBeenCalled();
      expect(chatTransport.replyConversation).not.toHaveBeenCalled();
    },
  );

  it.each(['pending', 'failed'])('preserves the draft and send budget while targetless navigation is %s', async outcome => {
    const current = mountRealHumanChat({}); await current.show();
    current.navigation.navReplace.mockImplementation(() => outcome === 'pending' ? new Promise<boolean>(() => {}) : Promise.resolve(false));
    const limiter = current.sendBudgets(current.app.accountKey, 'start:null');
    const acquire = vi.spyOn(limiter, 'tryAcquire'), restore = vi.fn(), settled = vi.fn();
    await current.page.onSend('Keep this draft', restore, settled);
    await current.page.onSend('Keep this draft', restore, settled);
    expect(restore).toHaveBeenCalledTimes(2);
    expect(settled.mock.calls).toEqual([[false], [false]]);
    expect(acquire).not.toHaveBeenCalled(); expect(limiter.peek().ok).toBe(true);
    const failed = { text: 'Original retry', settled: true, retryable: true, kind: 'failed', attempts: 1 };
    current.page.failedHumanSend.value = failed;
    await current.page.retryHumanSend();
    expect(current.page.failedHumanSend.value).toEqual(failed);
    expect(acquire).not.toHaveBeenCalled();
    expect(current.page.localHumanSend.value).toBeNull();
    expect(current.toast.warn).not.toHaveBeenCalled();
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
    expect(chatTransport.replyConversation).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'support'], ['', 'advisor'], [' \t', 'support'], [' \t', 'advisor'],
  ])('accepts empty cid %j with valid start %s and creates on the first send', async (cid, start) => {
    const current = mountRealHumanChat({ cid, start });
    expect(current.page.cid.value).toBe(''); expect(current.page.startType.value).toBe(start);
    expect(current.navigation.navReplace).not.toHaveBeenCalled();
    await current.show();
    const limiter = current.sendBudgets(current.app.accountKey, `start:${start}`);
    const acquire = vi.spyOn(limiter, 'tryAcquire'), restore = vi.fn(), settled = vi.fn();
    expect(acquire).not.toHaveBeenCalled();
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
    await current.page.onSend('First opening', restore, settled);
    expect(acquire).toHaveBeenCalledOnce(); expect(restore).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledExactlyOnceWith(true);
    expect(chatTransport.startConversation).toHaveBeenCalledOnce();
    expect(chatTransport.startConversation.mock.calls[0][0]).toBe(start);
    expect(chatTransport.replyConversation).not.toHaveBeenCalled();
    expect(current.page.cid.value).toBe('CV-cold'); expect(current.page.startType.value).toBeNull();
    expect(current.navigation.navReplace).toHaveBeenCalledExactlyOnceWith('/pages/support/chat?cid=CV-cold');
  });

  it('prioritizes a trimmed conversation id over start and replies to that conversation', async () => {
    const current = mountRealHumanChat({ cid: ' CV-cold ', start: 'support' });
    expect(current.page.cid.value).toBe('CV-cold'); expect(current.page.startType.value).toBeNull();
    await current.show();
    const restore = vi.fn(); await current.page.onSend('Existing conversation', restore);
    expect(restore).not.toHaveBeenCalled();
    expect(chatTransport.replyConversation).toHaveBeenCalledOnce();
    expect(chatTransport.replyConversation.mock.calls[0][0].id).toBe('CV-cold');
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
    expect(current.navigation.navReplace).not.toHaveBeenCalled();
  });
});

describe('scrolling history controls', () => {
  const template = parse(readFileSync(new URL('./chat.vue', import.meta.url), 'utf8')).descriptor.template!.content;
  const nodes = (node: any): any[] => [node, ...(node.children ?? []).flatMap(nodes)];
  const tree = nodes(parseTemplate(template));
  const hasClass = (node: any, name: string) => node.props?.some((prop: any) => prop.type === 6 && prop.name === 'class' && prop.value?.content.split(/\s+/).includes(name));
  const thread = tree.find(node => node.tag === 'ConversationThread');
  const slot = nodes(thread).find(node => node.tag === 'template' && node.props?.some((prop: any) => prop.type === 7 && prop.name === 'slot' && prop.arg?.content === 'history-prefix'));

  it('keeps all history actions and notices in the list slot, outside the floating identity header', () => {
    const overlay = tree.find(node => hasClass(node, 'cp-top-overlay'));
    expect(nodes(overlay).filter(node => hasClass(node, 'cp-history-text-action') || hasClass(node, 'cp-history-error') || hasClass(node, 'cp-ai-history'))).toHaveLength(0);
    expect(nodes(overlay).some(node => hasClass(node, 'cp-identity'))).toBe(true);
    expect(slot).toBeDefined();
    expect(nodes(slot).filter(node => hasClass(node, 'cp-history-text-action'))).toHaveLength(4);
    expect(nodes(slot).filter(node => hasClass(node, 'cp-history-error'))).toHaveLength(2);
  });

  it.each([zh, en, vietnamese])('preserves localized disclosure and the actual loading/retry handlers in the scrolling slot', async copy => {
    const current = mountRealHumanChat({ cid: 'CV-cold' }, copy); await current.show();
    const row = current.store.get('CV-cold')!; row.historyNextCursor = 1; row.historyTruncated = true;
    const load = vi.spyOn(current.store, 'loadEarlier').mockResolvedValue(undefined);
    const refresh = vi.spyOn(current.store, 'refresh').mockResolvedValue(undefined);
    current.page.conversationThread.value = { prepareHistoryPrepend: vi.fn(async () => true) };
    const render = new Function('Vue', compileTemplate(slot.children.map((child: any) => child.loc.source).join(''), {
      mode: 'function', prefixIdentifiers: true, isCustomElement: tag => ['view', 'text'].includes(tag),
    }).code)(Vue);
    const scope = Vue.proxyRefs({ ...current.page, t: copy, advisorApplies: false, convStore: current.store,
      isAi: false, remoteApiEnabled: true, humanHistoryRetryBusy: false });
    const root = element('root'), view = renderer.createApp({ render: () => render(scope, []) });
    view.component('LiquidGlass', { render: () => null }); view.mount(root); mounted.push(view);
    const actions = () => flatten(root).filter(node => String(node.props.class).split(/\s+/).includes('cp-history-text-action'));
    const allText = () => flatten(root).map(node => node.text).join('');
    expect(allText()).toContain(copy.conversations.historyTruncated);
    expect(allText()).toContain(copy.conversations.loadEarlier);
    current.page.humanEarlierBusy.value = true; await Vue.nextTick();
    expect(actions()[0].props['aria-disabled']).toBe(true);
    await actions()[0].props.onClick(); expect(load).not.toHaveBeenCalled();
    current.page.humanEarlierBusy.value = false; await Vue.nextTick();
    await actions()[0].props.onClick(); expect(load).toHaveBeenCalledOnce();
    current.page.humanHistoryListError.value = true; await Vue.nextTick();
    expect(allText()).toContain(copy.conversations.loadError);
    expect(allText()).toContain(copy.conversations.retry);
    await actions().at(-1)!.props.onClick(); expect(refresh).toHaveBeenCalledOnce();
    expect(current.page.humanHistoryListError.value).toBe(false);
  });
});

describe('native top overlay measurement ownership', () => {
  async function measuringChat() {
    const current = mountRealHumanChat(); await current.show(); await Vue.nextTick();
    const pending: Array<(rows: unknown[]) => void> = [];
    vi.stubGlobal('uni', { createSelectorQuery: () => {
      const query: Record<string, any> = { in: () => query,
        select: (selector: string) => { expect(selector).toBe('.cp-top-overlay'); return query; },
        boundingClientRect: () => query, exec: (done: (rows: unknown[]) => void) => pending.push(done) };
      return query;
    } });
    const request = async () => {
      const count = pending.length;
      current.page.measureTopOverlay(); await Vue.nextTick(); await Vue.nextTick();
      expect(pending.length).toBeGreaterThan(count);
      return pending[pending.length - 1];
    };
    return { ...current, request, pending };
  }

  it('keeps the newer 74px top inset when the old 180px native result arrives last', async () => {
    const current = await measuringChat();
    (await current.request())([{ height: 120 }]);
    expect(current.page.topOverlayHeight.value).toBe(120);
    const older = await current.request(), newer = await current.request();
    newer([{ height: 74 }]); expect(current.page.topOverlayHeight.value).toBe(74);
    older([{ height: 180 }]); expect(current.page.topOverlayHeight.value).toBe(74);
  });

  it.each(['hide', 'return', 'dispose'] as const)('ignores an old native top inset after %s', async boundary => {
    const current = await measuringChat();
    (await current.request())([{ height: 120 }]);
    const older = await current.request();
    if (boundary === 'dispose') current.page.cleanup();
    else current.hooks.onHide();
    if (boundary === 'return') await current.show();
    older([{ height: 180 }]); await Vue.nextTick();
    expect(current.page.topOverlayHeight.value).toBe(120);
    if (boundary === 'return') {
      (await current.request())([{ height: 74 }]);
      expect(current.page.topOverlayHeight.value).toBe(74);
    } else {
      const count = current.pending.length;
      current.page.measureTopOverlay(); await Vue.nextTick();
      expect(current.pending).toHaveLength(count);
    }
  });
});

describe('attachment policy and native history read ownership', () => {
  it.each(['disabled', 'failed'] as const)('keeps the newest %s policy when an old available result arrives late', async outcome => {
    const current = mountRealHumanChat(); await current.show();
    const old = chatDeferred(); chatTransport.attachmentPolicy.mockImplementationOnce(() => old.promise);
    const first = current.page.loadAttachmentPolicy();
    if (outcome === 'failed') chatTransport.attachmentPolicy.mockRejectedValueOnce(new Error('offline'));
    else chatTransport.attachmentPolicy.mockResolvedValueOnce({ available: false });
    await current.page.loadAttachmentPolicy(); old.resolve({ available: true }); await first;
    expect(current.page.attachmentPolicy.value?.available === true).toBe(false);
    expect(current.page.attachmentPolicyError.value).toBe(outcome === 'failed');
    chatTransport.attachmentPolicy.mockResolvedValueOnce({ available: true });
    await current.page.loadAttachmentPolicy(); expect(current.page.attachmentPolicy.value.available).toBe(true);
    expect(current.page.attachmentPolicyError.value).toBe(false);
  });

  it.each(['hide', 'return', 'rebind', 'dispose'] as const)('discards an attachment policy response after %s', async boundary => {
    const current = mountRealHumanChat(); await current.show();
    const old = chatDeferred(); chatTransport.attachmentPolicy.mockImplementationOnce(() => old.promise);
    const first = current.page.loadAttachmentPolicy();
    if (boundary === 'hide' || boundary === 'return') current.hooks.onHide();
    if (boundary === 'return') { await current.show(); await Vue.nextTick(); }
    if (boundary === 'rebind') { current.rebind(); await Vue.nextTick(); }
    if (boundary === 'dispose') current.page.cleanup();
    old.resolve({ available: true }); await first;
    expect(current.page.attachmentPolicy.value?.available === true).toBe(false);
  });

  it('keeps history intact when premeasurement fails and allows exactly one later retry', async () => {
    const current = mountRealHumanChat(); chatTransport.conversation.mockResolvedValue({ ...humanSnapshot(), historyNextCursor: 1 });
    await current.show();
    const loadEarlier = vi.spyOn(current.store, 'loadEarlier').mockResolvedValue(undefined);
    const prepare = vi.fn(async () => false); current.page.conversationThread.value = { prepareHistoryPrepend: prepare };
    await current.page.loadEarlierHumanHistory(); expect(loadEarlier).not.toHaveBeenCalled();
    expect(current.page.humanEarlierBusy.value).toBe(false); expect(current.toast.warn).toHaveBeenCalled();
    const measurement = chatDeferred(); prepare.mockImplementationOnce(() => measurement.promise);
    const retry = current.page.loadEarlierHumanHistory(); await current.page.loadEarlierHumanHistory();
    expect(prepare).toHaveBeenCalledTimes(2); expect(loadEarlier).not.toHaveBeenCalled();
    measurement.resolve(true); await retry; expect(loadEarlier).toHaveBeenCalledTimes(1);
  });
});

describe("human chat assignment belongs to the current conversation", () => {
  it.each(["warm", "cold", "reload"])("keeps %s closed support history independent of the account advisor", async entry => {
    const current = mountRealHumanChat();
    const history = { ...humanSnapshot(), status: "closed", sessionStatus: "closed", agentName: "待分配",
      messages: [{ id: "1", sender: "user", text: "Existing public history", ts: 1, status: "read" }] };
    chatTransport.conversation.mockResolvedValue(history);
    if (entry === "warm") current.store.conversations.push(history as any);
    await current.show();
    if (entry === "reload") {
      current.rebind(); await Vue.nextTick();
      await vi.waitFor(() => expect(chatTransport.conversation).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(current.store.get("CV-cold")?.status).toBe("closed"));
    }
    expect(readFileSync(new URL("./chat.vue", import.meta.url), "utf8")).toContain('v-if="showUnassignedReceived"');
    for (const advisor of [
      { assignmentState: "UNBOUND", availability: "UNBOUND", currentAdvisorName: null },
      { assignmentState: "ADVISOR_DISABLED", availability: "BUSY", currentAdvisorName: "Current account advisor" },
    ]) {
      current.store.advisor = advisor as any;
      current.store.advisorError = true; current.store.advisorLoading = true;
      expect(current.page.headerName.value).toBe(zh.conversations.unassignedAgent);
      expect(current.page.headerRole.value).toBe(zh.conversations.waitingAgent);
      expect(current.page.isClosedSession.value).toBe(false);
      expect(current.page.showUnassignedReceived.value).toBe(true);
    }
    current.page.goBack();
    expect(current.navigation.navBack).toHaveBeenCalledExactlyOnceWith("/pages/support/messages");
    await current.page.onSend("Continue original closed conversation", vi.fn());
    expect(current.navigation.navTo).not.toHaveBeenCalled();
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
    expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
    expect(chatTransport.replyConversation.mock.calls[0]![0]).toMatchObject({ id: "CV-cold", status: "closed" });
  });

  it("does not borrow an assigned advisor while a cold conversation is unknown", async () => {
    const current = mountRealHumanChat(), read = chatDeferred();
    const advisor: CurrentAdvisor = { assignmentId: 1, currentAdvisorId: 1, currentAdvisorName: "Account advisor",
      assignmentState: "ASSIGNED", availability: "BUSY" };
    current.store.advisor = advisor as any;
    chatTransport.advisor.mockResolvedValueOnce(advisor);
    chatTransport.conversation.mockReturnValueOnce(read.promise);
    const showing = current.hooks.onShow();
    await vi.waitFor(() => expect(chatTransport.conversation).toHaveBeenCalledTimes(1));
    expect(current.page.humanType.value).toBeNull();
    expect(current.page.headerName.value).toBe("");
    expect(current.page.showUnassignedReceived.value).toBe(false);
    current.store.advisorLoading = true; current.store.advisorError = true;
    expect(current.page.headerName.value).toBe("");
    expect(current.page.headerRole.value).toBe("");
    read.resolve(humanSnapshot()); await showing; await current.waitForHistory();
    expect(current.page.headerName.value).toBe("Fixture");
  });

  it("uses an active support thread's own agent and presence despite account advisor state", async () => {
    const current = mountRealHumanChat(); await current.show();
    current.store.advisor = { assignmentState: "UNBOUND", availability: "UNBOUND", currentAdvisorName: null } as any;
    current.store.advisorError = true; current.store.realtimeReady = true;
    current.store.onlineIds = { "CV-cold": true };
    expect(current.page.headerName.value).toBe("Fixture");
    expect(current.page.headerRole.value).toBe(zh.conversations.online);
    expect(current.page.waitingForAgent.value).toBe(false);
    expect(current.page.showUnassignedReceived.value).toBe(false);
    current.store.get("CV-cold")!.agentName = "待分配";
    expect(current.page.headerRole.value).toBe(zh.conversations.waitingAgent);
    expect(current.page.waitingForAgent.value).toBe(true);
  });

  it.each(["advisor", "support"])("preserves the existing %s new-composer advisor waiting state", async type => {
    const current = mountRealHumanChat({ start: type }); await current.show();
    current.store.advisor = { assignmentState: "UNBOUND", availability: "UNBOUND", currentAdvisorName: null } as any;
    expect(current.page.headerName.value).toBe(zh.conversations.image.unassigned);
    expect(current.page.headerRole.value).toBe(zh.conversations.waitingAgent);
    expect(current.page.emptyHint.value).toBe(zh.conversations.image.unassignedHint);
    expect(current.page.isClosedSession.value).toBe(false);
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
    expect(chatTransport.replyConversation).not.toHaveBeenCalled();
  });

  it("retains the exact conversation owner and derives waiting only from that replyable history", async () => {
    const current = mountRealHumanChat();
    chatTransport.conversation.mockResolvedValue({ ...humanSnapshot(), type: "advisor", roleKey: "roleAdvisor",
      messages: [{ id: "1", sender: "user", text: "Existing public history", ts: 1, status: "read" }] });
    await current.show();
    current.store.advisor = { assignmentState: "UNBOUND", availability: "UNBOUND", currentAdvisorName: null } as any;
    expect(current.page.headerName.value).toBe("Fixture");
    expect(current.page.showUnassignedReceived.value).toBe(false);
    current.store.get("CV-cold")!.agentName = "Unassigned";
    expect(current.page.headerName.value).toBe(zh.conversations.unassignedAgent);
    expect(current.page.showUnassignedReceived.value).toBe(true);
    current.store.get("CV-cold")!.agentName = "Fixture";
    current.store.get("CV-cold")!.status = "closed";
    expect(current.page.headerName.value).toBe("Fixture");
    expect(current.page.headerRole.value).toBe(zh.conversations.connecting);
    expect(current.page.showUnassignedReceived.value).toBe(false);
  });
});

describe("real chat and store account recovery", () => {
  it("retains a cold list failure after the current thread opens, then retries the missing history", async () => {
    const current = mountRealHumanChat();
    chatTransport.conversations.mockRejectedValueOnce(new Error("list offline"));
    await current.show(); await Vue.nextTick();
    expect(current.store.get("CV-cold")).toBeDefined();
    expect(current.page.humanHistoryListError.value).toBe(true);
    expect(current.page.humanHistoryError.value).toBe(false);
    expect(current.navigation.navBack).not.toHaveBeenCalled();
    const old = { ...humanSnapshot(), id: "CV-old", lastTs: 0, lastPublicMessageId: 2,
      messages: [{ id: "2", sender: "agent", text: "Older retained history", ts: 0, status: "sent" }] };
    chatTransport.conversations.mockResolvedValue({ items: [humanSnapshot(), { ...old, messages: [] }] });
    chatTransport.conversation.mockImplementation(async id => id === old.id ? old : humanSnapshot());
    await current.page.retryHumanHistory();
    await vi.waitFor(() => expect(current.page.conv.value.messages.map((row: any) => row.text))
      .toEqual(["Older retained history", "History"]));
    expect(current.page.humanHistoryListError.value).toBe(false);
    expect(current.page.humanHistoryError.value).toBe(false);
    expect(chatTransport.conversations).toHaveBeenCalledTimes(2);
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
  });

  it("hydrates a new reply in another historical segment without reopening the fixed window", async () => {
    const current = mountRealHumanChat();
    let old = { ...humanSnapshot(), id: "CV-old", lastTs: 0, lastPublicMessageId: 2,
      messages: [{ id: "2", sender: "agent", text: "Older retained history", ts: 0, status: "sent" }] };
    chatTransport.conversations.mockImplementation(async () => ({ items: [humanSnapshot(), { ...old, messages: [] }] }));
    chatTransport.conversation.mockImplementation(async id => id === old.id ? old : humanSnapshot());
    await current.show();
    await vi.waitFor(() => expect(current.page.conv.value.messages).toHaveLength(2));
    old = { ...old, version: 2, lastTs: 3, lastPublicMessageId: 3,
      messages: [...old.messages, { id: "3", sender: "agent", text: "Live historical reply", ts: 3, status: "sent" }] };
    await current.store.refresh();
    await vi.waitFor(() => expect(current.page.conv.value.messages.map((row: any) => row.text))
      .toEqual(["Older retained history", "History", "Live historical reply"]));
    expect(current.page.conv.value.id).toBe("CV-cold");
    expect(current.navigation.navTo).not.toHaveBeenCalled();
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
  });

  it.each([zh, en, vietnamese])("retires ticket conversion while keeping human replies usable", async messages => {
    const current = mountRealHumanChat({ cid: "CV-cold" }, messages); await current.show();
    const fullSource = readFileSync(new URL("./chat.vue", import.meta.url), "utf8");
    expect(fullSource).not.toContain("onConvertToTicket");
    expect(fullSource).not.toContain("convStore.convertToTicket(");
    expect(fullSource).not.toContain("/pages/me/support-tickets");
    await current.page.onSend("Continue the conversation", vi.fn());
    expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
    expect(chatTransport.convertConversationToTicket).not.toHaveBeenCalled();
    expect(current.navigation.navTo).not.toHaveBeenCalled();
  });
  it("redirects an old AI link before opening a category or sending a request", async () => {
    const current = mountRealHumanChat({ type: "ai" });
    expect(current.navigation.navReplace).toHaveBeenCalledExactlyOnceWith("/pages/support/messages");
    await current.show();
    expect(chatTransport.conversationCategories).not.toHaveBeenCalled();
  });
  it.each(["failed", "disabled"])("does not navigate a hidden page after a delayed %s category read", async outcome => {
    const current = mountRealHumanChat({ start: "support" });
    let resolve!: (value: any) => void, reject!: (error: Error) => void;
    chatTransport.conversationCategories.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
    const showing = current.hooks.onShow();
    await vi.waitFor(() => expect(chatTransport.conversationCategories).toHaveBeenCalledTimes(1));
    current.hooks.onHide();
    if (outcome === "failed") reject(new Error("unavailable"));
    else resolve({ advisor: true, support: false, ai: false });
    await showing;
    expect(current.navigation.navBack).not.toHaveBeenCalled(); expect(current.toast.info).not.toHaveBeenCalled();
    await current.show();
    expect(chatTransport.conversationCategories).toHaveBeenCalledTimes(2);
    expect(current.navigation.navBack).not.toHaveBeenCalled();
  });
  it.each(["reply failure", "reply success"])("does not let an old %s interrupt the new account history read", async operation => {
    const current = mountRealHumanChat(); await current.show();
    let resolve!: (value: any) => void, reject!: (error: Error) => void;
    const old = new Promise((done, fail) => { resolve = done; reject = fail; });
    const transport = chatTransport.replyConversation;
    transport.mockReturnValueOnce(old);
    const pending = current.page.onSend("Old account request", vi.fn());
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    const history = chatDeferred(); chatTransport.conversation.mockReturnValueOnce(history.promise);
    current.rebind(); await Vue.nextTick();
    await vi.waitFor(() => expect(chatTransport.conversation).toHaveBeenCalledTimes(2));
    if (operation.endsWith("success")) resolve(humanSnapshot());
    else reject(new Error("old transport failure"));
    await pending;
    const reads = chatTransport.conversation.mock.calls.length;
    history.resolve(humanSnapshot()); await vi.waitFor(() => expect(current.store.get("CV-cold")).toBeDefined());
    expect(reads).toBe(2); expect(current.navigation.navBack).not.toHaveBeenCalled();
    expect(current.navigation.navTo).not.toHaveBeenCalled(); expect(current.toast.error).not.toHaveBeenCalled();
  });
  it("does not refresh the new account inbox after an old create fails", async () => {
    const current = mountRealHumanChat({ start: "support" }); await current.show();
    let reject!: (error: Error) => void;
    chatTransport.startConversation.mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; }));
    const pending = current.page.onSend("Old new conversation", vi.fn());
    await vi.waitFor(() => expect(chatTransport.startConversation).toHaveBeenCalledTimes(1));
    current.rebind(); await Vue.nextTick();
    const revisionReads = chatTransport.authorityRevision.mock.calls.length;
    reject(new Error("old create failure")); await pending;
    expect(chatTransport.authorityRevision).toHaveBeenCalledTimes(revisionReads);
    expect(chatTransport.conversations).not.toHaveBeenCalled(); expect(current.toast.error).not.toHaveBeenCalled();
  });
  it.each(["same account", "A to B to A"])("recovers a new-conversation entry after %s rebinding overtakes its category read", async scenario => {
    const current = mountRealHumanChat({ start: "support" }), old = chatDeferred();
    chatTransport.conversationCategories.mockReturnValueOnce(old.promise);
    const showing = current.hooks.onShow();
    await vi.waitFor(() => expect(chatTransport.conversationCategories).toHaveBeenCalledTimes(1));
    current.rebind(scenario === "same account" ? "user:1" : "user:2"); await Vue.nextTick();
    if (scenario !== "same account") { current.rebind("user:1"); await Vue.nextTick(); }
    const restore = vi.fn(); await current.page.onSend("New request", restore);
    old.resolve({ advisor: true, support: true, ai: false }); await showing;
    expect(chatTransport.startConversation).toHaveBeenCalledTimes(1); expect(restore).not.toHaveBeenCalled();
    expect(current.navigation.navBack).not.toHaveBeenCalled();
  });
  it("retries a failed new-entry category read after rebinding without consuming the send limiter", async () => {
    const current = mountRealHumanChat({ start: "support" }); await current.show();
    chatTransport.conversationCategories.mockRejectedValue(new Error("503"));
    current.rebind(); await Vue.nextTick();
    await vi.waitFor(() => expect(current.store.categoryAvailabilityStatus).toBe("failed"));
    const restore = vi.fn(); await current.page.onSend("New request", restore);
    expect(restore).toHaveBeenCalledTimes(1); expect(chatTransport.startConversation).not.toHaveBeenCalled();
    chatTransport.conversationCategories.mockResolvedValue({ advisor: true, support: true, ai: false });
    await current.page.onSend("New request", restore); expect(chatTransport.startConversation).toHaveBeenCalledTimes(1);
  });
  it("keeps a rebound new-entry draft when PC confirms that category disabled", async () => {
    const current = mountRealHumanChat({ start: "support" }); await current.show();
    chatTransport.conversationCategories.mockResolvedValue({ advisor: false, support: true, ai: false });
    current.rebind(); await Vue.nextTick();
    await vi.waitFor(() => expect(current.store.categoryEnabled("support")).toBe(false));
    const restore = vi.fn(); await current.page.onSend("New request", restore);
    expect(restore).toHaveBeenCalledTimes(1); expect(chatTransport.startConversation).not.toHaveBeenCalled();
  });
  it("preserves a draft during initial history loading without superseding onShow", async () => {
    const current = mountRealHumanChat(), gate = chatDeferred(); chatTransport.conversation.mockReturnValueOnce(gate.promise);
    const showing = current.hooks.onShow(); await vi.waitFor(() => expect(chatTransport.conversation).toHaveBeenCalledTimes(1));
    const restore = vi.fn(); await current.page.onSend("Hello", restore);
    expect(restore).toHaveBeenCalledTimes(1); expect(chatTransport.replyConversation).not.toHaveBeenCalled();
    gate.resolve(humanSnapshot()); await showing; await current.waitForHistory(); await current.page.onSend("Hello", restore);
    expect(chatTransport.conversation).toHaveBeenCalledTimes(1); expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
    expect(current.navigation.navBack).not.toHaveBeenCalled();
  });
  it("reloads a visible human conversation and can reply after same-account rebinding", async () => {
    const current = mountRealHumanChat(); await current.show(); current.rebind(); await Vue.nextTick();
    await vi.waitFor(() => expect(current.store.get("CV-cold")).toBeDefined());
    await current.waitForHistory();
    await current.page.onSend("Hello", vi.fn()); expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
    expect(chatTransport.conversation).toHaveBeenCalledTimes(2); expect(current.navigation.navBack).not.toHaveBeenCalled();
  });
  it("ignores an overtaken account response when A to B to A reopens the same route", async () => {
    const current = mountRealHumanChat(); await current.show(); const old = chatDeferred();
    chatTransport.conversation.mockReturnValueOnce(old.promise); current.rebind("user:2"); await Vue.nextTick();
    await vi.waitFor(() => expect(chatTransport.conversation).toHaveBeenCalledTimes(2));
    current.rebind("user:1"); await Vue.nextTick(); await vi.waitFor(() => expect(current.store.get("CV-cold")).toBeDefined());
    await current.waitForHistory();
    const watchCount = current.watchRealtime.mock.calls.length;
    old.resolve({ ...humanSnapshot(), agentName: "Old account" }); await Vue.nextTick(); await Vue.nextTick();
    expect(current.store.get("CV-cold")?.agentName).toBe("Fixture"); expect(current.navigation.navBack).not.toHaveBeenCalled();
    expect(current.watchRealtime).toHaveBeenCalledTimes(watchCount);
    await current.page.onSend("Hello", vi.fn()); expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
  });
  it("does not reload hidden human pages until they are shown again", async () => {
    const current = mountRealHumanChat(); await current.show(); current.hooks.onHide(); current.rebind(); await Vue.nextTick();
    expect(chatTransport.conversation).toHaveBeenCalledTimes(1); await current.show();
    expect(chatTransport.conversation).toHaveBeenCalledTimes(2); expect(current.store.get("CV-cold")).toBeDefined();
  });
  it("cannot let the initial old-account read navigate away after a same-account rebind", async () => {
    const current = mountRealHumanChat(), old = chatDeferred(); chatTransport.conversation.mockReturnValueOnce(old.promise);
    const showing = current.hooks.onShow(); await vi.waitFor(() => expect(chatTransport.conversation).toHaveBeenCalledTimes(1));
    current.rebind(); await Vue.nextTick(); await vi.waitFor(() => expect(current.store.get("CV-cold")).toBeDefined());
    old.resolve(humanSnapshot()); await showing; await current.waitForHistory(); expect(current.navigation.navBack).not.toHaveBeenCalled();
    await current.page.onSend("Hello", vi.fn()); expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
  });
  it("keeps replying after rebinding independent of the new-entry category read", async () => {
    const current = mountRealHumanChat(); await current.show(); current.rebind(); await Vue.nextTick();
    await vi.waitFor(() => expect(current.store.get("CV-cold")).toBeDefined());
    await current.waitForHistory();
    chatTransport.conversationCategories.mockRejectedValueOnce(new Error("category unavailable"));
    const restore = vi.fn(); await current.page.onSend("Hello", restore);
    expect(restore).not.toHaveBeenCalled(); expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
    expect(chatTransport.conversationCategories).not.toHaveBeenCalled();
    expect(current.navigation.navBack).not.toHaveBeenCalled();
  });
  it("does not restore an old reply draft into a newly bound account", async () => {
    const current = mountRealHumanChat(); await current.show();
    let reject!: (error: Error) => void;
    chatTransport.replyConversation.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const restore = vi.fn(), pending = current.page.onSend("Old reply", restore);
    await vi.waitFor(() => expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1));
    current.rebind(); await Vue.nextTick(); reject(new Error("old reply failure")); await pending;
    expect(restore).not.toHaveBeenCalled();
  });
});

const composerSource = readFileSync(new URL("../../components/support/conversation-thread.vue", import.meta.url), "utf8");
const composerDescriptor = parse(composerSource).descriptor;
const composerCompiled = compileScript(composerDescriptor, { id: "human-composer", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text", "input", "textarea", "scroll-view"].includes(tag) } } });
const composerScript = ts.transpileModule(composerCompiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
// Read the production template expression, then feed its value to the actual
// child SFC. This includes the draft-owning component, unlike script-only tests.
const composerBindingSource = readFileSync(new URL("./chat.vue", import.meta.url), "utf8").match(/:composer-key="([^"]+)"/)![1];
const humanComposerBinding = new Function("app", "cid", "startType", "isAi", "nova", "convStore", `return ${composerBindingSource};`);
const entranceBindingSource = readFileSync(new URL('./chat.vue', import.meta.url), 'utf8').match(/:entrance-ready="([^"]+)"/)![1];
const entranceKeys = ['isAi', 'novaHistoryLoading', 'humanOpenRequest', 'humanHistoryRetryBusy', 'humanEarlierBusy'];
const humanEntranceBinding = new Function(...entranceKeys, `return ${entranceBindingSource};`);
function humanThreadComponent(state: unknown, audio?: ReturnType<typeof conversationAudio.createConversationAudio>) {
  return new Function('require', 'exports', composerScript + ';return exports.default;')((name: string) => {
    if (name === 'vue') return { ...Vue, onMounted: vi.fn() };
    if (name === '@/composables/use-dialog-a11y') return { useDialogA11y: vi.fn() };
    if (name === '@/composables/use-tab-page-lifecycle') return { onShow: vi.fn(), onHide: vi.fn() };
    if (name === '@/store/app') return { useApp: () => state };
    if (name === './conversation-entrance') return conversationEntrance;
    if (name === './conversation-scroll') return conversationScroll;
    if (name === './conversation-time') return conversationTime;
    if (name === './conversation-bubble-layout') return conversationBubbleLayout;
    if (name === '@/store/preferences') return { usePreferences: () => ({ soundEnabled: false }) };
    if (name === '@/lib/conversation-audio') return audio ? { createConversationAudio: () => audio } : conversationAudio;
    if (name === './message-status-icon.vue') return { default: { render: () => null } };
    if (name === '@/components/liquid-glass.vue') return { default: { render: () => null } };
    throw new Error(`Unexpected composer dependency: ${name}`);
  }, {});
}

describe('human history readiness reaches the rendered conversation thread', () => {
  it.each(['agent', 'user'] as const)('animates the first live %s message after async history without another parent interaction', async sender => {
    const current = mountRealHumanChat(), gate = chatDeferred();
    chatTransport.conversation.mockReturnValueOnce(gate.promise);
    const thread = humanThreadComponent(current.app), root = element('root');
    let renderedReady: boolean | undefined;
    const view = renderer.createApp({ render: () => {
      renderedReady = humanEntranceBinding(...entranceKeys.map(key => Vue.unref(current.page.entranceScope[key])));
      return Vue.h(thread, { messages: current.page.threadMessages.value, entranceReady: renderedReady,
        composerKey: 'CV-cold', inputPlaceholder: 'Message', inputLabel: 'Message', sendLabel: 'Send' });
    } });
    view.component('scroll-view', { setup: (_props: unknown, { slots }: any) => () => Vue.h('scroll-view', slots.default?.()) });
    view.mount(root); mounted.push(view);
    await current.hooks.onShow();
    await vi.waitFor(() => expect(chatTransport.conversation).toHaveBeenCalledTimes(1));
    expect(renderedReady).toBe(false);
    gate.resolve(humanSnapshot()); await current.waitForHistory(); await Vue.nextTick(); await Vue.nextTick();
    expect(renderedReady).toBe(true);
    expect(flatten(root).filter(node => /nx-conv-enter-(left|right)/.test(String(node.props.class)))).toHaveLength(0);
    current.store.get('CV-cold')!.messages.push({ id: 'live-first', sender, text: 'First live message', ts: 2, status: 'sent' });
    await Vue.nextTick(); await Vue.nextTick();
    const direction = sender === 'user' ? 'right' : 'left';
    expect(flatten(root).filter(node => String(node.props.class).includes('nx-conv-enter-' + direction))).toHaveLength(1);
  });
});
describe("rendered human composer account boundary", () => {
  it.each(["existing same account", "existing A to B to A", "new same account", "new A to B to A"])("clears an unsent private draft across %s rebinding", async scenario => {
    const state = Vue.reactive({ accountKey: "account-a", accountBindingEpoch: 1 });
    const thread = new Function("require", "exports", composerScript + ";return exports.default;")((name: string) => {
      if (name === "vue") return { ...Vue, onMounted: vi.fn() };
      if (name === "@/composables/use-dialog-a11y") return { useDialogA11y: vi.fn() };
      if (name === "@/composables/use-tab-page-lifecycle") return { onShow: vi.fn(), onHide: vi.fn() };
      if (name === "@/store/app") return { useApp: () => state };
      if (name === "./conversation-entrance") return conversationEntrance;
      if (name === "./conversation-scroll") return conversationScroll;
      if (name === "./conversation-time") return conversationTime;
      if (name === './conversation-bubble-layout') return conversationBubbleLayout;
      if (name === "@/store/preferences") return { usePreferences: () => ({ soundEnabled: false }) };
      if (name === "@/lib/conversation-audio") return conversationAudio;
      if (name === './message-status-icon.vue') return { default: { render: () => null } };
      if (name === "@/components/liquid-glass.vue") return { default: { render: () => null } };
      throw new Error(`Unexpected composer dependency: ${name}`);
    }, {});
    const empty: unknown[] = [], root = element("root");
    const app = renderer.createApp({ render: () => Vue.h(thread, { messages: empty, inputPlaceholder: "Message", inputLabel: "Message", sendLabel: "Send",
      composerKey: humanComposerBinding(state, scenario.startsWith("existing") ? "CV-same" : "", scenario.startsWith("new") ? "support" : null, false, {}, { scopeInvalidated: 0 }) }) });
    app.component("scroll-view", { setup: (_props: unknown, { slots }: any) => () => Vue.h("scroll-view", slots.default?.()) });
    app.mount(root); mounted.push(app);
    const input = () => flatten(root).find(node => node.tag === "textarea")!;
    input().props.onInput({ detail: { value: "Private draft for account A" } }); await Vue.nextTick();
    expect(input().props.value).toBe("Private draft for account A");
    if (scenario.includes("A to B")) state.accountKey = "account-b";
    state.accountBindingEpoch += 1; await Vue.nextTick();
    expect(input().props.value).toBe("");
    if (scenario.includes("A to B")) {
      state.accountKey = "account-a"; state.accountBindingEpoch += 1; await Vue.nextTick(); expect(input().props.value).toBe("");
    }
  });
});

// Bind the delivery-related props from the production parent template, so a
// missing revision/retry binding cannot be hidden by a test-only parent.
const parentTemplate = readFileSync(new URL('./chat.vue', import.meta.url), 'utf8');
const deliveryBindings = [
  ['composerKey', 'composer-key'], ['sendSuccessRevision', 'send-success-revision'], ['sendSuccessOwner', 'send-success-owner'], ['initialDraft', 'initial-draft'],
  ['failedSendLabel', 'failed-send-label'], ['canDiscardSend', 'can-discard-send'], ['canRetrySend', 'can-retry-send'], ['sendBlocked', 'send-blocked'],
].map(([prop, attribute]) => `${prop}: (${parentTemplate.match(new RegExp(`:${attribute}="([^"]+)"`))![1]})`);
const bindDeliveryProps = new Function('scope', `const {app,cid,startType,isAi,nova,convStore,sendSuccessRevision,sendSuccessOwner,
  draftText,failedHumanLabel,failedHumanSend,humanSendBusy,supportSessionReady} = scope; return {${deliveryBindings.join(',')}};`);
const retryHandler = parentTemplate.match(/@retry-message="([^"]+)"/)![1];
function renderHumanDelivery(current: ReturnType<typeof mountRealHumanChat>) {
  const sound = { unlock: vi.fn(), play: vi.fn(), stop: vi.fn(), destroy: vi.fn() };
  const thread = humanThreadComponent(current.app, sound), root = element('root');
  const scope = Vue.proxyRefs({ ...current.page, app: current.app, convStore: current.store, isAi: false, nova: useNova() });
  const view = renderer.createApp({ render: () => Vue.h(thread, {
    ...bindDeliveryProps(scope), messages: current.page.threadMessages.value,
    entranceReady: humanEntranceBinding(...entranceKeys.map(key => Vue.unref(current.page.entranceScope[key]))),
    inputPlaceholder: 'Message', inputLabel: 'Message', sendLabel: 'Send', imageLabels: zh.conversations.image,
    statusLabels: zh.conversations.delivery, onSend: current.page.onSend, onRetryMessage: current.page[retryHandler],
    onDraftChange: (value: string) => { current.page.draftText.value = value; },
  }) });
  view.component('scroll-view', { setup: (_props: unknown, { slots }: any) => () => Vue.h('scroll-view', slots.default?.()) });
  view.mount(root); mounted.push(view);
  const byClass = (name: string) => flatten(root).filter(node => String(node.props.class).split(/\s+/).includes(name));
  return { sound, byClass, async send(text: string) {
    byClass('nx-conv-input')[0].props.onInput({ detail: { value: text } }); await Vue.nextTick();
    byClass('nx-conv-send')[0].props.onClick(); await vi.advanceTimersByTimeAsync(0);
  } };
}
function deliveredSnapshot(text: string) {
  return { ...humanSnapshot(), version: 2, lastTs: 2, lastMessage: text,
    messages: [...humanSnapshot().messages, { id: '2', sender: 'user', text, ts: 2, status: 'sent' }] };
}

describe('rendered human delivery and success revisions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  const deliveryFailures: Array<[string, chatApiErrors.ApiError, 'failed' | 'unknown']> = [
    ['business refusal', new chatApiErrors.ApiError({ kind: 'business', code: 10001, message: 'refused' }), 'failed'],
    ['HTTP refusal', new chatApiErrors.ApiError({ kind: 'http', status: 403, message: 'refused' }), 'failed'],
    ['network', new chatApiErrors.ApiError({ kind: 'network', message: 'lost response' }), 'unknown'],
    ...[408, 409, 425, 429, 503].map((code): [string, chatApiErrors.ApiError, 'unknown'] =>
      [`WS ${code}`, new chatApiErrors.ApiError({ kind: 'business', code, message: 'uncertain ACK' }), 'unknown']),
  ];
  it.each(deliveryFailures)('keeps the original bubble/request through %s and icon retry, sounding only on success', async (_label, cause, status) => {
    const current = mountRealHumanChat(); await current.show(); const view = renderHumanDelivery(current);
    let fail!: (cause: unknown) => void;
    chatTransport.replyConversation.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const text = 'Keep this original request'; await view.send(text);
    const local = { ...current.page.localHumanSend.value }, requestKey = chatTransport.replyConversation.mock.calls[0][2];
    expect(view.byClass('nx-conv-receipt').at(-1)!.props['data-state']).toBe('sending');
    expect(view.byClass('nx-conv-enter-right')).toHaveLength(1);
    expect(current.page.sendSuccessRevision.value).toBe(0); expect(view.sound.play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(401); fail(cause); await vi.advanceTimersByTimeAsync(0);
    expect(current.page.failedHumanSend.value).toMatchObject({ text, kind: status, settled: status === 'failed', attempts: 1 });
    expect(current.page.threadMessages.value.filter((row: any) => row.localSend)).toHaveLength(1);
    const icon = view.byClass('nx-conv-receipt').at(-1)!;
    expect(icon.props['data-state']).toBe(status); expect(icon.props.role).toBe('button');
    expect(icon.props['aria-label']).toContain(zh.conversations.delivery[status as 'failed' | 'unknown']);
    expect(view.byClass('nx-conv-recovery-actions')).toHaveLength(status === 'failed' ? 1 : 0);
    expect(view.sound.play).not.toHaveBeenCalled();
    const retried = chatDeferred(); chatTransport.replyConversation.mockReturnValueOnce(retried.promise);
    icon.props.onClick(); icon.props.onClick(); await vi.advanceTimersByTimeAsync(0);
    expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
    expect(current.page.failedHumanSend.value).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    icon.props.onClick(); icon.props.onClick(); await vi.advanceTimersByTimeAsync(0);
    expect(chatTransport.replyConversation).toHaveBeenCalledTimes(2);
    expect(current.page.failedHumanSend.value).toBeNull();
    expect(current.page.localHumanSend.value).toMatchObject({ id: local.id, timestamp: local.timestamp, text });
    expect(view.byClass('nx-conv-enter-right')).toHaveLength(0);
    expect(view.byClass('nx-conv-receipt').at(-1)!.props['data-state']).toBe('sending');
    expect(chatTransport.replyConversation.mock.calls[1][1]).toBe(text);
    if (status === 'unknown') expect(chatTransport.replyConversation.mock.calls[1][2]).toBe(requestKey);
    else expect(chatTransport.replyConversation.mock.calls[1][2]).not.toBe(requestKey);
    retried.resolve(deliveredSnapshot(text)); await vi.advanceTimersByTimeAsync(0);
    expect(current.page.sendSuccessRevision.value).toBe(1); expect(view.sound.play).toHaveBeenCalledExactlyOnceWith('send');
    expect(current.page.threadMessages.value.filter((row: any) => row.text === text)).toHaveLength(1);
    expect(current.page.threadMessages.value.some((row: any) => row.localSend)).toBe(false);
    expect(view.byClass('nx-conv-enter-right')).toHaveLength(0);
    await current.page.retryHumanSend(); await Vue.nextTick();
    expect(chatTransport.replyConversation).toHaveBeenCalledTimes(2); expect(view.sound.play).toHaveBeenCalledOnce();
  });

  it('releases the rendered send at 15 seconds with an unknown retry icon and preserves the key for a late idempotent result', async () => {
    const current = mountRealHumanChat(); await current.show(); const view = renderHumanDelivery(current);
    const ack = chatDeferred(), readback = chatDeferred();
    chatTransport.replyConversation.mockReturnValueOnce(ack.promise); chatTransport.commandResult.mockReturnValueOnce(readback.promise);
    const text = 'Timed out original'; await view.send(text);
    const key = chatTransport.replyConversation.mock.calls[0][2];
    chatTransport.conversation.mockReturnValue(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(11_999);
    expect(current.page.humanSendBusy.value).toBe(true); expect(chatTransport.commandResult).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(chatTransport.commandResult).toHaveBeenCalledExactlyOnceWith(key);
    await vi.advanceTimersByTimeAsync(2_999); expect(current.page.humanSendBusy.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(current.page.humanSendBusy.value).toBe(false);
    expect(view.byClass('nx-conv-receipt').at(-1)!.props).toMatchObject({ 'data-state': 'unknown', role: 'button' });
    expect(view.sound.play).not.toHaveBeenCalled();
    // The plane schedules a zero-delay visual reset after the bounded outcome.
    await vi.advanceTimersByTimeAsync(1);
    expect(view.byClass('nx-conv-send')[0].props['aria-busy']).toBe(false);
    ack.resolve(deliveredSnapshot(text)); readback.resolve({ kind: 'conversation', conversation: deliveredSnapshot(text) });
    await vi.advanceTimersByTimeAsync(0);
    expect(current.page.failedHumanSend.value).toMatchObject({ text, kind: 'unknown' });
    chatTransport.replyConversation.mockResolvedValueOnce(deliveredSnapshot(text));
    view.byClass('nx-conv-receipt').at(-1)!.props.onClick(); await vi.advanceTimersByTimeAsync(0);
    expect(chatTransport.replyConversation.mock.calls[1].slice(1)).toEqual([text, key, undefined]);
    expect(view.sound.play).toHaveBeenCalledExactlyOnceWith('send');
    expect(current.page.threadMessages.value.filter((row: any) => row.text === text)).toHaveLength(1);
  });

  it('keeps the retry icon unknown when a timed-out write cannot be read back due to a GET refusal', async () => {
    const current = mountRealHumanChat(); await current.show(); const view = renderHumanDelivery(current);
    chatTransport.replyConversation.mockReturnValue(new Promise(() => {}));
    chatTransport.commandResult.mockRejectedValueOnce(new chatApiErrors.ApiError({ kind: 'http', status: 403, message: 'readback forbidden' }));
    await view.send('Possibly delivered'); await vi.advanceTimersByTimeAsync(12_000);
    expect(current.page.humanSendBusy.value).toBe(false);
    expect(current.page.failedHumanSend.value).toMatchObject({ text: 'Possibly delivered', kind: 'unknown', settled: false });
    expect(view.byClass('nx-conv-receipt').at(-1)!.props['data-state']).toBe('unknown');
    expect(view.sound.play).not.toHaveBeenCalled();
  });

  it('replaces the saved unknown bubble with one exact canonical echo while commandResult still has no confirmation', async () => {
    const current = mountRealHumanChat(); await current.show(); const view = renderHumanDelivery(current);
    chatTransport.replyConversation.mockRejectedValueOnce(new chatApiErrors.ApiError({ kind: 'network', message: 'lost ACK' }));
    const text = 'Server accepted this request'; await view.send(text);
    expect(current.page.failedHumanSend.value).toMatchObject({ text, kind: 'unknown' });
    const key = chatTransport.replyConversation.mock.calls[0][2], canonical = deliveredSnapshot(text);
    const echoed = { ...canonical, messages: canonical.messages.map(message => message.sender === 'user'
      ? { ...message, clientMessageId: key } : message) };
    chatTransport.commandResult.mockResolvedValue(null); chatTransport.conversation.mockResolvedValue(echoed);
    await current.store.open('CV-cold'); await Vue.nextTick();
    expect(current.store.composer('conversation:CV-cold').failedSend).toBeNull();
    expect(current.page.failedHumanSend.value).toBeNull();
    expect(current.page.threadMessages.value.filter((row: any) => row.text === text)).toHaveLength(1);
    expect(view.byClass('nx-conv-receipt').some(node => node.props['data-state'] === 'unknown')).toBe(false);
    expect(chatTransport.replyConversation).toHaveBeenCalledOnce();
  });

  it('keeps an in-flight canonical echo successful when the pending readback later returns null', async () => {
    const current = mountRealHumanChat(); await current.show(); const view = renderHumanDelivery(current), readback = chatDeferred();
    chatTransport.replyConversation.mockReturnValue(new Promise(() => {})); chatTransport.commandResult.mockReturnValueOnce(readback.promise);
    const text = 'Echo during readback'; await view.send(text); await vi.advanceTimersByTimeAsync(13_000);
    const key = chatTransport.replyConversation.mock.calls[0][2], canonical = deliveredSnapshot(text);
    chatTransport.conversation.mockResolvedValue({ ...canonical, messages: canonical.messages.map(message => message.sender === 'user'
      ? { ...message, clientMessageId: key } : message) });
    await current.store.open('CV-cold');
    expect(current.store.composer('conversation:CV-cold').failedSend).toBeNull();
    expect(current.page.humanSendBusy.value).toBe(true);
    expect(current.page.localHumanSend.value.clientMessageId).toBe(key);
    expect(current.page.threadMessages.value.filter((row: any) => row.text === text)).toHaveLength(1);
    expect(current.page.threadMessages.value.some((row: any) => row.localSend)).toBe(false);
    readback.resolve(null); await vi.advanceTimersByTimeAsync(0);
    expect(current.page.humanSendBusy.value).toBe(false); expect(current.page.failedHumanSend.value).toBeNull();
    expect(current.page.threadMessages.value.filter((row: any) => row.text === text)).toHaveLength(1);
    expect(current.page.sendSuccessRevision.value).toBe(1); expect(view.sound.play).toHaveBeenCalledExactlyOnceWith('send');
  });

  it.each(['different-key', 'agent'] as const)('does not hide an in-flight local message for a same-body %s echo', async mismatch => {
    const current = mountRealHumanChat(); await current.show(); const view = renderHumanDelivery(current);
    chatTransport.replyConversation.mockReturnValue(new Promise(() => {}));
    const text = 'Same body is not an identity'; await view.send(text);
    const key = chatTransport.replyConversation.mock.calls[0][2], canonical = deliveredSnapshot(text);
    chatTransport.conversation.mockResolvedValue({ ...canonical, messages: canonical.messages.map(message => message.sender === 'user'
      ? { ...message, sender: mismatch === 'agent' ? 'agent' : 'user', clientMessageId: mismatch === 'different-key' ? key + '-other' : key } : message) });
    await current.store.open('CV-cold'); await Vue.nextTick();
    expect(current.page.humanSendBusy.value).toBe(true);
    expect(current.page.threadMessages.value.filter((row: any) => row.localSend)).toHaveLength(1);
    expect(current.page.threadMessages.value.filter((row: any) => row.text === text)).toHaveLength(2);
  });

  it.each(['support', 'advisor'])('sounds the first successful new %s conversation despite its composer-key reset', async type => {
    const current = mountRealHumanChat({ start: type }); await current.show(); const view = renderHumanDelivery(current);
    const ack = chatDeferred(); chatTransport.startConversation.mockReturnValueOnce(ack.promise);
    await view.send('First opening');
    expect(current.page.cid.value).toBe(''); expect(view.sound.play).not.toHaveBeenCalled();
    ack.resolve(deliveredSnapshot('First opening')); await vi.advanceTimersByTimeAsync(0);
    expect(current.page.cid.value).toBe('CV-cold'); expect(current.page.startType.value).toBeNull();
    expect(current.page.sendSuccessRevision.value).toBe(1);
    expect(view.sound.play).toHaveBeenCalledExactlyOnceWith('send');
    expect(current.navigation.navReplace).toHaveBeenCalledExactlyOnceWith('/pages/support/chat?cid=CV-cold');
    const restore = vi.fn();
    await current.page.onSend('Must retain opening cooldown', restore);
    expect(restore).toHaveBeenCalledOnce();
    expect(chatTransport.replyConversation).not.toHaveBeenCalled();
    await current.hooks.onShow(); await vi.advanceTimersByTimeAsync(1000);
    expect(view.sound.play).toHaveBeenCalledOnce(); expect(chatTransport.startConversation).toHaveBeenCalledOnce();
  });

  it.each([
    ['reply', 'hide'], ['reply', 'binding'], ['reply', 'account'], ['reply', 'dispose'],
    ['opening', 'hide'], ['opening', 'binding'], ['opening', 'account'], ['opening', 'dispose'],
  ] as const)('does not sound a held %s success after %s', async (mode, boundary) => {
    const current = mountRealHumanChat(mode === 'reply' ? { cid: 'CV-cold' } : { start: 'support' });
    await current.show(); const view = renderHumanDelivery(current), ack = chatDeferred();
    const action = mode === 'reply' ? chatTransport.replyConversation : chatTransport.startConversation;
    action.mockReturnValueOnce(ack.promise); await view.send('Old private send');
    expect(action).toHaveBeenCalledOnce();
    if (boundary === 'hide') current.hooks.onHide();
    if (boundary === 'binding') current.rebind();
    if (boundary === 'account') current.rebind('user:2');
    if (boundary === 'dispose') current.page.cleanup();
    ack.resolve(deliveredSnapshot('Old private send')); await vi.advanceTimersByTimeAsync(0);
    expect(current.page.sendSuccessRevision.value).toBe(0); expect(view.sound.play).not.toHaveBeenCalled();
    if (boundary === 'hide') {
      await current.hooks.onShow(); await vi.advanceTimersByTimeAsync(1000);
      expect(current.page.sendSuccessRevision.value).toBe(0); expect(view.sound.play).not.toHaveBeenCalled();
    }
  });
});
