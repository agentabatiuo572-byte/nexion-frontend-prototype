<!--
  SettingsCard — ported from me/page.tsx SettingsCard.
  Rounded surface container for a stack of SettingRow children (rows draw their
  own bottom dividers; last row passes `last`).
-->
<template>
  <view class="relative overflow-hidden" :style="cardStyle">
    <slot />
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

const cardStyle: CSSProperties = {
  padding: "0 14px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
</script>
