<!--
  Support hub (ported from Nexion-prototype/app/(main)/me/support/page.tsx).
  In-app messages and tickets + pinned support notes.
  Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />

      <!-- Channels -->
      <view class="mx-4" :style="cardStyle">
        <view
          v-for="(c, i) in channels"
          :key="c.id"
          class="w-full flex items-center active:opacity-90"
          :style="channelRowStyle(i !== channels.length - 1)"
          role="button"
          tabindex="0"
          :aria-label="c.label"
          @click="navTo(c.href)"
        >
          <view class="grid place-items-center shrink-0" :style="iconBoxStyle(c.tintSoft)">
            <view v-html="c.icon" />
          </view>
          <view class="min-w-0" style="flex: 1">
            <text class="block" :style="channelLabelStyle">{{ c.label }}</text>
            <text class="block truncate" :style="channelHintStyle">{{ c.hint }}</text>
          </view>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </view>
      </view>

      <!-- Pinned -->
      <view class="mx-4" :style="pinnedCardStyle">
        <view class="flex items-center" style="gap: 8px; margin-bottom: 12px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></svg>
          <text :style="pinnedTitleStyle">{{ w.pinnedTitle }}</text>
        </view>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <view v-for="(p, i) in pinned" :key="i" class="flex items-start" style="gap: 10px">
            <view :style="pinDotStyle" />
            <text :style="pinTextStyle">{{ p }}</text>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";

const t = useT();
const w = computed(() => t.value.support);

interface Channel {
  id: string;
  label: string;
  hint: string;
  icon: string;
  tintSoft: string;
  href: string;
}

const CHAT_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /></svg>`;
const TICKET_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /><path d="m9 11 2 2 4-4" /></svg>`;

const channels = computed<Channel[]>(() => [
  { id: "lc", label: w.value.chLiveChat, hint: w.value.chLiveChatHint, icon: CHAT_SVG, tintSoft: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", href: "/pages/support/messages" },
  { id: "tk", label: w.value.chTicket, hint: w.value.chTicketHint, icon: TICKET_SVG, tintSoft: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", href: "/pages/me/support-tickets?mode=create" },
]);

const pinned = computed(() => [w.value.pinnedItem1, w.value.pinnedItem2, w.value.pinnedItem3, w.value.pinnedItem4]);

// Channels — transparent hairline nav list on the floor (2px optical indent,
// border-top opens the group; per-row hairlines below). No card chrome.
const cardStyle: CSSProperties = {
  marginBottom: "20px",
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function channelRowStyle(notLast: boolean): CSSProperties {
  return {
    gap: "12px",
    padding: "14px 0",
    borderBottom: notLast ? "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" : "none",
  };
}
function iconBoxStyle(bg: string): CSSProperties {
  return { width: "40px", height: "40px", borderRadius: "12px", background: bg };
}
const channelLabelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
};
const channelHintStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
// Pinned notes — block on the page floor; the pin-icon header stands in for a
// section label, whitespace above separates it from the channels group.
const pinnedCardStyle: CSSProperties = {
  padding: "0 2px",
};
const pinnedTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
};
const pinDotStyle: CSSProperties = {
  marginTop: "5px",
  width: "6px",
  height: "6px",
  borderRadius: "999px",
  background: "var(--v5-warning)",
  flexShrink: 0,
};
const pinTextStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.6 };
</script>
