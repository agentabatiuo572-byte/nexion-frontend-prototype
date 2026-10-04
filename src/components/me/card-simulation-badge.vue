<template>
  <view
    v-if="developmentPaymentEnabled"
    class="nx-card-simulation-badge"
    data-testid="card-simulation-badge"
    role="status"
    aria-live="polite"
    style="margin: 0 16px 12px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--v5-warning) 36%, transparent); border-radius: 12px; background: var(--v5-warning-soft); text-align: center"
  >
    <text style="font-size: 12px; font-weight: 700; line-height: 1.55; color: var(--v5-warning)">{{ t.cards.developmentSimulationBadge }}</text>
  </view>
</template>

<script setup lang="ts">
import { developmentPaymentEnabled } from "@/api/runtime";
import { useT } from "@/i18n/use-t";

const t = useT();
</script>
