<!--
  TrustSectionHeader — mono section label (icon slot) + optional right suffix.
  Ported from the inline SectionHeader in Nexion-prototype trust/page.tsx.
-->
<template>
  <view class="px-1 flex items-center justify-between" style="padding-top: 8px">
    <view class="flex items-center" :style="labelStyle">
      <view style="margin-right: 6px"><slot name="icon" /></view>
      <text>{{ label }}</text>
    </view>
    <text v-if="suffix" :style="suffixStyle">{{ suffix }}</text>
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

defineProps<{ label: string; suffix?: string }>();

const labelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  letterSpacing: "0.16em",
  color: "var(--v5-ink-3)",
};
const suffixStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
</script>
