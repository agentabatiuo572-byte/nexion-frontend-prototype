<!--
  NexChart — large area+line price chart for the NEX hero (ported from
  market/page.tsx NexChart). Normalizes `data` into a 360×120 viewBox; lemon
  when up, brand-2 (red) when down. Inline SVG renders on both H5 + App webview.
-->
<template>
  <svg width="100%" :height="H" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.30" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <polygon :points="areaPoints" :fill="`url(#${gradId})`" />
    <polyline
      :points="linePoints"
      fill="none"
      :stroke="color"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ data: number[]; up: boolean }>();

const W = 360;
const H = 120;
// Stable per-instance gradient id (avoids url() collisions across charts).
const gradId = `nex-area-${Math.random().toString(36).slice(2, 8)}`;

const color = computed(() => (props.up ? "var(--v5-brand)" : "var(--v5-brand-2)"));

const linePoints = computed(() => {
  const data = props.data;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = W / (data.length - 1);
  return data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(H - ((v - min) / range) * (H - 10) - 5).toFixed(1)}`)
    .join(" ");
});

const areaPoints = computed(() => `0,${H} ${linePoints.value} ${W},${H}`);
</script>
