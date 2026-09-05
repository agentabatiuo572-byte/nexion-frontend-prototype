<!--
  NexSparkline — ported from the Sparkline in me/wallet/nex/page.tsx.
  Area + line sparkline for the NEX holdings hero, driven by :data (kline) +
  :up (colour). Inline SVG (H5 + App webview). gradient id static (single
  instance per page).
-->
<template>
  <svg width="100%" height="56" viewBox="0 0 360 56" preserveAspectRatio="none">
    <defs>
      <linearGradient id="nx-nex-wallet-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.30" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <polygon :points="area" fill="url(#nx-nex-wallet-area)" />
    <polyline :points="points" fill="none" :stroke="color" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ data: number[]; up: boolean }>();

const W = 360;
const H = 56;
const color = computed(() => (props.up ? "var(--v5-brand)" : "var(--v5-brand-2)"));

const points = computed(() => {
  const data = props.data;
  if (data.length < 2) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = W / (data.length - 1);
  return data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(H - ((v - min) / range) * (H - 8) - 4).toFixed(1)}`)
    .join(" ");
});
const area = computed(() => `0,${H} ${points.value} ${W},${H}`);
</script>
