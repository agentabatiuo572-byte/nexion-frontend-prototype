<!-- Navigation choices only; the inventory screen owns actual activation. -->
<template>
  <view v-if="sheet.open" class="sas-root" role="dialog" aria-modal="true" :aria-label="t.slotSheet.title">
    <view class="sas-backdrop" aria-hidden="true" @click="hide" />
    <view class="nx-glass-sheet sas-panel" @click.stop>
      <view class="sas-content">
        <view class="sas-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8" /></svg>
        </view>
        <view class="sas-close" role="button" tabindex="0" :aria-label="t.trial.sheetCloseAria"
          @click="hide" @keydown.enter.stop.prevent="hide" @keydown.space.stop.prevent="hide">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </view>
        <text class="sas-title">{{ t.slotSheet.title }}</text>
        <text class="sas-desc">{{ t.slotSheet.desc }}</text>
        <view class="sas-inventory-cta nx-home-pill" role="button" tabindex="0"
          @click="onGoInventory" @keydown.enter.stop.prevent="onGoInventory" @keydown.space.stop.prevent="onGoInventory">
          <text>{{ t.slotSheet.activateRow }}</text>
        </view>
        <view class="sas-store-cta" role="button" tabindex="0"
          @click="onGoStore" @keydown.enter.stop.prevent="onGoStore" @keydown.space.stop.prevent="onGoStore">
          <text>{{ t.slotSheet.goStoreCta }}</text>
        </view>
        <view class="sas-cancel" role="button" tabindex="0"
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
.sas-panel { border-radius: var(--nx-glass-radius) var(--nx-glass-radius) 0 0; box-shadow: var(--nx-glass-edge); position: absolute; left: 0; right: 0; bottom: 0; max-height: 90%; overflow-y: auto;  padding: 20px 20px calc(env(safe-area-inset-bottom) + 38px); background: var(--nx-glass-fill); animation: sas-slide-up .32s cubic-bezier(.16,1,.3,1); }
.sas-content { position: relative; text-align: center; }
.sas-icon { display: grid; place-items: center; width: 48px; height: 48px; margin: 0 auto 10px; border-radius: var(--v5-radius-full); background: var(--v5-surface-2); color: var(--v5-ink-2); }
.sas-close { position: absolute; top: 0; right: -4px; width: 44px; height: 44px; display: grid; place-items: center; color: var(--v5-ink-2); border-radius: var(--v5-radius-full); }
.sas-title { display: block; font: 600 20px/1.35 var(--font-v5); color: var(--v5-ink); }
.sas-desc { display: block; margin: 8px 0 18px; font: 400 13px/1.6 var(--font-v5); color: var(--v5-ink-2); overflow-wrap: anywhere; }
.sas-inventory-cta, .sas-store-cta, .sas-cancel { display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 10px 18px; border-radius: var(--v5-radius-full); font: 600 15px/1.4 var(--font-v5); overflow-wrap: anywhere; transition: transform .25s ease; }
.sas-store-cta { margin-top: 10px; background: var(--v5-surface-2); color: var(--v5-ink); box-shadow: inset 0 1px 0 var(--v5-liquid-rim); }
.sas-cancel { margin-top: 10px; color: var(--v5-ink-2); font-weight: 400; }
.sas-inventory-cta:active, .sas-store-cta:active { transform: scale(.98); }
@keyframes sas-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sas-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .sas-panel, .sas-backdrop { animation: none; } .sas-inventory-cta, .sas-store-cta { transition: none; transform: none; } }
</style>
