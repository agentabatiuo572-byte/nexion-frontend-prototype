// @ts-expect-error Node-only SFC test harness.
import { readFileSync } from "node:fs";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import * as Vue from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { groupConversationThreads, type ConversationThread } from "@/api/conversation-threads";
import { conversationActionsCopy } from "@/i18n/conversation-actions";
import type { Conversation } from "@/domain/support";
import type { CurrentAdvisor } from "@/api/support-api";

// Same actual-template renderer mechanism as messages-start-entry.test.ts.
const transpile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function compileComponent(path: string, id: string) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = compileScript(parse(source).descriptor, { id, inlineTemplate: true,
    templateOptions: { compilerOptions: { hoistStatic: false, isCustomElement: tag => ["view", "text", "image"].includes(tag) } } });
  return transpile(compiled.content);
}
const script = compileComponent("./messages.vue", "history-kind-test");
const swipeScript = compileComponent("../../components/support/conversation-swipe-row.vue", "history-swipe-test");
const deleteScript = transpile(readFileSync(new URL("../../composables/use-conversation-delete.ts", import.meta.url), "utf8"));
type Element = { tag: string; text: string; props: Record<string, any>; children: Element[]; parent: Element | null };
const element = (tag: string, text = ""): Element => ({ tag, text, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Element, Element>({
  createElement: tag => element(tag), createText: text => element("#text", text), createComment: text => element("#comment", text),
  setText: (node, text) => { node.text = text; }, setElementText: (node, text) => { node.text = text; node.children = []; },
  parentNode: node => node.parent, nextSibling: node => node.parent?.children[(node.parent.children.indexOf(node)) + 1] ?? null,
  patchProp: (node, key, _previous, next) => { node.props[key] = next; },
  insert: (node, parent, anchor) => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node); node.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1; if (at < 0) parent.children.push(node); else parent.children.splice(at, 0, node); },
  remove: node => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node); },
});
const mounted: Vue.App<Element>[] = [];
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-10T07:00:00Z")); });
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); vi.restoreAllMocks(); });
const flatten = (node: Element): Element[] => [node, ...node.children.flatMap(flatten)];
const unbound: CurrentAdvisor = { assignmentId: null, currentAdvisorId: null, currentAdvisorName: null, assignmentState: "UNBOUND", availability: "UNBOUND" };
const assigned: CurrentAdvisor = { assignmentId: 1, currentAdvisorId: 2, currentAdvisorName: "Current account advisor", assignmentState: "ASSIGNED", availability: "BUSY" };
const advisorStates = [
  { advisor: unbound, advisorLoading: false, advisorError: false },
  { advisor: assigned, advisorLoading: false, advisorError: false },
  { advisor: { ...assigned, assignmentState: "ADVISOR_DISABLED" as const, availability: "DISABLED" as const }, advisorLoading: false, advisorError: false },
  { advisor: null, advisorLoading: true, advisorError: false },
  { advisor: null, advisorLoading: false, advisorError: true },
];

function conversation(type: "advisor" | "support", status: Conversation["status"], agentName = "Historical owner", id = "CV-history"): Conversation {
  return { id, type, status, agentName, version: 1, messages: [], lastMessage: "Public preview", lastTs: Date.now() - 4 * 86_400_000,
    unread: 2, sessionStatus: status === "open" || status === "resolved" ? "active" : "closed",
    roleKey: type === "advisor" ? "roleAdvisor" : "roleSupport", avatarTint: "blue" };
}
function mount(type: "advisor" | "support", conversations: Conversation[], messages = zh) {
  const store = Vue.reactive({ conversations, typingIds: {}, categoryAvailabilityStatus: "ready", error: null,
    get humanThreads(): ConversationThread[] { return groupConversationThreads(this.conversations); },
    advisor: unbound as CurrentAdvisor | null, advisorLoading: false, advisorError: false, realtimeFallback: false,
    dismissingIds: {}, dismissalAvailable: true, dismissConversation: vi.fn(), refresh: vi.fn(), refreshCategories: vi.fn(), refreshAdvisor: vi.fn(),
    deletingIds: {}, deletionAvailable: true, deleteConversation: vi.fn(async (_id: string) => {}),
    byType: (key: string): Conversation[] => store.conversations.filter(row => row.type === key),
    categoryReadable: (key: string) => key === type, categoryEnabled: (key: string) => key === "advisor",
  });
  const navTo = vi.fn(), confirm = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const account = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
  const locale = messages === zh ? "zh" : messages === vietnamese ? "vi" : "en";
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: vi.fn(), onHide: vi.fn() },
    "@/i18n/use-t": { useT: () => Vue.ref(messages) }, "@/i18n/format": { fmt },
    "@/lib/support-idle-message": { localizedIdleClose }, "@/lib/unread-badge": { formatUnreadBadge },
    "@/lib/route": { navTo },
    "@/store/conversations": { useConversations: () => store },
    "@/store/app": { useApp: () => account }, "@/store/locale": { useLocaleStore: () => ({ code: locale }) },
    "@/i18n/conversation-actions": { conversationActionsCopy },
    "@/store/ui": { confirm, toast: { error: vi.fn() }, useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/api/runtime": { remoteApiEnabled: true }, "@/lib/active-page-refresh": { registerActivePageRefresh: vi.fn() },
    "@/components/app-chassis.vue": { default: { setup: (_props: unknown, { slots }: any) => () => Vue.h("main", slots.default?.()) } },
  };
  function evaluate(code: string) {
    return new Function("require", "exports", `${code}; return exports;`)((name: string) => {
      if (name in modules) return modules[name];
      if (name.endsWith(".vue")) return { default: { render: () => null } };
      throw new Error(`Unexpected dependency: ${name}`);
    }, {});
  }
  modules["@/composables/use-conversation-delete"] = evaluate(deleteScript);
  modules["@/components/support/conversation-swipe-row.vue"] = evaluate(swipeScript);
  const component = evaluate(script).default;
  const root = element("root"), app = renderer.createApp(component); app.mount(root); mounted.push(app);
  const nodes = (className: string) => flatten(root).filter(node => String(node.props.class).split(" ").includes(className));
  function expectNames(names: string[]) {
    expect(nodes("nx-conv-rowname").map(node => node.text)).toEqual(names);
    expect(nodes("nx-conv-row").map(node => node.props["aria-label"])).toEqual(names);
    expect(nodes("conversation-swipe__delete").map(node => node.props["aria-label"])).toEqual(names.map(name => `${conversationActionsCopy[locale].delete} · ${name}`));
  }
  return { store, navTo, nodes, expectNames, confirm, account };
}

describe("human list identity follows each conversation kind and status", () => {
  it("keeps legacy records without stable peer IDs separate and independently navigable", () => {
    const current = mount("advisor", [{ ...conversation("advisor", "closed", "Dedicated history", "CV-advisor"), lastTs: 1 },
      { ...conversation("support", "closed", "Legacy history", "CV-support"), lastTs: 1 }]);
    current.expectNames(["Dedicated history", "Legacy history"]);
    expect(current.store.conversations.map(row=>row.id)).toEqual(["CV-advisor", "CV-support"]);
    current.nodes("nx-conv-row")[0]!.props.onClick();
    expect(current.navTo).toHaveBeenCalledWith("/pages/support/chat?cid=CV-advisor");
    current.nodes("nx-conv-row")[1]!.props.onClick();
    expect(current.navTo).toHaveBeenLastCalledWith("/pages/support/chat?cid=CV-support");
    current.nodes("nx-conv-contact")[0]!.props.onClick();
    expect(current.navTo).toHaveBeenLastCalledWith("/pages/support/chat?start=advisor");
    expect(current.store.conversations[1]!.type).toBe("support");
  });
  it.each(["warm", "cold"])("keeps seven %s unassigned closed histories separate without dropping their previews or unread counts", async entry => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ ...conversation("support", "closed", "待分配", `CV-${3168 - index}`),
      lastTs: Date.now() - 4 * 86_400_000 - index,
      lastMessage: "会话已因用户闲置 5 分钟自动结束,可重新发起会话。", lastMessageKind: "IDLE_TIMEOUT_CLOSE" as const }));
    const current = mount("support", entry === "warm" ? rows : []);
    if (entry === "cold") { current.store.conversations = rows; await Vue.nextTick(); }
    current.expectNames(rows.map(() => zh.conversations.sessionEnded));
    expect(current.store.conversations).toHaveLength(7);
    expect(current.nodes("nx-conv-rowprev").map(node => node.text)).toEqual(rows.map(row => localizedIdleClose(row.lastMessage, zh.conversations)));
    expect(current.nodes("nx-conv-rowtime").map(node => node.text)).toEqual(rows.map(() => fmt(zh.conversations.tDayAgo, { n: 4 })));
    expect(current.nodes("nx-conv-unread-t").map(node => node.children[0]?.text || node.text)).toEqual(rows.map(() => "2"));
    current.nodes("nx-conv-row").forEach(node => node.props.onClick());
    expect(current.navTo.mock.calls.map(call => call[0])).toEqual(rows.map(row => `/pages/support/chat?cid=${row.id}`));
    expect(current.store.dismissConversation).not.toHaveBeenCalled();
  });

  it.each(["warm", "cold"])("merges %s history across human kinds only for the same stable peer", async entry => {
    const rows = Array.from({ length: 7 }, (_, index): Conversation => ({
      ...conversation(index % 2 ? "advisor" : "support", "closed", "Historical owner", `CV-peer-${index}`),
      ownerAgentId: "42", lastTs: Date.now() - 4 * 86_400_000 - index,
      lastMessage: "会话已因用户闲置 5 分钟自动结束,可重新发起会话。", lastMessageKind: "IDLE_TIMEOUT_CLOSE",
    }));
    const current = mount("advisor", entry === "warm" ? rows : []);
    if (entry === "cold") { current.store.conversations = rows; await Vue.nextTick(); }
    current.expectNames(["Historical owner"]);
    expect(current.store.conversations.map(row => row.id)).toEqual(rows.map(row => row.id));
    expect(current.store.humanThreads[0]!.conversationIds).toEqual(rows.map(row => row.id));
    expect(current.nodes("nx-conv-rowprev").map(node => node.text)).toEqual([localizedIdleClose(rows[0]!.lastMessage, zh.conversations)]);
    expect(current.nodes("nx-conv-rowtime").map(node => node.text)).toEqual([fmt(zh.conversations.tDayAgo, { n: 4 })]);
    expect(current.nodes("nx-conv-unread-t").map(node => node.children[0]?.text || node.text)).toEqual(["14"]);
    current.nodes("nx-conv-row")[0]!.props.onClick();
    expect(current.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?cid=CV-peer-0");
    expect(current.store.deleteConversation).not.toHaveBeenCalled();
  });

  it("does not merge equal display names belonging to different stable peers or missing peer IDs", () => {
    const current = mount("advisor", [
      { ...conversation("advisor", "closed", "Same name", "CV-first"), ownerAgentId: "42" },
      { ...conversation("support", "closed", "Same name", "CV-second"), ownerAgentId: "84" },
      conversation("support", "closed", "Same name", "CV-legacy"),
    ]);
    current.expectNames(["Same name", "Same name", "Same name"]);
    expect(current.store.humanThreads.map(row => row.conversationIds)).toEqual([["CV-first"], ["CV-second"], ["CV-legacy"]]);
    current.nodes("nx-conv-row").forEach(node => node.props.onClick());
    expect(current.navTo.mock.calls.map(call => call[0])).toEqual(["CV-first", "CV-second", "CV-legacy"].map(id => `/pages/support/chat?cid=${id}`));
  });

  it.each(["open", "resolved"] as const)("keeps a known advisor/%s peer independent of later account assignment", async status => {
    const current = mount("advisor", [{ ...conversation("advisor", status), ownerAgentId: "42" }]);
    for (const state of advisorStates) {
      Object.assign(current.store, state); await Vue.nextTick();
      current.expectNames(["Historical owner"]);
      expect(current.nodes("nx-conv-contact")).toHaveLength(1);
    }
    current.store.advisor = { ...assigned, currentAdvisorId: 42 };
    await Vue.nextTick();
    current.expectNames(["Historical owner"]);
    expect(current.nodes("nx-conv-contact")).toHaveLength(0);
  });

  it.each(["open", "resolved", "closed", "transferred"] as const)("keeps a support/%s owner through reactive advisor changes", async status => {
    const current = mount("support", [conversation("support", status, "  Support owner  ")]);
    for (const state of advisorStates) { Object.assign(current.store, state); await Vue.nextTick(); current.expectNames(["Support owner"]); }
  });

  it.each(["closed", "transferred"] as const)("keeps advisor/%s historical owner through current advisor changes", async status => {
    const current = mount("advisor", [conversation("advisor", status)]);
    for (const state of advisorStates) { Object.assign(current.store, state); await Vue.nextTick(); current.expectNames(["Historical owner"]); }
  });

  it.each(["open", "resolved"] as const)("preserves the current advisor/%s projection", async status => {
    const current = mount("advisor", [conversation("advisor", status)]);
    const expected = [zh.conversations.image.unassigned, assigned.currentAdvisorName!, assigned.currentAdvisorName!,
      zh.conversations.image.loadingAdvisor, zh.conversations.image.advisorUnavailable];
    for (let index = 0; index < advisorStates.length; index++) {
      Object.assign(current.store, advisorStates[index]); await Vue.nextTick(); current.expectNames([expected[index]!]);
    }
  });

  it.each([zh, en, vietnamese])("retains existing owner normalization and localized action names", async messages => {
    for (const status of ["open", "closed"] as const) {
      const owners = ["", "Unassigned", "  unassigned  ", "待分配", "备勤池", "  Named owner  "];
      for (const [index, owner] of owners.entries()) {
        const current = mount("support", [conversation("support", status, owner, `CV-owner-${index}`)], messages);
        current.store.advisor = null; await Vue.nextTick();
        const expected = status === "closed" ? index < 5 ? messages.conversations.sessionEnded : "Named owner"
          : index < 3 ? messages.conversations.unassignedAgent : owner.trim();
        current.expectNames([expected]);
      }
    }
  });

  it.each([zh, en, vietnamese])("distinguishes waiting from ended unassigned histories and confirms deletion of only the selected thread", async messages => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ ...conversation("support", index === 0 ? "open" : "closed", "待分配", `CV-${3169 - index}`), lastTs: Date.now() - index }));
    const current = mount("support", rows, messages);
    current.expectNames(["待分配", ...rows.slice(1).map(() => messages.conversations.sessionEnded)]);
    expect(current.store.conversations).toHaveLength(8);
    expect(current.nodes("nx-conv-contact")).toHaveLength(1);
    current.nodes("nx-conv-row")[0]!.props.onClick();
    expect(current.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?cid=CV-3169");
    for (const handler of [current.nodes("conversation-swipe")[0]!.props.onKeydown].flat()) {
      handler({ key: "ArrowLeft", preventDefault: vi.fn() });
    }
    await Vue.nextTick();
    expect(current.nodes("conversation-swipe__delete")[0]!.props["aria-hidden"]).toBe(false);
    current.confirm.mockResolvedValueOnce(false);
    current.nodes("conversation-swipe__delete")[0]!.props.onClick({ stopPropagation: vi.fn() });
    await Vue.nextTick();
    expect(current.confirm).toHaveBeenCalledOnce();
    expect(current.store.deleteConversation).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(current.nodes("conversation-swipe__delete")[0]!.props["aria-disabled"]).toBe(false));
    current.nodes("conversation-swipe__delete")[0]!.props.onClick({ stopPropagation: vi.fn() });
    await vi.waitFor(() => expect(current.store.deleteConversation).toHaveBeenCalledExactlyOnceWith("CV-3169"));
    expect(current.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ danger: true }));
    expect(current.store.dismissConversation).not.toHaveBeenCalled();
    expect(current.nodes("nx-conv-row")).toHaveLength(8);

    Object.assign(current.store.conversations[0]!, { status: "closed", sessionStatus: "closed" });
    await Vue.nextTick();
    current.expectNames(rows.map(() => messages.conversations.sessionEnded));
    expect(current.nodes("nx-conv-contact")).toHaveLength(1);
    current.nodes("nx-conv-contact")[0]!.props.onClick();
    expect(current.navTo).toHaveBeenLastCalledWith("/pages/support/chat?start=advisor");
  });

  it("keeps an unassigned ended advisor independent of current assignment and preserves a later historical owner", async () => {
    const current = mount("advisor", [conversation("advisor", "closed", "Unassigned")]);
    for (const state of advisorStates) {
      Object.assign(current.store, state); await Vue.nextTick();
      current.expectNames([zh.conversations.sessionEnded]);
    }
    current.store.conversations[0]!.agentName = "Historical owner";
    await Vue.nextTick();
    current.expectNames(["Historical owner"]);
  });
});
