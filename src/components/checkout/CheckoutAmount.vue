<template>
  <text class="checkout-amount"><text v-if="showCurrency && currency === 'USD'" class="checkout-amount__symbol">$</text><text>{{ parts.whole }}</text><text v-if="parts.fraction" class="checkout-amount__fraction">.{{ parts.fraction }}</text><text v-if="showCurrency && currency === 'USDT'" class="checkout-amount__unit">USDT</text></text>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { formatGroupedAmount } from '@/lib/amount-display';
const props = withDefaults(defineProps<{ value: string | number | null | undefined; currency?: 'USD' | 'USDT'; showCurrency?: boolean }>(), { currency: 'USD', showCurrency: true });
const parts = computed(() => {
  const formatted = formatGroupedAmount(props.value);
  if (formatted === '-') return { whole: '—', fraction: '' };
  const [whole, fraction] = formatted.split('.');
  return { whole, fraction };
});
</script>
<style scoped>
.checkout-amount { white-space: nowrap; font-family: var(--font-amount); font-weight: 500; font-variant-numeric: tabular-nums; }
.checkout-amount__symbol { margin-right: calc(var(--v5-space-1) / 2); color: var(--v5-ink-3); font-size: .6em; }
.checkout-amount__fraction { color: var(--v5-ink-3); }
.checkout-amount__unit { margin-left: var(--v5-space-1); color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
</style>
