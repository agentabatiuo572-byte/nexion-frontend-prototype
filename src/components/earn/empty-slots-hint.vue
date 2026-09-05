<!--
  EmptySlotsHint — compact slot rail for the /earn device list.
  The old standalone potential-yield card was removed; this keeps only the
  device/empty-slot icons and the add-device CTA, wrapped around device rows.
-->
<template>
  <view class="mx-4 rounded-2xl overflow-hidden" :style="rootStyle">
    <!-- Slot rail at the top of the device list -->
    <view :style="slotRailStyle">
      <view class="grid grid-cols-6 gap-1.5">
        <view v-for="(slot, i) in slotCells" :key="i" :style="slotTileStyle(slot)" class="relative grid place-items-center overflow-hidden">
          <template v-if="slot.kind === 'filled'">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path :d="deviceIconPath(slot.deviceKind)" />
              <template v-if="slot.deviceKind === 'phone'"><path d="M12 18h.01" /></template>
            </svg>
            <view aria-hidden class="absolute" :style="liveDotStyle('var(--v5-brand)')" />
          </template>

          <template v-else-if="slot.kind === 'trial'">
            <view class="absolute inset-x-0 top-0 grid place-items-center" style="bottom: 13px">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5" />
                <path d="M12 22V12" />
              </svg>
            </view>
            <view aria-hidden class="absolute" :style="liveDotStyle('var(--v5-brand-2)')" />
            <text class="absolute inset-x-0 bottom-0 text-center font-mono-tabular" style="font-size: 12px; line-height: 13px; background: color-mix(in oklab, var(--v5-brand-2) 26%, transparent); color: var(--v5-brand-2-ink)">{{ t.trial.slotTag }}</text>
          </template>

          <template v-else>
            <!-- 空槽可点:与底部 CTA 同一入口(openForSlot 里做库存分支)。铺满整格拿满 tap 面积。 -->
            <view
              class="absolute inset-0 grid place-items-center active:opacity-70"
              role="button"
              tabindex="0"
              :aria-label="t.earn.fillSlots"
              @click="openAddDevice"
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="color-mix(in srgb, var(--v5-tech-cyan) 70%, transparent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            </view>
          </template>
        </view>
      </view>
    </view>

    <slot />

    <!-- Add-device CTA at the bottom of the device list -->
    <view :style="ctaWrapStyle">
      <view class="inline-flex items-center justify-center gap-1.5 w-full active:scale-[0.98]" :style="ctaStyle" @click="openAddDevice">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" />
        </svg>
        <text :style="ctaLabelStyle">{{ t.earn.fillSlots }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useApp } from "@/store/app";
import { useSlotActionSheet } from "@/store/slot-action-sheet";
import { MAX_DEVICES } from "@/store/device-types";
import { trialReservesSlotNow } from "@/store/free-trial";
import type { DeviceKind } from "@/store/types";
import { useT } from "@/i18n/use-t";

const app = useApp();
const t = useT();

const activeDevices = computed(() => app.visibleDevices.filter((d) => d.activatedAt !== null));
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const realCount = computed(() => activeDevices.value.length);

type SlotCell =
  | { kind: "filled"; deviceKind: DeviceKind }
  | { kind: "trial" }
  | { kind: "empty" };

const slotCells = computed<SlotCell[]>(() =>
  Array.from({ length: MAX_DEVICES }).map((_, i): SlotCell => {
    const device = activeDevices.value[i];
    if (device) return { kind: "filled", deviceKind: device.kind };
    if (trialSlot.value && i === realCount.value) return { kind: "trial" };
    return { kind: "empty" };
  }),
);

const DEVICE_ICON_PATHS: Record<DeviceKind, string> = {
  phone: "M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  "pc-gpu": "M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l1 3H9l1-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 21h8",
  "stellarbox-s1": "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
  "stellarbox-pro": "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
  "stellarbox-pro-v2": "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
  "stellarrack-p1": "M5 4h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 14h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z",
  "stellarrack-p2": "M5 4h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 14h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z",
  "cloud-share": "M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 15.3",
};

function deviceIconPath(kind: DeviceKind): string {
  return DEVICE_ICON_PATHS[kind] ?? DEVICE_ICON_PATHS["stellarbox-s1"];
}

function openAddDevice() {
  useSlotActionSheet().openForSlot();
}

function liveDotStyle(color: string): CSSProperties {
  return {
    top: "4px",
    right: "4px",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 6px ${color}`,
    animation: "v5-hb-pulse-success 2.4s ease-in-out infinite",
  };
}

function slotTileStyle(slot: SlotCell): CSSProperties {
  if (slot.kind === "filled") {
    return { aspectRatio: "1 / 1", borderRadius: "8px", background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)" };
  }
  if (slot.kind === "trial") {
    return { aspectRatio: "1 / 1", borderRadius: "8px", background: "color-mix(in oklab, var(--v5-brand-2) 16%, transparent)" };
  }
  return {
    aspectRatio: "1 / 1",
    borderRadius: "8px",
    border: "1px dashed color-mix(in srgb, var(--v5-tech-cyan) 45%, transparent)",
    background: "color-mix(in srgb, var(--v5-tech-cyan) 6%, transparent)",
  };
}

const rootStyle: CSSProperties = {
  background: "var(--v5-surface)",
};

const slotRailStyle: CSSProperties = {
  padding: "14px 20px 12px",
  borderBottom: "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)",
};

const ctaWrapStyle: CSSProperties = {
  padding: "12px 20px 16px",
  borderTop: "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)",
};

const ctaStyle: CSSProperties = {
  height: "48px",
  padding: "0 24px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
};

const ctaLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.005em",
  color: "var(--v5-on-brand)",
};
</script>
