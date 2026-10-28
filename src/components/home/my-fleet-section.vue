<!-- One large, accessible card per active device; manage opens the inventory. -->
<template>
  <view class="hf-section" data-home-section="fleet">
    <NxSection :title="t.home.myFleet" :meta="visibility.mask(fleetCountText)" :action="t.home.fleetManage" @action="goManage">
    <view v-if="fleetVisible || trialPresentation.active.value" class="hf-grid">
      <TrialDeviceRow v-if="trialPresentation.active.value" key="trial:current" variant="home" />
      <DeviceRow v-for="d in devices" :key="d.id" :device="d" :runtime-confirmed="fleetReady" />
      <AddDeviceRow v-if="countReady && slotsUsed < app.slotCap" />
    </view>
    <view v-if="!fleetVisible && app.remoteFleetStatus !== 'error'" class="hf-grid hf-loading" role="status" aria-live="polite" aria-busy="true"><text class="sr-only">{{ copy.fleetLoading }}</text><view v-for="n in 2" :key="n" class="hf-skeleton-row" aria-hidden="true"><view class="hf-skeleton-art"/><view class="hf-skeleton-copy"><view/><view/></view></view></view>
    <view v-if="app.remoteFleetStatus === 'error' || trial.authorityStatus === 'error'" class="hf-unavailable nx-inline-recovery"><text class="nx-inline-recovery__copy">{{ copy.fleetUnavailable }}</text><NxButton class="nx-inline-recovery__action" size="small" variant="text" :label="t.home.fleetManage" @click="goManage" /></view>
    </NxSection>
  </view>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { navTo } from "@/lib/route";
import { computed } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { remoteApiEnabled } from "@/api/runtime";
import { useAuditUiCopy } from '@/i18n/audit-ui';
import NxSection from "@/components/ui/nx-section.vue";
import NxButton from "@/components/ui/nx-button.vue";
import DeviceRow from "./device-row.vue";
import AddDeviceRow from "./add-device-row.vue";
import TrialDeviceRow from "@/components/trial-device-row.vue";
import { useTrialPresentation } from "@/composables/use-trial-presentation";
import { useFreeTrial } from "@/store/free-trial";
import { deviceOnlineState } from '@/lib/hashpower';

const visibility = useDataVisibility();
const t = useT();
const copy = useAuditUiCopy();
const app = useApp();
const trial = useFreeTrial();
const trialPresentation = useTrialPresentation();

const allDevices = computed(() => app.visibleDevices.filter((d) => d.activatedAt !== null)
  .sort((a,b) => Number(deviceOnlineState(a,Date.now(),fleetReady.value) === 'online') - Number(deviceOnlineState(b,Date.now(),fleetReady.value) === 'online')));
const devices = computed(() => fleetVisible.value ? allDevices.value : []);
// Read-only fleet presentation may retain this account's last confirmed
// snapshot while a background refresh is pending. Actions remain governed by
// their existing authoritative checks.
const fleetReady = computed(() => !remoteApiEnabled
  || app.remoteFleetStatus === "ready"
  || (app.remoteFleetStatus === "loading" && app.remoteFleetHasSnapshot));
const fleetVisible = computed(() => !remoteApiEnabled || app.remoteFleetHasSnapshot);
const countReady = computed(() => fleetReady.value && trialPresentation.reservedSlots.value !== null);
const slotsUsed = computed(() => app.activeSlotCount + (trialPresentation.reservedSlots.value ?? 0));
const fleetCountText = computed(() => countReady.value ? fmt(t.value.home.fleetOfMax, {
  n: slotsUsed.value,
  max: app.slotCap,
}) : "— / —");

function goManage() {
  navTo("/pages/me/devices");
}


</script>

<style scoped>
.hf-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 2px 12px; }
.hf-title-group { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; min-width: 0; }
.hf-title { font: 600 20px/1.35 var(--font-v5); color: var(--v5-ink); letter-spacing: -.02em; }
.hf-count { font-size: 12px; line-height: 18px; color: var(--v5-ink-3); white-space: nowrap; }
.hf-manage { display: flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 8px; min-height: 44px; padding: 10px 16px; border-radius: var(--v5-radius-full); font: 500 var(--ui-type-list-subtitle)/20px var(--font-v5); color: var(--v5-ink); }
.hf-manage > text, .hf-manage > svg { position: relative; }
.hf-grid { display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ui-radius-surface); background: var(--v5-surface); border:1px solid var(--v5-border); }
.hf-unavailable { padding: 12px 16px; border-radius: var(--ui-radius-surface); background: var(--v5-surface); color: var(--v5-ink-3); font-size: 12px; }
.hf-grid > :deep(.nx-device-row + .nx-device-row) { border-top: 1px solid var(--v5-border); }
.hf-grid > :deep(.trial-device-row + .nx-device-row) { border-top: 1px solid var(--v5-border); }
</style>

<style scoped>.hf-skeleton-row {display:flex;align-items:center;gap:12px;height:68px;padding:10px 16px;box-sizing:border-box;}.hf-skeleton-row + .hf-skeleton-row {border-top:1px solid var(--v5-border);}.hf-skeleton-art {width:48px;height:48px;border-radius:14px;background:var(--v5-surface-2);}.hf-skeleton-copy {flex:1;}.hf-skeleton-copy > view {height:12px;width:65%;border-radius:6px;background:var(--v5-surface-2);}.hf-skeleton-copy > view + view {margin-top:10px;width:40%;}</style>
