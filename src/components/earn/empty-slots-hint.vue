<!-- Compact earn list; the original trial reservation remains visible without a duplicate icon rail. -->
<template>
  <view class="earn-fleet-list mx-4">
    <view class="nx-home-glass-panel" aria-hidden="true" />
    <view class="earn-fleet-content">
      <view v-if="trialSlot" class="earn-trial-reservation">
        <text>{{ t.trial.slotTag }}</text>
        <text class="font-mono-tabular">1 / {{ MAX_DEVICES }}</text>
      </view>
      <slot />
      <view class="earn-add-wrap">
        <view class="earn-add-device nx-home-pill" role="button" tabindex="0" :aria-busy="sheet.checking" :aria-disabled="sheet.checking"
          @click="openAddDevice" @keydown.enter.stop.prevent="openAddDevice" @keydown.space.stop.prevent="openAddDevice">
          <text>{{ t.earn.fillSlots }}</text>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSlotActionSheet } from "@/store/slot-action-sheet";
import { MAX_DEVICES } from "@/store/device-types";
import { trialReservesSlotNow } from "@/store/free-trial";
import { useT } from "@/i18n/use-t";
const t = useT();
const sheet = useSlotActionSheet();
const trialSlot = computed(() => trialReservesSlotNow());
function openAddDevice() { void sheet.openForSlot(); }
</script>

<style scoped>
.earn-fleet-list { position: relative; border-radius: var(--v5-radius-2xl); }
.earn-fleet-content { position: relative; }
.earn-trial-reservation { display: flex; justify-content: space-between; gap: 12px; margin: 0 16px; padding: 14px 0 10px; font: 500 12px/1.4 var(--font-v5); color: var(--v5-ink-2); border-bottom: 1px solid var(--v5-border); }
.earn-add-wrap { padding: 4px 14px 14px; }
.earn-add-device { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 44px; padding: 10px 18px; font: 600 15px/1.4 var(--font-v5); transition: transform .4s cubic-bezier(.16,1.4,.3,1); }
.earn-add-device:active { transform: scale(.975); }
.earn-add-device[aria-busy="true"] { opacity: .6; }
@media (prefers-reduced-motion: reduce) { .earn-add-device { transition: none; transform: none; } }
</style>
