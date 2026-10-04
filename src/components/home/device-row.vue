<!-- A single device action combines the large bay, explicit status, name and live earnings. -->
<template>
  <view class="nx-device-row nx-home-glass-item" :data-online="isOnline ? 'true' : 'false'" :data-device-id="device.id"
    role="button" tabindex="0"
    :aria-label="`${t.earn.deviceDetailTitle}: ${displayName} · ${statusText}`"
    @click="go"  @keydown.enter.prevent="go" @keydown.space.prevent="go">
    <view class="nx-home-glass-panel" aria-hidden="true" />
    <text class="hf-device-status" :class="{ 'hf-device-status--online': isOnline }">{{ statusText }}</text>
    <DeviceSlot :device="device" :online="isOnline" />
    <view class="hf-device-meta">
      <text class="hf-device-name">{{ displayName }}</text>
      <text class="hf-device-income font-mono-tabular">+${{ todayText }}</text>
    </view>
    <view class="nx-home-arrow" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { deviceOnlineState } from "@/lib/hashpower";
import { deviceName } from "@/lib/device-copy";
import type { Device } from "@/store/types";

const props = defineProps<{ device: Device; divider?: boolean; runtimeConfirmed: boolean }>();
const t = useT();
// Stored device name is English + persisted → resolve from `kind` at render.
const displayName = computed(() => deviceName(t.value, props.device));

const onlineState = computed(() => deviceOnlineState(props.device, Date.now(), props.runtimeConfirmed));
const isOnline = computed(() => onlineState.value === "online");
const statusText = computed(() => onlineState.value === "unknown" ? t.value.earn.runtimeUnknown : isOnline.value ? t.value.earn.online : t.value.earn.offline);
const rowStyle = computed<CSSProperties>(() => ({
  padding: "13px 14px",
  borderBottom: props.divider ? "1px solid var(--v5-border)" : "none",
}));
const dotStyle = computed<CSSProperties>(() => ({
  width: "7px",
  height: "7px",
  borderRadius: "50%",
  flexShrink: 0,
  background: isOnline.value ? "var(--v5-success)" : "var(--v5-ink-4)",
}));
const todayText = computed(() =>
  props.device.todayEarnings.toFixed(props.device.todayEarnings < 1 ? 3 : 2),
);

function go() {
  navTo(`/pages/earn/device-detail?id=${encodeURIComponent(props.device.id)}&from=home`);
}

import DeviceSlot from "./device-slot.vue";
</script>

<style scoped>
.nx-device-row { min-width: 0; min-height: 192px; padding: 12px 12px 16px; border-radius: var(--v5-radius-xl); display: flex; flex-direction: column; }
.hf-device-status { position: absolute; top: 10px; right: 10px; z-index: 2; padding: 4px 10px; max-width: calc(100% - 20px); border-radius: var(--v5-radius-full); font: 500 12px/16px var(--font-v5); color: var(--v5-ink-3); background: var(--v5-surface-3); text-align: center; overflow-wrap: anywhere; }
.hf-device-status--online { color: var(--v5-brand); background: var(--v5-brand-soft); }
.hf-device-meta { position: relative; min-width: 0; margin-top: auto; padding-right: 28px; }
.hf-device-name { display: block; font: 500 13px/1.35 var(--font-v5); color: var(--v5-ink); overflow-wrap: anywhere; }
.hf-device-income { display: block; margin-top: 4px; font: 600 20px/1.3 var(--font-v5); color: var(--v5-ink); letter-spacing: -.025em; overflow-wrap: anywhere; }
.nx-device-row .nx-home-arrow { position: absolute; right: 10px; bottom: 18px; width: 28px; height: 28px; }
@media (max-width: 350px) {
  .nx-device-row { padding: 10px 10px 14px; }
  .hf-device-meta { padding-right: 0; }
  .nx-device-row .nx-home-arrow { display: none; }
}
</style>
