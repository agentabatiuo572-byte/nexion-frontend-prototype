<!--
  SettingsCard — ported from me/page.tsx SettingsCard.
  Rounded surface container for a stack of SettingRow children (rows draw their
  own bottom dividers; last row passes `last`).
-->
<template>
  <view class="nx-glass-card relative overflow-hidden" :style="cardStyle">
    <slot />
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "0 14px",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
};
</script>
