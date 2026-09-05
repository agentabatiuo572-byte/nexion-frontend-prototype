<!--
  SettingRow — ported from me/page.tsx SettingRow.
  Strict port of styles-v4.css .setting-row: 30px icon chip (surface-2 + border)
  + label (display 14 ink) + optional right value (12.5 ink-3, slot or text) +
  chevron. Navigates to `href` (uni route) with fail:()=>{} for not-yet-ported
  targets. `last` removes the bottom divider. Icon supplied via #icon slot.
-->
<template>
  <view class="flex items-center active:opacity-80" :style="rowStyle" @click="go">
    <view class="grid place-items-center shrink-0" :style="iconChipStyle">
      <slot name="icon" />
    </view>
    <text class="flex-1 truncate" :style="labelStyle">{{ label }}</text>
    <view v-if="hasValue" class="shrink-0 truncate" :style="valueWrapStyle">
      <slot name="value">
        <text :style="{ color: valueTint || 'var(--v5-ink-3)' }">{{ value }}</text>
      </slot>
    </view>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="m9 18 6-6-6-6" /></svg>
  </view>
</template>

<script setup lang="ts">
import { computed, useSlots, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{
    href: string;
    label: string;
    value?: string;
    valueTint?: string;
    last?: boolean;
  }>(),
  { last: false },
);

const slots = useSlots();
const hasValue = computed(() => props.value !== undefined || !!slots.value);

function go() {
  uni.navigateTo({ url: props.href, fail: () => {} });
}

const rowStyle = computed<CSSProperties>(() => ({
  gap: "12px",
  padding: "13px 0",
  borderBottom: props.last ? "none" : "1px solid var(--v5-border)",
}));
const iconChipStyle: CSSProperties = {
  width: "30px",
  height: "30px",
  borderRadius: "9px",
  background: "var(--v5-surface-2)",
  border: "1px solid var(--v5-border)",
  color: "var(--v5-ink-2)",
};
const labelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink)",
  whiteSpace: "nowrap",
};
const valueWrapStyle: CSSProperties = {
  fontSize: "13px",
  whiteSpace: "nowrap",
  maxWidth: "170px",
  textAlign: "right",
};
</script>
