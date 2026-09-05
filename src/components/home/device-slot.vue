<!--
  DeviceSlot — one bay in ZONE 2 fleet's horizontal slot rack. Icon-only: the
  device-kind icon + true-online pulse inside a rounded bay (the "device docked in a
  slot" visual). Name / status / earnings live in the DeviceRow list below — the
  rack is icons only. Tapping opens the device's detail / earn page.
-->
<template>
  <view
    class="nx-device-slot grid place-items-center relative shrink-0 active:opacity-70"
    :style="bayStyle"
    :data-online="isOnline ? 'true' : 'false'"
    role="button"
    tabindex="0"
    :aria-label="`${t.earn.deviceDetailTitle}: ${displayName} · ${isOnline ? t.earn.online : t.earn.offline}`"
    @click="go"
    @keydown.enter.prevent="go"
    @keydown.space.prevent="go"
  >
    <svg v-if="iconKind === 'smartphone'" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="iconColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
    <svg v-else-if="iconKind === 'server'" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="iconColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></svg>
    <svg v-else-if="iconKind === 'cpu'" width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="iconColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" /></svg>
    <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" :stroke="iconColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
    <view v-if="isOnline" style="position: absolute; top: -3px; right: -3px; width: 11px; height: 11px; border-radius: 50%; background: var(--v5-success); border: 2px solid var(--v5-bg); animation: v5-hb-pulse-success 1.6s ease-in-out infinite" />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { isDeviceOnline } from "@/lib/hashpower";
import { deviceName } from "@/lib/device-copy";
import type { Device } from "@/store/types";

const props = defineProps<{ device: Device }>();
const t = useT();
// Stored device name is English + persisted → resolve from `kind` at render.
const displayName = computed(() => deviceName(t.value, props.device));

const isOnline = computed(() => isDeviceOnline(props.device, Date.now()));
const iconColor = computed(() => (isOnline.value ? "var(--v5-brand)" : "var(--v5-ink-3)"));
const bayStyle = computed(() => ({
  width: "48px",
  height: "48px",
  borderRadius: "14px",
  background: isOnline.value ? "var(--v5-brand-soft)" : "var(--v5-surface)", // 离线槽位贴页面底:原 surface-2 与页面底同色不可辨,改 L1
}));
const iconKind = computed(() => {
  const k = props.device.kind;
  if (k === "phone") return "smartphone";
  if (k.startsWith("stellarrack")) return "server";
  if (k === "cloud-share") return "cpu";
  return "box";
});

function go() {
  navTo(`/pages/earn/device-detail?id=${encodeURIComponent(props.device.id)}`);
}
</script>
