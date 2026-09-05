<!--
  DeviceRow — one row in ZONE 2 fleet's device list (below the slot rack):
  status dot · device name · today earnings. Status is the dot colour (green =
  truly online, dim = hosted/offline). No icon (those live in the rack above), no GPU
  spec, no task block — kept simple per design. Tapping opens detail / earn.
-->
<template>
  <view
    class="nx-device-row flex items-center justify-between active:opacity-70"
    :style="rowStyle"
    :data-online="isOnline ? 'true' : 'false'"
    role="button"
    tabindex="0"
    :aria-label="`${t.earn.deviceDetailTitle}: ${displayName} · ${isOnline ? t.earn.online : t.earn.offline}`"
    @click="go"
    @keydown.enter.prevent="go"
    @keydown.space.prevent="go"
  >
    <view class="flex items-center min-w-0" style="gap: 9px; flex: 1 1 auto">
      <view :style="dotStyle" />
      <text class="block" style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-v5); font-weight: 500; font-size: 15px; color: var(--v5-ink); letter-spacing: -0.01em">{{ displayName }}</text>
      <!-- WCAG 1.4.1 状态不只靠色:离线(异常态)显式带文字;在线为默认态,
           两态的状态词都进 aria-label。紧凑行里只标异常,不挤占设备名空间。 -->
      <text v-if="!isOnline" class="shrink-0" style="font-size: 12px; line-height: 16px; color: var(--v5-ink-3)">{{ t.earn.offline }}</text>
    </view>
    <text class="font-mono-tabular tabular-nums shrink-0" style="font-family: var(--font-v5); font-weight: 500; font-size: 15px; color: var(--v5-success-ink); margin-left: 12px">+${{ todayText }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { isDeviceOnline } from "@/lib/hashpower";
import { deviceName } from "@/lib/device-copy";
import type { Device } from "@/store/types";

const props = defineProps<{ device: Device; divider: boolean }>();
const t = useT();
// Stored device name is English + persisted → resolve from `kind` at render.
const displayName = computed(() => deviceName(t.value, props.device));

const isOnline = computed(() => isDeviceOnline(props.device, Date.now()));
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
  navTo(`/pages/earn/device-detail?id=${encodeURIComponent(props.device.id)}`);
}
</script>
