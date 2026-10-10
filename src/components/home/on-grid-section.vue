<!--
  OnGridSection — ZONE 2 "what the network is computing now" (ported from
  mission-control.tsx OnGridSection). Header (On UVEL grid · now · Map) + 3
  client rows (company badge · company · model·city · GPUs) + live footer. The formal
  App reads every row from the Java Home projection; Mock rows live only in 5174.
-->
<template>
  <view data-home-section="on-grid">
    <view class="flex items-center justify-between" style="margin: 8px 2px 10px">
      <text style="font-family: var(--font-v5); font-weight: 600; font-size: 15px; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.home.onGridTitle }} <text class="font-mono-tabular" style="font-size: 12px; font-weight: 400; color: var(--v5-ink-3)">{{ t.home.onGridNow }}</text></text>
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
          <text class="block truncate" style="font-family: var(--font-v5); font-weight: 500; font-size: 13px; color: var(--v5-ink); letter-spacing: -0.008em">{{ c.name ?? "—" }}</text>
          <text class="block font-mono-tabular mt-0.5 truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ c.model ?? "—" }} <text style="color: var(--v5-ink-4)">· {{ c.city ?? "—" }}</text></text>
        </view>
        <text class="font-mono-tabular tabular-nums text-right whitespace-nowrap" style="font-size: 12px; color: var(--v5-success-ink); font-weight: 500">{{ gpusText(i) }}</text>
      </view>
      <!-- 页脚活数字与脉搏三格同判据降级(主人 2026-08-06 拍板包 G P2#3 选项 a):
           此前配置坏时这里回种子锚,与隔壁「更新中」占位同屏自相矛盾;现口径一致。
           单项坏降单侧(规格异常3「单项非法只坏本格」);双坏切单条占位 + 点按重试。
           上方客户内容只来自 Home canonical 投影。 -->
      <view
        v-if="devicesBad && fleetBad"
        class="nx-glass-inset px-4 py-2 flex items-center justify-center font-mono-tabular active:opacity-70"
        style="border-top: 1px solid var(--v5-border); font-size: 12px; color: var(--v5-ink-3); min-height: 44px"
        :role="app.homeTruthStatus === 'error' ? 'button' : undefined"
        :tabindex="app.homeTruthStatus === 'error' ? 0 : undefined"
        data-home-action="on-grid-status"
        @click="app.homeTruthStatus === 'error' && retryConfig()"

        @keydown.enter.stop.prevent="app.homeTruthStatus === 'error' && retryConfig()" @keydown.space.stop.prevent="app.homeTruthStatus === 'error' && retryConfig()"
      >
        <text>{{ gridStatusText }}<text v-if="app.homeTruthStatus === 'error'"> · <text style="color: var(--v5-tech-cyan-ink)">{{ t.home.networkStatRetry }}</text></text></text>
      </view>
      <view v-else class="nx-glass-inset px-4 py-2 flex items-center justify-between font-mono-tabular" style="border-top: 1px solid var(--v5-border); font-size: 12px; color: var(--v5-ink-3)">
          <text v-if="devicesBad">-</text>
        <text v-else><text style="color: var(--v5-ink); font-weight: 500">{{ activeDevicesText }}</text> {{ t.home.onGridOnline }}</text>
          <text v-if="fleetBad">-</text>
        <text v-else style="color: var(--v5-success-ink); font-weight: 500">{{ perSecText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { computed } from "vue";

const t = useT();
const app = useApp();
const devicesBad = computed(() => app.homeTruth?.onGrid.activeDevices == null);
const fleetBad = computed(() => app.homeTruth?.onGrid.perSecUsdt == null);
const gridStatusText = computed(() => app.homeTruthStatus === "error"
  ? t.value.uiChrome.unavailable
  : t.value.home.networkStatUpdating);
const perSecText = computed(() => {
  const value = app.homeTruth?.onGrid.perSecUsdt;
  if (value == null) return "";
  const digits = value < 0.1 ? 4 : 1;
  return `+${value.toFixed(digits)}/sec`;
});
function retryConfig() {
  void app.refreshHomeTruth();
}

const gridClients = computed(() => (app.homeTruth?.onGrid.clients ?? [])
  .map((client) => ({ ...client, color: "var(--v5-brand)" })));
const activeDevicesText = computed(() => {
  const value = app.homeTruth?.onGrid.activeDevices;
  return value === null || value === undefined ? "—" : value.toLocaleString();
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
