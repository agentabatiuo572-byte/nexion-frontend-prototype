<!--
  TxRow — label + value detail row for the tx explorer. Ported from the inline
  Row in Nexion-prototype tx/[hash]/page.tsx.
-->
<template>
  <view class="flex items-center justify-between" :style="rowStyle">
    <text :style="labelStyle">{{ label }}</text>
    <text class="tabular-nums" :style="valueStyle">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{ label: string; value: string; tint?: string; bold?: boolean; mono?: boolean; last?: boolean }>(),
  { bold: false, mono: false, last: false },
);

const rowStyle = computed<CSSProperties>(() => ({
  padding: "10px 16px",
  borderBottom: props.last ? "none" : "1px solid var(--v5-border)",
}));
const labelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const valueStyle = computed<CSSProperties>(() => ({
  fontFamily: props.mono ? "var(--font-jet-mono), ui-monospace, monospace" : props.bold ? "var(--font-v5)" : undefined,
  fontSize: props.bold ? "14px" : "12px",
  fontWeight: props.bold ? 600 : 400,
  color: props.tint ?? "var(--v5-ink)",
}));
</script>
