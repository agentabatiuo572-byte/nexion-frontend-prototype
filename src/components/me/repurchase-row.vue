<!--
  RepurchaseRow — label + value line for the re-invest projection panel.
  Ported from the inline Row in Nexion-prototype me/wallet/repurchase/page.tsx.
-->
<template>
  <view class="flex items-center justify-between">
    <text :style="labelStyle">{{ label }}</text>
    <text :style="valueStyle">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{ label: string; value: string; tint?: string; bold?: boolean }>(),
  { bold: false },
);

const labelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const valueStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: props.bold ? "14px" : "12.5px",
  letterSpacing: "-0.008em",
  color: props.tint ?? "var(--v5-ink)",
}));
</script>
