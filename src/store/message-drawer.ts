import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useNotifications } from "./notifications";
import { useConversations } from "./conversations";
import { navTo } from "@/lib/route";

export type MessageSection = "notifications" | "service";

/** Shared message-center navigation and unread totals. The legacy overlay stays closed. */
export const useMessageDrawer = defineStore("messageDrawer", () => {
  const open = ref(false);
  const section = ref<MessageSection>("notifications");
  const notifications = useNotifications(), conversations = useConversations();
  const humanUnread = computed(() => conversations.totalUnread);
  const serviceUnread = computed(() => humanUnread.value);
  const totalUnread = computed(() => notifications.unread + humanUnread.value);
  const ticketUnread = computed(() => 0);
  const loading = computed(() => conversations.loading || notifications.loading);
  const error = computed(() => conversations.error || notifications.error);
  let opening: ReturnType<typeof navTo> | undefined;

  function show(initialSection?: MessageSection) {
    if (initialSection) section.value = initialSection;
    if (opening) return opening;
    try { const pages = getCurrentPages(); if (pages[pages.length - 1]?.route === "pages/me/notifications") return Promise.resolve(); } catch { /* Initial navigation may not have a page stack. */ }
    return opening = navTo(`/pages/me/notifications?section=${section.value}`).finally(() => { opening = undefined; });
  }
  function close() {
    open.value = false;
  }

  async function refresh() { await Promise.allSettled([notifications.refreshRemote(), conversations.refresh()]); }
  function bindAccount() { close(); section.value = "notifications"; }
  return { open, show, close, section, humanUnread, serviceUnread, totalUnread, ticketUnread, loading, error, refresh, bindAccount };
});
