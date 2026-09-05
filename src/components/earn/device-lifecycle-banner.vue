<!--
  DeviceLifecycleBanner — ported from
  Nexion-prototype/app/components/device-lifecycle-banner.tsx.

  Surfaces device-lifecycle efficiency: average effective output across all
  degradable devices (NexGridBox / Rack) + monthly USD loss vs the day-1
  baseline. Only renders when the user owns ≥1 degradable device — the seeded
  phone-only fleet has none, so it self-hides until a Box is owned. Accent color
  follows efficiency thresholds (≥85% cyan / ≥65% warning / <65% orange). Taps
  route to /me/devices (not yet ported → nav fail swallowed).

  Hex-alpha on CSS vars (source `${accent}55` / `${accent}22`) → color-mix
  (P-022). Interval re-render keeps monthsOwned / efficiency ticking.
-->
<template>
  <view v-if="degradableDevices.length > 0" class="mx-4">
    <view class="block relative overflow-hidden rounded-2xl" :style="rootStyle" @click="goDevices">
      <view class="absolute inset-0 pointer-events-none" :style="glowStyle" />

      <view class="relative flex items-center gap-1.5" :style="labelStyle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="accent" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>
        <text :style="{ color: accent }">{{ t.earn.lifecycleLabel }}</text>
      </view>

      <view class="relative mt-2 flex items-baseline gap-2">
        <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 34px; font-weight: 600; line-height: 1; letter-spacing: -0.014em" :style="{ color: accent }">{{ (avgEfficiency * 100).toFixed(1) }}%</text>
        <text class="text-[12px]" style="color: var(--v5-ink-3); line-height: 1.2">{{ subtitleText }}</text>
      </view>

      <view class="relative mt-3 h-1 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
        <view class="h-full rounded-full" :style="barStyle" />
      </view>

      <view class="relative mt-4 flex items-center justify-between gap-3">
        <view class="min-w-0" style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.35">
          <text class="block">{{ t.earn.lifecycleMonthlyLoss }}</text>
          <text class="block tabular-nums" style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; margin-top: 2px" :style="{ color: accent }">−${{ totalMonthlyLossUSD.toFixed(2) }}<text style="font-size: 12px; color: var(--v5-ink-4); margin-left: 6px; font-weight: 400">· {{ monthsLabel }}</text></text>
        </view>
        <view class="shrink-0 inline-flex items-center gap-1.5 active:scale-[0.97]" :style="ctaStyle">
          <text :style="ctaLabelStyle">{{ t.earn.lifecycleCta }}</text>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type CSSProperties } from "vue";
import { useApp } from "@/store/app";
import { getLifecycleSummary, getNetworkMonthlyLoss, isDegradable } from "@/store/device-lifecycle";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const ONE_MIN_MS = 60_000;

const app = useApp();
const t = useT();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, ONE_MIN_MS);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const degradableDevices = computed(() => app.visibleDevices.filter((d) => isDegradable(d.kind)));

const summaries = computed(() => degradableDevices.value.map((d) => getLifecycleSummary(d, now.value)));
const avgEfficiency = computed(() => {
  const list = summaries.value;
  if (list.length === 0) return 1;
  return list.reduce((s, x) => s + x.efficiency, 0) / list.length;
});
const totalMonthlyLossUSD = computed(() => getNetworkMonthlyLoss(app.visibleDevices, now.value).totalMonthlyLossUSD);
const oldest = computed(() => {
  const list = summaries.value;
  if (list.length === 0) return null;
  return list.reduce((m, x) => (x.monthsOwned > m.monthsOwned ? x : m), list[0]);
});

const accent = computed(() =>
  avgEfficiency.value >= 0.85
    ? "var(--v5-tech-cyan)"
    : avgEfficiency.value >= 0.65
      ? "var(--v5-warning)"
      : "var(--v5-brand-2)",
);

const subtitleText = computed(() => fmt(t.value.earn.lifecycleSubtitle, { n: degradableDevices.value.length }));
const monthsLabel = computed(() => {
  const o = oldest.value;
  if (!o) return "";
  return o.monthsOwned < 1
    ? fmt(t.value.earn.lifecycleDays, { n: Math.floor(o.monthsOwned * 30) })
    : fmt(t.value.earn.lifecycleMonths, { n: o.monthsOwned.toFixed(1) });
});

const rootStyle = computed<CSSProperties>(() => ({
  border: `1px solid color-mix(in srgb, ${accent.value} 33%, transparent)`,
  background: `linear-gradient(160deg, color-mix(in srgb, ${accent.value} 12%, transparent) 0%, var(--v5-surface) 70%)`,
  padding: "16px",
}));
const glowStyle = computed<CSSProperties>(() => ({
  background: `radial-gradient(60% 80% at 95% 50%, color-mix(in srgb, ${accent.value} 14%, transparent), transparent 70%)`,
}));
const labelStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  fontWeight: 500,
};
const barStyle = computed<CSSProperties>(() => ({
  width: `${Math.max(8, avgEfficiency.value * 100)}%`,
  background: accent.value,
  opacity: 0.5,
}));
const ctaStyle = computed<CSSProperties>(() => ({
  height: "36px",
  padding: "0 16px",
  borderRadius: "999px",
  background: accent.value,
}));
const ctaLabelStyle: CSSProperties = {
  color: "var(--v5-on-brand)",
  fontSize: "15px",
  fontWeight: 600,
};

function goDevices() {
  uni.navigateTo({ url: "/pages/me/devices", fail: () => {} });
}
</script>
