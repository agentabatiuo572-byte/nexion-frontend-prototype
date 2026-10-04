<template>
  <view class="nx-home-indicator" :class="{ 'nx-home-indicator--system': isNativeAndroid }" aria-hidden="true" />
</template>

<script setup lang="ts">
let isNativeAndroid = false;
// #ifdef APP-PLUS
// Keep the spacer and tab position; Android already draws the gesture bar.
isNativeAndroid = uni.getSystemInfoSync().platform === "android";
// #endif
</script>

<style scoped>
.nx-home-indicator {
  height: 22px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8px;
  box-sizing: border-box;
  pointer-events: none;
}
.nx-home-indicator::after {
  content: "";
  width: 134px;
  height: 5px;
  border-radius: 3px;
  background: var(--v5-home-indicator);
}
.nx-home-indicator--system::after {
  display: none;
}
</style>
