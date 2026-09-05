<!--
  TrialGhostSlot — the user's NexGridBox S1 on free trial, surfaced on Home + Earn
  (ported from Nexion-prototype/app/components/trial-ghost-slot.tsx).

  Reads as a high-tier device under test-drive: device identity + live shadow
  earnings hero + trial-cycle progress + a buy CTA that converts. Hidden unless
  the trial is active/grace (grace renders as stopped). Hierarchy via internal aurora glow + lift
  (NOT an accent border), distinct from TrialHeroBanner (idle coupon entry).

  Spacing: caller controls horizontal margin via inherited `class` (no internal
  mx-* — the home wrapper owns padding; avoids the double-margin pitfall).
  Buy CTA routes to /pages/me/trial (not yet ported → nav fail swallowed).
-->
<template>
  <view
    v-if="visible"
    class="relative overflow-hidden rounded-2xl"
    :style="{
      background: 'var(--v5-surface)',
      boxShadow: 'var(--v5-card-shadow-lift)',
    }"
  >
    <!-- Internal aurora — brand-2 + tech-cyan glow marks the special trial device -->
    <view
      class="absolute inset-0 pointer-events-none"
      :style="{
        background:
          'radial-gradient(55% 60% at 0% 0%, color-mix(in oklab, var(--v5-brand-2) 22%, transparent) 0%, transparent 60%),' +
          'radial-gradient(45% 55% at 100% 100%, color-mix(in oklab, var(--v5-tech-cyan) 18%, transparent) 0%, transparent 65%)',
        filter: 'blur(14px)',
        opacity: 0.9,
      }"
    />

    <view class="relative p-4">
      <!-- Header — device identity + on-trial badge + countdown -->
      <view class="flex items-center gap-2.5">
        <view
          class="size-9 rounded-lg grid place-items-center shrink-0"
          :style="deviceIconStyle"
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          >
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
        </view>
        <view class="flex-1 min-w-0">
          <view class="flex items-center gap-1.5">
            <text class="text-[13px] font-semibold truncate" :style="deviceNameStyle">NexGridBox S1</text>
            <text
              class="shrink-0 text-[12px] font-mono-tabular rounded px-1.5 py-0.5"
              style="background: color-mix(in oklab, var(--v5-brand-2) 16%, transparent); color: var(--v5-brand-2-ink)"
            >{{ t.trial.ghostBadge }}</text>
          </view>
          <text class="block text-[12px] mt-0.5" :style="{ color: tint }">{{ ribbon }}</text>
        </view>
        <text
          class="shrink-0 text-[12px] font-mono-tabular rounded-full px-2 py-1"
          style="background: var(--v5-surface-2); color: var(--v5-ink-3)"
        >{{ etaText }}</text>
      </view>

      <!-- Shadow earnings hero — the conversion hook -->
      <view class="mt-3">
        <text
          class="block text-[12px] font-mono-tabular"
          style="color: var(--v5-ink-4); letter-spacing: 0.04em"
        >{{ t.trial.ghostSubtitle }}</text>
        <view class="mt-1 flex items-baseline gap-1.5">
          <text class="font-display tabular-nums" style="font-size: 15px; font-weight: 500; color: var(--v5-ink-3)">$</text>
          <text
            class="font-mono-tabular tabular-nums"
            style="font-size: 34px; font-weight: 600; color: var(--v5-ink); letter-spacing: -0.02em; line-height: 1"
          >{{ shadowUSD.toFixed(2) }}</text>
          <text class="font-mono-tabular text-[12px] ml-1" style="color: var(--v5-tech-cyan-ink)">{{ shadowNexText }}</text>
        </view>
      </view>

      <!-- Trial-cycle progress -->
      <view class="mt-3 h-1 rounded-full overflow-hidden" style="background: var(--v5-surface-2)">
        <view class="h-full rounded-full" :style="{ width: progressPct + '%', background: tint }" />
      </view>

      <!-- Bottom row — early-buy savings (left) + de-emphasized buy pill (right) -->
      <view class="mt-3 flex items-center justify-between gap-2">
        <text class="text-[12px] font-medium min-w-0 truncate" style="color: var(--v5-brand-2-ink)">{{ discountText }}</text>
        <view
          class="shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 h-9 active:scale-[0.97] transition-transform"
          style="background: var(--v5-brand-soft); color: var(--v5-brand); font-family: var(--font-v5); font-weight: 600; font-size: 13px"
          @click="goTrial"
        >
          <text style="color: var(--v5-brand); font-weight: 600; font-size: 13px">{{ t.trial.ghostBuyCta }}</text>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useFreeTrial, liveShadowUSD, liveShadowNEX, remainingMs } from "@/store/free-trial";
import { useTrialConfig, computeDiscountedPrice } from "@/store/trial-config";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const ONE_DAY = 86_400_000;

const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const t = useT();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const visible = computed(() => trial.status === "active" || trial.status === "grace");

const shadowUSD = computed(() => liveShadowUSD(now.value));
const shadowNEX = computed(() => liveShadowNEX(now.value));
const ms = computed(() => remainingMs(now.value));

// Grace = stopped (spec ⑤): the ribbon says production stopped — never claims
// the device is still earning.
const ribbon = computed(() =>
  trial.status === "grace" ? t.value.trial.ghostRibbonGrace : t.value.trial.ghostRibbonActive,
);
// Grace = stopped (spec ⑤ 设备灰显): the device visual body — icon area + device
// name — greys out for at-a-glance "parked" reading. grayscale(1) desaturates the
// brand-2 tint + icon stroke in one move; the name drops to ink-3. Amber warning
// stays on the ribbon/progress. Active keeps the original brand-2 identity.
const deviceIconStyle = computed(() =>
  trial.status === "grace"
    ? { background: "color-mix(in oklab, var(--v5-brand-2) 16%, transparent)", filter: "grayscale(1)", opacity: 0.55 }
    : { background: "color-mix(in oklab, var(--v5-brand-2) 16%, transparent)" },
);
const deviceNameStyle = computed(() =>
  trial.status === "grace" ? { color: "var(--v5-ink-3)" } : { color: "var(--v5-ink)" },
);
const tint = computed(() =>
  trial.status === "grace" ? "var(--v5-warning)" : "var(--v5-brand-2)",
);

const etaLabel = computed(() => {
  const m = ms.value;
  const days = Math.floor(m / ONE_DAY);
  const hours = Math.floor((m % ONE_DAY) / 3_600_000);
  const minutes = Math.floor((m % 3_600_000) / 60_000);
  return days > 0
    ? `${days}d ${String(hours).padStart(2, "0")}h`
    : `${hours}h ${String(minutes).padStart(2, "0")}m`;
});

const progressPct = computed(() => {
  const cfg = trialCfg.config;
  const totalMs = (cfg.trialDays + cfg.graceDays) * ONE_DAY;
  const elapsedMs = trial.startedAt !== null ? now.value - trial.startedAt : 0;
  return Math.min(100, Math.max(2, (elapsedMs / totalMs) * 100));
});

const discount = computed(() => computeDiscountedPrice(trialCfg.config).discount);

const etaText = computed(() => fmt(t.value.trial.ghostEta, { eta: etaLabel.value }));
const discountText = computed(() => fmt(t.value.trial.ghostDiscount, { amount: `$${discount.value}` }));
const shadowNexText = computed(() => `+ ${shadowNEX.value.toLocaleString()} NEX`);

function goTrial() {
  uni.navigateTo({ url: "/pages/me/trial", fail: () => {} });
}
</script>
