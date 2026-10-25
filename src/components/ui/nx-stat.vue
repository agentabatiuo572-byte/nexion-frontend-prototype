<template><view class="nx-stat"><text class="nx-stat__label">{{ label }}</text><text class="nx-stat__value">{{ money ? fmtMoney(value) : value ?? '-' }}</text><text v-if="detail" class="nx-stat__detail">{{ detail }}</text></view></template>
<script setup lang="ts">
import { fmtMoney } from '@/i18n/format';
defineProps<{ label: string; value: number | null; money?: boolean; detail?: string }>();
</script>
<style scoped>
.nx-stat__label, .nx-stat__detail { display: block; font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-2); }
.nx-stat__value { display: block; margin: 4px 0; font: 600 24px/1.25 var(--font-v5); font-variant-numeric: tabular-nums; color: var(--v5-ink); }
</style>
