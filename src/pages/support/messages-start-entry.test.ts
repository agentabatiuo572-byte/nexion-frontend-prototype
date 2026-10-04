// @ts-expect-error Node-only SFC test harness.
import { readFileSync } from "node:fs";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import * as Vue from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { installSupportStorage } from "@/test/storage-setup";

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
    categoryEnabled: (key: string): boolean => key === type && store.enabled && store.categoryAvailabilityStatus === "ready",
    refresh: vi.fn(), refreshCategories: vi.fn(), startConversation: vi.fn(),
  });
  const navTo = vi.fn();
  const account = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
  const currentLocale = Vue.ref(locale);
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: vi.fn(), onHide: vi.fn() },
    "@/i18n/use-t": { useT: () => currentLocale }, "@/i18n/format": { fmt: (value: string) => value },
    "@/lib/support-idle-message": { localizedIdleClose },
    "@/lib/unread-badge": { formatUnreadBadge },
    "@/lib/nova-visibility": { NOVA_SUPPORT_VISIBLE: false },
    "@/lib/route": { navTo }, "@/store/conversations": { useConversations: () => providedStore ?? store },
    "@/store/nova": { useNova: () => ({ messages: [], unread: 0 }) }, "@/store/app": { useApp: () => account },
    "@/api/runtime": { remoteApiEnabled: true }, "@/lib/active-page-refresh": { registerActivePageRefresh: vi.fn() },
    "@/components/app-chassis.vue": { default: { setup: (_props: unknown, { slots }: any) => () => Vue.h("main", slots.default?.()) } },
    "@/components/empty-state.vue": { default: { props: ["title", "desc", "ctaLabel"], setup: (props: any) => () => Vue.h("empty-state", props, [props.title, props.desc]) } },
  };
  const component = new Function("require", "exports", `${script}; return exports.default;`)((name: string) => {
    if (name in modules) return modules[name];
    if (name.endsWith(".vue")) return { default: { render: () => null } };
    throw new Error(`Unexpected dependency: ${name}`);
  }, {});
  const root = element("root"); const app = renderer.createApp(component); app.mount(root); mounted.push(app);
  return { root, store, navTo, account, rows, currentLocale };
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
    const warning = () => flatten(current.root).find(node => node.props.role === "alert"
      && node.props.class === "nx-conv-refresh-warning");
    expect(warning()).toBeDefined();
    expect(flatten(warning()!).some(node => node.text === en.conversations.image.advisorUnavailable)).toBe(true);
    const retry = flatten(warning()!).find(node => node.props.role === "button")!;
    expect(retry.props.tabindex).toBe("0");
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
    const contact = flatten(current.root).find(node => node.props["aria-label"] === "联系顾问");
    expect(contact).toBeDefined(); contact!.props.onClick();
    expect(current.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?cid=CV-1");
    expect(current.store.startConversation).not.toHaveBeenCalled();
  });

  it("keeps existing conversations usable while an older backend lacks removal support", async () => {
    const current = mount("advisor", "active"); current.store.dismissalAvailable = false; await Vue.nextTick();
    expect(flatten(current.root).some(node => String(node.props["aria-label"]).startsWith("从列表移除 · "))).toBe(false);
    expect(flatten(current.root).some(node => node.props["aria-label"] === "尚未分配顾问")).toBe(true);
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
    const button = flatten(current.root).find(node => node.props["aria-label"] === "联系顾问");
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
    const label = type === "advisor" ? "联系顾问" : "联系人工客服";
    const button = flatten(current.root).find(node => node.props["aria-label"] === label);
    expect(button).toBeDefined();
    button!.props.onClick();
    expect(current.navTo).toHaveBeenCalledExactlyOnceWith(`/pages/support/chat?start=${type}`);
    expect(current.store.startConversation).not.toHaveBeenCalled();
  });
  it.each(["advisor", "support"] as const)("keeps contact %s available when every prior conversation has ended", type => {
    const current = mount(type, "ended");
    expect(flatten(current.root).some(node => node.props["aria-label"] === (type === "advisor" ? "联系顾问" : "联系人工客服"))).toBe(true);
  });
  it.each(["active", "failed", "loading"] as const)("does not expose a duplicate or unauthorised contact entry in %s state", state => {
    const current = mount("advisor", state);
    expect(flatten(current.root).some(node => node.props["aria-label"] === "联系顾问")).toBe(false);
  });
  it("rechecks category availability when an old click arrives after the category was disabled", () => {
    const current = mount("advisor");
    const button = flatten(current.root).find(node => node.props["aria-label"] === "联系顾问");
    expect(button).toBeDefined(); current.store.enabled = false; button!.props.onClick();
    expect(current.navTo).not.toHaveBeenCalled();
  });
  it.each([[en, "Contact advisor"], [vietnamese, "Liên hệ cố vấn"]] as const)("provides a localised advisor action", (locale, label) => {
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
import * as chatSecure from "@/lib/secure-command-id";
import * as chatFormat from "@/i18n/format";
import * as chatApiErrors from "@/api/errors";
import { isSupportAttachmentNotReady, type CurrentAdvisor } from "@/api/support-api";
import * as ticketPolicy from '@/api/support-ticket-policy';
import { useAuth } from "@/store/auth";
import { createSessionVault } from "@/api/session-vault";
import { binarySessionReady } from "@/lib/binary-session-ready";

const chatTransport = vi.hoisted(() => ({
  authorityRevision: vi.fn(async () => "canonical-v1"), commandResult: vi.fn(async () => null),
  conversation: vi.fn(), replyConversation: vi.fn(), startConversation: vi.fn(), convertConversationToTicket: vi.fn(),
  conversationCategories: vi.fn(async () => ({ advisor: true, support: true, ai: false })),
  conversations: vi.fn(async () => ({ items: [] })), conversationDismissals: vi.fn(async () => []),
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
  chatTransport.conversation.mockReset().mockResolvedValue(humanSnapshot());
  chatTransport.replyConversation.mockReset().mockResolvedValue(humanSnapshot());
  chatTransport.startConversation.mockReset().mockResolvedValue(humanSnapshot());
  chatTransport.commandResult.mockReset().mockResolvedValue(null);
  chatTransport.convertConversationToTicket.mockReset().mockResolvedValue({ conversation: humanSnapshot(), ticket: { id: "TK-fixture" } });
  chatTransport.conversationCategories.mockReset().mockResolvedValue({ advisor: true, support: true, ai: false });
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
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onUnmounted: (fn: () => void) => { hooks.unmount = fn; } },
    "@dcloudio/uni-app": Object.fromEntries(["onLoad", "onUnload", "onShow", "onHide"].map(name => [name, (fn: () => void) => { hooks[name] = fn; }])),
    "@/i18n/use-t": { useT: () => Vue.ref(messages) }, "@/i18n/format": chatFormat,
    "@/lib/support-idle-message": { localizedIdleClose },
    "@/lib/nova-visibility": { NOVA_SUPPORT_VISIBLE: false },
    "@/lib/route": navigation, "@/lib/send-limiter": chatLimiter,
    "@/lib/device-preview": { h5DevicePreviewStatusBarHeight: () => 0 }, "@/lib/hashpower": { isDeviceOnline: () => false },
    "@/store/conversations": { useConversations: () => store }, "@/store/nova": { useNova }, "@/store/app": { useApp: () => app },
    "@/store/auth": { useAuth: () => auth }, "@/lib/binary-session-ready": { binarySessionReady },
    "@/store/ui": { toast, confirm: vi.fn(), useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/mock/nova-templates": {}, "@/api/runtime": { novaAiApi: {}, remoteApiEnabled: true, sessionVault },
    "@/api/errors": chatApiErrors,
    "@/api/support-api": { isSupportAttachmentNotReady },
    '@/api/support-ticket-policy': ticketPolicy,
    "@/lib/nova-failure": chatFailure, "@/store/locale": { useLocaleStore: () => ({ code: "zh" }) },
    "@/lib/secure-command-id": chatSecure, "@/lib/nova-thinking": chatThinking, "./conversation-realtime-page": chatRealtime,
  };
  const scope = Vue.effectScope();
  const page = scope.run(() => new Function("require", "exports", humanChatScript + ";return { onSend, onConvertToTicket, onRestart, goBack, cleanup, ticketCreationBlock, ticketCreationBlockText, headerName, headerRole, emptyHint, humanType, isClosedSession, waitingForAgent, showUnassignedReceived };")((name: string) => {
    if (name.endsWith(".vue")) return {}; if (!(name in modules)) throw new Error(`Unexpected chat dependency: ${name}`); return modules[name];
  }, {}));
  hooks.onLoad(query); chatCleanups.push(() => { page.cleanup(); scope.stop(); });
  function rebind(key = app.accountKey) { bindSession(key); store.bindAccount(key); app.accountKey = key; app.accountBindingEpoch += 1; }
  const waitForHistory = () => vi.waitFor(() => expect(watchRealtime).toHaveBeenLastCalledWith(query.cid));
  async function show() {
    await hooks.onShow(); await Vue.nextTick();
    // onShow now schedules the real post-flush watcher; observe its result.
    if (query.cid) await waitForHistory();
    else if (query.start) await vi.waitFor(() => expect(store.categoryAvailabilityStatus).toBe("ready"));
  }
  return { page, hooks, show, waitForHistory, store, app, navigation, rebind, watchRealtime, toast };
}

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
      expect(current.page.headerName.value).toBe("待分配");
      expect(current.page.headerRole.value).toBe(zh.conversations.sessionEnded);
      expect(current.page.isClosedSession.value).toBe(true);
      expect(current.page.showUnassignedReceived.value).toBe(false);
    }
    current.page.goBack();
    expect(current.navigation.navBack).toHaveBeenCalledExactlyOnceWith("/pages/support/messages");
    current.page.onRestart();
    expect(current.navigation.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?start=support");
    expect(chatTransport.startConversation).not.toHaveBeenCalled();
    expect(chatTransport.replyConversation).not.toHaveBeenCalled();
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

  it("retains advisor waiting only for replyable advisor history", async () => {
    const current = mountRealHumanChat();
    chatTransport.conversation.mockResolvedValue({ ...humanSnapshot(), type: "advisor", roleKey: "roleAdvisor",
      messages: [{ id: "1", sender: "user", text: "Existing public history", ts: 1, status: "read" }] });
    await current.show();
    current.store.advisor = { assignmentState: "UNBOUND", availability: "UNBOUND", currentAdvisorName: null } as any;
    expect(current.page.headerName.value).toBe(zh.conversations.image.unassigned);
    expect(current.page.showUnassignedReceived.value).toBe(true);
    current.store.get("CV-cold")!.status = "closed";
    expect(current.page.headerName.value).toBe("Fixture");
    expect(current.page.headerRole.value).toBe(zh.conversations.sessionEnded);
    expect(current.page.showUnassignedReceived.value).toBe(false);
  });
});

describe("real chat and store account recovery", () => {
  it.each([
    [zh, "客服回复当前消息后，才可转为工单。可先在此会话继续沟通。"],
    [en, "Wait for a service agent to reply before creating a ticket. You can continue this conversation."],
    [vietnamese, "Vui lòng chờ nhân viên hỗ trợ trả lời trước khi tạo phiếu. Bạn có thể tiếp tục cuộc trò chuyện này."],
  ])("explains the server reply prerequisite in the selected language", async (messages, notice) => {
    const current = mountRealHumanChat({ cid: "CV-cold" }, messages); await current.show();
    chatTransport.commandResult.mockRejectedValue(new chatApiErrors.ApiError({
      kind: "http", status: 409, message: "SUPPORT_COMMAND_FAILED_RETRYABLE",
    }));
    chatTransport.convertConversationToTicket.mockRejectedValueOnce(new chatApiErrors.ApiError({
      kind: "http", status: 409, message: "SUPPORT_REPLY_REQUIRED",
    }));
    await current.page.onConvertToTicket();
    expect(current.toast.warn).toHaveBeenCalledExactlyOnceWith(notice);
    expect(current.toast.error).not.toHaveBeenCalled();
    expect(chatTransport.commandResult).not.toHaveBeenCalled();
    expect(current.page.ticketCreationBlock.value).toBeNull();
    expect(current.store.get("CV-cold")?.status).toBe("open");
    expect(current.navigation.navTo).not.toHaveBeenCalled();
    await current.page.onSend("Continue the conversation", vi.fn());
    expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
  });
  it("does not treat an unrelated failure as a reply prerequisite", async () => {
    const current = mountRealHumanChat(); await current.show();
    chatTransport.convertConversationToTicket.mockRejectedValueOnce(new Error("SUPPORT_REPLY_REQUIRED"));
    await current.page.onConvertToTicket();
    expect(current.toast.warn).not.toHaveBeenCalled();
    expect(current.toast.error).toHaveBeenCalledExactlyOnceWith(zh.conversations.convertTicketFailed, "");
  });
  it("keeps a quota-refused conversation open and clears its notice on account rebinding", async () => {
    const current = mountRealHumanChat(); await current.show();
    const policy: ticketPolicy.TicketCreationPolicy = { allowed: false, reasonCode: 'SUPPORT_TICKET_CREATE_ACTIVE_LIMIT',
      retryAfterSeconds: 0, retryAt: null, existingTicketNo: 'TK-existing', cooldownSeconds: 60,
      windowHours: 24, maxCreatedInWindow: 10, maxActiveTickets: 3, createdInWindow: 3, activeTickets: 3 };
    chatTransport.convertConversationToTicket.mockRejectedValueOnce(new ticketPolicy.TicketCreationDenied(policy));
    await current.page.onConvertToTicket();
    expect(current.page.ticketCreationBlock.value).toEqual(policy);
    expect(current.page.ticketCreationBlockText.value).toContain('3');
    expect(current.store.get('CV-cold')?.status).toBe('open');
    expect(current.navigation.navTo).not.toHaveBeenCalled();
    expect(current.toast.error).not.toHaveBeenCalled();
    await current.page.onSend('Continue this existing conversation', vi.fn());
    expect(chatTransport.replyConversation).toHaveBeenCalledTimes(1);
    current.rebind(); await Vue.nextTick();
    expect(current.page.ticketCreationBlock.value).toBeNull();
  });
  it("redirects an old AI link before opening a category or sending a request", async () => {
    const current = mountRealHumanChat({ type: "ai" });
    expect(current.navigation.navReplace).toHaveBeenCalledExactlyOnceWith("/pages/support/messages");
    await current.show();
    expect(chatTransport.conversationCategories).not.toHaveBeenCalled();
  });
  it("navigates once when the ticket conversion is clicked twice before completion", async () => {
    const current = mountRealHumanChat(); await current.show(); const gate = chatDeferred();
    chatTransport.convertConversationToTicket.mockReturnValueOnce(gate.promise);
    const first = current.page.onConvertToTicket();
    await vi.waitFor(() => expect(chatTransport.convertConversationToTicket).toHaveBeenCalledTimes(1));
    const second = current.page.onConvertToTicket(); await new Promise(done => setTimeout(done, 20));
    gate.resolve({ conversation: humanSnapshot(), ticket: { id: "TK-one" } }); await Promise.all([first, second]);
    expect(chatTransport.convertConversationToTicket).toHaveBeenCalledTimes(1);
    expect(current.navigation.navTo).toHaveBeenCalledTimes(1);
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
  it.each(["reply failure", "convert failure", "convert success"])("does not let an old %s interrupt the new account history read", async operation => {
    const current = mountRealHumanChat(); await current.show();
    let resolve!: (value: any) => void, reject!: (error: Error) => void;
    const old = new Promise((done, fail) => { resolve = done; reject = fail; });
    const transport = operation.startsWith("reply") ? chatTransport.replyConversation : chatTransport.convertConversationToTicket;
    transport.mockReturnValueOnce(old);
    const pending = operation.startsWith("reply") ? current.page.onSend("Old account request", vi.fn()) : current.page.onConvertToTicket();
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    const history = chatDeferred(); chatTransport.conversation.mockReturnValueOnce(history.promise);
    current.rebind(); await Vue.nextTick();
    await vi.waitFor(() => expect(chatTransport.conversation).toHaveBeenCalledTimes(2));
    if (operation.endsWith("success")) resolve({ conversation: humanSnapshot(), ticket: { id: "TK-old" } });
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
    chatTransport.conversationCategories.mockResolvedValue({ advisor: true, support: false, ai: false });
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
describe("rendered human composer account boundary", () => {
  it.each(["existing same account", "existing A to B to A", "new same account", "new A to B to A"])("clears an unsent private draft across %s rebinding", async scenario => {
    const state = Vue.reactive({ accountKey: "account-a", accountBindingEpoch: 1 });
    const thread = new Function("require", "exports", composerScript + ";return exports.default;")((name: string) => {
      if (name === "vue") return { ...Vue, onMounted: vi.fn() };
      if (name === "@/composables/use-dialog-a11y") return { useDialogA11y: vi.fn() };
      if (name === "@/components/liquid-glass.vue") return { default: { render: () => null } };
      throw new Error(`Unexpected composer dependency: ${name}`);
    }, {});
    const empty: unknown[] = [], root = element("root");
    const app = renderer.createApp({ render: () => Vue.h(thread, { messages: empty, inputPlaceholder: "Message", inputLabel: "Message", sendLabel: "Send",
      composerKey: humanComposerBinding(state, scenario.startsWith("existing") ? "CV-same" : "", scenario.startsWith("new") ? "support" : null, false, {}, { scopeInvalidated: 0 }) }) });
    app.component("scroll-view", { setup: (_props: unknown, { slots }: any) => () => Vue.h("scroll-view", slots.default?.()) });
    app.mount(root); mounted.push(app);
    const input = () => flatten(root).find(node => node.tag === "input")!;
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
