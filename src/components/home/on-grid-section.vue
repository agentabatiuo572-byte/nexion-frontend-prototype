<!--
  OnGridSection — ZONE 2 "what the network is computing now" (ported from
  mission-control.tsx OnGridSection). Header (On NexGrid grid · now · Map) + 3
  client rows (id badge · model · client·city · GPUs) + live footer. Client list
  is server-owned in remote/Sandbox; the local demo alone uses the mock rows.
-->
<template>
  <view data-home-section="on-grid">
    <view class="flex items-center justify-between" style="margin: 8px 2px 10px">
      <text style="font-family: var(--font-v5); font-weight: 600; font-size: 15px; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.home.onGridTitle }} <text class="font-mono-tabular" style="font-size: 12px; font-weight: 400; color: var(--v5-ink-3)">{{ t.home.onGridNow }}<text v-if="app.homeTruth?.sourceEnvironment === 'SANDBOX'"> · SANDBOX</text></text></text>
      <text class="font-mono-tabular inline-flex items-center active:opacity-70" style="min-height: 44px; padding-left: 12px; font-size: 13px; color: var(--v5-brand); font-weight: 500" role="link" tabindex="0" data-home-action="on-grid-map" @click="goGlobe" @keydown.enter.stop.prevent="goGlobe" @keydown.space.stop.prevent="goGlobe">{{ t.home.onGridMap }} →</text>
    </view>

    <view style="background: var(--v5-surface); border-radius: 16px; overflow: hidden">
      <view
        v-for="(c, i) in gridClients"
        :key="c.id"
        class="grid items-center gap-3 px-4 py-2.5"
        :style="{ gridTemplateColumns: '32px 1fr auto', borderBottom: i < gridClients.length - 1 ? '1px solid var(--v5-border)' : 'none' }"
      >
        <view class="grid place-items-center" style="width: 30px; height: 30px; border-radius: 8px; background: var(--v5-brand-soft)">
          <text :style="{ color: c.color, fontFamily: 'var(--font-v5)', fontWeight: 600, fontSize: '12px' }">{{ c.id }}</text>
        </view>
        <view class="min-w-0">
          <text class="block truncate" style="font-family: var(--font-v5); font-weight: 500; font-size: 13px; color: var(--v5-ink); letter-spacing: -0.008em">{{ c.model ?? "—" }}</text>
          <text class="block font-mono-tabular mt-0.5 truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ c.name ?? "—" }} <text style="color: var(--v5-ink-4)">· {{ c.city ?? "—" }}</text></text>
        </view>
        <text class="font-mono-tabular tabular-nums text-right whitespace-nowrap" style="font-size: 12px; color: var(--v5-success-ink); font-weight: 500">{{ gpusText(i) }}</text>
      </view>
      <!-- 页脚活数字与脉搏三格同判据降级(主人 2026-08-06 拍板包 G P2#3 选项 a):
           此前配置坏时这里回种子锚,与隔壁「更新中」占位同屏自相矛盾;现口径一致。
           单项坏降单侧(规格异常3「单项非法只坏本格」);双坏切单条占位 + 点按重试。
           上方客户内容在远端来自 Home canonical 投影；仅本地 demo 使用静态样本。 -->
      <view
        v-if="devicesBad && fleetBad"
        class="px-4 py-2 flex items-center justify-center font-mono-tabular active:opacity-70"
        style="border-top: 1px solid var(--v5-border); background: var(--v5-surface-2); font-size: 12px; color: var(--v5-ink-3); min-height: 44px"
        :role="app.homeTruthStatus === 'error' ? 'button' : undefined"
        :tabindex="app.homeTruthStatus === 'error' ? 0 : undefined"
        data-home-action="on-grid-status"
        @click="app.homeTruthStatus === 'error' && retryConfig()"
        @keydown.enter.stop.prevent="app.homeTruthStatus === 'error' && retryConfig()"
        @keydown.space.stop.prevent="app.homeTruthStatus === 'error' && retryConfig()"
      >
        <text>{{ gridStatusText }}<text v-if="app.homeTruthStatus === 'error'"> · <text style="color: var(--v5-tech-cyan-ink)">{{ t.home.networkStatRetry }}</text></text></text>
      </view>
      <view v-else class="px-4 py-2 flex items-center justify-between font-mono-tabular" style="border-top: 1px solid var(--v5-border); background: var(--v5-surface-2); font-size: 12px; color: var(--v5-ink-3)">
        <text v-if="devicesBad">{{ t.home.networkStatUpdating }}</text>
        <text v-else><text style="color: var(--v5-ink); font-weight: 500">{{ activeDevicesText }}</text> {{ t.home.onGridOnline }}</text>
        <text v-if="fleetBad">{{ t.home.networkStatUpdating }}</text>
        <text v-else style="color: var(--v5-success-ink); font-weight: 500">{{ perSecText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { computed } from "vue";
import { payoutPerSecUsdOf, publicStatsHealth } from "@/lib/platform-stats";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
const app = useApp();
const cfg = useConfig();
// 🔴 $/sec 走配置派生(2026-08-06 审计 P1:此前设备数活着、这条死钉编译期锚)。
//   「配置坏回种子锚」的旧决策已被主人 2026-08-06 拍板(包 G P2#3 选 a)推翻:
//   回锚会与脉搏卡的「更新中」占位同屏自相矛盾;现在坏 → template 层占位降级,
//   本 computed 只在 fleetOk 时被读取(禁回退写死数字,与规格异常2 同口径)。
const psHealth = computed(() => {
  const ps = cfg.config.publicStats;
  return ps ? publicStatsHealth(ps) : null;
});
const devicesBad = computed(() => remoteApiEnabled ? app.homeTruth?.onGrid.activeDevices == null : cfg.syncFailed || !psHealth.value?.devicesOk);
const fleetBad = computed(() => remoteApiEnabled ? app.homeTruth?.onGrid.perSecUsdt == null : cfg.syncFailed || !psHealth.value?.fleetOk);
const gridStatusText = computed(() => remoteApiEnabled && app.homeTruthStatus === "error"
  ? t.value.uiChrome.unavailable
  : t.value.home.networkStatUpdating);
const perSecText = computed(() => {
  if (remoteApiEnabled) {
    const value = app.homeTruth?.onGrid.perSecUsdt;
    if (value == null) return "";
    const digits = value < 0.1 ? 4 : 1;
    return `+$${value.toFixed(digits)}/sec`;
  }
  const ps = cfg.config.publicStats;
  if (!ps || fleetBad.value) return "";
  return `+$${payoutPerSecUsdOf(ps).toFixed(1)}/sec`;
});
function retryConfig() {
  if (remoteApiEnabled) void app.refreshHomeTruth();
  else void cfg.load();
}

const GRID_CLIENTS = [
  { id: "P", name: "Pocket Studios", model: "SDXL Turbo", color: "var(--v5-brand)", city: "Berlin" },
  { id: "H", name: "Helix Labs", model: "Llama 3.2 3B", color: "var(--v5-success-ink)", city: "SF" },
  { id: "E", name: "Echo Earbuds", model: "Whisper tiny", color: "var(--v5-tech-cyan-ink)", city: "Tokyo" },
];

const gridClients = computed(() => remoteApiEnabled
  ? (app.homeTruth?.onGrid.clients ?? []).map((client) => ({ ...client, color: "var(--v5-brand)" }))
  : GRID_CLIENTS.map((client, index) => ({ ...client, gpus: 30 + index * 27 })));
const activeDevicesText = computed(() => {
  if (!remoteApiEnabled) return app.global.activeDevices.toLocaleString();
  const value = app.homeTruth?.onGrid.activeDevices;
  return value === null || value === undefined ? "—" : value.toLocaleString();
});

function gpusText(i: number) {
  const value = remoteApiEnabled ? gridClients.value[i]?.gpus ?? null : 30 + i * 27;
  return value === null ? "—" : fmt(t.value.home.onGridGpus, { n: value });
}
function goGlobe() {
  uni.navigateTo({ url: "/pages/globe/globe", fail: () => {} });
}
</script>
