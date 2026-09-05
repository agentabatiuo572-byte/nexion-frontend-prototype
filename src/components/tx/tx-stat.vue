<!--
  TxStat — soft-tint stat tile (label + value) for the tx explorer hero.
  Ported from the inline Stat in Nexion-prototype tx/[hash]/page.tsx.
  De-carded: nested inside the surface hero, so it uses a soft surface-2 fill
  with no border (single visual difference; the hero owns the outer edge).
-->
<template>
  <view :style="boxStyle">
    <text class="block" :style="labelStyle">{{ label }}</text>
    <text class="block tabular-nums" :style="valueStyle">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = defineProps<{ label: string; value: string; tint?: string }>();

const boxStyle: CSSProperties = {
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  padding: "8px 0",
};
const labelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const valueStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  marginTop: "2px",
  color: props.tint ?? "var(--v5-ink)",
}));
</script>
