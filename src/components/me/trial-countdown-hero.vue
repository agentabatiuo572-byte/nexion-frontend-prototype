<!--
  TrialCountdownHero — active/grace trial hero: ribbon + shadow earnings (live,
  frozen in grace), 4-cell countdown, full-cycle progress bar, start/end dates.
  Grace renders as the stopped state (warning tint + dimmed earnings, spec
  FEAT-TRIAL02 ⑤). Driven by `now` (page ticker) + the free-trial boundaries
  passed in as props.
-->
<template>
  <view class="relative overflow-hidden" :style="cardStyle">
    <view class="flex items-center justify-between">
      <text :style="ribbonStyle">{{ ribbon }}</text>
      <text :style="boxNameStyle">NexGridBox S1</text>
    </view>

    <!-- Shadow earnings -->
    <view class="flex items-baseline" style="gap: 6px; margin-top: 12px">
      <text :style="dollarStyle">$</text>
      <text :style="shadowUsdStyle">{{ shadowUSD.toFixed(2) }}</text>
      <text :style="shadowNexStyle">+ {{ shadowNEX.toLocaleString() }} NEX</text>
    </view>
    <text class="block" :style="ctaLineStyle">{{ cta }}</text>

    <!-- Countdown -->
    <view class="grid grid-cols-4" style="gap: 8px; margin-top: 16px">
      <Cell :n="days" unit="d" />
      <Cell :n="hours" unit="h" />
      <Cell :n="minutes" unit="m" />
      <Cell :n="seconds" unit="s" />
    </view>

    <!-- Progress bar -->
    <view :style="barTrackStyle">
      <view :style="barFillStyle" />
    </view>
    <view class="flex items-center justify-between" :style="datesRowStyle">
      <text>{{ startDateLine }}</text>
      <text>{{ endDateLine }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import Cell from "@/components/me/trial-time-cell.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { useTrialConfig } from "@/store/trial-config";
import type { TrialStatus } from "@/store/free-trial";

const props = defineProps<{
  status: TrialStatus;
  now: number;
  remainingMs: number;
  shadowUSD: number;
  shadowNEX: number;
  startedAt: number | null;
  expiresAt: number | null;
  graceEndsAt: number | null;
}>();

const t = useT();
const cfg = computed(() => useTrialConfig().config);

const days = computed(() => Math.floor(props.remainingMs / 86_400_000));
const hours = computed(() => Math.floor((props.remainingMs % 86_400_000) / 3_600_000));
const minutes = computed(() => Math.floor((props.remainingMs % 3_600_000) / 60_000));
const seconds = computed(() => Math.floor((props.remainingMs % 60_000) / 1000));

const totalMs = computed(() => (cfg.value.trialDays + cfg.value.graceDays) * 86_400_000);
const elapsedMs = computed(() => (props.startedAt !== null ? props.now - props.startedAt : 0));
const progressPct = computed(() => Math.min(100, Math.max(0, (elapsedMs.value / totalMs.value) * 100)));

const w = computed(() => t.value.trial);
const tint = computed(() => {
  if (props.status === "active") return "var(--v5-brand)";
  if (props.status === "grace") return "var(--v5-warning)";
  return "var(--v5-ink-4)";
});
const ribbon = computed(() => {
  if (props.status === "active") return w.value.countdownActiveRibbon;
  if (props.status === "grace") return w.value.countdownGraceRibbon;
  return "";
});
const cta = computed(() => {
  if (props.status === "active") return w.value.countdownActiveCta;
  if (props.status === "grace") return w.value.countdownGraceCta;
  return "";
});

const startDateLine = computed(() =>
  fmt(w.value.countdownStart, {
    date: props.startedAt ? new Date(props.startedAt).toLocaleDateString(dateLocale()) : w.value.countdownDateEmpty,
  }),
);
const endDateLine = computed(() =>
  fmt(w.value.countdownEnd, {
    date: props.graceEndsAt ? new Date(props.graceEndsAt).toLocaleDateString(dateLocale()) : w.value.countdownDateEmpty,
  }),
);

const cardStyle: CSSProperties = { borderRadius: "16px", border: "1px solid var(--v5-border)", background: "var(--v5-surface)", padding: "20px" };
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
const dollarStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "15px", fontWeight: 500, color: "var(--v5-ink-3)", opacity: 0.75 };
// Grace = stopped: the frozen figure dims to read as "no longer accruing".
const shadowUsdStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "34px",
  fontWeight: 600,
  letterSpacing: "-0.024em",
  color: props.status === "grace" ? "var(--v5-ink-3)" : "var(--v5-ink)",
}));
const shadowNexStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "13px", color: "var(--v5-tech-cyan)", marginLeft: "6px" };
const ctaLineStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-3)" };
const barTrackStyle: CSSProperties = { marginTop: "16px", height: "6px", borderRadius: "999px", background: "var(--v5-surface-3)", overflow: "hidden" };
const barFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${progressPct.value}%`,
  background: tint.value,
  transition: "width 500ms ease",
}));
const datesRowStyle: CSSProperties = { marginTop: "6px", fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", color: "var(--v5-ink-4)" };
</script>
