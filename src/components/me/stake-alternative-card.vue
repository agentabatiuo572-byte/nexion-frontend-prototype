<!--
  StakeAlternativeCard — ported from me/wallet/withdraw/page.tsx StakeAlternativeCard.
  Reverse-talk card: shows what the withdrawal amount would become if staked
  instead (30/90/180-day USDT lockup APYs 12% / 35% / 80% — matched to the
  /staking destination page, per the source's Round-7 mismatch fix). 3 tier cells
  + headline + "Stake for +$delta in {days} days" CTA → /staking.
-->
<template>
  <view class="mx-4 mt-3 relative overflow-hidden" :style="cardStyle">
    <view aria-hidden :style="washStyle" />
    <view class="relative">
      <view class="flex items-center" :style="labelStyle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 3 1.9 4.6L16 9.5l-4.6 1.9L9.5 16l-1.9-4.6L3 9.5l4.6-1.9z" /></svg>
        <text style="margin-left: 6px">{{ w.label }}</text>
      </view>
      <text class="block" style="font-size: 13px; color: var(--v5-ink); line-height: 1.55">{{ headlineText }}</text>

      <view class="grid grid-cols-3" style="gap: 8px; margin-top: 14px">
        <view v-for="tier in tiers" :key="tier.days" class="text-center" :style="tierCellStyle(tier.tone)">
          <text class="block font-mono-tabular" :style="tierLabelStyle(tier.tone)">{{ tierLabelText(tier.days) }}</text>
          <text class="block tabular-nums" :style="tierValueStyle">${{ tierValue(tier).toFixed(0) }}</text>
          <text class="block tabular-nums" :style="tierDeltaStyle(tier.tone)">+${{ tierDelta(tier).toFixed(0) }}</text>
        </view>
      </view>

      <view class="flex items-center justify-between w-full active:opacity-85" :style="ctaStyle" @click="goStaking">
        <text>{{ ctaText }}</text>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
    <text class="block" style="margin-top: 8px; font-size: 12px; color: var(--v5-ink-4); line-height: 1.375">{{ w.disclaimer }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { STAKING_APY } from "@/store/staking";

const props = defineProps<{ amountNum: number }>();
const t = useT();
const w = computed(() => t.value.walletV3.stakeAlt);

type Tone = "ok" | "warn" | "hot";
// APY 读质押主表单源(STAKING_APY),不再硬编码镜像 —— 防主表调档后此卡漂移。
// (核查表「5/12/20」为误报:Round-7 已手动 matched 到 12/35/80,此处进一步焊单源根治。)
const tiers: Array<{ days: number; apy: number; tone: Tone }> = [
  { days: 30, apy: STAKING_APY[30], tone: "ok" },
  { days: 90, apy: STAKING_APY[90], tone: "warn" },
  { days: 180, apy: STAKING_APY[180], tone: "hot" },
];
const peak = tiers[tiers.length - 1];
const peakValue = computed(() => props.amountNum * (1 + (peak.apy * peak.days) / 365));
const peakDelta = computed(() => peakValue.value - props.amountNum);

const headlineText = computed(() =>
  fmt(w.value.headline, {
    amount: `$${props.amountNum.toFixed(2)}`,
    peak: `$${peakValue.value.toFixed(2)}`,
    days: peak.days,
  }),
);
const ctaText = computed(() => fmt(w.value.cta, { delta: `$${peakDelta.value.toFixed(0)}`, days: peak.days }));
function tierLabelText(days: number): string {
  return fmt(w.value.tierLabel, { n: days });
}
function tierValue(tier: { days: number; apy: number }): number {
  return props.amountNum * (1 + (tier.apy * tier.days) / 365);
}
function tierDelta(tier: { days: number; apy: number }): number {
  return tierValue(tier) - props.amountNum;
}
function toneColor(tone: Tone): string {
  return tone === "ok" ? "var(--v5-ink-3)" : tone === "warn" ? "var(--v5-warning)" : "var(--v5-brand)";
}

function goStaking() {
  uni.navigateTo({ url: "/pages/staking/staking", fail: () => {} });
}

// ── styles ──
const cardStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "16px",
  background: "var(--v5-surface)",
  border: "1px solid var(--v5-border)",
};
const washStyle: CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background:
    "radial-gradient(45% 55% at 85% 15%, var(--v5-brand-2-soft) 0%, transparent 60%), radial-gradient(35% 45% at 15% 90%, var(--v5-success-soft) 0%, transparent 60%)",
  filter: "blur(8px)",
  pointerEvents: "none",
  opacity: 0.85,
};
const labelStyle: CSSProperties = {
  gap: "6px",
  marginBottom: "10px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
  letterSpacing: "0.06em",
};
function tierCellStyle(tone: Tone): CSSProperties {
  const c = toneColor(tone);
  return {
    padding: "10px",
    borderRadius: "10px",
    background: `color-mix(in oklab, ${c} 12%, transparent)`,
    border: `1px solid color-mix(in oklab, ${c} 30%, transparent)`,
  };
}
function tierLabelStyle(tone: Tone): CSSProperties {
  return {
    fontSize: "12px",
    fontWeight: 500,
    color: toneColor(tone),
    letterSpacing: "0.06em",
  };
}
const tierValueStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
function tierDeltaStyle(tone: Tone): CSSProperties {
  return {
    marginTop: "2px",
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    color: toneColor(tone),
  };
}
const ctaStyle: CSSProperties = {
  marginTop: "14px",
  padding: "0 18px",
  height: "50px",
  borderRadius: "999px",
  background: "var(--v5-brand-2)",
  boxShadow: "var(--v5-spotlight-brand-2)",
  color: "var(--v5-on-brand-2)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
</script>
