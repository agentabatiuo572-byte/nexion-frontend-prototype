<!-- IconRow — emoji in brand-soft 36×36 box + label + body (how-it-works/parts.tsx IconRow). -->
<template>
  <view :style="outerStyle">
    <view :style="gridStyle">
      <view class="flex items-center justify-center" :style="emojiBoxStyle">
        <text style="font-size: 20px; line-height: 1">{{ emoji }}</text>
      </view>
      <view class="min-w-0">
        <text class="block" :style="labelStyle">{{ label }}</text>
        <text class="block" :style="bodyStyle">{{ body }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

defineProps<{ emoji: string; label: string; body: string }>();

const outerStyle: CSSProperties = {
  background: "var(--v5-surface-2)",
  borderRadius: "12px",
  padding: "12px",
};
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px 1fr",
  gap: "12px",
  alignItems: "flex-start",
};
const emojiBoxStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "10px",
  background: "var(--v5-brand-soft)",
};
// Typography pass 2026-07-08 — label 13.5, body 13/1.62 ink-2 (was a wall of text).
const labelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  lineHeight: 1.4,
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const bodyStyle: CSSProperties = {
  marginTop: "5px",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.62,
};
</script>
