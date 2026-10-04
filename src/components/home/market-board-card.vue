<!--
  MarketBoardCard — canonical Java workload prices rendered with the same
  five-column visual hierarchy as the high-fidelity App. Missing market facts
  stay explicit instead of being replaced with local mock movement or volume.
-->
<template>
  <view data-home-section="compute-market">
    <view class="flex items-center justify-between" style="margin: 8px 2px 10px">
      <text style="font-family: var(--font-v5); font-weight: 600; font-size: 15px; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.home.marketBoardTitle }} <text class="font-mono-tabular" style="font-size: 12px; font-weight: 400; color: var(--v5-ink-3)">{{ t.home.marketBoardPrices }}</text><text v-if="app.homeTruthStatus === 'error' && app.homeTruth" style="font-size: 12px; color: var(--v5-warning)"> · {{ t.home.networkStale }}</text></text>
      <view
        class="market-board-open font-mono-tabular inline-flex items-center active:opacity-70"
        style="min-height: 44px; padding-left: 12px; font-size: 13px; color: var(--v5-brand); font-weight: 500"
        role="link"
        tabindex="0"
        data-home-action="compute-market-open"
        @click="marketNavigation.openMarket"
        @keydown.enter.stop.prevent="marketNavigation.openMarketFromKeyboard"
      >{{ t.home.marketBoardOpen }} →</view>
    </view>

    <view v-if="homeMarketRows.length" style="background: var(--v5-surface); border-radius: 16px; overflow: hidden">
      <view class="grid gap-2 font-mono-tabular" :style="{ gridTemplateColumns: marketGridColumns, padding: '9px 14px', background: 'var(--v5-surface-2)', borderBottom: '1px solid var(--v5-border)', fontSize: '12px', color: 'var(--v5-ink-4)' }">
        <text>{{ t.home.mbColTag }}</text>
        <text>{{ t.home.mbColModel }}</text>
        <text class="text-right">{{ t.home.mbCol1h }}</text>
        <text class="text-right">{{ t.home.mbColPrice }}</text>
        <text class="text-right">{{ t.home.mbCol24h }}</text>
      </view>

      <view
        v-for="(row, i) in homeMarketRows"
        :key="row.code"
        data-home-market-row="true"
        class="grid items-center gap-2 active:opacity-70 transition-opacity"
        role="link"
        tabindex="0"
        :style="{ gridTemplateColumns: marketGridColumns, padding: '10px 14px', borderBottom: i < homeMarketRows.length - 1 ? '1px solid var(--v5-border)' : 'none', minWidth: 0 }"
        @click="goEarn"
        @keydown.enter.stop.prevent="goEarn"
      >
        <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-brand); background: var(--v5-brand-soft); border-radius: 4px; padding: 2px 4px; text-align: center; justify-self: start; font-weight: 500">{{ displayRow(row).tag }}</text>
        <view class="min-w-0">
          <text class="block truncate" style="font-family: var(--font-v5); font-weight: 500; font-size: 13px; color: var(--v5-ink); letter-spacing: -0.008em">{{ displayRow(row).name }}</text>
          <text class="block font-mono-tabular mt-0.5" style="font-size: 12px; color: var(--v5-ink-4)">{{ unavailableVolumeText }}</text>
        </view>
        <view class="min-w-0 text-right">
          <HomeSparkline v-if="displayRow(row).sparkline" :data="displayRow(row).sparkline!" :color="deltaColor(row)" :height="18" :fill="false" />
          <text v-else class="font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-4)">{{ marketBoardUnavailable }}</text>
        </view>
        <view class="text-right whitespace-nowrap tabular-nums">
          <text style="font-family: var(--font-v5); font-weight: 500; font-size: 13px; color: var(--v5-ink)">{{ displayRow(row).priceText }}</text>
          <text class="block font-mono-tabular mt-0.5" style="font-size: 12px; color: var(--v5-ink-4)">{{ displayRow(row).unitText }}</text>
        </view>
        <text class="text-right tabular-nums font-mono-tabular" :style="{ fontSize: '13px', color: deltaColor(row), fontWeight: 500 }">{{ displayRow(row).deltaText }}</text>
      </view>
    </view>
    <view v-else class="rounded-xl flex items-center justify-between" style="min-height: 60px; gap: 12px; background: var(--v5-surface); padding: 14px">
      <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ marketBoardStatusText }}</text>
      <text v-if="app.homeTruthStatus === 'error'" class="font-mono-tabular active:opacity-70" style="display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; font-size: 12px; color: var(--v5-brand); font-weight: 600" role="button" tabindex="0" data-home-action="compute-market-retry" @click="retryHome"  @keydown.enter.stop.prevent="retryHome" @keydown.space.stop.prevent="retryHome">{{ t.ui.retry }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import type { AppHomeWorkload } from "@/api/app-home-api";
import { useApp } from "@/store/app";
import HomeSparkline from "./home-sparkline.vue";
import { presentHomeMarketWorkload } from "./home-market-board";
import { createMarketBoardNavigation } from "./market-board-navigation";

const t = useT();
const app = useApp();
const marketGridColumns = "36px minmax(0, 1fr) 60px 76px 58px";
const marketBoardUnavailable = "—";
const homeMarketRows = computed(() => app.homeTruth?.marketBoard.workloads ?? []);
const unavailableVolumeText = computed(() => fmt(t.value.home.marketBoardVol, { n: marketBoardUnavailable }));
const marketBoardStatusText = computed(() => app.homeTruthStatus === "loading" || app.homeTruthStatus === "idle"
  ? t.value.home.networkStatUpdating
  : t.value.uiChrome.unavailable);
const marketNavigation = createMarketBoardNavigation(navTo);

function displayRow(row: AppHomeWorkload) {
  return presentHomeMarketWorkload(row, t.value);
}
function deltaColor(row: AppHomeWorkload) {
  const tone = displayRow(row).deltaTone;
  return tone === "positive"
    ? "var(--v5-success)"
    : tone === "negative" ? "var(--v5-danger)" : "var(--v5-ink-4)";
}
function goEarn() {
  void navTo("/pages/earn/earn");
}
function retryHome() {
  void app.refreshHomeTruth();
}


</script>

<style scoped>
.market-board-open:focus,
.market-board-open:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 3px;
  border-radius: 6px;
}
</style>
