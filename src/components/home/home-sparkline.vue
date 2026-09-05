<!--
  HomeSparkline — tiny inline SVG sparkline (ported from mission-control.tsx
  HomeSparkline). Normalizes `data` into a 100×height viewBox; optional filled
  area + polyline + last-point dot. Used by NetworkPulseCard metrics.
-->
<template>
  <svg width="100%" :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" style="display: block; overflow: visible">
    <polygon v-if="fill" :points="areaPts" :fill="color" opacity="0.10" />
    <polyline :points="linePts" fill="none" :stroke="color" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />
    <circle :cx="lastX" :cy="lastY" r="1.6" :fill="color" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ data: number[]; color?: string; height?: number; fill?: boolean }>(), {
  color: "var(--v5-tech-cyan-ink)",
  height: 22,
  fill: true,
});

const W = 100;

const pts = computed(() => {
  const data = props.data;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const r = max - min || 1;
  return data.map((v, i) => {
    const x = i * (W / (data.length - 1));
    const y = props.height - 2 - ((v - min) / r) * (props.height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
});
const linePts = computed(() => pts.value.join(" "));
const areaPts = computed(() => `0,${props.height} ${linePts.value} ${W},${props.height}`);
const lastX = computed(() => pts.value[pts.value.length - 1].split(",")[0]);
const lastY = computed(() => pts.value[pts.value.length - 1].split(",")[1]);
</script>
