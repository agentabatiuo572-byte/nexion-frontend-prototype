<!--
  TicketRow — a transparent hairline row in the support tickets list
  (status/category/id meta, unread chip, subject, updated-time + message count).
  Ported from the inline TicketRow in Nexion-prototype me/support/tickets/page.tsx
  (was one card per ticket; de-carded 2026-07). Emits `open` on tap.
-->
<template>
  <view class="w-full active:opacity-70" :style="rowStyle" role="button" tabindex="0" :aria-label="openLabel" @click="emit('open')">
    <view class="flex items-start" style="gap: 12px">
      <view class="grid place-items-center shrink-0" :style="iconBoxStyle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="statusColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
      </view>
      <view class="min-w-0" style="flex: 1">
        <view class="flex items-center" style="gap: 6px">
          <text :style="statusStyle">{{ statusLabel }}</text>
          <text :style="sepStyle">·</text>
          <text :style="metaStyle">{{ categoryLabel }}</text>
          <text :style="sepStyle">·</text>
          <text :style="idStyle">{{ tk.id }}</text>
          <text v-if="tk.unread > 0" :style="unreadChipStyle">{{ unreadLabel }}</text>
        </view>
        <text class="block" :style="subjectStyle">{{ tk.subject }}</text>
        <text class="block" :style="timeStyle">{{ relWhen(tk.updatedAt) }} · {{ messageCountLabel }}</text>
      </view>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 4px"><path d="m9 18 6-6-6-6" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { STATUS_COLOR, type Ticket } from "@/domain/support";

const props = withDefaults(defineProps<{ tk: Ticket; divider?: boolean }>(), { divider: true });
const emit = defineEmits<{ open: [] }>();
const t = useT();

const statusColor = computed(() => STATUS_COLOR[props.tk.status]);
const statusLabel = computed(() => t.value.tickets.status[props.tk.status]);
const categoryLabel = computed(() => t.value.tickets.category[props.tk.category]);
const unreadLabel = computed(() => fmt(t.value.tickets.unreadChip, { n: props.tk.unread }));
const messageCountLabel = computed(() => fmt(t.value.tickets.messagesCount, { n: props.tk.messageCount }));
const openLabel = computed(() => fmt(t.value.tickets.openAria, { id: props.tk.id, subject: props.tk.subject }));

function relWhen(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return t.value.tickets.timeJustNow;
  if (ms < 3600_000) return fmt(t.value.tickets.timeMinutesAgo, { n: Math.floor(ms / 60_000) });
  if (ms < 86_400_000) return fmt(t.value.tickets.timeHoursAgo, { n: Math.floor(ms / 3600_000) });
  return fmt(t.value.tickets.timeDaysAgo, { n: Math.floor(ms / 86_400_000) });
}

// Transparent hairline row (was one card per ticket) — parent opens the group
// with a border-top; the last row drops its divider.
const rowStyle = computed<CSSProperties>(() => ({
  padding: "13px 0",
  borderBottom: props.divider ? "1px solid var(--v5-border)" : "none",
}));
const iconBoxStyle = computed<CSSProperties>(() => ({
  width: "36px",
  height: "36px",
  borderRadius: "8px",
  background: `color-mix(in srgb, ${statusColor.value} 12%, transparent)`,
}));
const statusStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  letterSpacing: "0.05em",
  fontWeight: 600,
  color: statusColor.value,
}));
const sepStyle: CSSProperties = { color: "var(--v5-ink-4)", fontSize: "12px" };
const metaStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", color: "var(--v5-ink-3)" };
const idStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", color: "var(--v5-ink-3)" };
const unreadChipStyle: CSSProperties = {
  marginLeft: "auto",
  padding: "2px 6px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 600,
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
};
const subjectStyle: CSSProperties = { marginTop: "4px", fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.4 };
const timeStyle: CSSProperties = { marginTop: "4px", fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", color: "var(--v5-ink-3)" };
</script>
