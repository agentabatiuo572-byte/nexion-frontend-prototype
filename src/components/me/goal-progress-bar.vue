<!--
  GoalProgressBar — ported from me/goals/page.tsx GoalProgressBar.
  Per-goal bar with a scroll-grow entrance (each row owns its own
  IntersectionObserver, so this is a standalone component — a composable can't
  be called inside a v-for callback). Fill = warning→brand gradient that grows
  0 → pct on scroll-into-view (replays on re-entry). The composable resolves the
  track <view>'s $el for IO (P-019); `ref="elRef"` binds the node, matching the
  convention in vrank-card.vue / missed-income-banner.vue.
-->
<template>
  <view ref="elRef" :style="trackStyle">
    <view :style="fillStyle" />
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import {
  useScrollGrowProgress,
  PROGRESS_GROW_TRANSITION,
} from "@/composables/use-scroll-grow-progress";

const props = defineProps<{ pct: number }>();

const { elRef, inView } = useScrollGrowProgress();

const trackStyle: CSSProperties = {
  marginTop: "8px",
  height: "6px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  overflow: "hidden",
};
const fillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${inView.value ? props.pct : 0}%`,
  background: "linear-gradient(to right, var(--v5-warning), var(--v5-brand))",
  transition: inView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
}));
</script>
