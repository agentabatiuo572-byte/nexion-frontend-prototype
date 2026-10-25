<!-- A single device action combines the large bay, explicit status, name and live earnings. -->
<template>
  <view class="nx-device-row" :data-online="isOnline ? 'true' : 'false'" :data-device-id="device.id"
    role="button" tabindex="0"
    :aria-label="`${t.earn.deviceDetailTitle}: ${displayName} · ${statusText}`"
    @click="go"  @keydown.enter.prevent="go" @keydown.space.prevent="go">
    <DeviceSlot :device="device" :online="false" />
    <view class="hf-device-meta">
      <text class="hf-device-name">{{ displayName }}</text>
      <text class="hf-device-status" :class="{ 'hf-device-status--offline': onlineState === 'offline' }"><text class="hf-status-dot" :style="dotStyle" />{{ statusText }}</text>
    </view>
    <view class="hf-device-income"><text class="font-mono-tabular">{{ runtimeConfirmed ? (device.todayEarnings > 0 ? '+' : '') + fmtMoney(device.todayEarnings) : '-' }}</text><text class="hf-device-today">{{ copy.today }}</text></view>
    <view class="nx-home-arrow" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { fmtMoney } from '@/i18n/format';
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { deviceOnlineState } from "@/lib/hashpower";
import { deviceName } from "@/lib/device-copy";
import type { Device } from "@/store/types";

const props = defineProps<{ device: Device; divider?: boolean; runtimeConfirmed: boolean }>();
const t = useT();
const copy = useAuditUiCopy();
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
  formatAmount(props.device.todayEarnings),
);

function go() {
  navTo(`/pages/earn/device-detail?id=${encodeURIComponent(props.device.id)}&from=home`);
}

import DeviceSlot from "./device-slot.vue";
</script>

<style scoped>
.nx-device-row { display: flex; align-items: center; gap: 12px; min-height: 64px; box-sizing:border-box;padding: 10px 16px; cursor: pointer; }
.nx-device-row:active { background: var(--v5-surface-2); }
.nx-device-row:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -2px; }
.nx-device-row :deep(.nx-device-slot) { width: 48px; height: 48px; flex-shrink: 0;border-radius:14px;background:radial-gradient(80% 70% at 50% 70%,color-mix(in srgb,var(--v5-ink) 6%,transparent),transparent); }
.nx-device-row :deep(.nx-home-art) { width: 52px;max-width:none; height: 52px; animation: none; }
.nx-device-row :deep(.hf-computer) { height: 48px; }
.hf-device-meta { min-width: 0; flex: 1; }
.hf-device-name { display: block; font: 500 15px/20px var(--font-v5); color: var(--v5-ink); overflow-wrap: anywhere; }
.hf-device-status { display: flex;align-items:center;gap:6px; margin-top: 2px; font: 400 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.hf-device-status--offline { color: var(--v5-warning-ink); }
.hf-device-income { flex-shrink: 0; font: 600 15px/20px var(--font-v5); color: var(--v5-brand);text-align:right; }
.hf-device-today {display:block;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-3);}
.nx-home-arrow { display: flex; align-items: center; width: 16px; color: var(--v5-ink-4);background:none;box-shadow:none; }
</style>
