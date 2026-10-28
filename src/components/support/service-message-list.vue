<template>
  <view class="service-messages" :aria-busy="loading">
    <GlassSegments v-if="!hideFilters" v-model="filter" :options="filters" layout="scroll" semantics="radio" :label="t.notifs.serviceFilterLabel" />
    <view v-if="loading && !rows.length" class="service-state" role="status" aria-live="polite"><text>{{ t.help.loadingMore }}</text></view>
    <view v-if="!loading && !failed && !rows.length" class="service-state service-empty">
      <text class="service-empty-title">{{ t.notifs.serviceEmpty }}</text>
      <text>{{ t.notifs.serviceEmptyHint }}</text>
      <view v-if="conversations.categoryEnabled('advisor')" class="service-button" role="button" tabindex="0" @click="go('/pages/support/chat?start=advisor')"><LiquidGlass :radius="22" /><text>{{ actions.copy.value.contact }}</text></view>
    </view>
    <ConversationSwipeRow v-for="row in rows" :key="row.key" class="service-rowgroup" :label="row.title"
      :delete-label="actions.copy.value.delete" :open="actions.openedId.value === row.key"
      :disabled="!conversations.deletionAvailable" :busy="actions.pending.value || conversations.deletingIds[row.id]"
      @update:open="actions.openedId.value = $event ? row.key : ''" @delete="actions.remove(row.id)">
      <view class="service-row" role="button" tabindex="0" :aria-label="row.title + (!unreadUnavailable(row) && row.unread ? ' · ' + fmt(t.notifs.unreadCount, { n: row.unread }) : '')" @click="openRow(row)">
        <view class="service-avatar" :class="'service-avatar--' + row.kind" aria-hidden="true">
          <LiquidGlass :radius="22" />
          <svg v-if="row.kind === 'advisor'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
          <svg v-else-if="row.kind === 'support'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /></svg>
          <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
        </view>
        <view class="service-content">
          <text class="service-title">{{ row.title }}</text>
          <text class="service-preview">{{ row.preview }}</text>
          <text class="service-time">{{ activityTime(row.ts) }}</text>
        </view>
        <view class="service-meta"><view v-if="unreadUnavailable(row) || row.unread > 0" class="service-unread"><text>{{ unreadUnavailable(row) ? '-' : formatUnreadBadge(row.unread) }}</text></view></view>
      </view>
    </ConversationSwipeRow>
    <view v-if="!failed && conversations.realtimeFallback" class="service-state nx-inline-recovery" role="status">
      <text class="nx-inline-recovery__copy">{{ t.conversations.realtimeFallback }}</text>
      <view class="service-button service-retry nx-inline-recovery__action" role="button" :tabindex="loading ? -1 : 0" :aria-disabled="loading" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry"><text>{{ t.ui.retry }}</text></view>
    </view>
    <view v-if="failed" class="service-state nx-inline-recovery" role="alert">
      <text class="nx-inline-recovery__copy">{{ rows.length ? t.conversations.staleSnapshot : t.conversations.loadError }}</text>
      <view class="service-button service-retry nx-inline-recovery__action" role="button" :tabindex="loading ? -1 : 0" :aria-disabled="loading" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry">
        <text>{{ t.ui.retry }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import GlassSegments from "@/components/glass-segments.vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import ConversationSwipeRow from './conversation-swipe-row.vue';
import { useConversationDelete } from '@/composables/use-conversation-delete';
import { useConversations } from "@/store/conversations";

import { useMessageDrawer } from "@/store/message-drawer";
import { useT } from "@/i18n/use-t";
import { fmt, dateLocale } from "@/i18n/format";
import { formatDisplayDateTime } from "@/lib/display-date";
import { navTo } from "@/lib/route";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";

const props = withDefaults(defineProps<{ filter?: "all" | "advisor" | "support" | "ticket"; hideFilters?: boolean }>(), { filter: "all", hideFilters: false });
const emit = defineEmits<{ (event: "navigate"): void }>();
const conversations = useConversations(), center = useMessageDrawer();
const t = useT();
const actions = useConversationDelete();
type ServiceKind = "advisor" | "support" | "ticket";
type Row = { key: string; id: string; kind: ServiceKind; title: string; preview: string; ts: number; unread: number };
function unreadUnavailable(row: Row) { return !Number.isSafeInteger(row.unread) || row.unread < 0 || !!(conversations.error || conversations.categoryAvailabilityStatus === "failed"); }
const filter = ref<"all" | ServiceKind>("all");
const filters = computed(() => [
  { value: "all", label: t.value.notifs.filterAll },
  { value: "advisor", label: t.value.conversations.typeAdvisor },
]);
const loading = computed(() => conversations.loading || conversations.categoryLoading);
const failed = computed(() => !!(conversations.error || conversations.categoryAvailabilityStatus === "failed"));
const clean = (text: string) => text.replace(/\*\*/g, "").replace(/\s*\n+\s*/g, " ").trim();
const rows = computed<Row[]>(() => {
  const human: Row[] = conversations.humanThreads.map(c => {
    const last = c.messages[c.messages.length - 1];
    const useLoaded = !!last && last.ts >= c.lastTs;
    const text = useLoaded ? last.kind === "IMAGE" && !last.text ? t.value.conversations.image.message : last.text : c.lastMessage;
    const preview = c.lastMessageKind === "IDLE_TIMEOUT_CLOSE" && (!useLoaded || last.sender === "system")
      ? localizedIdleClose(text, t.value.conversations) ?? text : text;
    return { key: c.peerKey, id: c.id, kind: "advisor",
      title: c.ownerAgentId ? c.agentName : t.value.conversations.typeAdvisor,
      preview: c.conversationIds.some(id => conversations.typingIds[id]) ? t.value.conversations.agentTyping : clean(preview) || t.value.conversations[c.roleKey],
      ts: Math.max(c.lastTs, last?.ts ?? 0), unread: c.unread };
  });

  const selected = props.hideFilters ? props.filter : filter.value;
  return human.filter(row => selected === "all" || row.kind === (selected === "support" ? "advisor" : selected))
    .sort((a, b) => b.ts - a.ts || a.key.localeCompare(b.key));
});
function activityTime(ts: number) {
  return formatDisplayDateTime(ts, dateLocale());
}
function go(route: string) { emit("navigate"); navTo(route); }
function openRow(row: Row) {
  go(`/pages/support/chat?cid=${encodeURIComponent(row.id)}`);
}
function retry() {
  if (loading.value) return;
  if (conversations.realtimeFallback) { conversations.stopRealtime(); conversations.startRealtime(); }
  void center.refresh();
}
</script>

<style scoped>
.service-messages { padding: 0 16px 16px; font-family: var(--font-v5); }
.service-note { padding: 12px 0; color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); line-height: 1.5; }
.service-rowgroup { border-bottom: 1px solid color-mix(in srgb, var(--v5-border) 55%, transparent); }
.service-row { display: flex; align-items: center; gap: 12px; min-height: 88px; box-sizing: border-box; padding: 16px 0; cursor: pointer; }
.service-row:active { opacity: .78; }
.service-row:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -3px; }
.service-button:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.service-avatar { position: relative; width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; color: var(--v5-ink-2); }
.service-avatar > svg { position: relative; }
.service-content { flex: 1; min-width: 0; }
.service-title { display: block; color: var(--v5-ink); font-size: var(--ui-type-section); font-weight: 600; overflow-wrap: anywhere; }
.service-time { display: block; margin-top: 5px; font-size: 11px; color: var(--v5-ink-3); white-space: normal; overflow-wrap: anywhere; }
.service-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; margin-top: 5px; color: var(--v5-ink-2); font-size: var(--ui-type-list-subtitle); line-height: 1.5; }
.service-meta { flex-shrink: 0; align-self: stretch; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 8px; }
.service-unread { flex-shrink: 0; min-width: 21px; height: 21px; padding: 0 6px; box-sizing: border-box; border-radius: var(--v5-radius-full); display: grid; place-items: center; background: var(--v5-brand); color: var(--v5-on-brand); font-size: 11px; font-weight: 600; line-height: 1; }
.service-state { gap: 12px; padding: 16px 0; color: var(--v5-ink-3); font-size: 13px; line-height: 1.6; }
.service-state:not(.nx-inline-recovery) { display: flex; flex-direction: column; align-items: flex-start; }
.service-empty { padding: 32px 0; }
.service-empty-title { color: var(--v5-ink); font-size: var(--ui-type-section); font-weight: 600; }
.service-button { position: relative; min-height: 44px; padding: 0 16px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 22px; color: var(--v5-brand); font-size: 13px; cursor: pointer; }
.service-button > text { position: relative; }
.service-avatar, .service-button { --v5-liquid-shadow: inset 0 1px 0 var(--v5-border); }
.service-retry { align-self: center; padding: 0; border: 0; background: none; box-shadow: none; }
.service-button:active { opacity: .78; }
.service-button[aria-disabled="true"] { opacity: .5; }
</style>
