<!--
  TradeinLadderSheet(W-TIL1)— 置换抵扣帮助弹层。
  入口:设备列表「可抵 $X」chip。展示所选设备和抵扣使用说明,不写任何状态。
-->
<template>
  <view v-if="device" class="fixed inset-0" style="z-index: 900">
    <view class="absolute inset-0" style="background: var(--v5-bg-color-mask)" @click="emit('close')" />
    <view class="absolute left-0 right-0 bottom-0" :style="sheetStyle">
      <view class="flex items-center justify-between">
        <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 650; color: var(--v5-ink)">{{ t.tradein.ladderTitle }}</text>
        <view class="grid place-items-center active:opacity-70" :style="closeBtnStyle" @click.stop="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>
      <view style="margin-top: 6px"><text style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.6">{{ t.tradein.ladderIntro }}</text></view>

      <view class="flex items-center justify-between" style="margin-top: 14px; gap: 12px">
        <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.tradein.sheetOldDeviceLabel }}</text>
        <text style="font-size: 13px; color: var(--v5-ink)">{{ deviceName(t, device) }}</text>
      </view>

      <view style="margin-top: 12px"><text style="font-size: 12px; color: var(--v5-ink-4); line-height: 1.6">{{ t.tradein.ladderFootnote }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import type { Device } from "@/store/types";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";

defineProps<{ device: Device | null }>();
const emit = defineEmits<{ (e: "close"): void }>();
const t = useT();
const sheetStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "24px 24px 0 0",
  padding: "18px 18px 30px",
  boxShadow: "var(--v5-card-shadow-lift-strong)",
};
// 44×44 点按区(移动端最小触控标准;PR-D 债 #4)。
const closeBtnStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  border: "1px solid var(--v5-border)",
};
</script>
