<!--
  OrderDetailRow — label/value row for the order-detail summary section
  (ported from the Row helper in orders/[id]/page.tsx). Variants: big (total),
  mono (order id), brand (discount value color), copyable (long codes get a
  copy button and may wrap).
-->
<template>
  <view class="flex items-center justify-between" style="padding: 6px 0; gap: var(--v5-space-3)">
    <text class="shrink-0" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3)">{{ label }}</text>
    <view v-if="copyable" class="flex items-center min-w-0" style="gap: var(--v5-space-2)">
      <text :class="mono ? 'font-mono-tabular tabular-nums' : 'tabular-nums'" :style="[valueStyle, copyableValueStyle]">{{ value }}</text>
      <CopyCodeButton :value="value" :label="label" />
    </view>
    <text v-else :class="mono ? 'font-mono-tabular tabular-nums' : 'tabular-nums'" :style="valueStyle">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import CopyCodeButton from "@/components/copy-code-button.vue";

const props = defineProps<{
  label: string;
  value: string;
  big?: boolean;
  mono?: boolean;
  brand?: boolean;
  copyable?: boolean;
}>();

const copyableValueStyle: CSSProperties = { minWidth: 0, overflowWrap: "anywhere", textAlign: "right" };

const valueStyle = computed<CSSProperties>(() => {
  if (props.big) {
    return { fontFamily: "var(--font-v5)", fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
  }
  if (props.mono) {
    return { fontSize: "12px", color: "var(--v5-ink-2)" };
  }
  return { fontSize: "var(--ui-type-list-subtitle)", color: props.brand ? "var(--v5-brand)" : "color-mix(in srgb, var(--v5-ink) 90%, transparent)" };
});
</script>
