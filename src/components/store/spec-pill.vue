<!--
  SpecPill — hardware / AI-perf spec chip (ported from store/page.tsx SpecPillV5).
  Neutral surface for hardware (RTX/VRAM/DC); tech-cyan tint when `ai` for
  throughput pills. Soft tint only, no border (SKILL card-nesting).
-->
<template>
  <view class="inline-flex items-center whitespace-nowrap" :style="pillStyle">
    <slot />
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(defineProps<{ ai?: boolean }>(), { ai: false });

const pillStyle = computed<CSSProperties>(() => ({
  gap: "5px",
  padding: "5px 10px",
  borderRadius: "7px",
  background: "var(--v5-surface-2)",
  color: props.ai ? "var(--v5-tech-cyan)" : "var(--v5-ink-2)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  letterSpacing: "-0.005em",
}));
</script>
