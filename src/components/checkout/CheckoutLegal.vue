<template>
  <view class="checkout-legal-group">
    <text class="checkout-legal-group__intro">{{ copy.legalLead }}</text>
    <view class="checkout-legal-group__links" role="navigation" :aria-label="copy.legalLead">
      <view v-for="link in links" :key="link.kind" class="checkout-legal-group__link" role="link" tabindex="0" @click="emit('navigate', link.kind)" @keydown.enter.prevent="!$event.repeat && emit('navigate', link.kind)"><text>{{ link.label }}</text></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useLocaleStore } from '@/store/locale';
import { checkoutFlowCopy } from '@/lib/checkout-flow-copy';
const emit = defineEmits<{ (event: 'navigate', kind: 'aftersales' | 'terms' | 'risk'): void }>();
const locale = useLocaleStore();
const copy = computed(() => checkoutFlowCopy(locale.code));
// The parent opens its existing purchase-policy sheet for aftersales. The two
// published routes are /pages/onboarding/terms and /pages/me/risk-disclosure.
const links = computed(() => [
  { kind: 'aftersales' as const, label: copy.value.afterSalesShort },
  { kind: 'terms' as const, label: copy.value.termsShort },
  { kind: 'risk' as const, label: copy.value.riskShort },
]);
</script>
<style scoped>
.checkout-legal-group { margin-top: var(--v5-space-6); text-align: center; }
.checkout-legal-group__intro { display: block; margin-bottom: var(--v5-space-1); color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.checkout-legal-group__links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.checkout-legal-group__link { position: relative; display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 44px; padding: var(--v5-space-2) calc(var(--v5-space-3) / 2); color: var(--v5-brand); font: var(--ui-type-text-link-weight) var(--ui-type-text-link)/var(--ui-type-text-link-lh) var(--font-v5); cursor: pointer; transition: filter 160ms ease-out; }
.checkout-legal-group__link + .checkout-legal-group__link::before { content: ''; position: absolute; left: 0; top: 50%; width: 1px; height: 16px; transform: translateY(-50%); background: color-mix(in srgb, var(--v5-ink) 5%, transparent); pointer-events: none; }
.checkout-legal-group__link:active { filter: brightness(.85); }
.checkout-legal-group__link:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .checkout-legal-group__link { transition: none; } }
</style>
