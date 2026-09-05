<!--
  QuotaConditionBar — per-condition progress bar with scroll-grow entrance
  (ported from quota/page.tsx ConditionBar). Extracted as its own component
  because the parent maps conditions and the scroll-grow composable (a hook)
  can't be called inside a v-for callback (P-019: each bar needs its own $el).
-->
<template>
  <view ref="elRef" class="rounded-full overflow-hidden" :style="trackStyle">
    <view class="rounded-full" :style="fillStyle" />
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

const props = defineProps<{ pct: number; met: boolean; tint: string }>();
const { elRef, inView } = useScrollGrowProgress();

const trackStyle: CSSProperties = {
  height: "4px",
  background: "color-mix(in srgb, var(--v5-surface-2) 50%, transparent)",
};
const fillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${inView.value ? props.pct * 100 : 0}%`,
  transition: inView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
  background: props.met ? "var(--v5-success)" : props.tint,
}));
</script>
