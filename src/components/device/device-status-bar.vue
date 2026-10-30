<!--
  Shared gradient frost for the status-bar safe area. Native devices keep their
  system indicators; only the H5 device-preview shell simulates clock/signal/wifi/
  battery. Uses the real device height or preview height, and renders no overlay
  when desktop H5 has no status-bar inset.

  Absolutely positioned at top:0 of the nearest positioned ancestor — AppChassis
  (.nx-chassis) and the bare full-screen chat page (.cp-root, position:fixed) both
  provide one. Extracted from app-chassis so bare pages (support/chat) show the same
  status bar instead of tucking their header under it.
-->
<template>
  <view v-if="barHeight > 0" class="nx-statusbar-material" :style="{ height: (barHeight + 40) + 'px' }" aria-hidden="true">
    <view /><view /><view /><view />
  </view>
  <view v-if="barHeight > 0" class="nx-statusbar" :style="{ height: barHeight + 'px' }">
    <view v-if="showBar" class="nx-statusbar__inner" aria-hidden="true">
      <text class="nx-statusbar__time">{{ statusTime }}</text>
      <view class="nx-statusbar__icons">
        <view class="nx-statusbar__signal">
          <view />
          <view />
          <view />
          <view />
        </view>
        <view class="nx-statusbar__wifi"><view /></view>
        <view class="nx-statusbar__battery" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";

const barHeight = computed(() => {
  try {
    return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight();
  } catch {
    return h5DevicePreviewStatusBarHeight();
  }
});
const showBar = computed(() => h5DevicePreviewStatusBarHeight() > 0);

const statusTime = ref("9:41");
function updateStatusTime() {
  const now = new Date();
  statusTime.value = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}
let statusClockTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  updateStatusTime();
  statusClockTimer = setInterval(updateStatusTime, 30_000);
});
onUnmounted(() => {
  if (statusClockTimer) clearInterval(statusClockTimer);
});
</script>

<style scoped>
.nx-statusbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 110;
  pointer-events: none;
}
/* The material continues below the safe area behind navigation (z50/z100).
   Four successively shorter blur bands avoid a uniform blur ending at 54px. */
.nx-statusbar-material {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  pointer-events: none;
}
.nx-statusbar-material > view,
.nx-statusbar-material::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.nx-statusbar-material > view:nth-child(1) {
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
  mask-image: linear-gradient(to bottom, #000 0%, #000 45%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 45%, transparent 100%);
}
.nx-statusbar-material > view:nth-child(2) {
  backdrop-filter: blur(4px) saturate(125%);
  -webkit-backdrop-filter: blur(4px) saturate(125%);
  mask-image: linear-gradient(to bottom, #000 0%, #000 30%, transparent 85%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 30%, transparent 85%);
}
.nx-statusbar-material > view:nth-child(3) {
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  mask-image: linear-gradient(to bottom, #000 0%, #000 15%, transparent 70%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 15%, transparent 70%);
}
.nx-statusbar-material > view:nth-child(4) {
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  mask-image: linear-gradient(to bottom, #000 0%, transparent 55%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 55%);
}
.nx-statusbar-material::after {
  content: "";
  background: linear-gradient(to bottom, color-mix(in srgb, var(--v5-bg) 56%, transparent) 0%, color-mix(in srgb, var(--v5-bg) 28%, transparent) 40%, transparent 100%);
}
.nx-statusbar__inner {
  position: absolute;
  z-index: 1;
  top: 13px;
  left: 28px;
  right: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--v5-ink);
  pointer-events: none;
}
.nx-statusbar__time {
  min-width: 58px;
  text-align: center;
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 650;
  line-height: 1;
}
.nx-statusbar__icons {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 76px;
  justify-content: flex-end;
}
.nx-statusbar__signal {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 13px;
}
.nx-statusbar__signal view {
  width: 3px;
  border-radius: 2px;
  background: currentColor;
}
.nx-statusbar__signal view:nth-child(1) {
  height: 5px;
}
.nx-statusbar__signal view:nth-child(2) {
  height: 7px;
}
.nx-statusbar__signal view:nth-child(3) {
  height: 10px;
}
.nx-statusbar__signal view:nth-child(4) {
  height: 13px;
}
.nx-statusbar__wifi {
  position: relative;
  width: 18px;
  height: 13px;
  overflow: hidden;
}
.nx-statusbar__wifi::before,
.nx-statusbar__wifi::after {
  content: "";
  position: absolute;
  left: 50%;
  border: 2px solid currentColor;
  border-color: currentColor transparent transparent transparent;
  border-radius: 999px;
  transform: translateX(-50%);
}
.nx-statusbar__wifi::before {
  top: 0;
  width: 18px;
  height: 18px;
}
.nx-statusbar__wifi::after {
  top: 5px;
  width: 10px;
  height: 10px;
}
.nx-statusbar__wifi view {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
  transform: translateX(-50%);
}
.nx-statusbar__battery {
  position: relative;
  width: 25px;
  height: 12px;
  border: 1.6px solid currentColor;
  border-radius: 4px;
}
.nx-statusbar__battery::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 6px;
  border-radius: 2px;
  background: currentColor;
}
.nx-statusbar__battery::after {
  content: "";
  position: absolute;
  top: 3px;
  right: -4px;
  width: 2px;
  height: 5px;
  border-radius: 0 2px 2px 0;
  background: currentColor;
  opacity: 0.75;
}
</style>
