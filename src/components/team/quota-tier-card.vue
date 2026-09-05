<!--
  QuotaTierCard — one gated hardware tier (ported from quota/page.tsx TierCard).
  Header (lock/check + name + stock line + UNLOCKED/LOCKED badge) → stock bar
  (scroll-grow) → unlock conditions (each a QuotaConditionBar) → perks → CTA
  (buy product if unlocked / invite to unlock otherwise). Owns the stock bar's
  scroll-grow hook here (parent maps tiers, can't call hook per-iteration).
  Condition `kind` ("invites"|"volume") drives $ formatting instead of locale
  string-matching. `${tint}10` alpha-hex → color-mix. banned hex #0F0F0F →
  var(--v5-surface). emits navigate('/pages/store/detail?id=...') for CTA.
  DECARD 2026-07-09: whitelist tier card (selection/comparison semantics) —
  fill kept, outer border dropped (filled no border, single visual difference);
  locked-state rgba-white fills → surface-2 token.
-->
<template>
  <view class="rounded-2xl" :style="cardStyle">
    <!-- header -->
    <view class="flex items-start justify-between">
      <view class="flex items-center" style="gap: 8px">
        <view class="rounded-xl grid place-items-center" :style="iconBoxStyle">
          <svg v-if="unlocked" width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="tier.tint" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </view>
        <view>
          <text class="block font-display" :style="nameStyle">{{ tier.name }}</text>
          <text class="block font-mono-tabular" :style="stockLineStyle">{{ stockLineText }}</text>
        </view>
      </view>
      <text class="font-mono-tabular" :style="badgeStyle">{{ unlocked ? t.quota.unlocked : t.quota.locked }}</text>
    </view>

    <!-- stock progress -->
    <view style="margin-top: 12px">
      <view ref="stockBarRef" class="rounded-full overflow-hidden" :style="stockTrackStyle">
        <view class="rounded-full" :style="stockFillStyle" />
      </view>
      <view class="flex items-center justify-between font-mono-tabular" :style="stockStatsStyle">
        <text>{{ fmt(t.quota.soldPct, { pct: Math.round(stockPct * 100) }) }}</text>
        <text>{{ fmt(t.quota.leftLabel, { n: stockLeft }) }}</text>
      </view>
    </view>

    <!-- conditions -->
    <view style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px">
      <text class="block font-mono-tabular" :style="unlockHeadStyle">{{ tier.unlockKind === "either" ? t.quota.unlockEither : t.quota.unlockAll }}</text>
      <view v-for="(c, i) in tier.conditions" :key="i">
        <view class="flex items-center justify-between" style="font-size: 12px; margin-bottom: 4px">
          <view class="flex items-center" style="gap: 4px">
            <svg v-if="c.current >= c.required" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
            <text :style="{ color: 'var(--v5-ink-2)' }">{{ c.label }}</text>
          </view>
          <text class="font-mono-tabular tabular-nums">
            <text :style="{ color: c.current >= c.required ? 'var(--v5-success)' : 'var(--v5-ink)' }">{{ c.kind === "volume" ? `$${c.current.toLocaleString()}` : c.current }}</text>
            <text :style="{ color: 'var(--v5-ink-3)' }"> / {{ c.kind === "volume" ? `$${c.required.toLocaleString()}` : c.required }}</text>
          </text>
        </view>
        <QuotaConditionBar :pct="Math.min(1, c.current / c.required)" :met="c.current >= c.required" :tint="tier.tint" />
      </view>
    </view>

    <!-- perks -->
    <view :style="perksWrapStyle">
      <view v-for="(p, i) in tier.perks" :key="i" class="flex items-start" style="gap: 8px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" :stroke="tier.tint" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0"><polyline points="20 6 9 17 4 12" /></svg>
        <text :style="{ fontSize: '12px', color: 'var(--v5-ink-2)' }">{{ p }}</text>
      </view>
    </view>

    <!-- CTA -->
    <view style="margin-top: 12px">
      <view v-if="unlocked" class="flex items-center justify-center active:opacity-90" :style="buyCtaStyle" role="button" tabindex="0" :aria-label="fmt(t.quota.buyCta, { name: tier.name })" @click="emit('navigate', `/pages/store/detail?id=${tier.productId}`)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
        <text :style="{ color: 'var(--v5-on-brand)' }" style="pointer-events: none">{{ fmt(t.quota.buyCta, { name: tier.name }) }}</text>
      </view>
      <view v-else class="flex items-center justify-center active:opacity-80" :style="lockedCtaStyle" role="button" tabindex="0" :aria-label="t.quota.inviteToUnlock" @click="emit('navigate', '/pages/team/team')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        <text :style="{ color: 'var(--v5-ink-2)' }" style="pointer-events: none">{{ t.quota.inviteToUnlock }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import QuotaConditionBar from "./quota-condition-bar.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

export interface QuotaCondition {
  label: string;
  current: number;
  required: number;
  kind: "invites" | "volume";
}
export interface QuotaTier {
  productId: string;
  name: string;
  price: number;
  monthlyStock: number;
  soldThisMonth: number;
  unlockKind: "either" | "all";
  conditions: QuotaCondition[];
  perks: string[];
  tint: string;
}

const props = defineProps<{ tier: QuotaTier }>();
const emit = defineEmits<{ navigate: [url: string] }>();

const t = useT();
const { elRef: stockBarRef, inView: stockBarInView } = useScrollGrowProgress();

const unlocked = computed(() => {
  const met = props.tier.conditions.map((c) => c.current >= c.required);
  return props.tier.unlockKind === "either" ? met.some(Boolean) : met.every(Boolean);
});
const stockPct = computed(() => props.tier.soldThisMonth / props.tier.monthlyStock);
const stockLeft = computed(() => props.tier.monthlyStock - props.tier.soldThisMonth);
const stockLineText = computed(() =>
  fmt(t.value.quota.priceLine, { price: props.tier.price.toLocaleString(), left: stockLeft.value, stock: props.tier.monthlyStock }),
);

// ─── styles ───
// Whitelist tier card: fill only, no border — unlocked keeps the tint-wash
// gradient as the single visual difference vs the locked plain surface.
const cardStyle = computed<CSSProperties>(() => ({
  padding: "16px",
  background: unlocked.value
    ? `linear-gradient(180deg, color-mix(in srgb, ${props.tier.tint} 10%, transparent) 0%, var(--v5-surface) 100%)`
    : "var(--v5-surface)",
}));
const iconBoxStyle = computed<CSSProperties>(() => ({
  width: "40px",
  height: "40px",
  background: unlocked.value ? `color-mix(in srgb, ${props.tier.tint} 25%, transparent)` : "var(--v5-surface-2)",
}));
const nameStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, lineHeight: 1.1, color: "var(--v5-ink)" };
const stockLineStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
const badgeStyle = computed<CSSProperties>(() => ({
  fontSize: "12px",
  letterSpacing: "0.04em",
  padding: "1px 6px",
  borderRadius: "4px",
  fontWeight: 600,
  background: unlocked.value ? `color-mix(in srgb, ${props.tier.tint} 25%, transparent)` : "var(--v5-surface-2)",
  color: unlocked.value ? props.tier.tint : "var(--v5-ink-4)",
}));

const stockTrackStyle: CSSProperties = { height: "6px", background: "var(--v5-surface-2)" };
const stockFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${stockBarInView.value ? stockPct.value * 100 : 0}%`,
  transition: stockBarInView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
  background: props.tier.tint,
}));
const stockStatsStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-3)" };

const unlockHeadStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.04em", color: "var(--v5-ink-3)" };
const perksWrapStyle: CSSProperties = {
  marginTop: "12px",
  paddingTop: "12px",
  borderTop: "1px solid var(--v5-border)",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const buyCtaStyle = computed<CSSProperties>(() => ({
  width: "100%",
  height: "44px",
  borderRadius: "999px",
  fontSize: "13px",
  fontWeight: 600,
  gap: "6px",
  background: props.tier.tint,
}));
const lockedCtaStyle: CSSProperties = {
  width: "100%",
  height: "44px",
  borderRadius: "999px",
  fontSize: "13px",
  fontWeight: 600,
  gap: "6px",
  background: "var(--v5-surface-2)",
};
</script>
