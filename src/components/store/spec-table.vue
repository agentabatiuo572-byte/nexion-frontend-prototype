<!--
  SpecTable — key/value spec rows (Hardware specs + AI performance) on the
  product detail page. Ported from store/[productId]/_client.tsx SpecTable.
  Value is ink (hardware) or brand (`brandValue`, for AI throughput rows).
-->
<template>
  <view class="mx-4 rounded-2xl overflow-hidden" :style="rootStyle">
    <view
      v-for="(r, i) in rows"
      :key="r.k"
      class="flex items-center justify-between"
      :style="rowStyle(i)"
    >
      <text style="font-size: 13px; color: var(--v5-ink-3)">{{ r.k }}</text>
      <text class="tabular-nums" :style="valueStyle">{{ r.v }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{ rows: { k: string; v: string }[]; brandValue?: boolean }>(),
  { brandValue: false },
);

const rootStyle: CSSProperties = {
  background: "var(--v5-surface)",
  padding: "0 16px",
};
function rowStyle(i: number): CSSProperties {
  return {
    padding: "12px 0",
    borderBottom: i < props.rows.length - 1 ? "1px solid var(--v5-border)" : "none",
  };
}
const valueStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: props.brandValue ? "var(--v5-brand)" : "var(--v5-ink)",
}));
</script>
