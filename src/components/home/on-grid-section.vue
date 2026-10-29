<!--
  OnGridSection — ZONE 2 "what the network is computing now" (ported from
  mission-control.tsx OnGridSection). Header (On UVEL grid · now · Map) + 3
  client rows (company badge · company · model·city · GPUs) + live footer. The formal
  App reads client rows from Java Home and display metrics from H9.
-->
<template>
  <view data-home-section="on-grid">
    <view class="flex items-center justify-between" style="margin: 8px 2px 10px">
      <text style="font-family: var(--font-v5); font-weight: var(--ui-type-card-title-weight); font-size: var(--ui-type-card-title); color: var(--v5-ink); letter-spacing: -0.012em">{{ t.home.onGridTitle }} <text class="font-mono-tabular" style="font-size: 12px; font-weight: 400; color: var(--v5-ink-3)">{{ t.home.onGridNow }}</text></text>
      <text class="font-mono-tabular inline-flex items-center active:opacity-70" style="min-height: 44px; padding-left: 12px; font-size: 13px; color: var(--v5-brand); font-weight: 500" role="link" tabindex="0" data-home-action="on-grid-map" @click="goGlobe" @keydown.enter.stop.prevent="goGlobe">{{ t.home.onGridMap }} →</text>
    </view>

    <view class="nx-glass-card" style="background: var(--nx-glass-fill); box-shadow: var(--nx-glass-edge); border-radius: var(--nx-glass-radius); overflow: hidden">
      <view
        v-for="(c, i) in gridClients"
        :key="c.id"
        class="grid items-center gap-3 px-4 py-2.5"
        :style="{ gridTemplateColumns: '32px 1fr auto', borderBottom: i < gridClients.length - 1 ? '1px solid var(--v5-border)' : 'none' }"
      >
        <view class="grid place-items-center" style="width: 30px; height: 30px; border-radius: 8px; background: var(--v5-brand-soft)">
          <text :style="{ color: c.color, fontFamily: 'var(--font-v5)', fontWeight: 600, fontSize: '12px' }">{{ companyInitial(c.name) }}</text>
        </view>
        <view class="min-w-0">
          <text class="block truncate" style="font-family: var(--font-v5); font-weight: 500; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink); letter-spacing: -0.008em">{{ c.name ?? "—" }}</text>
          <text class="block font-mono-tabular mt-0.5 truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ c.model ?? "—" }} <text style="color: var(--v5-ink-4)">· {{ c.city ?? "—" }}</text></text>
        </view>
        <text class="font-mono-tabular tabular-nums text-right whitespace-nowrap" style="font-size: 12px; color: var(--v5-success-ink); font-weight: 500">{{ gpusText(i) }}</text>
      </view>
      <!-- H9 在线数与已发放批次独立降级、独立重读；客户仍读 Home canonical 投影。 -->
      <view
        v-if="devicesBad && fleetBad"
        class="nx-glass-inset px-4 py-2 flex items-center justify-center font-mono-tabular active:opacity-70"
        style="border-top: 1px solid var(--v5-border); font-size: 12px; color: var(--v5-ink-3); min-height: 44px"
        role="button"
        tabindex="0"
        data-home-action="on-grid-status"
        @click="retryConfig"
        @keydown.enter.stop.prevent="retryConfig" @keydown.space.stop.prevent="retryConfig"
      >
        <text>{{ gridStatusText }} · <text style="color: var(--v5-tech-cyan-ink)">{{ t.home.networkStatRetry }}</text></text>
      </view>
      <view v-else class="nx-glass-inset px-4 py-2 flex items-center justify-between font-mono-tabular" style="border-top: 1px solid var(--v5-border); font-size: 12px; color: var(--v5-ink-3)">
        <text v-if="devicesBad" class="on-grid-retry" role="button" tabindex="0" :aria-label="t.home.networkStatRetry" data-home-action="on-grid-online-retry" @click="retryDevices" @keydown.enter.stop.prevent="retryDevices" @keydown.space.stop.prevent="retryDevices">-</text>
        <text v-else><text style="color: var(--v5-ink); font-weight: 500">{{ activeDevicesText }}</text> {{ t.home.onGridOnline }}</text>
        <text v-if="fleetBad" class="on-grid-retry on-grid-retry--paid" role="button" tabindex="0" :aria-label="t.home.networkStatRetry" data-home-action="on-grid-paid-retry" @click="retryFleet" @keydown.enter.stop.prevent="retryFleet" @keydown.space.stop.prevent="retryFleet">-</text>
        <text v-else style="color: var(--v5-success-ink); font-weight: 500">{{ perSecText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { networkPopulationBand } from "@/lib/platform-stats";
import { navTo } from "@/lib/route";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { apiClient } from "@/api/runtime";
import { createHomeDisplayPlayer, parseHomeDisplayBatch, type homeDisplayAt } from "@/lib/home-display-player";
import { onShow, onHide } from "@/composables/use-tab-page-lifecycle";
import { computed, ref, onMounted, onUnmounted } from "vue";

const t = useT();
const app = useApp();
const cfg = useConfig();
const displayValue = ref<ReturnType<typeof homeDisplayAt>>(null);
const batchLoading = ref(false);
const player = createHomeDisplayPlayer({
  fetch: async () => parseHomeDisplayBatch(await apiClient.request({ path: "/api/config/home-display", authenticated: false })),
  now: () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now(),
  render: next => { displayValue.value = next; },
  onLoading: loading => { batchLoading.value = loading; },
});
let visible = false;
function syncVisibility() {
  if (visible && (typeof document === "undefined" || !document.hidden)) player.start();
  else player.stop();
}
onShow(() => { visible = true; syncVisibility(); });
onHide(() => { visible = false; syncVisibility(); });
onMounted(() => { if (typeof document !== "undefined") document.addEventListener("visibilitychange", syncVisibility); });
onUnmounted(() => {
  player.stop();
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", syncVisibility);
});
const devicesBad = computed(() => cfg.syncFailed || !Number.isSafeInteger(cfg.config.networkPulse?.onlineDevices) || cfg.config.networkPulse!.onlineDevices! < 0);
const fleetBad = computed(() => displayValue.value === null);
const gridStatusText = computed(() => cfg.loading || batchLoading.value
  ? t.value.home.networkStatUpdating
  : t.value.uiChrome.unavailable);
const perSecText = computed(() => {
  const value = displayValue.value?.paidPerSec;
  if (value == null) return "";
  return `+${formatAmount(value)}/sec`;
});
function retryConfig() {
  if (devicesBad.value) retryDevices();
  if (fleetBad.value) retryFleet();
}
function retryDevices() { if (!cfg.loading) void cfg.load(); }
function retryFleet() { void player.refresh(); }

const gridClients = computed(() => (app.homeTruth?.onGrid.clients ?? [])
  .map((client) => ({ ...client, color: "var(--v5-brand)" })));
const activeDevicesText = computed(() => {
  return devicesBad.value ? "-" : networkPopulationBand(cfg.config.networkPulse!.onlineDevices!);
});

function gpusText(i: number) {
  const value = gridClients.value[i]?.gpus ?? null;
  return value === null ? "—" : fmt(t.value.home.onGridGpus, { n: value });
}
function companyInitial(value: string | null) {
  return value?.trim().charAt(0).toUpperCase() || "—";
}
function goGlobe() {
  navTo("/pages/globe/globe");
}


</script>
<style scoped>
.on-grid-retry { display: inline-flex; align-items: center; min-width: 44px; min-height: 44px; }
.on-grid-retry--paid { justify-content: flex-end; }
</style>
