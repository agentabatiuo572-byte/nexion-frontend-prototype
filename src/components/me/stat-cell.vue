<!--
  StatCell — ported from me/page.tsx StatCell (Genesis stat grid cell).
  Centered tabular value (26px when `big`, else 20px) + small mono label below.
  Tint is fixed to warning gold (the only caller passes warning).
-->
<template>
  <view class="text-center">
    <text class="block tabular-nums" :style="valueStyle">{{ value }}</text>
    <text class="block font-mono-tabular" :style="labelStyle">{{ label }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(defineProps<{ value: string; label: string; big?: boolean }>(), { big: false });

const valueStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: props.big ? "26px" : "20px",
  fontWeight: 600,
  color: "var(--v5-warning)",
  letterSpacing: "-0.014em",
  lineHeight: 1,
}));
const labelStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
</script>
