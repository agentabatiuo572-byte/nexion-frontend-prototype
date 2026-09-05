<template>
  <view class="block" style="background: var(--v5-surface); border-radius: 16px; padding: 12px 14px; position: relative; overflow: hidden" role="link" tabindex="0" data-home-action="nex-market-link" @click="goMarket" @keydown.enter.stop.prevent="goMarket" @keydown.space.stop.prevent="goMarket">
    <view class="grid items-center gap-3" style="grid-template-columns: 1fr 76px">
      <view class="min-w-0">
        <view class="flex items-baseline gap-1.5 font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">
          <text style="font-family: var(--font-v5); font-weight: 600; color: var(--v5-brand); letter-spacing: -0.005em; font-size: 13px">$NEX</text>
          <text style="color: var(--v5-ink-4)">{{ t.home.nexPricePair }}</text>
        </view>
        <view class="mt-1 flex items-baseline gap-1.5">
          <text class="tabular-nums" style="font-family: var(--font-v5); font-weight: 600; font-size: 20px; color: var(--v5-ink); letter-spacing: -0.020em; line-height: 1">{{ priceText }}</text>
          <text v-if="ready" class="font-mono-tabular tabular-nums" :style="{ fontSize: '13px', color: tint, fontWeight: 500 }">{{ changeText }}</text>
          <text v-else class="active:opacity-70" :style="retryStyle" role="button" tabindex="0" @click.stop="retry" @keydown.enter.stop.prevent="retry" @keydown.space.stop.prevent="retry">{{ market.remoteError ? t.ui.retry : t.home.networkStatUpdating }}</text>
        </view>
      </view>
      <view style="height: 36px">
        <HomeSparkline v-if="ready" :data="kline" :color="tint" :height="36" />
        <view v-else :style="placeholderStyle" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, watch, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useMarket } from "@/store/market";
import HomeSparkline from "./home-sparkline.vue";

const t = useT();
const market = useMarket();
const ready = computed(() => market.remoteReady && market.nexPriceUSDT > 0 && market.klineHourly.length >= 2);
const change = computed(() => market.change24hPct);
const kline = computed(() => market.klineHourly);
const isUp = computed(() => change.value >= 0);
const tint = computed(() => (isUp.value ? "var(--v5-success)" : "var(--v5-danger)"));
const priceText = computed(() => ready.value ? `$${market.nexPriceUSDT.toFixed(3)}` : "—");
const changeText = computed(() => `${isUp.value ? "+" : ""}${change.value.toFixed(1)}%`);
const retryStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand)", fontWeight: 500 };
const placeholderStyle: CSSProperties = { height: "2px", marginTop: "17px", borderRadius: "999px", background: "var(--v5-border)" };

function retry() {
  void market.syncRemote();
}

function goMarket() {
  uni.navigateTo({ url: "/pages/market/market", fail: () => {} });
}

onMounted(() => {
  if (!market.isMockMode) void market.syncRemote();
});

watch(() => market.marketRunId, (next, previous) => {
  if (!market.isMockMode && previous !== null && next === null) void market.syncRemote();
});
</script>
