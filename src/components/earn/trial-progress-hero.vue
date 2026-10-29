<!--
  TrialCountdownHero — active/grace trial hero: ribbon + shadow earnings (live,
  frozen in grace), 4-cell countdown, full-cycle progress bar, start/end dates.
  Grace renders as the stopped state (warning tint + dimmed earnings, spec
  FEAT-TRIAL02 ⑤). Driven by `now` (page ticker) + the free-trial boundaries
  passed in as props.
-->
<template>
  <view class="nx-glass-card relative overflow-hidden" :style="cardStyle">
    <view class="flex items-center justify-between">
      <text :style="ribbonStyle">{{ ribbon }}</text>
      <text :style="boxNameStyle">{{ cfg.trialProductName }}</text>
    </view>

    <text class="block" style="margin-top:16px;font-size:var(--ui-type-list-subtitle);line-height:var(--ui-type-list-subtitle-lh);color:var(--v5-ink-3)">{{ lifecycle.accruedLabel }}</text>
    <!-- Shadow earnings: USDT and UVT are separate assets, never shown as dollars. -->
    <view class="flex items-baseline" style="gap: 6px; margin-top: 8px">
      <text :style="shadowUsdStyle">{{ visibility.mask(formatGroupedAmount(shadowUSD)) }}</text>
      <text :style="unitStyle">USDT</text>
      <text :style="shadowNexStyle">+ {{ visibility.mask(formatGroupedAmount(shadowNEX)) }} UVT</text>
    </view>
    <text class="block" :style="ctaLineStyle">{{ cta }}</text>

    <!-- Remaining time and the term end share one compact row; seconds only in the final 24 hours. -->
    <view class="trial-remaining" :class="{ 'trial-remaining--final-day': remainingMs <= 86400000 }">
      <text>{{ fmt(purchase.heroRemaining, { time: remainingLabel }) }}</text>
      <text>{{ termLine }}</text>
    </view>

    <!-- Progress bar -->
    <view :style="barTrackStyle">
      <view :style="barFillStyle" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { formatGroupedAmount } from "@/lib/amount-display";
import { computed, type CSSProperties } from "vue";
import { formatTrialRemaining } from "@/i18n/core-review";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { formatTrialDeadline } from "@/lib/trial-date";
import { useTrialConfig } from "@/store/trial-config";
import type { TrialStatus } from "@/store/free-trial";
import { trialCycleDurationMs } from "@/lib/trial-cycle-duration";
import { useTrialLifecycleCopy } from "@/i18n/trial-lifecycle";
import { useTrialPurchaseCopy } from "@/i18n/trial-purchase";

const visibility = useDataVisibility();
const props = defineProps<{
  status: TrialStatus;
  extended?: boolean;
  now: number;
  remainingMs: number;
  shadowUSD: number;
  shadowNEX: number;
  startedAt: number | null;
  expiresAt: number | null;
  graceEndsAt: number | null;
}>();

const t = useT();
const lifecycle = useTrialLifecycleCopy();
const purchase = useTrialPurchaseCopy();
const cfg = computed(() => useTrialConfig().config);

const remainingLabel = computed(() => formatTrialRemaining(props.remainingMs, t.value.coreReview));

const totalMs = computed(() => trialCycleDurationMs(props.startedAt, props.graceEndsAt, cfg.value.trialDays + cfg.value.graceDays));
const elapsedMs = computed(() => (props.startedAt !== null ? props.now - props.startedAt : 0));
const progressPct = computed(() => Math.min(100, Math.max(0, (elapsedMs.value / totalMs.value) * 100)));

const w = computed(() => t.value.trial);
const tint = computed(() => {
  if (props.status === "active") return "var(--v5-brand)";
  if (props.status === "grace") return "var(--v5-warning)";
  return "var(--v5-ink-4)";
});
const ribbon = computed(() => {
  if (props.extended) return w.value.countdownExtendedRibbon;
  if (props.status === "active") return w.value.countdownActiveRibbon;
  if (props.status === "grace") return w.value.countdownGraceRibbon;
  return "";
});
const cta = computed(() => {
  if (props.status === "active") return w.value.countdownActiveCta;
  if (props.status === "grace") return w.value.countdownGraceCta;
  return "";
});

// Active: the original term end (where the early discount stops). Grace: how long the credit is kept.
const termLine = computed(() => {
  if (props.status === "grace") {
    return props.graceEndsAt === null ? "" : fmt(purchase.value.heroKeptUntil, { time: formatTrialDeadline(props.graceEndsAt, dateLocale()) });
  }
  return props.expiresAt === null ? "" : fmt(purchase.value.heroTermUntil, { time: formatTrialDeadline(props.expiresAt, dateLocale()) });
});

const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)", borderRadius: "var(--nx-glass-radius)", border: "none", background: "var(--nx-glass-fill)", padding: "20px" };
const ribbonStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: tint.value,
}));
// Grace = stopped (spec ⑤ 设备灰显): the device name itself greys out — disabled
// formula (ink-4 + reduced opacity), so the box reads as parked at a glance while
// the amber warning stays on the ribbon/copy. Other states keep the resting ink-3.
const boxNameStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: props.status === "grace" ? "var(--v5-ink-4)" : "var(--v5-ink-3)",
  opacity: props.status === "grace" ? 0.6 : 1,
}));
const unitStyle: CSSProperties = { fontSize: "var(--ui-type-list-subtitle)", color: "var(--v5-ink-3)" };
// Grace = stopped: the frozen figure dims to read as "no longer accruing".
const shadowUsdStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-amount)",
  fontSize: "var(--ui-type-wallet-amount)",
  lineHeight: "var(--ui-type-wallet-amount-lh)",
  fontWeight: 600,
  letterSpacing: "-0.024em",
  color: props.status === "grace" ? "var(--v5-ink-3)" : "var(--v5-ink)",
}));
const shadowNexStyle: CSSProperties = { fontSize: "var(--ui-type-list-subtitle)", color: "var(--v5-nex)", marginLeft: "4px" };
const ctaLineStyle: CSSProperties = { marginTop: "4px", fontSize: "var(--ui-type-meta)", lineHeight: "var(--ui-type-meta-lh)", color: "var(--v5-ink-3)" };
const barTrackStyle: CSSProperties = { marginTop: "8px", height: "6px", borderRadius: "999px", background: "var(--v5-surface-3)", overflow: "hidden" };
const barFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${progressPct.value}%`,
  background: tint.value,
  transition: "width 500ms ease",
}));


</script>


<style scoped>
.trial-remaining { margin-top:16px;display:flex;justify-content:space-between;gap:12px;font-size:var(--ui-type-meta);line-height:var(--ui-type-meta-lh);color:var(--v5-ink-3); }
.trial-remaining--final-day { font-variant-numeric:tabular-nums; }
</style>
