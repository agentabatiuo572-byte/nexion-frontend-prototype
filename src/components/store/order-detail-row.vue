<!--
  OrderDetailRow — label/value row for the order-detail summary card. Field
  name in the muted role, value in primary ink 500 (design system 01 §1.1.1).
  Variants: mono (codes), brand (discounts and rewards), warning (the payment
  deadline), copyable (long codes get a copy button and may wrap).
-->
<template>
  <view class="detail-row">
    <text class="detail-row__label">{{ label }}</text>
    <view v-if="copyable" class="detail-row__copy">
      <text class="detail-row__value detail-row__value--wrap" :class="valueClass">{{ value }}</text>
      <CopyCodeButton :value="value" :label="label" />
    </view>
    <text v-else class="detail-row__value" :class="valueClass">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CopyCodeButton from "@/components/copy-code-button.vue";

const props = defineProps<{
  label: string;
  value: string;
  mono?: boolean;
  brand?: boolean;
  warning?: boolean;
  copyable?: boolean;
}>();

const valueClass = computed(() => ({
  "detail-row__value--mono": props.mono,
  "detail-row__value--brand": props.brand,
  "detail-row__value--warning": props.warning,
}));
</script>

<style scoped>
.detail-row { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-3); min-height: 32px; }
.detail-row__label { flex: none; color: var(--v5-ink-3); font: 400 var(--ui-type-list-subtitle)/var(--ui-type-list-subtitle-lh) var(--font-v5); }
.detail-row__copy { display: flex; align-items: center; min-width: 0; }
.detail-row__value { min-width: 0; text-align: right; color: var(--v5-ink); font: 500 var(--ui-type-list-subtitle)/var(--ui-type-list-subtitle-lh) var(--font-v5); font-variant-numeric: tabular-nums; }
.detail-row__value--wrap { overflow-wrap: anywhere; }
.detail-row__value--mono { font-family: var(--font-jet-mono), ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-weight: 400; font-size: var(--ui-type-meta); }
.detail-row__value--brand { color: var(--v5-brand); }
.detail-row__value--warning { color: var(--v5-warning-ink); }
</style>
