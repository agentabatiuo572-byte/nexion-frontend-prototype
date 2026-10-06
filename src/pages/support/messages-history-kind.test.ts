// @ts-expect-error Node-only SFC test harness.
import { readFileSync } from "node:fs";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import * as Vue from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";
import type { Conversation } from "@/domain/support";
import type { CurrentAdvisor } from "@/api/support-api";

// Same actual-template renderer mechanism as messages-start-entry.test.ts.
const source = readFileSync(new URL("./messages.vue", import.meta.url), "utf8");
const compiled = compileScript(parse(source).descriptor, { id: "history-kind-test", inlineTemplate: true,
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
    advisor: unbound as CurrentAdvisor | null, advisorLoading: false, advisorError: false, realtimeFallback: false,
    dismissingIds: {}, dismissalAvailable: true, dismissConversation: vi.fn(), refresh: vi.fn(), refreshCategories: vi.fn(), refreshAdvisor: vi.fn(),
    byType: (key: string): Conversation[] => store.conversations.filter(row => row.type === key),
    categoryReadable: (key: string) => key === type, categoryEnabled: (key: string) => key === type,
  });
  const navTo = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: vi.fn(), onHide: vi.fn() },
    "@/i18n/use-t": { useT: () => Vue.ref(messages) }, "@/i18n/format": { fmt },
    "@/lib/support-idle-message": { localizedIdleClose }, "@/lib/unread-badge": { formatUnreadBadge },
    "@/lib/nova-visibility": { NOVA_SUPPORT_VISIBLE: false }, "@/lib/route": { navTo },
    "@/store/conversations": { useConversations: () => store }, "@/store/nova": { useNova: () => ({ messages: [], unread: 0 }) },
    "@/store/app": { useApp: () => Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 }) },
    "@/api/runtime": { remoteApiEnabled: true }, "@/lib/active-page-refresh": { registerActivePageRefresh: vi.fn() },
    "@/components/app-chassis.vue": { default: { setup: (_props: unknown, { slots }: any) => () => Vue.h("main", slots.default?.()) } },
  };
  const component = new Function("require", "exports", `${script}; return exports.default;`)((name: string) => {
    if (name in modules) return modules[name];
    if (name.endsWith(".vue")) return { default: { render: () => null } };
    throw new Error(`Unexpected dependency: ${name}`);
  }, {});
  const root = element("root"), app = renderer.createApp(component); app.mount(root); mounted.push(app);
  const nodes = (className: string) => flatten(root).filter(node => String(node.props.class).split(" ").includes(className));
  function expectNames(names: string[]) {
    expect(nodes("nx-conv-rowname").map(node => node.text)).toEqual(names);
    expect(nodes("nx-conv-row").map(node => node.props["aria-label"])).toEqual(names);
    expect(nodes("nx-conv-remove").map(node => node.props["aria-label"])).toEqual(names.map(name => `${messages.conversations.removeFromList} · ${name}`));
  }
  return { store, navTo, nodes, expectNames };
}

describe("human list identity follows each conversation kind and status", () => {
  it.each(["warm", "cold"])("keeps seven %s support/CLOSED rows and action names independent of UNBOUND", async entry => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ ...conversation("support", "closed", "待分配", `CV-${3168 - index}`),
      lastMessage: "会话已因用户闲置 5 分钟自动结束,可重新发起会话。", lastMessageKind: "IDLE_TIMEOUT_CLOSE" as const }));
    const current = mount("support", entry === "warm" ? rows : []);
    if (entry === "cold") { current.store.conversations = rows; await Vue.nextTick(); }
    current.expectNames(rows.map(() => zh.conversations.sessionEnded));
    expect(current.nodes("nx-conv-rowprev").map(node => node.text)).toEqual(rows.map(row => localizedIdleClose(row.lastMessage, zh.conversations)));
    expect(current.nodes("nx-conv-rowtime").map(node => node.text)).toEqual(rows.map(() => fmt(zh.conversations.tDayAgo, { n: 4 })));
    expect(current.nodes("nx-conv-unread-t").map(node => node.children[0]?.text || node.text)).toEqual(rows.map(() => "2"));
    current.nodes("nx-conv-row").forEach(node => node.props.onClick());
    expect(current.navTo.mock.calls.map(call => call[0])).toEqual(rows.map(row => `/pages/support/chat?cid=${row.id}`));
    expect(current.store.dismissConversation).not.toHaveBeenCalled();
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
      const current = mount("support", owners.map((owner, index) => conversation("support", status, owner, `CV-owner-${index}`)), messages);
      current.store.advisor = null; await Vue.nextTick();
      current.expectNames(status === "closed"
        ? [...Array(5).fill(messages.conversations.sessionEnded), "Named owner"]
        : [messages.conversations.unassignedAgent, messages.conversations.unassignedAgent, messages.conversations.unassignedAgent,
          "待分配", "备勤池", "Named owner"]);
    }
  });

  it.each([zh, en, vietnamese])("distinguishes one waiting session from seven ended sessions without changing actions", async messages => {
    const rows = Array.from({ length: 8 }, (_, index) => conversation("support", index === 0 ? "open" : "closed", "待分配", `CV-${3169 - index}`));
    const current = mount("support", rows, messages);
    current.expectNames(["待分配", ...Array(7).fill(messages.conversations.sessionEnded)]);
    expect(current.nodes("nx-conv-contact")).toHaveLength(0);
    current.nodes("nx-conv-row")[1]!.props.onClick();
    expect(current.navTo).toHaveBeenCalledExactlyOnceWith("/pages/support/chat?cid=CV-3168");
    await current.nodes("nx-conv-remove")[1]!.props.onClick();
    expect(current.store.dismissConversation).toHaveBeenCalledExactlyOnceWith("CV-3168");
    expect(current.nodes("nx-conv-row")).toHaveLength(8);

    Object.assign(current.store.conversations[0]!, { status: "closed", sessionStatus: "closed" });
    await Vue.nextTick();
    current.expectNames(Array(8).fill(messages.conversations.sessionEnded));
    expect(current.nodes("nx-conv-contact")).toHaveLength(1);
    current.nodes("nx-conv-contact")[0]!.props.onClick();
    expect(current.navTo).toHaveBeenLastCalledWith("/pages/support/chat?start=support");
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
