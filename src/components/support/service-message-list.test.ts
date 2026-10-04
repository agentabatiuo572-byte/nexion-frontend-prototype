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
  it("merges real ticket and human replies in latest-first order without reusing stale bodies", () => {
    const h = mount();
    expect(h.worker.rows.value.map((row: { kind: string }) => row.kind)).toEqual(["ticket", "advisor", "support"]);
    expect(h.worker.rows.value[0].preview).toBe(zh.notifs.ticketReply);
    expect(h.worker.rows.value[2].preview).toBe("Latest server summary");
    expect(h.worker.rows.value.map((row: { unread: number }) => row.unread)).toEqual([3, 2, 1]);
    h.props.filter = "advisor"; expect(h.worker.rows.value).toHaveLength(1);
    h.props.filter = "ticket"; expect(h.worker.rows.value[0].kind).toBe("ticket");
  });
  it("opens the selected detail without claiming its unread replies were already acknowledged", () => {
    const h = mount();
    h.worker.openRow(h.worker.rows.value[0]); expect(h.navTo).toHaveBeenCalledWith("/pages/me/support-tickets?ticket=ticket%2F1");
    h.worker.openRow(h.worker.rows.value[1]); expect(h.navTo).toHaveBeenCalledWith("/pages/support/chat?cid=advisor%2F1");
    expect(h.tickets.tickets[0].unread).toBe(3); expect(h.emit).toHaveBeenCalledWith("navigate");
  });
  it("refreshes failed sources once and keeps conversation management in its existing page", () => {
    const h = mount();
    expect(source).toContain("go('/pages/support/messages')");
    expect(source).not.toContain('@click="remove(');
    h.worker.retry(); expect(h.refresh).toHaveBeenCalledOnce();
    h.conversations.loading = true; h.worker.retry(); expect(h.refresh).toHaveBeenCalledOnce();
  });
});
