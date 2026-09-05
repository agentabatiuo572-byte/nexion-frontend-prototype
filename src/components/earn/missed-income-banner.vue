<!--
  MissedIncomeBanner — ported from Nexion-prototype/app/components/missed-income-banner.tsx.

  Loss-aversion hook for /earn — surfaces today's "missed income" vs the S1
  ceiling and cumulative miss since signup. Warning-orange tone (var(--v5-brand-2)),
  separate from the lemon "you earned" semantics. Dual progress bars (phone tiny
  vs S1 ceiling full), the phone bar grows-on-scroll via useScrollGrowProgress
  (P-019 $el-aware). Hidden while trial active (TrialGhostSlot covers it) or when
  the user is already top-tier (nothing higher to miss). Taps route to /store.

  TickerNumber (source) → plain reactive value: the interval re-render already
  ramps the number; uni has no tween component, matching trial-ghost-slot.vue.
-->
<template>
  <view v-if="show" class="mx-4">
    <view class="block relative overflow-hidden rounded-2xl active:opacity-90" :style="rootStyle" @click="goStore">
      <!-- Subtle background glow on the right -->
      <view class="absolute inset-0 pointer-events-none" :style="glowStyle" />

      <!-- Header label -->
      <view class="relative flex items-center gap-1.5" :style="labelStyle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 17h6v-6" /><path d="m22 17-8.5-8.5-5 5L2 7" /></svg>
        <text style="color: var(--v5-brand-2-ink)">{{ t.earn.missedToday }}</text>
      </view>

      <!-- Big missed-today number -->
      <view class="relative mt-2 flex items-baseline gap-2">
        <view class="flex items-baseline">
          <text class="tabular-nums" style="font-family: var(--font-v5); line-height: 1; color: var(--v5-brand-2-ink); letter-spacing: -0.014em; font-size: 34px; font-weight: 600">−</text>
          <text class="tabular-nums" style="font-family: var(--font-v5); line-height: 1; font-size: 15px; font-weight: 500; color: var(--v5-brand-2-ink); opacity: 0.75">$</text>
          <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 34px; font-weight: 600; line-height: 1; color: var(--v5-brand-2-ink); letter-spacing: -0.014em">{{ missedToday.toFixed(2) }}</text>
        </view>
        <text class="text-[12px]" style="color: var(--v5-ink-3); line-height: 1.2">{{ vsCeilingText }}</text>
      </view>

      <!-- Dual progress bars -->
      <view class="relative mt-3 space-y-2">
        <view>
          <view class="flex items-center justify-between mb-1" style="font-size: 12px">
            <text style="color: var(--v5-ink-3)">{{ baseLabel }}</text>
            <text class="tabular-nums" style="color: var(--v5-ink-2)">${{ promo.baseDaily.toFixed(2) }}/d</text>
          </view>
          <view ref="elRef" class="h-1 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
            <view class="h-full rounded-full" :style="phoneBarStyle" />
          </view>
        </view>
        <view>
          <view class="flex items-center justify-between mb-1" style="font-size: 12px">
            <text style="color: var(--v5-brand)">{{ ceilingText }}</text>
            <text class="tabular-nums" style="color: var(--v5-brand)">${{ promo.targetDaily.toFixed(2) }}/d</text>
          </view>
          <view class="h-1 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
            <view class="h-full w-full rounded-full" style="background: color-mix(in srgb, var(--v5-brand) 45%, transparent)" />
          </view>
        </view>
      </view>

      <!-- Cumulative miss + CTA -->
      <view class="relative mt-4 flex items-center justify-between gap-3">
        <view class="min-w-0" style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.35">
          <text class="block">{{ t.earn.cumulativeMissed }}</text>
          <text class="block tabular-nums" style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-brand-2-ink); margin-top: 2px">−${{ cumulativeMissedRounded }}<text style="font-size: 12px; color: var(--v5-ink-4); margin-left: 6px; font-weight: 400">· {{ daysSinceJoin }}d</text></text>
        </view>
        <view class="shrink-0 inline-flex items-center gap-1.5 active:scale-[0.97]" :style="ctaStyle">
          <text :style="ctaLabelStyle">{{ t.earn.stopBleeding }}</text>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type CSSProperties } from "vue";
import { useApp } from "@/store/app";
import { derivePromoUpgrade } from "@/store/device-types";
import { deviceNameByKind } from "@/lib/device-copy";
import { trialReservesSlotNow } from "@/store/free-trial";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const app = useApp();
const t = useT();

const { elRef, inView } = useScrollGrowProgress();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const promo = computed(() => derivePromoUpgrade(app.visibleDevices));
const trialActive = computed(() => trialReservesSlotNow());

// Trial active → TrialGhostSlot already carries device + earnings + buy CTA.
// Top tier (multiplier 0) → nothing higher to miss. Hide in both cases.
const show = computed(() => !trialActive.value && promo.value.multiplier !== 0);

const gap = computed(() => promo.value.targetDaily - promo.value.baseDaily);
const dayProgress = computed(() => {
  const todayStart = new Date(now.value).setHours(0, 0, 0, 0);
  const elapsedHoursToday = (now.value - todayStart) / (60 * 60 * 1000);
  return Math.min(1, elapsedHoursToday / 24);
});
const missedToday = computed(() => gap.value * dayProgress.value);

const daysSinceJoin = computed(() =>
  Math.max(1, Math.floor((now.value - app.user.joinedAt) / ONE_DAY_MS)),
);
const cumulativeMissedRounded = computed(() =>
  Math.round(gap.value * daysSinceJoin.value).toLocaleString(),
);

const phoneWidthPct = computed(() => (promo.value.baseDaily / promo.value.targetDaily) * 100);

const baseLabel = computed(() =>
  deviceNameByKind(t.value, promo.value.baseKind, promo.value.baseName),
);
const targetLabel = computed(() =>
  deviceNameByKind(t.value, promo.value.targetKind, promo.value.targetName),
);
const vsCeilingText = computed(() => fmt(t.value.earn.vsDeviceCeiling, { name: targetLabel.value }));
const ceilingText = computed(() => fmt(t.value.earn.deviceCeiling, { name: targetLabel.value }));

const phoneBarStyle = computed<CSSProperties>(() => ({
  width: `${inView.value ? phoneWidthPct.value : 0}%`,
  transition: inView.value ? PROGRESS_GROW_TRANSITION : "none",
  background: "color-mix(in srgb, var(--v5-ink-3) 40%, transparent)",
}));

function goStore() {
  uni.navigateTo({ url: "/pages/store/store", fail: () => {} });
}

const rootStyle: CSSProperties = {
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--v5-brand-2) 12%, transparent), var(--v5-surface) 45%, var(--v5-bg))",
  padding: "16px",
};
const glowStyle: CSSProperties = {
  background: "radial-gradient(60% 80% at 92% 50%, color-mix(in srgb, var(--v5-brand-2) 16%, transparent), transparent 70%)",
};
const labelStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--v5-brand-2-ink)",
  fontWeight: 500,
};
const ctaStyle: CSSProperties = {
  height: "36px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "var(--v5-brand-2)",
};
const ctaLabelStyle: CSSProperties = {
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
};
</script>
