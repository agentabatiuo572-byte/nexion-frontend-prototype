<!-- PerkRow — .genesis-perk: 36px brand-soft emoji box + name/desc (genesis/page.tsx PerkRow). -->
<template>
  <view class="grid items-start" :style="rowStyle">
    <view class="flex items-center justify-center" :style="iconStyle">
      <text style="font-size: 20px">{{ ico }}</text>
    </view>
    <view>
      <text class="block" :style="nameStyle">{{ name }}</text>
      <text class="block" :style="descStyle">{{ desc }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = defineProps<{ ico: string; name: string; desc: string; isLast: boolean }>();

const rowStyle = computed<CSSProperties>(() => ({
  gridTemplateColumns: "36px 1fr",
  gap: "12px",
  padding: "14px 0",
  borderBottom: props.isLast ? "none" : "1px solid var(--v5-border)",
}));
const iconStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "10px",
  background: "var(--v5-brand-soft)",
};
const nameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const descStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  marginTop: "3px",
  lineHeight: 1.4,
};
</script>
