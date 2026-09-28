<!-- Navigation choices only; the inventory screen owns actual activation. -->
<template>
  <view v-if="sheet.open" class="sas-root" role="dialog" aria-modal="true" :aria-label="t.slotSheet.title">
    <view class="sas-backdrop" aria-hidden="true" @click="hide" />
    <view class="nx-glass-sheet sas-panel" @click.stop>
      <view class="sas-content">
        <view class="sas-handle" aria-hidden="true" />
        <view class="sas-close" role="button" tabindex="0" :aria-label="t.trial.sheetCloseAria"
          @click="hide" @keydown.enter.stop.prevent="hide" @keydown.space.stop.prevent="hide">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </view>
        <text class="sas-title">{{ t.slotSheet.title }}</text>
        <text class="sas-desc">{{ t.slotSheet.chooseMethod }}</text>
        <view class="sas-inventory-cta nx-glass-action" role="button" tabindex="0"
          @click="onGoInventory" @keydown.enter.stop.prevent="onGoInventory" @keydown.space.stop.prevent="onGoInventory">
          <svg class="sas-option-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8" /><path d="m6 13 3 1.5m6 0 3-1.5" /></svg>
          <view class="sas-option-copy"><text class="sas-option-title">{{ t.slotSheet.activateRow }}</text><text class="sas-option-hint">{{ t.slotSheet.inventoryHint }}</text></view>
          <svg class="sas-chevron" width="16" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </view>
        <view class="sas-store-cta nx-glass-action" role="button" tabindex="0"
          @click="onGoStore" @keydown.enter.stop.prevent="onGoStore" @keydown.space.stop.prevent="onGoStore">
          <svg class="sas-option-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h3l3 13h11l3-10H6" /><circle cx="9" cy="21" r="1" /><circle cx="19" cy="21" r="1" /></svg>
          <view class="sas-option-copy"><text class="sas-option-title">{{ t.slotSheet.goStoreCta }}</text><text class="sas-option-hint">{{ t.slotSheet.storeHint }}</text></view>
          <svg class="sas-chevron" width="16" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </view>
        <view class="sas-cancel nx-glass-action" role="button" tabindex="0"
          @click="hide" @keydown.enter.stop.prevent="hide" @keydown.space.stop.prevent="hide">
          <text>{{ t.earn.quickMenu.cancel }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSlotActionSheet } from "@/store/slot-action-sheet";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const sheet = useSlotActionSheet();
const t = useT();
function hide() { sheet.hide(); }
function onGoInventory() { if (!sheet.open) return; sheet.hide(); navTo("/pages/me/devices"); }
function onGoStore() { if (!sheet.open) return; sheet.hide(); navTo("/store"); }
useDialogA11y(computed(() => sheet.open), ".sas-root", hide);
</script>

<style scoped>
.sas-root { position: fixed; inset: 0; z-index: 790; }
.sas-backdrop { position: absolute; inset: 0; background: var(--v5-bg-color-mask); animation: sas-fade .2s ease-out; }
.sas-panel { position: absolute; left: 8px; right: 8px; bottom: 8px; max-height: calc(90% - 16px); overflow-y: auto; padding: 16px 20px calc(env(safe-area-inset-bottom) + 20px); animation: sas-slide-up .42s cubic-bezier(.16,1,.3,1); }
.sas-content { position: relative; text-align: left; }
.sas-handle { width: 48px; height: 5px; margin: 0 auto 26px; border-radius: 999px; background: var(--v5-ink-4); }
.sas-close { position: absolute; top: 14px; right: -6px; width: 44px; height: 44px; display: grid; place-items: center; color: var(--v5-ink-2); border-radius: 999px; }
.sas-title { display: block; padding-right: 36px; font: 600 23px/1.35 var(--font-v5); color: var(--v5-ink); }
.sas-desc { display: block; margin: 10px 0 22px; font: 400 14px/1.6 var(--font-v5); color: var(--v5-ink-2); overflow-wrap: anywhere; }
.sas-inventory-cta, .sas-store-cta { --nx-glass-radius: 20px; display: flex; align-items: center; gap: 14px; min-height: 88px; padding: 16px; box-sizing: border-box; color: var(--v5-ink); }
.sas-store-cta { margin-top: 12px; }
.sas-option-icon { flex-shrink: 0; color: var(--v5-ink-2); }
.sas-option-copy { flex: 1; min-width: 0; }
.sas-option-title { display: block; font: 600 17px/1.4 var(--font-v5); overflow-wrap: anywhere; }
.sas-option-hint { display: block; margin-top: 5px; font: 400 13px/1.5 var(--font-v5); color: var(--v5-ink-2); overflow-wrap: anywhere; }
.sas-chevron { flex-shrink: 0; color: var(--v5-ink-2); }
.sas-cancel { --nx-glass-radius: 999px; display: flex; align-items: center; justify-content: center; min-height: 52px; margin-top: 24px; padding: 8px 16px; color: var(--v5-ink); font: 600 16px/1.4 var(--font-v5); }
@keyframes sas-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sas-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .sas-panel, .sas-backdrop { animation: none; } }
</style>
