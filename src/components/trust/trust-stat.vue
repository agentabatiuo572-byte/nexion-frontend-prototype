<!--
  TrustStat — label + large tinted value. Ported from the inline Stat in
  Nexion-prototype trust/page.tsx and trust/nex anchor section.
-->
<template>
  <view>
    <text class="block" :style="labelStyle">{{ label }}</text>
    <text class="block tabular-nums" :style="valueStyle">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(defineProps<{ label: string; value: string; tint?: string }>(), {
  tint: "var(--v5-ink)",
});

const labelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const valueStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  marginTop: "2px",
  lineHeight: 1,
  color: props.tint,
}));
</script>
