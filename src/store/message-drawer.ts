import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { remoteApiEnabled } from "@/api/runtime";
import { useNotifications } from "./notifications";
import { useConversations } from "./conversations";
import { useTickets } from "./tickets";
import { navTo } from "@/lib/route";

export type MessageSection = "notifications" | "service";
export const useMessageDrawer = defineStore("messageDrawer", () => {
  const section = ref<MessageSection>("notifications");
  const notifications = useNotifications(), conversations = useConversations(), tickets = useTickets();
  const advisorUnread = computed(() => conversations.byType("advisor").reduce((sum, row) => sum + row.unread, 0));
  const supportUnread = computed(() => conversations.byType("support").reduce((sum, row) => sum + row.unread, 0));
  const humanUnread = computed(() => advisorUnread.value + supportUnread.value);
  const ticketUnread = computed(() => tickets.tickets.reduce((sum, ticket) => sum + ticket.unread, 0));
  const serviceUnread = computed(() => humanUnread.value + ticketUnread.value);
  const totalUnread = computed(() => notifications.unread + serviceUnread.value);
  const loading = computed(() => notifications.loading || conversations.loading || tickets.loading);
  const error = computed(() => notifications.error || conversations.error || tickets.error
    || (conversations.categoryAvailabilityStatus === "failed" ? "SUPPORT_CATEGORIES_UNAVAILABLE" : null));
  let epoch = 0;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: { human: boolean; promise: Promise<void> } | undefined;
  let opening: Promise<boolean> | undefined;

  function show(initialSection?: MessageSection) {
    if (opening) return opening;
    if (initialSection) section.value = initialSection;
    try {
      const pages = getCurrentPages();
      if (pages[pages.length - 1]?.route === "pages/me/notifications") return Promise.resolve(true);
    } catch { /* Startup navigation may not yet expose a page stack. */ }
    return opening = navTo(`/pages/me/notifications?section=${section.value}`)
      .finally(() => { opening = undefined; });
  }

  async function refresh(includeHuman = true): Promise<void> {
    const requestEpoch = epoch;
    const active = () => requestEpoch === epoch;
    if (inFlight) {
      const previous = inFlight;
      await previous.promise;
      if (active() && includeHuman && !previous.human) await refresh();
      return;
    }
    const work = async () => {
      const requests: Promise<unknown>[] = [];
      // A page-triggered request already supplies this snapshot; do not race pagination.
      if (!notifications.loading) requests.push(notifications.refreshRemote(undefined, active));
      if (!tickets.loading) requests.push(tickets.refresh(active));
      if (includeHuman) requests.push(conversations.refresh(active), conversations.refreshCategories(active));
      await Promise.allSettled(requests);
    };
    const job = { human: includeHuman, promise: work() };
    inFlight = job;
    try { await job.promise; }
    finally { if (inFlight === job) inFlight = undefined; }
  }

  function startRefresh() {
    if (running || !remoteApiEnabled) return;
    running = true;
    const requestEpoch = epoch;
    const tick = async () => {
      if (!running || requestEpoch !== epoch) return;
      await refresh(false);
      if (running && requestEpoch === epoch) timer = setTimeout(() => { void tick(); }, 15_000);
    };
    void tick();
  }
  function stopRefresh() {
    running = false;
    epoch += 1;
    clearTimeout(timer);
    timer = undefined;
    inFlight = undefined;
    notifications.cancelRefresh();
    tickets.cancelRefresh();
  }
  function bindAccount() {
    stopRefresh();
    section.value = "notifications";
  }

  return { section, show, advisorUnread, supportUnread, humanUnread, ticketUnread, serviceUnread, totalUnread,
    loading, error, refresh, startRefresh, stopRefresh, bindAccount };
});
