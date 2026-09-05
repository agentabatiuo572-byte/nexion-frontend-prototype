<!--
  TrialDiscountRow — label + value line for the trial early-purchase discount
  preview. Ported from the inline Row in Nexion-prototype me/trial/page.tsx.
-->
<template>
  <view class="flex items-baseline justify-between">
    <text :style="labelStyle">{{ label }}</text>
    <text :style="valueStyle">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{ label: string; value: string; big?: boolean; accent?: boolean }>(),
  { big: false, accent: false },
);

const labelStyle = computed<CSSProperties>(() => ({
  fontSize: "13px",
  fontWeight: props.big ? 600 : 400,
  color: props.big ? "var(--v5-ink)" : "var(--v5-ink-3)",
}));
const valueStyle = computed<CSSProperties>(() => {
  if (props.big) {
    return { fontFamily: "var(--font-v5)", fontSize: "20px", fontWeight: 600, color: "var(--v5-ink)" };
  }
  return {
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "13px",
    color: props.accent ? "var(--v5-brand)" : "var(--v5-ink)",
  };
});
</script>
