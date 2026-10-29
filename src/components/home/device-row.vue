<!-- A single device action combines the large bay, explicit status, name and live earnings. -->
<template>
  <view class="nx-device-row" :data-online="isOnline ? 'true' : 'false'" :data-device-id="device.id"
    role="button" tabindex="0"
    :aria-label="`${t.earn.deviceDetailTitle}: ${displayName} · ${statusText}`"
    @click="go"  @keydown.enter.prevent="go" @keydown.space.prevent="go">
    <view class="nx-device-row__main">
    <DeviceSlot :device="device" :online="false" />
    <view class="hf-device-meta">
      <text class="hf-device-name">{{ displayName }}</text>
      <view v-if="statusText" class="hf-device-status"><view class="hf-status-dot" :style="dotStyle" aria-hidden="true" /><text>{{ statusText }}</text></view>
    </view>
    <view class="hf-device-income"><text class="font-mono-tabular">{{ visibility.mask(runtimeConfirmed ? (device.todayEarnings > 0 ? '+' : '') + fmtMoney(device.todayEarnings) : '-') }}</text><text class="hf-device-today">{{ copy.today }}</text></view>
    <view class="nx-home-arrow" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg>
    </view>
    </view>
    <view v-if="device.currentTask" class="hf-device-task">
      <text class="hf-device-task__title">{{ t.earn.currentTask }} · {{ visibility.mask(device.currentTask.model) }}</text>
      <text class="hf-device-task__id font-mono-tabular">#{{ visibility.mask(device.currentTask.id) }}</text>
      <view class="hf-device-task__progress">
        <view class="hf-device-task__track" role="progressbar" :aria-label="t.earn.currentTask" :aria-valuenow="visibility.hidden || progressPct == null ? undefined : progressPct" aria-valuemin="0" aria-valuemax="100">
          <view v-if="!visibility.hidden && progressPct != null" class="hf-device-task__fill" :style="{ width: `${progressPct}%` }" />
        </view>
        <text class="font-mono-tabular">{{ visibility.mask(progressPct == null ? '-' : `${progressPct}%`) }}</text>
      </view>
      <text v-if="device.currentTask.status === 'PAUSED' || device.interruptedAt != null" class="hf-device-task__note">{{ device.interruptedAt != null ? t.earn.reconnecting : t.earn.phoneTaskPaused }}</text>
      <text v-else-if="awaitingExecutionResultConfirmation" class="hf-device-task__note">{{ t.earn.taskAwaitingExecutionResultConfirmation }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { formatAmount } from "@/lib/amount-display";
import { fmtMoney } from '@/i18n/format';
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { computed, ref, type CSSProperties } from "vue";
import { useVisibleInterval } from "@/composables/use-tab-page-lifecycle";
import { advanceMonotonicHighWater, projectServerNow, readMonotonicNowMs } from "@/lib/server-deadline-clock";
import { taskProgressPercent } from "@/lib/task-progress";
import { awaitsExecutionResultConfirmation } from "@/lib/task-result-confirmation";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { deviceOnlineState } from "@/lib/hashpower";
import { deviceName } from "@/lib/device-copy";
import type { Device } from "@/store/types";

const visibility = useDataVisibility();
const props = defineProps<{ device: Device; divider?: boolean; runtimeConfirmed: boolean }>();
const t = useT();
const copy = useAuditUiCopy();
// Stored device name is English + persisted → resolve from `kind` at render.
const displayName = computed(() => deviceName(t.value, props.device));

const onlineState = computed(() => deviceOnlineState(props.device, Date.now(), props.runtimeConfirmed));
const isOnline = computed(() => onlineState.value === "online");
const statusText = computed(() => onlineState.value === "unknown" ? t.value.earn.runtimeUnknown : isOnline.value ? t.value.earn.online : "");
const now = ref(Date.now());
const monotonicNow = ref(readMonotonicNowMs());
useVisibleInterval(() => {
  now.value = Date.now();
  monotonicNow.value = advanceMonotonicHighWater(monotonicNow.value, readMonotonicNowMs());
}, 1000);
const liveTaskNow = computed(() => props.device.taskServerNow != null && props.device.taskServerNowReceivedAt != null
  ? projectServerNow(props.device.taskServerNow, props.device.taskServerNowReceivedAt, monotonicNow.value) : now.value);
const progressPct = computed(() => props.runtimeConfirmed
  ? taskProgressPercent(props.device.currentTask, liveTaskNow.value, props.device.interruptedAt) : null);
const awaitingExecutionResultConfirmation = computed(() => props.device.currentTask != null
  && awaitsExecutionResultConfirmation(props.device.currentTask, liveTaskNow.value));
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
.nx-device-row { min-height: 64px; box-sizing:border-box;padding: 10px 16px; cursor: pointer; }
.nx-device-row__main { display:flex; align-items:center; gap:12px; }
.nx-device-row:active { background: var(--v5-surface-2); }
.nx-device-row:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -2px; }
.nx-device-row :deep(.nx-device-slot) { width: 48px; height: 48px; flex-shrink: 0;border-radius:14px;background:radial-gradient(80% 70% at 50% 70%,color-mix(in srgb,var(--v5-ink) 6%,transparent),transparent); }
.nx-device-row :deep(.nx-home-art) { width: 52px;max-width:none; height: 52px; animation: none; }
.nx-device-row :deep(.hf-computer) { height: 48px; }
.hf-device-meta { min-width: 0; flex: 1; }
.hf-device-name { display: block; font: 500 clamp(13px,3.85vw,15px)/20px var(--font-v5); color: var(--v5-ink); overflow-wrap: anywhere; }
.hf-device-status { display: flex;align-items:center;gap:6px; margin-top: 2px; font: 400 clamp(11px,3.08vw,12px)/18px var(--font-v5); color: var(--v5-ink-3); }
.hf-device-income { flex-shrink: 0; font: 600 clamp(13px,3.85vw,15px)/20px var(--font-v5); color: var(--v5-brand);text-align:right; }
.hf-device-today {display:block;font:400 clamp(11px,3.08vw,12px)/18px var(--font-v5);color:var(--v5-ink-3);}
.nx-home-arrow { display: flex; align-items: center; width: 16px; color: var(--v5-ink-4);background:none;box-shadow:none; }
.hf-device-task { margin:10px 0 0 60px; min-width:0; color:var(--v5-ink-3); font:400 12px/18px var(--font-v5); }
.hf-device-task__title,.hf-device-task__id,.hf-device-task__note { display:block; overflow-wrap:anywhere; }
.hf-device-task__title { color:var(--v5-ink-2); }
.hf-device-task__id { margin-top:3px; }
.hf-device-task__progress { display:flex; align-items:center; gap:12px; margin-top:6px; color:var(--v5-ink-2); }
.hf-device-task__track { flex:1; height:4px; overflow:hidden; border-radius:999px; background:var(--v5-surface-2); }
.hf-device-task__fill { height:100%; background:var(--v5-brand); transition:width .6s ease; }
.hf-device-task__note { margin-top:4px; }
</style>
