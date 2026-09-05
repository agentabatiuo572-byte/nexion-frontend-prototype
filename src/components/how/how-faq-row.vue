<!-- FaqRow — surface-2 fill Q/A pair (ported from how-it-works/parts.tsx FaqRow). -->
<template>
  <view :style="boxStyle">
    <text class="block" :style="qStyle">{{ q }}</text>
    <text class="block" :style="aStyle">{{ a }}</text>
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

defineProps<{ q: string; a: string }>();

const boxStyle: CSSProperties = {
  background: "var(--v5-surface-2)",
  borderRadius: "12px",
  padding: "12px 14px",
};
// Typography pass 2026-07-08 — q 13.5, a 13/1.62 ink-2 (was a wall of text).
const qStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  lineHeight: 1.4,
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const aStyle: CSSProperties = {
  marginTop: "5px",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.62,
};
</script>
