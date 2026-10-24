<template>
  <view class="service-messages">
    <view v-if="store.loading" class="service-state" role="status"><text>{{ t.help.loadingMore }}</text></view>
    <view v-if="store.error" class="service-state" role="alert">
      <text>{{ row ? t.conversations.staleSnapshot : t.conversations.loadError }}</text>
      <view class="service-control" role="button" tabindex="0" @click="retry"><text>{{ t.ui.retry }}</text></view>
    </view>
    <view v-if="!store.loading && !store.error && !row" class="service-state"><text>{{ t.notifs.serviceEmpty }}</text><text>{{ t.notifs.serviceEmptyHint }}</text></view>
    <view v-if="row" class="service-row" role="button" tabindex="0" :aria-label="t.conversations.typeAdvisor" @click="navTo('/pages/support/chat?cid=' + encodeURIComponent(row.id))">
      <view class="service-meta"><text class="service-title">{{ t.conversations.typeAdvisor }}</text><text class="service-preview">{{ preview }}</text></view>
      <view v-if="store.error || store.totalUnread > 0" class="service-badge"><text>{{ store.error ? '-' : formatUnreadBadge(store.totalUnread) }}</text></view>
      <text aria-hidden="true">›</text>
    </view>
    <view class="service-state"><text>{{ t.notifs.serviceReadHint }}</text></view>
    <view class="service-control" role="button" tabindex="0" @click="navTo('/pages/support/messages')"><text>{{ t.notifs.contactService }}</text></view>
  </view>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useConversations } from "@/store/conversations";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { formatUnreadBadge } from "@/lib/unread-badge";
defineProps<{ filter?: "all" | "advisor" }>();
const store = useConversations(), t = useT();
const row = computed(() => [...store.conversations].filter(item => item.type !== "ai").sort((a, b) => b.lastTs - a.lastTs)[0]);
const preview = computed(() => row.value ? store.typingIds[row.value.id] ? t.value.conversations.agentTyping : row.value.lastMessage.replace(/\*\*/g, "") : "");
function retry() { if (!store.loading) void store.refresh().catch(() => undefined); }
</script>
<style scoped>
.service-messages { padding: 0 16px 24px; }
.service-row { display:flex; align-items:center; gap:12px; min-height:76px; border-bottom:1px solid var(--v5-border); padding:16px 0; }
.service-meta { flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; }
.service-title { color:var(--v5-ink); font-size:15px; font-weight:600; }
.service-preview { color:var(--v5-ink-3); font-size:13px; overflow-wrap:anywhere; }
.service-badge { border-radius:999px; padding:2px 7px; color:var(--v5-on-brand); background:var(--v5-brand); font-size:12px; }
.service-state { display:flex; flex-direction:column; gap:8px; padding:16px 0; color:var(--v5-ink-3); font-size:13px; }
.service-control { display:inline-flex; min-height:44px; align-items:center; color:var(--v5-brand); font-size:14px; }
</style>
