<template>
  <view class="service-messages">
    <GlassSegments v-if="!hideFilters" v-model="filter" :options="filters" layout="scroll" semantics="radio" :label="t.notifs.serviceFilterLabel" />
    <view v-if="loading" class="service-state" role="status" aria-live="polite"><text>{{ t.help.loadingMore }}</text></view>
    <view v-if="failed" class="service-state" role="alert">
      <text>{{ rows.length ? t.conversations.staleSnapshot : t.conversations.loadError }}</text>
      <view class="service-button" role="button" :tabindex="loading ? -1 : 0" :aria-disabled="loading" @click="retry">
        <LiquidGlass :radius="22" /><text>{{ t.ui.retry }}</text>
      </view>
    </view>
    <view v-else-if="conversations.realtimeFallback" class="service-state" role="status">
      <text>{{ t.conversations.realtimeFallback }}</text>
      <view class="service-button" role="button" :tabindex="loading ? -1 : 0" :aria-disabled="loading" @click="retry"><LiquidGlass :radius="22" /><text>{{ t.ui.retry }}</text></view>
    </view>
    <view v-if="!loading && !failed && !rows.length" class="service-state service-empty">
      <text class="service-empty-title">{{ t.notifs.serviceEmpty }}</text>
      <text>{{ t.notifs.serviceEmptyHint }}</text>
    </view>
    <view v-for="row in rows" :key="row.key" class="service-rowgroup">
      <view class="service-row" role="button" tabindex="0" :aria-label="row.title + (row.unread ? ' · ' + fmt(t.notifs.unreadCount, { n: row.unread }) : '')" @click="openRow(row)">
        <view class="service-avatar" :class="'service-avatar--' + row.kind" aria-hidden="true">
          <LiquidGlass :radius="22" />
          <svg v-if="row.kind === 'advisor'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
          <svg v-else-if="row.kind === 'support'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /></svg>
          <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
        </view>
        <view class="service-content">
          <view class="service-rowtop"><text class="service-title">{{ row.title }}</text><text class="service-time">{{ timeAgo(row.ts) }}</text></view>
          <view class="service-rowbottom"><text class="service-preview">{{ row.preview }}</text><view v-if="row.unread > 0" class="service-unread"><text>{{ formatUnreadBadge(row.unread) }}</text></view></view>
        </view>
        <svg class="service-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 5 7 7-7 7" /></svg>
      </view>
    </view>
    <view class="service-note"><text>{{ t.notifs.serviceReadHint }}</text></view>
    <view class="service-links">
      <view class="service-button" role="button" tabindex="0" @click="go('/pages/support/messages')"><LiquidGlass :radius="22" /><text>{{ t.notifs.contactService }}</text></view>
      <view class="service-button" role="button" tabindex="0" @click="go('/pages/me/support-tickets')"><LiquidGlass :radius="22" /><text>{{ t.notifs.manageTickets }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import GlassSegments from "@/components/glass-segments.vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import { useConversations } from "@/store/conversations";
import { useTickets } from "@/store/tickets";
import { useMessageDrawer } from "@/store/message-drawer";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";

const props = withDefaults(defineProps<{ filter?: "all" | "advisor" | "support" | "ticket"; hideFilters?: boolean }>(), { filter: "all", hideFilters: false });
const emit = defineEmits<{ (event: "navigate"): void }>();
const conversations = useConversations(), tickets = useTickets(), center = useMessageDrawer();
const t = useT();
type ServiceKind = "advisor" | "support" | "ticket";
type Row = { key: string; id: string; kind: ServiceKind; title: string; preview: string; ts: number; unread: number };
const filter = ref<"all" | ServiceKind>("all");
const filters = computed(() => [
  { value: "all", label: t.value.notifs.filterAll },
  { value: "advisor", label: t.value.conversations.typeAdvisor },
  { value: "support", label: t.value.conversations.typeSupport },
  { value: "ticket", label: t.value.notifs.ticketFilter },
]);
const loading = computed(() => conversations.loading || tickets.loading || conversations.categoryLoading);
const failed = computed(() => !!(conversations.error || tickets.error || conversations.categoryAvailabilityStatus === "failed"));
const clean = (text: string) => text.replace(/\*\*/g, "").replace(/\s*\n+\s*/g, " ").trim();
const rows = computed<Row[]>(() => {
  const human: Row[] = (["advisor", "support"] as const).flatMap(kind => conversations.byType(kind).map(c => {
    const last = c.messages[c.messages.length - 1];
    const useLoaded = !!last && last.ts >= c.lastTs;
    const text = useLoaded ? last.kind === "IMAGE" && !last.text ? t.value.conversations.image.message : last.text : c.lastMessage;
    const preview = c.lastMessageKind === "IDLE_TIMEOUT_CLOSE" && (!useLoaded || last.sender === "system")
      ? localizedIdleClose(text, t.value.conversations) ?? text : text;
    return { key: `conversation:${c.id}`, id: c.id, kind,
      title: kind === "advisor" ? t.value.conversations.typeAdvisor : t.value.conversations.typeSupport,
      preview: conversations.typingIds[c.id] ? t.value.conversations.agentTyping : clean(preview) || t.value.conversations[c.roleKey],
      ts: Math.max(c.lastTs, last?.ts ?? 0), unread: c.unread };
  }));
  const ticketRows: Row[] = tickets.tickets.map(ticket => {
    const last = ticket.messages[ticket.messages.length - 1];
    return { key: `ticket:${ticket.id}`, id: ticket.id, kind: "ticket", title: `${t.value.notifs.ticketFilter} · ${ticket.subject}`,
      // List headers do not include a reply body. Do not present an older hydrated reply as the latest one.
      preview: last && last.ts >= ticket.lastReplyAt ? clean(last.body) : ticket.unread > 0 ? t.value.notifs.ticketReply : t.value.tickets.status[ticket.status],
      ts: Math.max(ticket.lastReplyAt, ticket.updatedAt), unread: ticket.unread };
  });
  return [...human, ...ticketRows].filter(row => (props.hideFilters ? props.filter : filter.value) === "all" || row.kind === (props.hideFilters ? props.filter : filter.value))
    .sort((a, b) => b.ts - a.ts || a.key.localeCompare(b.key));
});
function timeAgo(ts: number) {
  const minutes = Math.max(1, Math.floor((Date.now() - ts) / 60_000));
  return minutes < 60 ? fmt(t.value.notifs.minutesAgo, { n: minutes }) : minutes < 1440
    ? fmt(t.value.notifs.hoursAgo, { n: Math.floor(minutes / 60) }) : fmt(t.value.notifs.daysAgo, { n: Math.floor(minutes / 1440) });
}
function go(route: string) { emit("navigate"); navTo(route); }
function openRow(row: Row) {
  go(row.kind === "ticket" ? `/pages/me/support-tickets?ticket=${encodeURIComponent(row.id)}` : `/pages/support/chat?cid=${encodeURIComponent(row.id)}`);
}
function retry() {
  if (loading.value) return;
  if (conversations.realtimeFallback) { conversations.stopRealtime(); conversations.startRealtime(); }
  void center.refresh();
}
</script>

<style scoped>
.service-messages { padding: 0 16px 16px; font-family: var(--font-v5); }
.service-note { padding: 12px 0; color: var(--v5-ink-3); font-size: 13px; line-height: 1.5; }
.service-rowgroup { border-bottom: 1px solid color-mix(in srgb, var(--v5-border) 55%, transparent); }
.service-row { display: flex; align-items: center; gap: 12px; min-height: 76px; padding: 24px 0; cursor: pointer; }
.service-row:active { opacity: .78; }
.service-row:focus-visible, .service-button:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.service-avatar { position: relative; width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; color: var(--v5-ink-2); }
.service-avatar > svg { position: relative; }
.service-content { flex: 1; min-width: 0; }
.service-rowtop, .service-rowbottom { display: flex; justify-content: space-between; gap: 8px; }
.service-rowtop { align-items: baseline; flex-wrap: wrap; }
.service-title { color: var(--v5-ink); font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.service-time { font-size: 12px; color: var(--v5-ink-3); white-space: nowrap; }
.service-rowbottom { align-items: center; margin-top: 5px; }
.service-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; color: var(--v5-ink-2); font-size: 13px; line-height: 1.5; }
.service-unread { flex-shrink: 0; align-self: flex-start; min-width: 20px; height: 20px; padding: 0 4px; box-sizing: border-box; border-radius: var(--v5-radius-full); display: grid; place-items: center; background: var(--v5-brand-soft); color: var(--v5-brand); font-size: 12px; font-weight: 600; }
.service-chevron { color: var(--v5-ink-3); flex-shrink: 0; }
.service-state { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px 0; color: var(--v5-ink-3); font-size: 13px; line-height: 1.6; }
.service-empty { padding: 32px 0; }
.service-empty-title { color: var(--v5-ink); font-size: 15px; font-weight: 600; }
.service-button { position: relative; min-height: 44px; padding: 0 16px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 22px; color: var(--v5-brand); font-size: 13px; cursor: pointer; }
.service-button > text { position: relative; }
.service-button:active { opacity: .78; }
.service-button[aria-disabled="true"] { opacity: .5; }
.service-links { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 20px; }
</style>
