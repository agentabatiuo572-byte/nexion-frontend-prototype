<template>
  <view v-if="device" class="nx-tradein-ladder-root fixed inset-0" style="z-index: 900" role="dialog" aria-modal="true" :aria-label="t.tradein.ladderTitle" @click.stop>
    <view class="absolute inset-0" style="background: var(--v5-bg-color-mask)" @click="emit('close')" />
    <view class="nx-glass-sheet absolute left-0 right-0 bottom-0" :style="sheetStyle">
      <view class="flex items-center justify-between">
        <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 650; color: var(--v5-ink)">{{ t.tradein.ladderTitle }}</text>
        <view class="grid place-items-center active:opacity-70" :style="closeBtnStyle" role="button" tabindex="0" :aria-label="t.ui.close" @click.stop="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>
      <text class="block" style="margin-top: 14px; font-size: 15px; font-weight: 600; color: var(--v5-ink)">{{ deviceName(t, device) }}</text>
      <text class="block" style="margin-top: 8px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.6">{{ t.tradein.ladderIntro }}</text>
      <text class="block" style="margin-top: 8px; font-size: 12px; color: var(--v5-ink-4); line-height: 1.6">{{ t.tradein.ladderFootnote }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import type { Device } from "@/store/types";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";

const props = defineProps<{ device: Device | null }>();
const emit = defineEmits<{ (e: "close"): void }>();
const t = useT();
useDialogA11y(computed(() => props.device !== null), ".nx-tradein-ladder-root", () => emit("close"));

const sheetStyle: CSSProperties = {
  background: "var(--nx-glass-fill)", borderRadius: "var(--nx-glass-radius) var(--nx-glass-radius) 0 0",
  padding: "18px 18px 30px", boxShadow: "var(--nx-glass-edge)",
};
const closeBtnStyle: CSSProperties = {
  width: "44px", height: "44px", borderRadius: "12px",
  background: "var(--v5-surface-2)", border: "1px solid var(--v5-border)",
};


</script>
