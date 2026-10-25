import ts from "typescript";
import * as vue from "vue";
import { describe, expect, it, vi } from "vitest";
import source from "./service-message-list.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { fmt } from "@/i18n/format";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";
function mount() {
  const conversations = vue.reactive({
    loading: false, error: null, categoryLoading: false, categoryAvailabilityStatus: "ready", realtimeFallback: false,
    dismissalAvailable: true, dismissingIds: {} as Record<string, boolean>, typingIds: {} as Record<string, boolean>,
    byType: (kind: string) => kind === "advisor" ? [{ id: "advisor/1", lastTs: 40, lastMessage: "Advisor reply", messages: [], unread: 2, roleKey: "typeAdvisor" }] : [{ id: "support/1", lastTs: 20, lastMessage: "Latest server summary", messages: [{ ts: 10, text: "Old loaded reply", sender: "agent" }], unread: 1, roleKey: "typeSupport" }],
    dismissConversation: vi.fn(async () => {}), stopRealtime: vi.fn(), startRealtime: vi.fn(),
  });
  const tickets = vue.reactive({ loading: false, error: null, tickets: [{ id: "ticket/1", subject: "A ticket", lastReplyAt: 60, updatedAt: 60, unread: 3, status: "open", messages: [{ ts: 10, body: "Old ticket reply" }] }] });
  const props = vue.reactive({ filter: "all", hideFilters: true });
  const navTo = vi.fn(), emit = vi.fn(), refresh = vi.fn();
  const modules: Record<string, unknown> = {
    vue: { ...vue, watch: vi.fn() }, "@/store/conversations": { useConversations: () => conversations },
    "@/store/tickets": { useTickets: () => tickets }, "@/store/message-drawer": { useMessageDrawer: () => ({ refresh }) },
    "@/store/app": { useApp: () => ({ accountBindingEpoch: 0 }) }, "@/i18n/use-t": { useT: () => vue.ref(zh) },
    "@/i18n/format": { fmt }, "@/lib/route": { navTo }, "@/lib/support-idle-message": { localizedIdleClose },
    "@/lib/unread-badge": { formatUnreadBadge },
  };
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  const js = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const worker = new Function("require", "exports", "defineProps", "withDefaults", "defineEmits", js + ";return { rows, openRow, retry };")(
    (name: string) => name.endsWith(".vue") ? {} : modules[name], {}, () => props, (value: unknown) => value, () => emit,
  );
  return { worker, props, navTo, emit, refresh, conversations, tickets };
}
describe("unified service rows", () => {
  it("keeps each conversation's unread count, latest preview and target together", () => {
    const h = mount();
    expect(h.worker.rows.value.map((row: { kind: string }) => row.kind)).toEqual(["advisor", "advisor"]);
    expect(h.worker.rows.value[0].preview).toBe("Advisor reply");
    expect(h.worker.rows.value.map((row: { unread: number }) => row.unread)).toEqual([2, 1]);
    expect(h.worker.rows.value[1].preview).toBe('Latest server summary');
    h.props.filter = "advisor"; expect(h.worker.rows.value).toHaveLength(2);
    h.props.filter = "support"; expect(h.worker.rows.value).toHaveLength(2);
    h.props.filter = "ticket"; expect(h.worker.rows.value).toHaveLength(0);
    expect(source).not.toContain("support-tickets");
  });
  it("opens the customer window without claiming unread messages are acknowledged", () => {
    const h = mount();
    h.worker.openRow(h.worker.rows.value[0]);
    expect(h.navTo).toHaveBeenCalledWith("/pages/support/chat?cid=advisor%2F1");
    expect(h.worker.rows.value[0].unread).toBe(2);
    expect(h.tickets.tickets[0].unread).toBe(3); expect(h.emit).toHaveBeenCalledWith("navigate");
  });
  it('does not attach an older unread conversation to the newest read conversation', () => {
    const h = mount();
    h.conversations.byType = kind => kind === 'advisor'
      ? [{ id: 'new/read', lastTs: 80, lastMessage: 'Read', messages: [], unread: 0, roleKey: 'typeAdvisor' }]
      : [{ id: 'old/unread', lastTs: 20, lastMessage: 'Pending', messages: [], unread: 5, roleKey: 'typeSupport' }];
    expect(h.worker.rows.value.map((row: { id: string; unread: number }) => [row.id, row.unread])).toEqual([['new/read', 0], ['old/unread', 5]]);
    h.worker.openRow(h.worker.rows.value[1]);
    expect(h.navTo).toHaveBeenCalledWith('/pages/support/chat?cid=old%2Funread');
    expect(h.worker.rows.value[1].unread).toBe(5);
  });
  it("refreshes failed sources once and keeps conversation management in its existing page", () => {
    const h = mount();
    expect(source).toContain("go('/pages/support/messages')");
    expect(source).not.toContain('@click="remove(');
    h.worker.retry(); expect(h.refresh).toHaveBeenCalledOnce();
    h.conversations.loading = true; h.worker.retry(); expect(h.refresh).toHaveBeenCalledOnce();
  });
});
