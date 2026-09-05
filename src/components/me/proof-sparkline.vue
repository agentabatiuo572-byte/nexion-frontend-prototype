<!--
  ProofSparkline — ported from the EarningsSparkline in me/proof/page.tsx.
  Deterministic lemon-uptrend sparkline (14 fixed points) for the Earnings share
  card. Inline SVG (H5 + App webview). gradient id is static (single instance on
  the page, no useId needed).
-->
<template>
  <svg width="100%" height="36" viewBox="0 0 320 36" preserveAspectRatio="none" style="margin-top: 8px">
    <defs>
      <linearGradient id="nx-proof-spark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--v5-brand)" stop-opacity="0.30" />
        <stop offset="100%" stop-color="var(--v5-brand)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <polygon :points="`0,36 ${points} 320,36`" fill="url(#nx-proof-spark)" />
    <polyline :points="points" fill="none" stroke="var(--v5-brand)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const points = computed(() => {
  const w = 320;
  const h = 36;
  const data = [0.15, 0.2, 0.18, 0.28, 0.32, 0.42, 0.48, 0.55, 0.62, 0.7, 0.78, 0.85, 0.92, 1.0];
  const stepX = w / (data.length - 1);
  return data.map((v, i) => `${(i * stepX).toFixed(1)},${(h - v * (h - 4) - 2).toFixed(1)}`).join(" ");
});
</script>
