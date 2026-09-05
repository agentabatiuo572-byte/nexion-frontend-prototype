<!--
  PulseDot — a small pulsing status dot (ported from mission-control.tsx
  PulseDot). Pulse ring keyframe picks the success variant when the color
  references --v5-success, else the cyan default.
-->
<template>
  <view :style="dotStyle" />
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(defineProps<{ color?: string; size?: number }>(), {
  color: "var(--v5-tech-cyan-ink)",
  size: 6,
});

const animName = computed(() =>
  props.color.includes("success") ? "v5-hb-pulse-success" : "v5-hb-pulse",
);

const dotStyle = computed<CSSProperties>(() => ({
  display: "inline-block",
  width: props.size + "px",
  height: props.size + "px",
  borderRadius: "50%",
  background: props.color,
  animation: `${animName.value} 1.6s ease-in-out infinite`,
}));
</script>
