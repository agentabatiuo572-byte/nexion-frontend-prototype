<!--
  Support hub (ported from Nexion-prototype/app/(main)/me/support/page.tsx).
  Live-status banner + 4 contact channels (Telegram/Discord/Ticket/Email) +
  pinned support notes. Ticket channel routes to /me/support-tickets; others
  toast their hint. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />

      <!-- Live status -->
      <view class="mx-4 flex items-center" :style="statusStyle">
        <view class="relative flex" style="width: 8px; height: 8px">
          <view :style="pingStyle" />
          <view :style="dotStyle" />
        </view>
        <text :style="onlineTextStyle">{{ w.onlineNow }}</text>
        <text class="text-right" :style="avgStyle" style="flex: 1">{{ avgResponse }}</text>
      </view>

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
          @click="onChannel(c)"
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
import { fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import { navTo } from "@/lib/route";

const t = useT();
const w = computed(() => t.value.support);

const avgResponse = computed(() => fmt(w.value.avgResponse, { n: "4" }));

interface Channel {
  id: string;
  label: string;
  hint: string;
  icon: string;
  tintSoft: string;
  href?: string;
}

const CHAT_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /></svg>`;
const SEND_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>`;
const DISCORD_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 7.2A18 18 0 0 1 12 6.5a18 18 0 0 1 4.5.7" /><path d="M8 11a16 16 0 0 0 8 0" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /><path d="M7.5 17.2A18 18 0 0 0 12 17.9a18 18 0 0 0 4.5-.7" /></svg>`;
const TICKET_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /><path d="m9 11 2 2 4-4" /></svg>`;
const MAIL_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>`;

const channels = computed<Channel[]>(() => [
  { id: "lc", label: w.value.chLiveChat, hint: w.value.chLiveChatHint, icon: CHAT_SVG, tintSoft: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", href: "/pages/support/messages" },
  { id: "tg", label: w.value.chTelegram, hint: w.value.chTelegramHint, icon: SEND_SVG, tintSoft: "color-mix(in srgb, var(--v5-tech-cyan) 15%, transparent)" },
  { id: "ds", label: w.value.chDiscord, hint: w.value.chDiscordHint, icon: DISCORD_SVG, tintSoft: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)" },
  { id: "tk", label: w.value.chTicket, hint: w.value.chTicketHint, icon: TICKET_SVG, tintSoft: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", href: "/pages/me/support-tickets?mode=create" },
  { id: "em", label: w.value.chEmail, hint: w.value.chEmailHint, icon: MAIL_SVG, tintSoft: "color-mix(in srgb, var(--v5-warning) 15%, transparent)" },
]);

const pinned = computed(() => [w.value.pinnedItem1, w.value.pinnedItem2, w.value.pinnedItem3, w.value.pinnedItem4]);

function onChannel(c: Channel) {
  if (c.href) {
    navTo(c.href);
    return;
  }
  toast.info(c.label, c.hint);
}

// Live status — plain indicator line on the page floor; the pulsing brand dot +
// brand "online" text carry the affordance, the boxed chrome added nothing.
const statusStyle: CSSProperties = {
  gap: "8px",
  marginBottom: "12px",
  padding: "0 2px",
};
const pingStyle: CSSProperties = {
  position: "absolute",
  inset: "0",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  opacity: 0.6,
  animation: "mc-pulse 1.6s ease-in-out infinite",
};
const dotStyle: CSSProperties = { width: "8px", height: "8px", borderRadius: "999px", background: "var(--v5-brand)" };
const onlineTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand)", fontWeight: 500 };
const avgStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
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
