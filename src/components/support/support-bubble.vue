<!--
  SupportBubble — the floating shortcut to the dedicated advisor.

  The chassis mounts one shortcut on home/earn/team, above its navigation pill.
  Human support stays available with or without unread replies; the badge counts
  unread advisor / support replies only. Route gating lives in the chassis; its
  measured navigation height includes the safe area.
-->
<template>
    <view class="nx-support-bubble" :class="{ 'nx-support-bubble--dimmed': dimmed, 'nx-support-bubble--light': theme.resolved === 'light' }" role="button" :tabindex="dimmed ? -1 : 0" :aria-hidden="dimmed || undefined" :aria-label="t.coreReview.supportHelp" @click="open" @keydown.enter.prevent="!dimmed && open()" @keydown.space.prevent="!dimmed && open()">
      <view class="nx-support-btn nx-support-motion">
        <SupportAvatar :size="36" :pulse="showUnreadBadge && !dimmed" :appearance="theme.resolved" class="nx-support-avatar" />
        <view v-if="showUnreadBadge" :key="totalUnread" class="nx-support-badge"><text class="nx-support-badge-t">{{ unreadLabel }}</text></view>
      </view>
    </view>
</template>

<script setup lang="ts">
import { runPassiveTabRead } from "@/lib/passive-tab-read";
import { computed, onMounted } from "vue";
import { useConversations } from "@/store/conversations";
import { remoteApiEnabled } from "@/api/runtime";
import { useMessageDrawer } from "@/store/message-drawer";
import { useT } from "@/i18n/use-t";
import SupportAvatar from "./support-avatar.vue";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { useTheme } from "@/store/theme";

defineProps<{ dimmed?: boolean }>();

const t = useT();
const theme = useTheme();
const conversations = useConversations();
const messageCenter = useMessageDrawer();

// The floating shortcut retains only unread human advisor/support replies.
// Notification and ticket counts belong to the unified message center.
const humanUnread = computed(() =>
  [...conversations.byType("advisor"), ...conversations.byType("support")]
    .reduce((sum, row) => sum + row.unread, 0),
);
const totalUnread = computed(() => humanUnread.value);
const showUnreadBadge = computed(() => totalUnread.value > 0);
const unreadLabel = computed(() => formatUnreadBadge(totalUnread.value));

// Human support uses the same full-page center as the bell, opening Service.
function open() {
  messageCenter.show("service");
}

onMounted(() => {
  if (remoteApiEnabled) {
    void runPassiveTabRead("conversations", () => conversations.refresh(), { owner: conversations.scopeInvalidated }, () => !conversations.loading && !conversations.error).catch(() => undefined);
  }
});
</script>

<style scoped>
.nx-support-bubble {
  position: absolute;
  right: 16px;
  bottom: calc(100% + 12px);
  z-index: 1;
  color: var(--v5-ink);
  transition: opacity 150ms, transform 120ms cubic-bezier(.2,.8,.2,1);
  /* Rounded hit area returns transparent corners to the underlying content. */
  border-radius: 999px;
}
.nx-support-bubble--dimmed { opacity: 0; pointer-events: none; }
.nx-support-bubble--dimmed .nx-support-motion { animation-play-state: paused; }
.nx-support-bubble--light .nx-support-btn {
  background: linear-gradient(155deg, #fff, #eef2e5);
  box-shadow: 0 3px 12px rgba(42, 53, 24, .14), inset 0 0 0 1px #dde4d3;
}
/* Press belongs to the outer hit target; idle float belongs to the inner visual. */
.nx-support-bubble:active {
  transform: scale(.94);
}
.nx-support-btn {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--v5-surface);
}
/* Float the avatar and badge together while keeping the outer hit target stationary. */
.nx-support-motion { position: relative; z-index: 1; animation: nx-support-float 3.4s ease-in-out infinite; }
@keyframes nx-support-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.nx-support-badge {
  position: absolute;
  z-index: 2;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ui-unread-badge);
  display: grid;
  place-items: center;
  border: 1px solid var(--v5-bg);
  animation: nx-support-unread 420ms cubic-bezier(.2,1.5,.3,1) both;
}
@keyframes nx-support-unread { from { transform: scale(.65); } to { transform: scale(1); } }
.nx-support-badge-t {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-v5);
  color: var(--ui-unread-badge-ink);
  line-height: 1;
}
.nx-support-avatar { position: relative; z-index: 1; }
.nx-support-bubble:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .nx-support-bubble { transition: none; }
  .nx-support-bubble:active { transform: none; }
  .nx-support-motion, .nx-support-badge { animation: none; }
}
</style>
