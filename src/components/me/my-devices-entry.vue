<!--
  MyDevicesEntry — ported from me/page.tsx MyDevicesEntry (Sprint #146-1).
  Compact fleet summary: phone icon (success-soft + pulse dot when a device is online) +
  fleet title + "{n} online · {n} empty slots" + 6 slot pills (filled-from-left).
  Trial reserves a slot too. Taps through to /me/devices (not yet ported → nav
  fail:()=>{}).
-->
<template>
  <view>
    <SectionHeader
      :title="t.myDevices.sectionTitle"
      :count="sectionCount"
      link="/pages/me/devices"
      :link-label="t.myDevices.sectionManage"
    />
    <view class="block active:opacity-90" :style="cardStyle" @click="goDevices">
      <!-- Active device icon -->
      <view class="relative" :style="iconBoxStyle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
        <view v-if="onlineCount > 0" aria-hidden :style="pulseDotStyle" />
      </view>

      <!-- Center text stack -->
      <view style="min-width: 0">
        <text class="block" :style="fleetTitleStyle">{{ t.myDevices.fleetTitle }}</text>
        <view :style="fleetMetaStyle">
          <text style="color: var(--v5-success); font-weight: 500">{{ onlineLabel }}</text>
          <text style="color: var(--v5-ink-4); margin: 0 5px">·</text>
          <text>{{ emptySlotsLabel }}</text>
        </view>
      </view>

      <!-- 6 slot pills -->
      <view style="display: flex; gap: 4px">
        <view v-for="i in MAX_DEVICES" :key="i" :style="pillStyle(i - 1 < slotsUsed)" />
      </view>

      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import SectionHeader from "@/components/me/section-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { MAX_DEVICES } from "@/store/device-types";
import { trialReservesSlotNow } from "@/store/free-trial";
import { isDeviceOnline } from "@/lib/hashpower";

const t = useT();
const app = useApp();

const activeCount = computed(() => app.activeSlotCount);
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const slotsUsed = computed(() => activeCount.value + trialSlot.value);
const emptySlots = computed(() => MAX_DEVICES - slotsUsed.value);
const onlineCount = computed(
  () => app.visibleDevices.filter((device) => device.activatedAt !== null && isDeviceOnline(device, Date.now())).length + trialSlot.value,
);

const sectionCount = computed(() => fmt(t.value.myDevices.sectionCount, { n: slotsUsed.value, total: MAX_DEVICES }));
const onlineLabel = computed(() => fmt(t.value.myDevices.onlineLabel, { n: onlineCount.value }));
const emptySlotsLabel = computed(() => fmt(t.value.myDevices.emptySlots, { n: emptySlots.value }));

function goDevices() {
  uni.navigateTo({ url: "/pages/me/devices", fail: () => {} });
}

const cardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "14px 16px",
  display: "grid",
  gridTemplateColumns: "auto 1fr auto auto",
  gap: "14px",
  alignItems: "center",
};
const iconBoxStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "10px",
  background: "var(--v5-success-soft)",
  border: "1px solid color-mix(in srgb, var(--v5-success) 30%, transparent)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const pulseDotStyle: CSSProperties = {
  position: "absolute",
  top: "-2px",
  right: "-2px",
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "var(--v5-success)",
  border: "2px solid var(--v5-surface)",
  boxShadow: "0 0 5px var(--v5-success)",
  animation: "v5-hb-pulse 1.6s ease-in-out infinite",
};
const fleetTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  letterSpacing: "-0.006em",
  lineHeight: 1.25,
};
const fleetMetaStyle: CSSProperties = {
  marginTop: "3px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
function pillStyle(filled: boolean): CSSProperties {
  return {
    width: "5px",
    height: "18px",
    borderRadius: "2px",
    background: filled ? "var(--v5-success)" : "var(--v5-surface-3)",
    boxShadow: filled ? "0 0 4px color-mix(in srgb, var(--v5-success) 40%, transparent)" : "none",
  };
}
</script>
