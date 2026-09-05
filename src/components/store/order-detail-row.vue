<!--
  OrderDetailRow — label/value row for the order-detail summary section
  (ported from the Row helper in orders/[id]/page.tsx). Variants: big (total),
  mono (order id), brand (discount value color).
-->
<template>
  <view class="flex items-center justify-between" style="padding: 6px 0">
    <text style="font-size: 13px; color: var(--v5-ink-3)">{{ label }}</text>
    <text :class="mono ? 'font-mono-tabular tabular-nums' : 'tabular-nums'" :style="valueStyle">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = defineProps<{
  label: string;
  value: string;
  big?: boolean;
  mono?: boolean;
  brand?: boolean;
}>();

const valueStyle = computed<CSSProperties>(() => {
  if (props.big) {
    return { fontFamily: "var(--font-v5)", fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
  }
  if (props.mono) {
    return { fontSize: "12px", color: "var(--v5-ink-2)" };
  }
  return { fontSize: "13px", color: props.brand ? "var(--v5-brand)" : "color-mix(in srgb, var(--v5-ink) 90%, transparent)" };
});
</script>
