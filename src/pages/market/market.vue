<!--
  Market — ported from Nexion-prototype/app/(main)/market/page.tsx.
  NEX market page: price + 24h + timeframe + kline + buy/sell → stats grid.
  The retired third-party comparable-token board is deliberately absent.
  framer SegmentedControl → inline pill row; <Link>→uni.navigateTo; <button>→<view @click>.
-->
<template>
  <AppChassis active="home">
    <view class="nx-card-stagger pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/index/index" :title="t.headerTitles.market" :subtitle="t.headerSubtitles.market" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- ───────── NEX HERO (de-carded: sits on the page floor) ───────── -->
        <view :style="heroStyle">
          <view class="flex items-center font-mono-tabular" :style="heroCapStyle">
            <text>{{ t.marketPage.nexHero.yourToken }}</text>
          </view>
          <view class="flex items-end justify-between" style="margin-top: 8px">
            <view class="flex items-center" style="gap: 8px">
              <view class="rounded-full grid place-items-center" :style="nexIconStyle">
                <text :style="{ fontSize: '15px', fontWeight: 600, color: 'var(--v5-ink)' }">N</text>
              </view>
              <view>
                <text class="block font-display" :style="nexPairStyle">NEX / USDT</text>
                <text class="block" :style="nexSubStyle">NexGrid · #{{ nex.rank }}</text>
              </view>
            </view>
            <view class="text-right">
              <text class="block font-display tabular-nums" :style="nexPriceStyle">{{ nexPriceText }}</text>
              <text v-if="market.isMockMode || market.remoteReady" class="block font-mono-tabular tabular-nums" :style="nexChangeStyle">
                {{ nexDirection }} {{ Math.abs(nex.change24h).toFixed(2) }}% (24h)
              </text>
            </view>
          </view>

          <!-- Timeframe — SegmentedControl (HIG 44pt, brand indicator) -->
          <view class="grid" :style="segWrapStyle">
            <view
              v-for="f in TIMEFRAMES"
              :key="f"
              class="grid place-items-center active:opacity-70"
              :style="segItemStyle(f === tf)"
              @click="tf = f"
            >
              <text :style="segLabelStyle(f === tf)">{{ f }}</text>
            </view>
          </view>

          <!-- chart -->
          <view v-if="nexChartData.length >= 2" class="rounded-xl overflow-hidden" :style="chartBoxStyle">
            <NexChart :data="nexChartData" :up="nexUp" />
          </view>
          <view v-else class="rounded-xl flex items-center justify-center" :style="chartBoxStyle">
            <text class="active:opacity-70" :style="marketHoldBodyStyle" @click="retryMarkets">{{ market.remoteError ? t.ui.retry : t.home.networkStatUpdating }}</text>
          </view>

          <!-- buy / sell CTAs -->
          <view class="grid grid-cols-2" :style="ctaRowStyle">
            <view class="rounded-full flex items-center justify-center nx-press" :style="buyBtnStyle" @click="goExchange">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7 13.5 15.5l-5-5L2 17" /><path d="M16 7h6v6" /></svg>
              <text :style="buyTextStyle">{{ t.marketPage.nexHero.buy }}</text>
            </view>
            <view class="rounded-xl flex items-center justify-center nx-press" :style="sellBtnStyle" @click="goExchange">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17 13.5 8.5l-5 5L2 7" /><path d="M16 17h6v-6" /></svg>
              <text :style="sellTextStyle">{{ t.marketPage.nexHero.sell }}</text>
            </view>
          </view>
        </view>

        <!-- ───────── STATS GRID ───────── -->
        <view class="rounded-2xl" :style="cardStyle">
          <view class="grid grid-cols-3" style="row-gap: 12px; column-gap: 8px">
            <view v-for="cell in statCells" :key="cell.label">
              <text class="block" :style="statLabelStyle">{{ cell.label }}</text>
              <text class="block font-mono-tabular tabular-nums" :style="statValueStyle">{{ cell.value }}</text>
            </view>
          </view>
          <view class="flex items-center justify-between border-t" :style="athRowStyle">
            <text :style="{ color: 'var(--v5-ink-3)' }">{{ t.marketPage.stats.ath }}</text>
            <text class="font-mono-tabular tabular-nums" :style="{ color: 'var(--v5-ink-2)' }">
              {{ nex.ath > 0 ? fmtPrice(nex.ath) : "—" }}
              <text :style="{ color: 'var(--v5-brand-2)' }">({{ athDeltaPct.toFixed(1) }}% {{ t.marketPage.stats.athFromNow }})</text>
            </text>
          </view>
        </view>

      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import NexChart from "@/components/market/nex-chart.vue";
import { useT } from "@/i18n/use-t";
import { useMarket } from "@/store/market";

const t = useT();
const market = useMarket();

type Timeframe = "1H" | "24H" | "7D" | "1M" | "ALL";
const TIMEFRAMES: Timeframe[] = ["1H", "24H", "7D", "1M", "ALL"];
const nex = computed(() => ({
  rank: market.isMockMode ? 247 : "—",
  priceUSD: market.nexPriceUSDT,
  change24h: market.change24hPct,
  ath: market.isMockMode ? 0.184 : 0,
  marketCapUSD: market.isMockMode ? market.nexPriceUSDT * 2_850_000_000 : market.marketCap,
  volume24hUSD: market.isMockMode ? 4_247_891 : market.volume24hUSDT,
  fdvUSD: market.isMockMode ? market.nexPriceUSDT * 10_000_000_000 : 0,
  circulating: market.isMockMode ? 2_850_000_000 : market.circulating,
  totalSupply: market.isMockMode ? 10_000_000_000 : 0,
  spark24h: market.klineHourly,
  spark30d: market.klineDaily,
}));
const nexPriceText = computed(() => market.isMockMode || market.remoteReady ? fmtPrice(nex.value.priceUSD) : "—");
onMounted(() => { if (!market.isMockMode) void market.syncRemote(); });

const tf = ref<Timeframe>("24H");

function retryMarkets() {
  void market.syncRemote();
}

const nexChartData = computed(() =>
  tf.value === "1M" || tf.value === "ALL" ? nex.value.spark30d : nex.value.spark24h,
);
const nexUp = computed(() => nex.value.change24h >= 0);
const nexDirection = computed(() => nex.value.change24h > 0 ? "▲" : nex.value.change24h < 0 ? "▼" : "•");
const athDeltaPct = computed(() => nex.value.ath > 0 ? ((nex.value.priceUSD - nex.value.ath) / nex.value.ath) * 100 : 0);

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}
function fmtBig(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const statCells = computed(() => [
  { label: t.value.marketPage.stats.marketCap, value: fmtBig(nex.value.marketCapUSD) },
  { label: t.value.marketPage.stats.vol24h, value: fmtBig(nex.value.volume24hUSD) },
  { label: t.value.marketPage.stats.fdv, value: nex.value.fdvUSD > 0 ? fmtBig(nex.value.fdvUSD) : "—" },
  { label: t.value.marketPage.stats.circulating, value: nex.value.circulating > 0 ? fmtNumber(nex.value.circulating) : "—" },
  { label: t.value.marketPage.stats.totalSupply, value: nex.value.totalSupply > 0 ? fmtNumber(nex.value.totalSupply) : "—" },
  { label: t.value.marketPage.stats.rank, value: nex.value.rank === "—" ? "—" : `#${nex.value.rank}` },
]);

function goExchange() {
  uni.navigateTo({ url: "/pages/me/wallet-exchange", fail: () => {} });
}

// ─── styles ───
// De-carded: the NEX hero sits on the page floor (surface gradient + accent
// border + brand glow dropped; the banned dark hex stops went with them). 2px
// optical inset aligns the price block with the section containers below.
const heroStyle: CSSProperties = {
  padding: "0 2px",
};
const heroCapStyle: CSSProperties = {
  gap: "8px",
  fontSize: "12px",
  letterSpacing: "0.16em",
  color: "var(--v5-brand)",
};
const nexIconStyle: CSSProperties = { width: "36px", height: "36px", background: "var(--v5-brand)" };
const nexPairStyle: CSSProperties = { fontSize: "20px", fontWeight: 600, lineHeight: 1, color: "var(--v5-ink)" };
const nexSubStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
const nexPriceStyle: CSSProperties = { fontSize: "26px", fontWeight: 600, lineHeight: 1, color: "var(--v5-ink)" };
const nexChangeStyle = computed<CSSProperties>(() => ({
  marginTop: "4px",
  fontSize: "12px",
  color: nex.value.change24h > 0 ? "var(--v5-brand)" : nex.value.change24h < 0 ? "var(--v5-brand-2)" : "var(--v5-ink-4)",
}));
const segWrapStyle: CSSProperties = {
  marginTop: "12px",
  gap: "2px",
  padding: "4px",
  borderRadius: "16px",
  // hero 已去卡,轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface;选中 pill 是 brand 实底,不撞色
  background: "var(--v5-surface)",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
};
function segItemStyle(active: boolean): CSSProperties {
  return {
    height: "44px",
    borderRadius: "10px",
    background: active ? "var(--v5-brand)" : "transparent",
    transition: "background 0.2s",
  };
}
function segLabelStyle(active: boolean): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "-0.005em",
    color: active ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}
const chartBoxStyle: CSSProperties = {
  marginTop: "12px",
  height: "120px",
  background: "color-mix(in srgb, var(--v5-surface-2) 60%, transparent)",
};
const ctaRowStyle: CSSProperties = { marginTop: "12px", gap: "8px" };
const buyBtnStyle: CSSProperties = {
  height: "44px",
  gap: "6px",
  background: "var(--v5-brand)",
};
const buyTextStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-on-brand)" };
const sellBtnStyle: CSSProperties = {
  height: "44px",
  gap: "6px",
  background: "var(--v5-surface)", // hero 已去卡,按钮贴页面底:原 surface-2 与页面底同色不可辨,改 L1
};
const sellTextStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };

// De-carded form-b stats container (single surface, no border).
const cardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "16px",
};
const statLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const statValueStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const athRowStyle: CSSProperties = {
  marginTop: "12px",
  paddingTop: "12px",
  borderColor: "var(--v5-border)",
  fontSize: "12px",
};
const marketHoldBodyStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", lineHeight: "18px", color: "var(--v5-ink-3)" };
</script>

<style scoped>
/* 原版 active:scale-[0.98] (buy/sell) / active:scale-[0.97] (category inactive) —
   tactile press feedback on compositor-friendly transform. */
.nx-press:active {
  transform: scale(0.98);
}
</style>
