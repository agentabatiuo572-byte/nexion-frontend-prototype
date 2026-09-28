<!-- One large, accessible card per active device. The empty bay keeps the existing upgrade destination. -->
<template>
  <view class="hf-section">
    <view class="hf-heading">
      <view class="hf-title-group">
        <text class="hf-title">{{ t.home.myFleet }}</text>
        <text class="hf-count font-mono-tabular">{{ fleetCountText }}</text>
      </view>
      <view class="hf-manage nx-home-glass-item" role="button" tabindex="0" @click="goManage">
        <view class="nx-home-glass-panel" aria-hidden="true" />
        <text>{{ t.home.fleetManage }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
      </view>
    </view>
    <view class="hf-grid">
      <DeviceRow v-for="d in devices" :key="d.id" :device="d" />
      <AddDeviceRow v-if="devices.length < 6" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { navTo } from "@/lib/route";
import DeviceRow from "./device-row.vue";
import AddDeviceRow from "./add-device-row.vue";

const t = useT();
const app = useApp();
const devices = computed(() => app.visibleDevices.filter((d) => d.activatedAt !== null));
const fleetCountText = computed(() => fmt(t.value.home.fleetOfMax, { n: devices.value.length }));

function goManage() {
  navTo("/pages/earn/earn");
}
</script>

<style scoped>
.hf-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 2px 12px; }
.hf-title-group { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; min-width: 0; }
.hf-title { font: 600 20px/1.35 var(--font-v5); color: var(--v5-ink); letter-spacing: -.02em; }
.hf-count { font-size: 12px; line-height: 18px; color: var(--v5-ink-3); white-space: nowrap; }
.hf-manage { display: flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 8px; min-height: 44px; padding: 10px 16px; border-radius: var(--v5-radius-full); font: 500 13px/20px var(--font-v5); color: var(--v5-ink); }
.hf-manage > text, .hf-manage > svg { position: relative; }
.hf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.hf-grid > :nth-child(even) { --home-art-delay: -2s; }
</style>
