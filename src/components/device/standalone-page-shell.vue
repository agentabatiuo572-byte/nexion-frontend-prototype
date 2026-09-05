<!--
  Shared shell for bare auth/onboarding pages. It reserves the real device status
  bar on App, the simulated 54px status bar in the H5 device preview, and the
  bottom safe area/Home Indicator. AppChassis pages already provide the same chrome.
-->
<template>
  <view class="nx-standalone-page" :style="shellStyle">
    <DeviceStatusBar />
    <slot />
    <view class="nx-standalone-home">
      <DeviceHomeIndicator />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import DeviceHomeIndicator from "@/components/device/device-home-indicator.vue";
import DeviceStatusBar from "@/components/device/device-status-bar.vue";
import { h5DevicePreviewStatusBarHeight } from "@/lib/device-preview";

const props = withDefaults(defineProps<{
  topInset?: number;
  reserveBottom?: boolean;
}>(), {
  topInset: 0,
  reserveBottom: true,
});
const BOTTOM_SAFE_PADDING = "calc(env(safe-area-inset-bottom, 0px) + 38px)";

const statusBarHeight = computed(() => {
  try {
    return uni.getSystemInfoSync().statusBarHeight || h5DevicePreviewStatusBarHeight();
  } catch {
    return h5DevicePreviewStatusBarHeight();
  }
});

const shellStyle = computed<CSSProperties>(() => ({
  boxSizing: "border-box",
  paddingTop: `${statusBarHeight.value + props.topInset}px`,
  paddingBottom: props.reserveBottom ? BOTTOM_SAFE_PADDING : "0px",
}));
</script>

<style scoped>
.nx-standalone-home {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10050;
  pointer-events: none;
}
.nx-standalone-page :deep(.nx-statusbar) {
  position: fixed;
  z-index: 10050;
}
</style>
