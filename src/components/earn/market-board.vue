<!--
  MarketBoard (Earn) — ported from Nexion-prototype/app/components/market-board.tsx.
  v3.1 §6.1 compute-price board. Two sections top→bottom:
    1. AI Workload Price Index (6 workloads · 24h delta · 7-pt sparkline)
    2. Device earnings ranking (5 tiers, phone last → upgrade pull)
  Distinct from home's MarketBoardCard (different data + layout). Static mock
  numbers; workload names/units come from t.market.workloads (shared with Task
  Center + device cards). Model names stay untranslated. Ranking rows with an href
  route to that tier's store detail. Conversion role: feeds the tier-locked
  tasks banner below it on /earn.
-->
<template>
  <view class="mx-4">
    <view class="flex items-center justify-between mb-2 px-0">
      <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.market.title }}</text>
      <view class="flex items-center gap-1" style="font-size: 12px; color: var(--v5-ink-3)">
        <view style="width: 6px; height: 6px; border-radius: 50%; background: var(--v5-brand); box-shadow: 0 0 6px color-mix(in srgb, var(--v5-brand) 70%, transparent)" />
        <text>{{ t.market.liveLabel }}</text>
      </view>
    </view>

    <!-- Price Index -->
    <view>
      <text class="block" :style="sectionLabelStyle">{{ t.market.priceIndex }}</text>
      <text v-if="!priceIndex.length" class="block py-2.5" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.uiChrome.unavailable }}</text>
      <view
        v-for="(w, i) in priceIndex"
        :key="w.code"
        class="py-2.5"
        :style="{ borderTop: i !== 0 ? '1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)' : 'none' }"
      >
        <view class="flex items-center gap-2.5">
          <view class="flex-1 min-w-0">
            <view class="flex items-baseline gap-1.5">
            <text class="truncate" style="font-size: 13px; font-weight: 500; color: var(--v5-ink)">{{ w.name ?? t.market.workloads[w.code].label }}</text>
              <text class="truncate" style="font-size: 12px; color: var(--v5-ink-4)">{{ w.unit ?? "—" }}</text>
            </view>
            <text v-if="w.flagshipDelta !== null" class="block truncate" style="font-size: 12px; color: var(--v5-warning-ink); margin-top: 2px">↳ {{ t.market.flagshipRow }} <text class="tabular-nums" style="font-family: var(--font-v5)">↑{{ w.flagshipDelta.toFixed(1) }}%</text></text>
          </view>
          <text class="tabular-nums shrink-0 text-right" style="font-family: var(--font-v5); font-size: 12px; color: var(--v5-ink-2); width: 64px">{{ w.price === null ? "—" : `$${formatPrice(w.price)}` }}</text>
          <text class="tabular-nums shrink-0 text-right" style="font-size: 12px; width: 48px" :style="{ color: arrowColor(w) }">{{ w.delta === null ? "—" : `${arrow(w)} ${Math.abs(w.delta).toFixed(1)}%` }}</text>
          <svg v-if="w.spark.length" class="shrink-0" width="48" height="16" viewBox="0 0 48 16">
            <polyline :points="sparkPoints(w.spark)" fill="none" :stroke="w.delta !== null && w.delta < -0.05 ? 'var(--v5-brand-2)' : 'var(--v5-brand)'" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />
          </svg>
        </view>
      </view>
    </view>

    <!-- Device earnings ranking -->
    <view class="mt-4 pt-4" style="border-top: 1px solid var(--v5-border)">
      <text class="block" :style="sectionLabelStyle">{{ t.market.deviceRanking }}</text>
      <text v-if="!deviceRankings.length" class="block py-2.5" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.uiChrome.unavailable }}</text>
      <view
        v-for="(d, i) in deviceRankings"
        :key="d.rank"
        class="flex items-center gap-3 py-2.5"
        :class="d.kind ? 'active:opacity-70 transition-opacity' : ''"
        :style="{ borderTop: i !== 0 ? '1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)' : 'none' }"
        v-on="d.kind ? { click: () => d.kind && goDetail(d.kind) } : {}"
      >
        <view class="flex-1 min-w-0">
          <text class="block truncate" :style="{ fontSize: '15px', color: d.isPhone ? 'var(--v5-ink-3)' : 'var(--v5-ink-2)', fontWeight: d.isPhone ? 400 : 600 }">{{ d.name ?? t.market.yourPhone }}<text v-if="d.rank === 1" style="margin-left: 6px; font-size: 12px; color: var(--v5-warning-ink)">{{ t.uiChrome.best }}</text></text>
          <text class="block truncate" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 2px">{{ d.bestFor ?? "—" }}</text>
        </view>
        <text class="tabular-nums shrink-0" :style="{ fontFamily: 'var(--font-v5)', fontSize: '14.5px', fontWeight: 400, color: 'var(--v5-warning-ink)' }">{{ d.dailyEarn === null ? "—" : `$${d.dailyEarn.toFixed(2)}/d` }}</text>
        <svg v-if="d.kind" class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import type { DeviceKind, TaskCategory } from "@/store/types";
import { useApp } from "@/store/app";
import { remoteApiEnabled } from "@/api/runtime";

interface WorkloadPrice {
  code: TaskCategory;
  name: string | null;
  unit: string | null;
  price: number | null;
  delta: number | null;
  spark: number[];
  flagshipDelta: number | null;
}

interface DeviceRanking {
  rank: 1 | 2 | 3 | 4 | 5;
  /** 商品品牌名(不翻译);手机档没有商品名,走 t.market.yourPhone。 */
  name?: string;
  bestFor: string | null;
  dailyEarn: number | null;
  isPhone?: boolean;
  kind?: Exclude<DeviceKind, "phone">;
}

const t = useT();
const app = useApp();

// Label + unit come from t.market.workloads[code] — the same key set the Task
// Center job rows and device cards read, so a workload is named identically
// everywhere. Only the numbers live here (flagship 行的文案走 t.market.flagshipRow)。
const PRICE_INDEX: WorkloadPrice[] = [
  { code: "IG", name: null, unit: null, price: 0.003, delta: 4.2, spark: [0.4, 0.5, 0.42, 0.55, 0.6, 0.7, 0.72], flagshipDelta: null },
  { code: "LL", name: null, unit: null, price: 0.0024, delta: 18.7, spark: [0.3, 0.35, 0.4, 0.42, 0.6, 0.78, 0.88], flagshipDelta: 32.1 },
  { code: "VG", name: null, unit: null, price: 0.18, delta: -1.2, spark: [0.65, 0.7, 0.6, 0.55, 0.62, 0.58, 0.62], flagshipDelta: null },
  { code: "FT", name: null, unit: null, price: 0.06, delta: 0.0, spark: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], flagshipDelta: null },
  { code: "EM", name: null, unit: null, price: 0.0008, delta: 2.1, spark: [0.4, 0.45, 0.4, 0.5, 0.52, 0.55, 0.57], flagshipDelta: null },
  { code: "SP", name: null, unit: null, price: 0.0003, delta: 0.3, spark: [0.5, 0.48, 0.5, 0.52, 0.5, 0.51, 0.52], flagshipDelta: null },
];

const DEVICE_RANKINGS: DeviceRanking[] = [
  { rank: 1, name: "NexGridRack P1", dailyEarn: 45, bestFor: "rackP1", kind: "stellarrack-p1" },
  { rank: 2, name: "NexGridBox Pro", dailyEarn: 13, bestFor: "boxPro", kind: "stellarbox-pro" },
  { rank: 3, name: "NexGridBox S1", dailyEarn: 7, bestFor: "boxS1", kind: "stellarbox-s1" },
  { rank: 4, name: "Inference Share", dailyEarn: 0.19, bestFor: "cloudShare", kind: "cloud-share" },
  { rank: 5, dailyEarn: 0.06, bestFor: "phone", isPhone: true },
];

const priceIndex = computed<WorkloadPrice[]>(() => remoteApiEnabled
  ? (app.homeTruth?.marketBoard.workloads ?? []).map((row) => ({ code: row.code, name: row.name, unit: row.unit, price: row.price, delta: row.deltaPct, spark: row.sparkline ?? [], flagshipDelta: row.flagshipDeltaPct }))
  : PRICE_INDEX);
const deviceRankings = computed<DeviceRanking[]>(() => remoteApiEnabled
  ? (app.homeTruth?.marketBoard.deviceRankings ?? []).map((row) => ({ rank: Math.min(5, row.rank) as 1 | 2 | 3 | 4 | 5, name: row.name ?? undefined, dailyEarn: row.dailyUsdt, bestFor: row.bestFor, kind: row.kind && row.kind !== "phone" ? row.kind : undefined, isPhone: row.kind === "phone" }))
  : DEVICE_RANKINGS);

function formatPrice(n: number): string {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(3);
  return n.toFixed(4);
}
function arrow(w: WorkloadPrice): string {
  return w.delta !== null && w.delta > 0.05 ? "↑" : w.delta !== null && w.delta < -0.05 ? "↓" : "→";
}
function arrowColor(w: WorkloadPrice): string {
  return w.delta !== null && w.delta > 0.05 ? "var(--v5-brand)" : w.delta !== null && w.delta < -0.05 ? "var(--v5-brand-2)" : "var(--v5-ink-4)";
}
function sparkPoints(data: number[]): string {
  const w = 48;
  const h = 16;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  return data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
}

function goDetail(kind: Exclude<DeviceKind, "phone">) {
  uni.navigateTo({ url: `/pages/store/detail?id=${kind}`, fail: () => {} });
}

const sectionLabelStyle: CSSProperties = {
  padding: "0 0 8px",
  fontSize: "12px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--v5-ink-3)",
};
</script>
