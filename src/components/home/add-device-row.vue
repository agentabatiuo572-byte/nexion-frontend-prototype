<!--
  AddDeviceRow — the "add a box" empty bay in ZONE 2 fleet's slot rack (matches
  the DeviceSlot bay style, dashed to read as an empty slot). Targets the next
  upgrade tier (derivePromoUpgrade) so a Pro/Rack owner is pushed up-ladder;
  tapping opens that tier's store page.
-->
<template>
  <view class="grid place-items-center shrink-0 active:opacity-70" style="width: 48px; height: 48px; border-radius: 14px; border: 1.5px dashed var(--v5-brand-border)" @click="go">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useApp } from "@/store/app";
import { derivePromoUpgrade } from "@/store/device-types";

const app = useApp();
const promo = computed(() => derivePromoUpgrade(app.visibleDevices));

function go() {
  uni.navigateTo({ url: `/pages/store/detail?id=${promo.value.targetKind}`, fail: () => {} });
}
</script>
