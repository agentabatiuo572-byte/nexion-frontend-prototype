<!--
  TicketStatBox — tinted stat tile (icon + label + count) for the tickets list
  header. Ported from the inline StatBox in Nexion-prototype me/support/tickets/page.tsx.
  Icon is an inline SVG string with `stroke="currentColor"` so it inherits `tint`.
-->
<template>
  <!-- 🔴 三层都要 min-w-0:grid item 与 flex item 的 min-width 默认都是 auto,不肯收缩到
       内容宽度以下 —— 只要链路上有一层没放开,里面的 .truncate 就永远触发不了,
       长标签("Awaiting you")直接撑破三宫格(B7 字号迁移把它顶过阈值,探针实测 +14px)。
       图标 shrink-0 保尺寸,文字 flex-1 min-w-0 才拿得到可截断的宽度。
       改的是这个根因,不是回退字号。 -->
  <view class="active:opacity-70" style="min-width: 0" :style="boxStyle" role="button" tabindex="0" :aria-label="label" @click="emit('select')">
    <view class="flex items-center" style="min-width: 0" :style="headStyle">
      <view style="flex-shrink: 0" v-html="icon" />
      <text style="margin-left: 4px; flex: 1; min-width: 0; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ label }}</text>
    </view>
    <text class="block" :style="valueStyle">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = defineProps<{ tint: string; label: string; value: number; icon: string }>();
const emit = defineEmits<{ select: [] }>();

// Soft tint only — tinted tiles carry no border (inner-element rule).
const boxStyle = computed<CSSProperties>(() => ({
  borderRadius: "16px",
  padding: "12px",
  background: `color-mix(in srgb, ${props.tint} 8%, transparent)`,
}));
const headStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: props.tint,
}));
const valueStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  lineHeight: 1,
};
</script>
