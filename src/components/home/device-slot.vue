<!-- Decorative hardware bay inside the single DeviceRow action. Clicks bubble to that action. -->
<template>
  <view class="nx-device-slot" :data-online="online ? 'true' : 'false'" aria-hidden="true">
    <view v-if="artFile" class="nx-home-art" :class="{ 'nx-home-art-float': online }" :style="{ backgroundImage: `url('/static/img/home-glass-20260928/${artFile}.webp')` }" />
    <view v-else class="hf-computer">
      <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8m-4-4v4" /></svg>
      <view class="nx-home-empty-plinth" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Device } from "@/store/types";

const props = defineProps<{ device: Device; online: boolean }>();
// Family illustrations never replace persisted SKU identity or the detail-page product media.
const artFile = computed(() => {
  const kind = props.device.kind;
  if (kind === "phone") return "phone";
  if (kind === "cloud-share") return "cloud";
  if (kind === "stellarbox-s1") return "s1";
  if (kind === "stellarbox-pro" || kind === "stellarbox-pro-v2") return "pro";
  if (kind === "stellarrack-p1" || kind === "stellarrack-p2") return "rack";
  return "";
});
</script>

<style scoped>
.nx-device-slot { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; height: 126px; width: 100%; }
.nx-device-slot .nx-home-art { width: 136px; max-width: 100%; height: auto; aspect-ratio: 1; pointer-events: none; }
.hf-computer { position: relative; display: grid; place-items: center; width: 100%; height: 116px; color: var(--v5-ink-2); }
.hf-computer svg { z-index: 1; margin-bottom: 10px; }
</style>
