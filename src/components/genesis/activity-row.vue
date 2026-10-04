<!-- ActivityRow — marketplace activity feed row (marketplace/page.tsx ActivityRow). -->
<template>
  <view class="flex items-center" :style="rowStyle">
    <view class="grid place-items-center shrink-0" :style="iconBoxStyle">
      <!-- sale -->
      <svg v-if="e.kind === 'sale'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
      <!-- list -->
      <svg v-else-if="e.kind === 'list'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg>
      <!-- transfer -->
      <svg v-else-if="e.kind === 'transfer'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
      <!-- mint -->
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></svg>
    </view>
    <view class="flex-1 min-w-0">
      <view class="flex items-center" style="gap: 6px">
        <text v-if="e.tokenId !== undefined" :style="tokenStyle" :title="String(e.tokenId)" :aria-label="String(e.tokenId)">#{{ displayGenesisHoldingId(e.tokenId) }}</text>
        <text :style="kindBadgeStyle">{{ kindLabel }}</text>
      </view>
      <text class="block truncate" :style="addrStyle">{{ e.description ?? `${fromLabel} → ${toLabel}` }}</text>
    </view>
    <view class="text-right shrink-0">
      <text v-if="e.priceUSDT !== undefined" class="block tabular-nums" :style="priceStyle">${{ priceText }}</text>
      <view class="flex items-center justify-end" :style="timeStyle">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 3px"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
        <text>{{ timeAgo }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { displayGenesisHoldingId } from "@/lib/genesis-holding-id";
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

export interface ActivityEvent {
  id: string;
  kind: "sale" | "list" | "transfer" | "mint";
  tokenId?: string | number;
  priceUSDT?: number;
  from: string;
  to: string;
  ts: number;
  description?: string;
}

const props = defineProps<{ e: ActivityEvent; isLast: boolean }>();

const t = useT();

const TINT: Record<ActivityEvent["kind"], string> = {
  sale: "var(--v5-brand)",
  list: "var(--v5-warning)",
  transfer: "var(--v5-tech-cyan)",
  mint: "var(--v5-brand-2)",
};

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

const tint = computed(() => TINT[props.e.kind]);
const kindLabel = computed(() => t.value.marketplace.actKind[props.e.kind]);
const priceText = computed(() => props.e.priceUSDT?.toLocaleString() ?? "");
const fromLabel = computed(() => (props.e.from === "—" ? t.value.marketplace.actKind.mint : shortAddr(props.e.from)));
const toLabel = computed(() =>
  props.e.to === "—" ? t.value.marketplace.actKind.list.toLowerCase() : shortAddr(props.e.to),
);
const timeAgo = computed(() => {
  const mins = Math.max(1, Math.floor((Date.now() - props.e.ts) / 60_000));
  if (mins < 60) return fmt(t.value.marketplace.timeMinAgo, { n: mins });
  if (mins < 1440) return fmt(t.value.marketplace.timeHrAgo, { n: Math.floor(mins / 60) });
  return fmt(t.value.marketplace.timeDayAgo, { n: Math.floor(mins / 1440) });
});

const rowStyle = computed<CSSProperties>(() => ({
  gap: "12px",
  padding: "12px 16px",
  borderBottom: props.isLast ? "none" : "1px solid var(--v5-border)",
}));
const iconBoxStyle = computed<CSSProperties>(() => ({
  width: "36px",
  height: "36px",
  borderRadius: "8px",
  background: `color-mix(in srgb, ${tint.value} 9%, transparent)`,
  color: tint.value,
}));
const tokenStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const kindBadgeStyle = computed<CSSProperties>(() => ({
  padding: "1px 6px",
  borderRadius: "4px",
  background: `color-mix(in srgb, ${tint.value} 10%, transparent)`,
  color: tint.value,
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
}));
const addrStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const priceStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-brand)",
  letterSpacing: "-0.008em",
};
const timeStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
</script>
