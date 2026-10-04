import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CanonicalNotificationPage } from "@/api/notification-api";
import type { Conversation, Ticket } from "@/domain/support";
import { installSupportStorage } from "@/test/storage-setup";
import { navBack, navTo, takeNavigationQuery } from "@/lib/route";
import chassisSource from "@/components/app-chassis.vue?raw";
import headerSource from "@/components/sub-page-header.vue?raw";
import meSource from "@/pages/me/me.vue?raw";
import bubbleSource from "@/components/nova/nova-bubble.vue?raw";
import supportSource from "@/pages/me/support.vue?raw";
import ts from "typescript";

installSupportStorage();
const runtime = vi.hoisted(() => ({ remoteApiEnabled: true,
  notificationApi: { page: vi.fn(), markRead: vi.fn() },
  supportApi: { authorityRevision: vi.fn(), commandResult: vi.fn(), tickets: vi.fn(),
    ticket: vi.fn(), markTicketRead: vi.fn(), conversations: vi.fn(), conversationDismissals: vi.fn(),
    conversationCategories: vi.fn() },
}));
vi.mock("@/api/runtime", () => runtime);
const { useMessageDrawer } = await import("./message-drawer");
const { useNotifications } = await import("./notifications");
const { useTickets } = await import("./tickets");
const { useConversations } = await import("./conversations");

const notificationPage = (unread = 0): CanonicalNotificationPage => ({
  items: unread ? [{ id: 1, kind: "wallet", priority: "high", title: "Receipt", body: "", ctaLabel: "", ctaHref: "", createdAt: 1, readAt: null }] : [],
  unread, nextCursor: unread > 1 ? "older" : null,
});
function human(id: string, type: Conversation["type"], unread: number): Conversation {
  return { id, type, unread, status: "open", version: 1, lastTs: 1, lastPublicMessageId: 5, messages: [],
    agentName: "Agent", roleKey: "roleSupport", avatarTint: "blue", lastMessage: "Reply", sessionStatus: "active" };
}
function ticket(unread = 2, version = 1): Ticket {
  return { id: "TK-1", unread, version, subject: "Question", category: "technical", status: "open", priority: "normal",
    createdAt: 1, updatedAt: version, lastReplyAt: 1, messageCount: 1, owner: "Agent", messages: [] };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };
let pages: Array<{ route: string }>;
const navigate = vi.fn();

beforeEach(() => {
  setActivePinia(createPinia()); vi.resetAllMocks(); vi.useFakeTimers();
  pages = [{ route: "pages/index/index" }];
  vi.stubGlobal("getCurrentPages", () => pages);
  navigate.mockImplementation(({ url, success }) => {
    pages.push({ route: url.split("?")[0].replace(/^\//, "") });
    success?.({});
  });
  vi.stubGlobal("uni", { navigateTo: navigate, navigateBack: () => { pages.pop(); },
    reLaunch: ({ url }: { url: string }) => { pages = [{ route: url.replace(/^\//, "") }]; } });
  runtime.notificationApi.page.mockResolvedValue(notificationPage());
  runtime.supportApi.authorityRevision.mockResolvedValue("run-1");
  runtime.supportApi.commandResult.mockResolvedValue(null);
  runtime.supportApi.tickets.mockResolvedValue({ items: [], total: 0 });
  runtime.supportApi.conversations.mockResolvedValue({ items: [], total: 0 });
  runtime.supportApi.conversationDismissals.mockResolvedValue([]);
  runtime.supportApi.conversationCategories.mockResolvedValue({ advisor: true, support: true, ai: false });
});
afterEach(() => { useMessageDrawer().stopRefresh(); vi.useRealTimers(); });

describe("shared message center", () => {
  it("sums server notifications, visible human conversations and tickets without reading on open", async () => {
    runtime.notificationApi.page.mockResolvedValue(notificationPage(11));
    runtime.supportApi.tickets.mockResolvedValue({ items: [ticket()], total: 1 });
    runtime.supportApi.conversations.mockResolvedValue({ items: [human("advisor", "advisor", 3), human("support", "support", 4),
      human("ai", "ai", 50), human("dismissed", "support", 20)], total: 4 });
    runtime.supportApi.conversationDismissals.mockResolvedValue([{ conversationNo: "dismissed", throughMessageId: 5 }]);
    const center = useMessageDrawer();
    await center.refresh(); center.show("service");
    expect(center.section).toBe("service"); expect(pages[1].route).toBe("pages/me/notifications");
    expect(center.advisorUnread).toBe(3); expect(center.supportUnread).toBe(4);
    expect(center.humanUnread).toBe(7); expect(center.ticketUnread).toBe(2);
    expect(center.serviceUnread).toBe(9); expect(center.totalUnread).toBe(20);
    expect(runtime.notificationApi.markRead).not.toHaveBeenCalled();
    expect(runtime.supportApi.markTicketRead).not.toHaveBeenCalled();
    runtime.supportApi.markTicketRead.mockResolvedValue(ticket(0, 2));
    await useTickets().markRead(useTickets().tickets[0]);
    expect(center.ticketUnread).toBe(0); expect(center.totalUnread).toBe(18);
  });

  it("updates each human category from visible conversations while preserving sibling unread", async () => {
    runtime.supportApi.conversations.mockResolvedValueOnce({ items: [human("a1", "advisor", 3), human("a2", "advisor", 2),
      human("s1", "support", 4), human("ai", "ai", 80)], total: 4 })
      .mockResolvedValueOnce({ items: [human("a1", "advisor", 0), human("a2", "advisor", 2),
        human("s1", "support", 0), human("ai", "ai", 80)], total: 4 });
    const center = useMessageDrawer();
    await center.refresh();
    expect(center.advisorUnread).toBe(5); expect(center.supportUnread).toBe(4);
    expect(center.serviceUnread).toBe(9);
    await center.refresh();
    expect(center.advisorUnread).toBe(2); expect(center.supportUnread).toBe(0);
    expect(center.serviceUnread).toBe(2);
    useConversations().bindAccount("default");
    expect(center.advisorUnread).toBe(0); expect(center.supportUnread).toBe(0);
  });

  it("keeps the last successful counts and exposes source failures for retry", async () => {
    runtime.notificationApi.page.mockResolvedValueOnce(notificationPage(4)).mockRejectedValueOnce(new Error("offline"));
    runtime.supportApi.tickets.mockResolvedValueOnce({ items: [ticket()], total: 1 }).mockRejectedValueOnce(new Error("offline"));
    const center = useMessageDrawer();
    await center.refresh(); await center.refresh();
    expect(center.totalUnread).toBe(6); expect(center.error).toBe("offline"); expect(center.loading).toBe(false);
  });

  it("runs one non-overlapping foreground loop and leaves human polling to realtime", async () => {
    const slow = deferred<CanonicalNotificationPage>();
    runtime.notificationApi.page.mockReturnValueOnce(slow.promise);
    const center = useMessageDrawer();
    center.startRefresh(); center.startRefresh(); await flush();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(runtime.notificationApi.page).toHaveBeenCalledTimes(1);
    expect(runtime.supportApi.tickets).toHaveBeenCalledTimes(1);
    expect(runtime.supportApi.conversations).not.toHaveBeenCalled();
    slow.resolve(notificationPage(1)); await flush();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(runtime.notificationApi.page).toHaveBeenCalledTimes(2);
    center.stopRefresh(); await vi.advanceTimersByTimeAsync(30_000);
    expect(runtime.notificationApi.page).toHaveBeenCalledTimes(2);
  });

  it("rejects hidden responses and refreshes immediately when restored", async () => {
    const oldNotifications = deferred<CanonicalNotificationPage>();
    const oldTickets = deferred<{ items: Ticket[]; total: number }>();
    runtime.notificationApi.page.mockReturnValueOnce(oldNotifications.promise).mockResolvedValueOnce(notificationPage(2));
    runtime.supportApi.tickets.mockReturnValueOnce(oldTickets.promise).mockResolvedValueOnce({ items: [ticket(3)], total: 1 });
    const center = useMessageDrawer();
    center.startRefresh(); await flush(); center.stopRefresh(); center.startRefresh(); await flush();
    expect(center.totalUnread).toBe(5);
    oldNotifications.resolve(notificationPage(40)); oldTickets.resolve({ items: [ticket(20)], total: 1 });
    await flush(); expect(center.totalUnread).toBe(5);
    expect(runtime.notificationApi.page).toHaveBeenCalledTimes(2);
  });

  it("resets the section and rejects old-account sources after binding", async () => {
    const oldNotifications = deferred<CanonicalNotificationPage>();
    const oldTickets = deferred<{ items: Ticket[]; total: number }>();
    runtime.notificationApi.page.mockReturnValueOnce(oldNotifications.promise);
    runtime.supportApi.tickets.mockReturnValueOnce(oldTickets.promise);
    const center = useMessageDrawer();
    center.show("service"); const pending = center.refresh(); await flush();
    center.bindAccount(); useNotifications().bindAccount("default"); useTickets().bindAccount("default"); useConversations().bindAccount("default");
    oldNotifications.resolve(notificationPage(40)); oldTickets.resolve({ items: [ticket(20)], total: 1 });
    await pending;
    expect(center.section).toBe("notifications"); expect(center.totalUnread).toBe(0);
  });

  for (const origin of ["pages/index/index", "pages/store/store", "pages/me/me", "pages/me/support-tickets"]) {
    it(`opens the full-page center from every bell and returns to ${origin}`, async () => {
      const center = useMessageDrawer();
      for (const [source, handler, binding] of [[chassisSource, "goNotifications", "messageDrawer"], [headerSource, "goBell", "drawer"]]) {
        pages = [{ route: origin }]; navigate.mockClear();
        expect(source).toContain(`@click="${handler}"`);
        const body = source.match(new RegExp(`function ${handler}\\(\\) \\{([\\s\\S]*?)\\n\\}`))![1];
        const click = new Function(binding, body);
        click(center); await flush();
        expect(navigate).toHaveBeenCalledOnce();
        expect(pages.map(page => page.route)).toEqual([origin, "pages/me/notifications"]);
        expect(takeNavigationQuery("/pages/me/notifications")).toBe("?section=notifications");
        click(center); await flush();
        expect(navigate).toHaveBeenCalledOnce();
        navBack("/pages/me/me");
        expect(pages).toEqual([{ route: origin }]);
      }
    });
  }

  it("keeps Me and the existing center on the same route, preserves sections and handles a cold-open back", async () => {
    const center = useMessageDrawer();
    const href = meSource.match(/key: "messages",[^\n]+href: "([^"]+)"/)![1];
    await navTo(href);
    expect(pages[1].route).toBe("pages/me/notifications");
    await center.show("service");
    expect(center.section).toBe("service"); expect(navigate).toHaveBeenCalledOnce();
    navBack("/pages/me/me");
    await center.show();
    expect(takeNavigationQuery("/pages/me/notifications")).toBe("?section=service");
    pages = [{ route: "pages/me/notifications" }];
    navBack("/pages/me/me");
    expect(pages).toEqual([{ route: "pages/me/me" }]);
    expect(chassisSource).not.toContain("<MessageDrawer");
  });

  it("coalesces repeated bells while navigation is pending and allows opening again after returning", async () => {
    const center = useMessageDrawer();
    let arrive!: () => void;
    navigate.mockImplementationOnce(({ url, success }) => {
      arrive = () => { pages.push({ route: url.split("?")[0].replace(/^\//, "") }); success({}); };
    });
    const first = center.show("service"), repeated = center.show();
    expect(navigate).toHaveBeenCalledOnce(); expect(pages).toHaveLength(1);
    arrive();
    expect(await first).toBe(true); expect(await repeated).toBe(true);
    expect(pages).toHaveLength(2);
    navBack("/pages/me/me");
    await center.show();
    expect(navigate).toHaveBeenCalledTimes(2); expect(pages).toHaveLength(2);
  });

  it("routes the floating shortcut and live-chat channel through the shared Service entry without reading replies", async () => {
    const center = useMessageDrawer();
    const floatingBody = bubbleSource.match(/function open\(\) \{([\s\S]*?)\n\}/)![1];
    const floating = new Function("messageCenter", floatingBody);
    const channelFunction = supportSource.match(/function onChannel\(c: Channel\) \{[\s\S]*?\n\}/)![0];
    const compiled = ts.transpileModule(channelFunction, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const channel = new Function("messageCenter", "navTo", compiled + ";return onChannel;")(center, navTo);
    expect(bubbleSource).toContain('@click="open"');
    expect(supportSource).toContain('@click="onChannel(c)"');
    for (const [origin, open] of [
      ["pages/index/index", () => floating(center)],
      ["pages/me/support", () => channel({ id: "lc" })],
    ] as const) {
      pages = [{ route: origin }]; navigate.mockClear(); center.section = "notifications";
      open(); await flush();
      expect(navigate).toHaveBeenCalledOnce();
      expect(center.section).toBe("service");
      expect(takeNavigationQuery("/pages/me/notifications")).toBe("?section=service");
      expect(pages.map(page => page.route)).toEqual([origin, "pages/me/notifications"]);
      open(); await flush();
      expect(navigate).toHaveBeenCalledOnce();
      navBack("/pages/me/me"); expect(pages).toEqual([{ route: origin }]);
    }
    expect(runtime.notificationApi.markRead).not.toHaveBeenCalled();
    expect(runtime.supportApi.markTicketRead).not.toHaveBeenCalled();
    await channel({ id: "tk", href: "/pages/me/support-tickets?mode=create" });
    expect(pages[1].route).toBe("pages/me/support-tickets");
  });
});
