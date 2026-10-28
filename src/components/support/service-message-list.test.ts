import ts from "typescript";
import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from 'pinia';
import { installSupportStorage } from '@/test/storage-setup';
import source from "./service-message-list.vue?raw";
import deleteSource from "@/composables/use-conversation-delete.ts?raw";
import { zh } from "@/i18n/messages/zh";
import { fmt } from "@/i18n/format";
import { conversationActionsCopy } from "@/i18n/conversation-actions";

installSupportStorage();
const remote = vi.hoisted(() => ({ remoteApiEnabled: true, supportApi: {
  authorityRevision: vi.fn(async () => 'run-1'), commandResult: vi.fn(async () => null),
  conversations: vi.fn(), conversationDismissals: vi.fn(async () => []),
} }));
vi.mock('@/api/runtime', () => remote);
const { useConversations } = await import('@/store/conversations');
import { groupConversationThreads } from "@/api/conversation-threads";
import type { Conversation } from "@/domain/support";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { formatDisplayDateTime } from "@/lib/display-date";

type Node = { tag: string; text: string; props: Record<string, any>; children: Node[]; parent: Node | null };
const node = (tag: string, text = ""): Node => ({ tag, text, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Node, Node>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: text => node("#comment", text),
  setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  patchProp: (n, key, _old, value) => { n.props[key] = value; },
  insert(n, parent, anchor) {
    if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n);
    n.parent = parent; const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(n); else parent.children.splice(index, 0, n);
  },
  remove(n) { if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n); },
});
const flatten = (n: Node): Node[] => [n, ...n.children.flatMap(flatten)];
const byClass = (n: Node, name: string) => flatten(n).filter(item => String(item.props.class).split(/\s+/).includes(name));
const textOf = (n: Node): string => n.text + n.children.map(textOf).join("");
const flowContent = (n: Node): string => JSON.stringify({ tag: n.tag, text: n.text,
  props: Object.fromEntries(Object.entries(n.props).filter(([key, value]) => key !== "aria-busy" && typeof value !== "function")),
  children: n.children.map(flowContent) });
const mounted: Vue.App<Node>[] = [];
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); });
const js = (code: string) => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const compiled = compileScript(parse(source).descriptor, { id: "service-inbox-review", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } } });

// Gesture mechanics are exercised against the actual SFC in conversation-swipe-row.behavior.test.ts.
// Keep the real parent slot and component events here; do not replace the row with an empty stub.
const Swipe = Vue.defineComponent({
  inheritAttrs: false, props: ["open", "label", "deleteLabel", "disabled", "busy"],
  emits: ["delete", "update:open"],
  setup(props, { slots, emit }) {
    return () => Vue.h("swipe-row", { ...props,
      onReveal: () => emit("update:open", true), onDelete: () => emit("delete"),
    }, slots.default?.());
  },
});
function conversation(id: string, ownerAgentId: string | null, lastTs: number, unread: number, status: Conversation["status"] = "open"): Conversation {
  return { id, ownerAgentId, type: "advisor", status, version: 1, agentName: "Same display name",
    messages: [], unread, lastTs, lastMessage: "Preview " + id, sessionStatus: status === "closed" ? "closed" : "active",
    roleKey: "roleAdvisor", avatarTint: "blue", historyNextCursor: null, historyTruncated: false };
}
function mount(initial = [
  conversation("a/active", "7", 40, 2),
  conversation("a/history", "7", 60, 3, "closed"),
  conversation("b/active", "9", 20, 1),
], sourceStore?: ReturnType<typeof useConversations>) {
  const conversations = Vue.reactive({
    loading: false, error: null as string | null, categoryLoading: false, categoryAvailabilityStatus: "ready", realtimeFallback: false,
    deletionAvailable: true, deletingIds: {} as Record<string, boolean>, typingIds: {} as Record<string, boolean>,
    conversations: initial, get humanThreads() { return groupConversationThreads(this.conversations); },
    deleteConversation: vi.fn(async (_id: string) => {}), stopRealtime: vi.fn(), startRealtime: vi.fn(), categoryEnabled: () => true,
  });
  const props = Vue.reactive({ filter: "all", hideFilters: true });
  const navTo = vi.fn(), navigate = vi.fn(), refresh = vi.fn(), confirm = vi.fn(async (_options: any) => false);
  const displayLocale = Vue.ref("zh-CN"), displayDateTime = vi.fn(formatDisplayDateTime);
  const toast = { error: vi.fn() }, account = Vue.reactive({ accountBindingEpoch: 1 });
  const modules: Record<string, any> = {
    vue: Vue, "@dcloudio/uni-app": { onHide: vi.fn() },
    "@/store/conversations": { useConversations: () => sourceStore ?? conversations },
    "@/store/message-drawer": { useMessageDrawer: () => ({ refresh }) },
    "@/store/app": { useApp: () => account }, "@/store/locale": { useLocaleStore: () => ({ code: "zh" }) },
    "@/store/ui": { confirm, toast, useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/i18n/conversation-actions": { conversationActionsCopy },
    "@/i18n/use-t": { useT: () => Vue.ref(zh) }, "@/i18n/format": { fmt, dateLocale: () => displayLocale.value },
    "@/lib/display-date": { formatDisplayDateTime: displayDateTime },
    "@/lib/route": { navTo }, "@/lib/support-idle-message": { localizedIdleClose }, "@/lib/unread-badge": { formatUnreadBadge },
    "./conversation-swipe-row.vue": { default: Swipe },
  };
  const require = (name: string) => {
    if (name in modules) return modules[name];
    if (name.endsWith(".vue")) return { default: { render: () => null } };
    throw new Error("Unexpected service dependency: " + name);
  };
  modules["@/composables/use-conversation-delete"] = new Function("require", "exports",
    js(deleteSource) + ";return exports;")(require, {});
  const Component = new Function("require", "exports", js(compiled.content) + ";return exports.default;")(require, {});
  const root = node("root"), app = renderer.createApp({ setup: () => () => Vue.h(Component, { ...props, onNavigate: navigate }) });
  app.mount(root); mounted.push(app);
  return { root, conversations, props, navTo, navigate, refresh, confirm, toast, displayLocale, displayDateTime,
    rows: () => byClass(root, "service-row"), swipes: () => flatten(root).filter(n => n.tag === "swipe-row") };
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await Vue.nextTick(); }

describe("rendered service threads and deletion", () => {
  it('keeps the real store row and flow prefix through repeated offline refresh error/fallback windows', async () => {
    setActivePinia(createPinia());
    remote.supportApi.conversations.mockResolvedValue({ items: [conversation('current', '7', 40, 2)], total: 1 });
    const store = useConversations(); store.bindAccount('user:fixture'); await store.refresh();
    store.categoryLoading = false; store.categoryAvailabilityStatus = 'ready';
    store.realtimeFallback = true; store.error = 'offline';
    const h = mount(undefined, store); await Vue.nextTick();
    const row = h.rows()[0], prefix = () => h.root.children[0].children.filter(n => n.tag !== '#comment').slice(0, 1).map(n => n.tag);
    const before = prefix();
    for (let cycle = 0; cycle < 3; cycle++) {
      let reject!: (cause: Error) => void;
      remote.supportApi.authorityRevision.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
      const refresh = store.refresh().catch(() => undefined);
      expect(store.loading).toBe(true); expect(store.error).toBeNull();
      await Vue.nextTick();
      expect(store.conversations).toHaveLength(1); expect(h.rows()[0]).toBe(row);
      expect(prefix()).toEqual(before);
      const nodes = flatten(h.root), state = byClass(h.root, 'service-state')[0];
      expect(nodes.indexOf(state)).toBeGreaterThan(nodes.indexOf(row));
      expect(textOf(state)).toContain(zh.conversations.realtimeFallback);
      reject(new Error('offline')); await refresh; await Vue.nextTick();
      expect(store.error).toBe('offline'); expect(h.rows()[0]).toBe(row); expect(prefix()).toEqual(before);
      expect(textOf(h.root)).toContain(zh.conversations.staleSnapshot);
    }
    let reject!: (cause: Error) => void;
    remote.supportApi.authorityRevision.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const oldRead = store.refresh().catch(() => undefined);
    store.bindAccount('user:replacement'); await Vue.nextTick(); expect(h.rows()).toHaveLength(0);
    reject(new Error('old scope offline')); await oldRead; await Vue.nextTick();
    expect(h.rows()).toHaveLength(0); expect(store.error).toBeNull(); store.reset();
  });
  it("merges the same staff ID, keeps another ID separate despite the same name, and routes to the replyable member", () => {
    const h = mount();
    expect(h.rows()).toHaveLength(2);
    expect(h.conversations.humanThreads[0].conversationIds).toEqual(["a/history", "a/active"]);
    expect(byClass(h.root, "service-preview").map(textOf)).toEqual(["Preview a/history", "Preview b/active"]);
    h.rows()[0].props.onClick();
    expect(h.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?cid=a%2Factive");
    expect(h.navigate).toHaveBeenCalledOnce();
    expect(h.conversations.humanThreads.map(row => row.unread)).toEqual([5, 1]);
  });
  it("renders each group's own unread badge in the trailing meta column, never on its avatar", () => {
    const h = mount();
    expect(h.rows().map(row => textOf(byClass(row, "service-unread")[0]))).toEqual(["5", "1"]);
    for (const row of h.rows()) {
      expect(row.children.indexOf(byClass(row, "service-meta")[0])).toBeGreaterThan(row.children.indexOf(byClass(row, "service-content")[0]));
      expect(byClass(byClass(row, "service-avatar")[0], "service-unread")).toHaveLength(0);
    }
  });
  it.each(["zh-CN", "en-US", "vi-VN"])("uses the shared %s date formatter beneath the preview and retains the right badge", async locale => {
    const h = mount(), timestamp = Date.parse("2026-10-27T05:10:00Z");
    h.displayDateTime.mockClear();
    h.displayLocale.value = locale;
    h.conversations.conversations[1].lastTs = timestamp;
    await Vue.nextTick();
    const row = h.rows()[0], content = byClass(row, "service-content")[0], time = byClass(row, "service-time")[0];
    expect(h.displayDateTime).toHaveBeenCalledWith(timestamp, locale);
    expect(textOf(time)).toBe(formatDisplayDateTime(timestamp, locale));
    expect(content.children.indexOf(time)).toBeGreaterThan(content.children.indexOf(byClass(row, "service-preview")[0]));
    expect(byClass(byClass(row, "service-meta")[0], "service-time")).toHaveLength(0);
    expect(textOf(byClass(row, "service-unread")[0])).toBe("5");
  });
  it.each(["loading", "categoryLoading"] as const)("warm %s changes busy state without adding/removing flow content", async field => {
    const h = mount(), before = flowContent(h.root), rows = h.rows();
    h.conversations[field] = true; await Vue.nextTick();
    expect(byClass(h.root, "service-messages")[0].props["aria-busy"]).toBe(true);
    expect(flowContent(h.root)).toBe(before);
    h.rows().forEach((row, index) => expect(row).toBe(rows[index]));
    expect(byClass(h.root, "service-state")).toHaveLength(0);
    expect(textOf(h.root)).not.toContain(zh.help.loadingMore);
    h.conversations[field] = false; await Vue.nextTick();
    expect(flowContent(h.root)).toBe(before);
    expect(byClass(h.root, "service-messages")[0].props["aria-busy"]).toBe(false);
  });
  it("cold/cleared selected results keep visible loading and never retain old row content", async () => {
    const h = mount();
    h.props.filter = "ticket"; h.conversations.loading = true; await Vue.nextTick();
    expect(h.rows()).toHaveLength(0);
    expect(byClass(h.root, "service-state")[0].props.role).toBe("status");
    expect(textOf(h.root)).toContain(zh.help.loadingMore);
    expect(textOf(h.root)).not.toContain("Preview ");
    expect(byClass(h.root, "service-empty-title")).toHaveLength(0);
    h.props.filter = "all"; h.conversations.conversations.splice(0); await Vue.nextTick();
    expect(h.rows()).toHaveLength(0);
    expect(textOf(h.root)).toContain(zh.help.loadingMore);
    expect(textOf(h.root)).not.toContain("Preview ");
    h.conversations.loading = false; await Vue.nextTick();
    expect(textOf(h.root)).not.toContain(zh.help.loadingMore);
    expect(textOf(byClass(h.root, "service-empty-title")[0])).toBe(zh.notifs.serviceEmpty);
  });
  it("keeps unidentified histories separate rather than grouping by display name", () => {
    const h = mount([conversation("unknown-1", null, 2, 0), conversation("unknown-2", null, 1, 5)]);
    expect(h.rows()).toHaveLength(2);
    expect(byClass(h.root, "service-unread").map(textOf)).toEqual(["5"]);
    h.rows()[1].props.onClick(); expect(h.navTo).toHaveBeenCalledWith("/pages/support/chat?cid=unknown-2");
  });
  it("hides zero badges, caps the visible count, and never changes unread into zero on a failed read", async () => {
    const h = mount([conversation("zero", "7", 20, 0), conversation("many", "9", 10, 120)]);
    expect(byClass(h.root, "service-unread").map(textOf)).toEqual(["99"]);
    h.conversations.error = "offline"; await Vue.nextTick();
    expect(byClass(h.root, "service-unread").map(textOf)).toEqual(["-", "-"]);
    expect(h.conversations.conversations.map(row => row.unread)).toEqual([0, 120]);
  });
  it("reads typing from any same-peer segment without changing another peer's preview", async () => {
    const h = mount(); h.conversations.typingIds["a/history"] = true; await Vue.nextTick();
    expect(byClass(h.root, "service-preview").map(textOf)).toEqual([zh.conversations.agentTyping, "Preview b/active"]);
  });
  it("retains the advisor/support filter aliases and excludes tickets", async () => {
    const h = mount();
    for (const filter of ["advisor", "support"]) { h.props.filter = filter; await Vue.nextTick(); expect(h.rows()).toHaveLength(2); }
    h.props.filter = "ticket"; await Vue.nextTick(); expect(h.rows()).toHaveLength(0);
  });
  it("cancels the real delete confirmation without deleting history or opening chat", async () => {
    const h = mount(), before = JSON.stringify(h.conversations.conversations);
    h.swipes()[0].props.onReveal(); await Vue.nextTick();
    h.swipes()[0].props.onDelete(); await settle();
    expect(h.confirm).toHaveBeenCalledOnce();
    expect(h.confirm.mock.calls[0][0]).toMatchObject({ message: conversationActionsCopy.zh.message, danger: true });
    expect(h.conversations.deleteConversation).not.toHaveBeenCalled();
    expect(JSON.stringify(h.conversations.conversations)).toBe(before); expect(h.rows()).toHaveLength(2);
    expect(h.navTo).not.toHaveBeenCalled();
  });
  it("only requests the selected thread after confirmation and keeps all rows/history when it fails", async () => {
    const h = mount(), before = JSON.stringify(h.conversations.conversations);
    h.confirm.mockResolvedValue(true); h.conversations.deleteConversation.mockRejectedValueOnce(new Error("offline"));
    h.swipes()[0].props.onDelete(); await settle();
    expect(h.conversations.deleteConversation).toHaveBeenCalledExactlyOnceWith("a/active");
    expect(h.toast.error).toHaveBeenCalledExactlyOnceWith(conversationActionsCopy.zh.failed);
    expect(JSON.stringify(h.conversations.conversations)).toBe(before); expect(h.rows()).toHaveLength(2);
    expect(h.navTo).not.toHaveBeenCalled();
    h.swipes()[0].props.onDelete(); await settle();
    expect(h.conversations.deleteConversation).toHaveBeenCalledTimes(2);
  });
  it("makes both swipe affordance and destructive action unavailable without server capability", async () => {
    const h = mount(); h.conversations.deletionAvailable = false; await Vue.nextTick();
    expect(h.swipes().every(row => row.props.disabled)).toBe(true);
    h.swipes()[0].props.onDelete(); await settle();
    expect(h.confirm).not.toHaveBeenCalled(); expect(h.conversations.deleteConversation).not.toHaveBeenCalled();
    h.rows()[0].props.onClick(); expect(h.navTo).toHaveBeenCalledOnce();
  });
  it("keeps warm errors and realtime fallback visible while retry respects synchronous busy state", async () => {
    const h = mount(); h.conversations.error = "offline"; await Vue.nextTick();
    expect(h.rows()).toHaveLength(2);
    expect(byClass(h.root, "service-state")[0].props.role).toBe("alert");
    expect(textOf(h.root)).toContain(zh.conversations.staleSnapshot);
    // The drawer starts the store refresh synchronously; exercise two clicks before Vue patches the DOM.
    h.refresh.mockImplementation(() => { h.conversations.loading = true; });
    const retry = byClass(h.root, "service-retry")[0];
    retry.props.onClick(); retry.props.onClick();
    expect(h.refresh).toHaveBeenCalledOnce();
    await Vue.nextTick();
    expect(retry.props["aria-disabled"]).toBe(true); expect(retry.props.tabindex).toBe(-1);
    retry.props.onClick(); expect(h.refresh).toHaveBeenCalledOnce();
    h.conversations.loading = false; h.conversations.categoryLoading = true; await Vue.nextTick();
    retry.props.onClick(); expect(h.refresh).toHaveBeenCalledOnce();
    h.conversations.categoryLoading = false; h.conversations.error = null; h.conversations.realtimeFallback = true;
    await Vue.nextTick();
    expect(textOf(h.root)).toContain(zh.conversations.realtimeFallback);
    expect(textOf(h.root)).not.toContain(zh.conversations.staleSnapshot);
    const fallbackRetry = byClass(h.root, "service-retry")[0];
    expect(fallbackRetry.props["aria-disabled"]).toBe(false); expect(fallbackRetry.props.tabindex).toBe(0);
    fallbackRetry.props.onClick(); fallbackRetry.props.onClick();
    expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(h.conversations.stopRealtime).toHaveBeenCalledOnce(); expect(h.conversations.startRealtime).toHaveBeenCalledOnce();
    h.conversations.loading = false; h.conversations.conversations.splice(0); h.conversations.error = "offline";
    await Vue.nextTick();
    expect(textOf(h.root)).toContain(zh.conversations.loadError);
    expect(textOf(h.root)).not.toContain(zh.conversations.staleSnapshot);
    expect(textOf(h.root)).not.toContain("Preview ");
  });

  it.each(["error", "category"])("places warm %s details after retained rows without moving their flow prefix", async source => {
    const h = mount();
    const rowPrefix = () => h.root.children[0].children.filter(n => n.tag !== "#comment").slice(0, 2).map(n => n.tag);
    const before = rowPrefix();
    if (source === "error") h.conversations.error = "offline";
    if (source === "category") h.conversations.categoryAvailabilityStatus = "failed";
    await Vue.nextTick();
    expect(rowPrefix()).toEqual(before);
    const nodes = flatten(h.root), rows = h.rows(), state = byClass(h.root, "service-state")[0];
    expect(nodes.indexOf(state)).toBeGreaterThan(nodes.indexOf(rows[rows.length - 1]));
    expect(textOf(state)).toContain(zh.conversations.staleSnapshot);
    expect(textOf(state)).toContain(zh.ui.retry);
  });
});
