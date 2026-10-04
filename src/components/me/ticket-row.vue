<!--
  TicketRow — a transparent hairline row in the support tickets list
  (status/category/id meta, unread chip, subject, updated-time + message count).
  Ported from the inline TicketRow in Nexion-prototype me/support/tickets/page.tsx
  (was one card per ticket; de-carded 2026-07). Emits `open` on tap.
-->
<template>
  <view class="w-full active:opacity-70" :style="rowStyle" role="button" tabindex="0" :aria-label="openLabel" @click="emit('open')">
    <view class="ticket-row-top">
      <text :style="subjectStyle">{{ tk.subject }}</text>
      <text :style="statusStyle">{{ statusLabel }}</text>
      <text v-if="tk.unread > 0" :style="unreadChipStyle">{{ unreadLabel }}</text>
      <svg class="ticket-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="1.6"><path d="m9 18 6-6-6-6" /></svg>
    </view>
    <view class="ticket-row-meta">
      <text :style="metaStyle">{{ categoryLabel }}</text>
      <text :style="timeStyle">{{ relWhen(tk.updatedAt) }}</text>
      <text :style="metaStyle">{{ messageCountLabel }}</text>
    </view>
    <text class="block" :style="idStyle">{{ tk.id }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { STATUS_COLOR, type Ticket } from "@/domain/support";
import { formatUnreadBadge } from "@/lib/unread-badge";

const props = withDefaults(defineProps<{ tk: Ticket; divider?: boolean }>(), { divider: true });
const emit = defineEmits<{ open: [] }>();
const t = useT();

const statusColor = computed(() => STATUS_COLOR[props.tk.status]);
const statusLabel = computed(() => t.value.tickets.status[props.tk.status]);
const categoryLabel = computed(() => t.value.tickets.category[props.tk.category]);
const unreadLabel = computed(() => fmt(t.value.tickets.unreadChip, { n: formatUnreadBadge(props.tk.unread) }));
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
  padding: "20px 0",
  borderBottom: props.divider ? "1px solid var(--v5-border)" : "none",
}));
const statusStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  padding: "3px 7px",
  borderRadius: "999px",
  background: `color-mix(in srgb, ${statusColor.value} 10%, transparent)`,
  fontSize: "12px",
  fontWeight: 600,
  color: statusColor.value,
}));
const metaStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "12px", color: "var(--v5-ink-3)" };
const idStyle: CSSProperties = { marginTop: "6px", overflowWrap: "anywhere", fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", color: "var(--v5-ink-3)" };
const unreadChipStyle: CSSProperties = {
  marginLeft: "auto",
  padding: "2px 6px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 600,
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
};
const subjectStyle: CSSProperties = { flex: "1 1 120px", overflowWrap: "anywhere", fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.4 };
const timeStyle: CSSProperties = { marginTop: "4px", fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", color: "var(--v5-ink-3)" };
</script>

<style scoped>
.ticket-row-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ticket-row-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin-top: 7px; }
.ticket-row-chevron { flex-shrink: 0; margin-left: auto; }
</style>
