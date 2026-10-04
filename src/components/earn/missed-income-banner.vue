<!--
  MissedIncomeBanner — ported from Nexion-prototype/app/components/missed-income-banner.tsx.

  Device earning-ceiling comparison for /earn. The server projection
  (homeTruth.doTheMath, basis OWNED_DEVICE_TO_NEXT_CATALOG_PRODUCT) supplies the
  daily USDT ceiling of the next catalog product against the user's current
  device, plus the product to open. Every figure here is that ceiling gap — a
  pricing comparison, not income the user lost, tasks they were denied, or
  entitlement they forfeited; the copy says so and carries no minus sign.
  Warning-orange tone (var(--v5-brand-2)) keeps it distinct from the lemon
  "you earned" semantics. Dual progress bars (current device vs ceiling), the
  current bar grows-on-scroll via useScrollGrowProgress (P-019 $el-aware). A free
  trial does not hide this comparison: trial credit and the ceiling comparison
  answer different questions. Hidden when no authoritative comparison exists, so
  an absent projection never renders a money figure.

  TickerNumber (source) → plain reactive value: the interval re-render already
  ramps the number; uni has no tween component, matching trial-ghost-slot.vue.
-->
<template>
  <view v-if="show" class="mx-4">
    <view class="nx-glass-card block relative overflow-hidden active:opacity-90" :style="rootStyle" role="link" tabindex="0" @click="goStore">
      <!-- Subtle background glow on the right -->
      <view class="absolute inset-0 pointer-events-none" :style="glowStyle" />

      <!-- Header label -->
      <view class="relative flex items-center gap-1.5" :style="labelStyle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 17h6v-6" /><path d="m22 17-8.5-8.5-5 5L2 7" /></svg>
        <text style="color: var(--v5-brand-2-ink)">{{ t.earn.missedToday }}</text>
      </view>

      <!-- Ceiling gap at today's elapsed progress -->
      <view class="relative mt-2 flex items-baseline gap-2">
        <view class="flex items-baseline">
          <text class="tabular-nums" style="font-family: var(--font-v5); line-height: 1; font-size: 15px; font-weight: 500; color: var(--v5-brand-2-ink); opacity: 0.75">$</text>
          <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 34px; font-weight: 600; line-height: 1; color: var(--v5-brand-2-ink); letter-spacing: -0.014em">{{ ceilingGapToday.toFixed(2) }}</text>
        </view>
        <text class="text-[12px]" style="color: var(--v5-ink-3); line-height: 1.2">{{ vsCeilingText }}</text>
      </view>

      <!-- Dual progress bars -->
      <view class="relative mt-3 space-y-2">
        <view>
          <view class="flex items-center justify-between mb-1" style="font-size: 12px">
            <text style="color: var(--v5-ink-3)">{{ baseLabel }}</text>
            <text class="tabular-nums" style="color: var(--v5-ink-2)">${{ baseDaily.toFixed(2) }}/d</text>
          </view>
          <view ref="elRef" class="h-1 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
            <view class="h-full rounded-full" :style="phoneBarStyle" />
          </view>
        </view>
        <view>
          <view class="flex items-center justify-between mb-1" style="font-size: 12px">
            <text style="color: var(--v5-brand)">{{ ceilingText }}</text>
            <text class="tabular-nums" style="color: var(--v5-brand)">${{ targetDaily.toFixed(2) }}/d</text>
          </view>
          <view class="h-1 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
            <view class="h-full w-full rounded-full" style="background: color-mix(in srgb, var(--v5-brand) 45%, transparent)" />
          </view>
        </view>
      </view>

      <!-- Cumulative ceiling gap + CTA -->
      <view class="relative mt-4 flex items-center justify-between gap-3">
        <view class="min-w-0" style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.35">
          <text class="block">{{ t.earn.cumulativeMissed }}</text>
          <text class="block tabular-nums" style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-brand-2-ink); margin-top: 2px">${{ cumulativeCeilingGapRounded }}<text style="font-size: 12px; color: var(--v5-ink-4); margin-left: 6px; font-weight: 400">· {{ daysSinceJoin }}d</text></text>
        </view>
        <view class="shrink-0 inline-flex items-center gap-1.5 active:scale-[0.97]" :style="ctaStyle">
          <text :style="ctaLabelStyle">{{ t.earn.capExplainCta }}</text>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>

      <!-- Estimate basis: this is a pricing comparison, not a realised loss. -->
      <text class="relative block" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 8px; line-height: 1.35">{{ t.earn.ceilingGapDisclaimer }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, ref, onMounted, onUnmounted, type CSSProperties } from "vue";
import { useApp } from "@/store/app";
import { derivePromoUpgrade } from "@/store/device-types";
import { remoteApiEnabled } from "@/api/runtime";
import { deviceNameByKind } from "@/lib/device-copy";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const app = useApp();
const t = useT();

const { elRef, inView } = useScrollGrowProgress();

const localNow = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  if (remoteApiEnabled) return;
  timer = setInterval(() => {
    localNow.value = Date.now();
  }, 60_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const promo = computed(() => {
  if (remoteApiEnabled) {
    const projection = app.homeTruth?.doTheMath;
    if (!projection) return null;
    return {
      baseKind: projection.base.kind,
      baseName: projection.base.name,
      baseDaily: projection.base.dailyUsdt,
      targetKind: projection.target.kind,
      targetName: projection.target.name,
      targetDaily: projection.target.dailyUsdt,
      multiplier: projection.multiplier,
      targetPayback: projection.paybackDays,
      productNo: projection.target.productNo,
    };
  }
  return {
    ...derivePromoUpgrade(app.visibleDevices),
    productNo: null,
  };
});
// The formal App uses the Java response timestamp as its clock authority. This
// avoids browser-time drift and prevents a failed Home request from falling
// back to locally invented earning values. The prototype keeps its mock ticker.
const authoritativeNow = computed(() => {
  if (!remoteApiEnabled) return localNow.value;
  const generatedAt = app.homeTruth?.generatedAt;
  if (!generatedAt) return 0;
  const parsed = Date.parse(generatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
});
const joinedAtValid = computed(() =>
  Number.isFinite(app.user.joinedAt)
  && app.user.joinedAt > 0
  && app.user.joinedAt <= authoritativeNow.value,
);

// Trial credit and the device ceiling comparison are separate concepts, so an
// active trial must not remove the comparison card. Top tier (multiplier 0) has
// no higher catalog product to compare against and remains hidden.
const show = computed(() =>
  promo.value !== null
  && promo.value.baseKind !== "cloud-share"
  && promo.value.targetKind !== "cloud-share"
  && authoritativeNow.value > 0
  && joinedAtValid.value
  && promo.value.multiplier !== 0,
);

const baseDaily = computed(() => promo.value?.baseDaily ?? 0);
const targetDaily = computed(() => promo.value?.targetDaily ?? 0);
/** Daily ceiling gap between the current device and the next catalog product. */
const dailyCeilingGap = computed(() => targetDaily.value - baseDaily.value);
const dayProgress = computed(() => {
  const todayStart = new Date(authoritativeNow.value).setHours(0, 0, 0, 0);
  const elapsedHoursToday = (authoritativeNow.value - todayStart) / (60 * 60 * 1000);
  return Math.min(1, elapsedHoursToday / 24);
});
// Today's share of the ceiling gap, prorated by elapsed day progress. This is a
// pricing comparison the server projection defines, never income actually lost.
const ceilingGapToday = computed(() => dailyCeilingGap.value * dayProgress.value);

const daysSinceJoin = computed(() => {
  if (!joinedAtValid.value) return 0;
  return Math.max(1, Math.floor((authoritativeNow.value - app.user.joinedAt) / ONE_DAY_MS));
});
const cumulativeCeilingGapRounded = computed(() =>
  Math.round(dailyCeilingGap.value * daysSinceJoin.value).toLocaleString(),
);

const phoneWidthPct = computed(() =>
  targetDaily.value > 0 ? (baseDaily.value / targetDaily.value) * 100 : 0,
);

const baseLabel = computed(() =>
  promo.value
    ? deviceNameByKind(t.value, promo.value.baseKind, promo.value.baseName)
    : "—",
);
const targetLabel = computed(() =>
  promo.value
    ? deviceNameByKind(t.value, promo.value.targetKind, promo.value.targetName)
    : "—",
);
const vsCeilingText = computed(() => fmt(t.value.earn.vsDeviceCeiling, { name: targetLabel.value }));
const ceilingText = computed(() => fmt(t.value.earn.deviceCeiling, { name: targetLabel.value }));

const phoneBarStyle = computed<CSSProperties>(() => ({
  width: `${inView.value ? phoneWidthPct.value : 0}%`,
  transition: inView.value ? PROGRESS_GROW_TRANSITION : "none",
  background: "color-mix(in srgb, var(--v5-ink-3) 40%, transparent)",
}));

function goStore() {
  const productNo = promo.value?.productNo;
  const url = remoteApiEnabled && productNo
    ? `/pages/store/detail?id=${encodeURIComponent(productNo)}`
    : "/pages/store/store";
  navTo(url);
}

const rootStyle: CSSProperties = {
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
