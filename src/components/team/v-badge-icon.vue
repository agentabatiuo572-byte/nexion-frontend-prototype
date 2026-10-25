<!--
  VBadgeIcon — ported from Nexion-prototype/app/components/v3/v-badge.tsx (VBadgeIcon).
  Square V-rank chip showing just the level digit; colour climbs with level.
  Used by rank-how.vue's 13-rank ladder. <div>→<view>, digit leaf→<text>.
-->
<template>
  <view class="rounded-xl grid place-items-center font-display tabular-nums" :style="boxStyle">
    <text :style="digitStyle">{{ v }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { VRank } from "@/store/v-rank";

const props = withDefaults(defineProps<{ v: VRank; size?: number }>(), { size: 32 });

interface ColorSpec {
  bg: string;
  text: string;
}

// Published level numbers may change; the mark has one neutral/lime vocabulary.
const c = computed<ColorSpec>(() => props.v > 0 ? {
  bg: "color-mix(in srgb, var(--v5-brand) 12%, transparent)", text: "var(--v5-brand)",
} : { bg: "var(--v5-surface-3)", text: "var(--v5-ink-2)" });

const boxStyle = computed<CSSProperties>(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: c.value.bg,
  color: c.value.text,
}));
const digitStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: `${props.size * 0.45}px`,
  color: c.value.text,
}));
</script>
