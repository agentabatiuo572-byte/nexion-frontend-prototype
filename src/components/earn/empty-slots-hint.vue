<!-- Compact earn list; the original trial reservation remains visible without a duplicate icon rail. -->
<template>
  <view class="earn-fleet-list mx-4">
    <view class="nx-home-glass-panel" aria-hidden="true" />
    <view class="earn-fleet-content">
      <TrialDeviceRow variant="earn" :expanded="trialExpanded" @toggle="emit('toggleTrial')" />
      <slot />
      <view v-if="slotsUsed < app.slotCap" class="earn-add-wrap">
        <view class="earn-add-device" role="button" tabindex="0"
          @click="openAddDevice"  @keydown.enter.stop.prevent="openAddDevice" @keydown.space.stop.prevent="openAddDevice">
          <view class="earn-add-device__slot" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg></view>
          <text class="earn-add-device__label">{{ t.earn.fillSlots }}</text>
          <svg class="earn-add-device__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import TrialDeviceRow from "@/components/trial-device-row.vue";
import { useApp } from "@/store/app";
import { useSlotActionSheet } from "@/store/slot-action-sheet";
import { trialReservesSlotNow } from "@/store/free-trial";
import { isActiveSlotDevice } from "@/lib/device-slot-policy";
import type { DeviceKind } from "@/store/types";
import { useT } from "@/i18n/use-t";

const app = useApp();
const t = useT();
defineProps<{ trialExpanded?: boolean }>();
const emit = defineEmits<{ (event: "toggleTrial"): void }>();

const activeDevices = computed(() => app.visibleDevices.filter(isActiveSlotDevice));
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const slotsUsed = computed(() => app.remoteSlotsUsed ?? app.activeSlotCount + trialSlot.value);
const realCount = computed(() => activeDevices.value.length);

type SlotCell =
  | { kind: "filled"; deviceKind: DeviceKind }
  | { kind: "trial" }
  | { kind: "empty" };

const slotCells = computed<SlotCell[]>(() =>
  Array.from({ length: app.slotCap }).map((_, i): SlotCell => {
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
  fontSize: "var(--ui-type-button)",
  letterSpacing: "-0.005em",
  color: "var(--v5-on-brand)",
};


</script>

<style scoped>
.earn-fleet-list { position: relative; border-radius: var(--v5-radius-2xl); }
.earn-fleet-content { position: relative; }
.earn-fleet-content > :deep(.trial-device-row:first-child) { border-radius: var(--v5-radius-2xl) var(--v5-radius-2xl) 0 0; }
.earn-trial-reservation { display: flex; justify-content: space-between; gap: 12px; margin: 0 16px; padding: 14px 0 10px; font: 500 12px/1.4 var(--font-v5); color: var(--v5-ink-2); border-bottom: 1px solid var(--v5-border); }
.earn-add-wrap { padding: 4px 14px 14px; }
.earn-add-device { display:flex; align-items:center; box-sizing:border-box; gap:12px; min-height:60px; padding:10px 12px; border:1px dashed color-mix(in srgb,var(--v5-ink-3) 30%,transparent); border-radius:16px; background:color-mix(in srgb,var(--v5-surface-2) 48%,transparent); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px); box-shadow:inset 0 1px 0 color-mix(in srgb,var(--v5-ink) 5%,transparent); color:var(--v5-ink-2); cursor:pointer; touch-action:manipulation; transition:transform 140ms ease-out,background-color 140ms ease-out; }
.earn-add-device__slot { display:grid; place-items:center; width:32px; height:32px; flex:none; border-radius:10px; background:color-mix(in srgb,var(--v5-ink-3) 7%,transparent); color:var(--v5-ink-3); }
.earn-add-device__label { flex:1; min-width:0; font:500 clamp(12px,3.6vw,14px)/20px var(--font-v5); overflow-wrap:anywhere; }
.earn-add-device__chevron { flex:none; color:var(--v5-ink-3); }
.earn-add-device:active { transform:scale(.985); background:color-mix(in srgb,var(--v5-surface-2) 72%,transparent); }
.earn-add-device:focus-visible { outline:2px solid var(--v5-brand); outline-offset:2px; }
.earn-add-device[aria-busy="true"] { opacity: .6; }
@media (prefers-reduced-motion: reduce) { .earn-add-device { transition: none; transform: none; } }
</style>
