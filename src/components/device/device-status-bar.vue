<!--
  Simulated iOS status bar for the H5 device-preview shell (clock + signal + wifi +
  battery). Self-contained: computes its own height/visibility (real device height,
  else the H5 device-preview simulated height) and drives its own clock. Renders only
  inside the preview iframe (nx_device_inner=1); ~0 height + hidden on real desktop H5.

  Absolutely positioned at top:0 of the nearest positioned ancestor — AppChassis
  (.nx-chassis) and the bare full-screen chat page (.cp-root, position:fixed) both
  provide one. Extracted from app-chassis so bare pages (support/chat) show the same
  status bar instead of tucking their header under it.
-->
<template>
  <view class="nx-statusbar" :style="{ height: barHeight + 'px' }">
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
}
.nx-statusbar__inner {
  position: absolute;
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
