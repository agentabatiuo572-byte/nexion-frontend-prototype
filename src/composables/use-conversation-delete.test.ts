import { createRenderer, nextTick, reactive, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationDelete } from "./use-conversation-delete";
import { conversationActionsCopy } from "@/i18n/conversation-actions";

const mocks = vi.hoisted(() => ({
  account: null as any, store: null as any, locale: null as any,
  hide: [] as Array<() => void>,
  confirm: vi.fn<(_options: any) => Promise<boolean>>(),
  clearConfirmsBy: vi.fn(), error: vi.fn(),
}));
vi.mock("@dcloudio/uni-app", () => ({ onHide: (fn: () => void) => mocks.hide.push(fn) }));
vi.mock("@/store/app", () => ({ useApp: () => mocks.account }));
vi.mock("@/store/conversations", () => ({ useConversations: () => mocks.store }));
vi.mock("@/store/locale", () => ({ useLocaleStore: () => mocks.locale }));
vi.mock("@/store/ui", () => ({
  confirm: mocks.confirm, toast: { error: mocks.error }, useUI: () => ({ clearConfirmsBy: mocks.clearConfirmsBy }),
}));

type Element = { parent: Element | null; children: Element[] };
const element = (): Element => ({ parent: null, children: [] });
const renderer = createRenderer<Element, Element>({
  createElement: element, createComment: element, createText: element,
  setElementText() {}, setText() {}, patchProp() {}, nextSibling: () => null, parentNode: n => n.parent,
  insert(n, parent) { n.parent = parent; parent.children.push(n); },
  remove(n) { if (n.parent) n.parent.children = n.parent.children.filter(child => child !== n); },
});
const mounted = new Set<App<Element>>();
function mount() {
  let actions!: ReturnType<typeof useConversationDelete>;
  const app = renderer.createApp({ setup() { actions = useConversationDelete(); return () => null; } });
  app.mount(element()); mounted.add(app);
  return { actions, hide: mocks.hide[mocks.hide.length - 1],
    unmount() { if (mounted.delete(app)) app.unmount(); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  mocks.account = reactive({ accountBindingEpoch: 1 });
  mocks.locale = reactive({ code: "zh" });
  mocks.store = reactive({
    deletionAvailable: true, deletingIds: {} as Record<string, boolean>,
    conversations: [{ id: "A", messages: [{ id: "1", text: "Keep history" }] }, { id: "B", messages: [] }],
    deleteConversation: vi.fn(async (_id: string) => {}),
  });
  mocks.hide.length = 0;
  mocks.confirm.mockReset().mockResolvedValue(false); mocks.clearConfirmsBy.mockClear(); mocks.error.mockClear();
});
afterEach(() => { mounted.forEach(app => app.unmount()); mounted.clear(); });

describe("actual conversation deletion composable", () => {
  // The backing action is server account+peer view clearing, not physical message deletion.
  // Persistence, pagination and attachment watermarks belong to the API/store contract suite.
  it.each(["zh", "en", "vi"] as const)("asks about clearing the user's peer history in %s before dispatch", async code => {
    mocks.locale.code = code;
    const h = mount(), gate = deferred<boolean>(); mocks.confirm.mockReturnValueOnce(gate.promise);
    const pending = h.actions.remove("A");
    expect(h.actions.pending.value).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      owner: expect.stringMatching(/^conversation-delete:\d+$/), title: conversationActionsCopy[code].title,
      message: conversationActionsCopy[code].message, confirmLabel: conversationActionsCopy[code].confirm,
      cancelLabel: conversationActionsCopy[code].cancel, danger: true, icon: "warn",
    }));
    const meaning = {
      zh: [/重新登录.*换设备/, /客服端.*保留.*记录/, /新消息/],
      en: [/signing in again.*switching devices/, /Support retains the full history/, /receive new messages/],
      vi: [/đăng nhập lại.*đổi thiết bị/, /Phía hỗ trợ vẫn giữ đầy đủ lịch sử/, /tin nhắn mới/],
    };
    for (const requirement of meaning[code]) expect(mocks.confirm.mock.calls[0][0].message).toMatch(requirement);
    expect(mocks.store.deleteConversation).not.toHaveBeenCalled();
    gate.resolve(false); await pending;
    expect(h.actions.pending.value).toBe(false);
    expect(mocks.store.deleteConversation).not.toHaveBeenCalled();
  });
  it("cancel keeps the selected row, all history, and the other peer untouched", async () => {
    const h = mount(), before = JSON.stringify(mocks.store.conversations);
    h.actions.openedId.value = "A";
    await h.actions.remove("A");
    expect(mocks.store.deleteConversation).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.store.conversations)).toBe(before);
    expect(h.actions.openedId.value).toBe("A"); expect(mocks.error).not.toHaveBeenCalled();
  });
  it("singleflights confirmation and the actual delete, then closes the swipe only after success", async () => {
    const h = mount(), answer = deferred<boolean>(), deletion = deferred<void>();
    h.actions.openedId.value = "A"; mocks.confirm.mockReturnValueOnce(answer.promise);
    mocks.store.deleteConversation.mockReturnValueOnce(deletion.promise);
    const pending = h.actions.remove("A"); await h.actions.remove("B");
    expect(mocks.confirm).toHaveBeenCalledOnce();
    answer.resolve(true); await Promise.resolve();
    expect(mocks.store.deleteConversation).toHaveBeenCalledExactlyOnceWith("A");
    expect(h.actions.openedId.value).toBe("A"); expect(h.actions.pending.value).toBe(true);
    await h.actions.remove("A"); expect(mocks.confirm).toHaveBeenCalledOnce();
    deletion.resolve(); await pending;
    expect(h.actions.openedId.value).toBe(""); expect(h.actions.pending.value).toBe(false);
  });
  it("a failed deletion retains history, reports failure, and allows an explicit new confirmation", async () => {
    const h = mount(), before = JSON.stringify(mocks.store.conversations);
    h.actions.openedId.value = "A"; mocks.confirm.mockResolvedValue(true);
    mocks.store.deleteConversation.mockRejectedValueOnce(new Error("offline"));
    await h.actions.remove("A");
    expect(JSON.stringify(mocks.store.conversations)).toBe(before);
    expect(h.actions.openedId.value).toBe("A"); expect(h.actions.pending.value).toBe(false);
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(conversationActionsCopy.zh.failed);
    await h.actions.remove("A");
    expect(mocks.confirm).toHaveBeenCalledTimes(2); expect(mocks.store.deleteConversation).toHaveBeenCalledTimes(2);
  });
  it.each(["capability unavailable", "already deleting"])("does nothing when %s", async state => {
    const h = mount();
    if (state === "capability unavailable") mocks.store.deletionAvailable = false;
    else mocks.store.deletingIds.A = true;
    await h.actions.remove("A");
    expect(mocks.confirm).not.toHaveBeenCalled(); expect(mocks.store.deleteConversation).not.toHaveBeenCalled();
  });
  it.each(["hide", "account", "unmount"] as const)("invalidates a held confirmation on %s before a late acceptance", async boundary => {
    const h = mount(), answer = deferred<boolean>();
    h.actions.openedId.value = "A"; mocks.confirm.mockReturnValueOnce(answer.promise);
    const pending = h.actions.remove("A");
    const owner = mocks.confirm.mock.calls[0][0].owner;
    if (boundary === "hide") h.hide();
    if (boundary === "account") { mocks.account.accountBindingEpoch++; await nextTick(); }
    if (boundary === "unmount") h.unmount();
    expect(mocks.clearConfirmsBy).toHaveBeenCalledWith(owner);
    answer.resolve(true); await pending;
    expect(mocks.store.deleteConversation).not.toHaveBeenCalled();
    expect(h.actions.pending.value).toBe(false); expect(h.actions.openedId.value).toBe("");
  });
  it("a late old failure cannot toast or release a new delete after leaving and returning", async () => {
    const h = mount(), old = deferred<void>(), fresh = deferred<void>();
    mocks.confirm.mockResolvedValue(true);
    mocks.store.deleteConversation.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const first = h.actions.remove("A"); await Promise.resolve(); h.hide();
    const second = h.actions.remove("B"); await Promise.resolve();
    old.reject(new Error("old failure")); await first;
    expect(mocks.error).not.toHaveBeenCalled(); expect(h.actions.pending.value).toBe(true);
    await h.actions.remove("B"); expect(mocks.store.deleteConversation).toHaveBeenCalledTimes(2);
    fresh.resolve(); await second; expect(h.actions.pending.value).toBe(false);
  });
  it("uses distinct dialog owners for the two inbox surfaces", async () => {
    const one = mount(), two = mount(), first = deferred<boolean>(), second = deferred<boolean>();
    mocks.confirm.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = one.actions.remove("A"), b = two.actions.remove("B");
    const [ownerA, ownerB] = mocks.confirm.mock.calls.map(([options]) => options.owner);
    expect(ownerA).not.toBe(ownerB);
    one.unmount();
    expect(mocks.clearConfirmsBy).toHaveBeenCalledExactlyOnceWith(ownerA);
    first.resolve(true); second.resolve(false); await Promise.all([a, b]);
    expect(mocks.store.deleteConversation).not.toHaveBeenCalled();
  });
});
