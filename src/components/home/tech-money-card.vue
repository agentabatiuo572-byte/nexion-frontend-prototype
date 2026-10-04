<!--
  TechMoneyCard — ZONE 1 home hero "Today's earnings" (ported from
  mission-control.tsx TechMoneyCard). CROSS-STREAM aggregate: device mining,
  team commission, and staking accrual. (Genesis 已移出每日 USD 聚合——
  分红延期改造后它是上所后 NEX 排放，见 holder 页。) surface-2
  base + aurora + tech-grid + drifting dots make it the conversion focal point.
  Big streaming number + peer-avg / payback footer.
  Source hardcoded the labels; ported to t.home.tech* for bilingual parity.
-->
<template>
  <view
    class="relative isolate"
    style="padding: 8px 2px 12px"
  >
    <!-- Left purple glow — soft radial, blurred so its edges feather into the black page bg.
         走 --v5-ambient-nex:暗色是原样的极光(0 像素变化),亮色塌成 none。
         此前虽已从 legacy --accent-purple 换到 --v5-nex 让门变绿,但两个 token 的
         **亮色值都是 #7C5CFF**,米色底上那团发灰的淡紫斑一直还在(2026-08-18 实测)。 -->
    <view
      style="position: absolute; inset: 0; background: var(--v5-ambient-nex); filter: blur(24px); z-index: 0; pointer-events: none; animation: v5-aurora-drift 14s ease-in-out infinite alternate"
    />
    <!-- Tech grid (brand-tinted, masked) -->
    <view
      style="position: absolute; inset: 0; background-image: linear-gradient(to right, color-mix(in oklab, var(--v5-brand) 9%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--v5-brand) 9%, transparent) 1px, transparent 1px); background-size: 24px 24px; -webkit-mask-image: radial-gradient(ellipse at center, #000 35%, transparent 85%); mask-image: radial-gradient(ellipse at center, #000 35%, transparent 85%); z-index: 0; pointer-events: none"
    />
    <!-- Drifting dots -->
    <view style="position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden">
      <view v-for="(d, i) in dots" :key="i" :style="dotStyle(d)" />
    </view>

    <view class="relative" style="z-index: 1">
      <view class="flex justify-between items-center gap-2">
        <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-4); letter-spacing: 0.04em">{{ t.home.techTodaysEarnings }}</text>
        <text
          class="inline-flex items-center gap-1 font-mono-tabular"
          style="font-size: 12px; padding: 2px 7px; border-radius: 4px; background: var(--v5-tech-cyan-soft); color: var(--v5-tech-cyan-ink); font-weight: 500; letter-spacing: 0.04em; white-space: nowrap"
        >{{ t.home.techStreaming }}</text>
      </view>

      <view
        class="mt-2.5 flex items-baseline gap-1"
        style="font-family: var(--font-v5); font-weight: 600; letter-spacing: -0.024em; line-height: 1; color: var(--v5-ink)"
      >
        <text style="font-size: 20px; color: var(--v5-ink-3); font-weight: 500">$</text>
        <text v-if="remoteApiEnabled && remoteToday === null" class="tabular-nums" style="font-size: 56px">—</text>
        <text v-else class="tabular-nums" style="font-size: 56px">{{ intPart }}<text style="font-size: 36px; color: var(--v5-ink-3); font-weight: 600">.{{ cents }}</text></text>
      </view>

      <!-- 《02》§7:混合内容整句禁 Mono;保留 tabular-nums 让数字仍等宽对齐 -->
      <text class="block mt-2 tabular-nums" style="font-size: 12px; line-height: 16px; color: var(--v5-success-ink)">{{ earningsSubtitle }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { useCommission } from "@/store/commission";
import { useStaking } from "@/store/staking";
import { useTicker } from "@/composables/use-ticker";
import { remoteApiEnabled } from "@/api/runtime";
import { homeEarningsSubtitle } from "./home-real-copy";
import { fmt } from "@/i18n/format";

const t = useT();
const app = useApp();
const commission = useCommission();
const staking = useStaking();

// 创世节点不再计入「今日 USD 收益」——分红延期改造后它是上所后 NEX 排放（在 holder 页按
// NEX 展示），非每日 USD 现金，故从首页每日聚合移除（去旧「平台交易量日分红」雷）。
const computeToday = computed(() => app.earnings.today);
const teamToday = computed(() => commission.todayUSDT());
const stakingToday = computed(() => staking.todayAccruedUSDT());
const todayTotal = computed(() => computeToday.value + teamToday.value + stakingToday.value);
const remoteToday = computed<number | null>(() => remoteApiEnabled
  ? app.homeTruth?.earnings.today.usdt ?? null
  : null);
const remoteJobCount = computed<number | null>(() => remoteApiEnabled
  ? app.homeTruth?.earnings.today.jobCount ?? null
  : null);
const remoteTodayVsYesterdayPct = computed<number | null>(() => remoteApiEnabled
  ? app.homeTruth?.earnings.todayVsYesterdayPct ?? null
  : null);
const earningsSubtitle = computed(() => homeEarningsSubtitle(
  remoteApiEnabled,
  app.homeTruthStatus,
  remoteToday.value,
  remoteJobCount.value,
  remoteTodayVsYesterdayPct.value,
  t.value.home.techVsYesterday,
  t.value.home.techEarningsLoading,
  t.value.uiChrome.unavailable,
  t.value.home.techEarningsEmpty,
  fmt(t.value.home.techSettledJobs, {
    arrow: remoteTodayVsYesterdayPct.value === null ? "" : remoteTodayVsYesterdayPct.value > 0 ? "↑" : remoteTodayVsYesterdayPct.value < 0 ? "↓" : "→",
    delta: remoteTodayVsYesterdayPct.value === null ? "—" : `${remoteTodayVsYesterdayPct.value > 0 ? "+" : ""}${remoteTodayVsYesterdayPct.value.toFixed(1)}%`,
    count: remoteJobCount.value ?? 0,
  }),
));

// Mock-only streaming number. Remote mode renders the exact server snapshot or
// an unavailable placeholder; it never advances a client-side money counter.
const display = useTicker(() => remoteToday.value ?? Math.max(todayTotal.value, 0.06), 0.0009, 1100, !remoteApiEnabled);
const displayAmount = computed(() => remoteToday.value ?? display.value);
const intPart = computed(() => Math.floor(displayAmount.value));
const cents = computed(() => String(Math.floor(displayAmount.value * 100) % 100).padStart(2, "0"));

interface Dot {
  left: string;
  delay: number;
  color: string;
}
const dots: Dot[] = [
  { left: "12%", delay: 0, color: "var(--v5-tech-cyan-ink)" },
  { left: "32%", delay: 1.6, color: "var(--v5-brand)" },
  { left: "54%", delay: 3.2, color: "var(--v5-brand-2-ink)" },
  { left: "72%", delay: 4.8, color: "var(--v5-tech-cyan-ink)" },
  { left: "88%", delay: 6.4, color: "var(--v5-brand)" },
];
function dotStyle(d: Dot): CSSProperties {
  return {
    position: "absolute",
    bottom: "-6px",
    left: d.left,
    width: "4px",
    height: "4px",
    borderRadius: "50%",
    background: d.color,
    opacity: 0,
    animation: "v5-dot-drift 8s linear infinite",
    animationDelay: `${d.delay}s`,
  };
}
</script>
