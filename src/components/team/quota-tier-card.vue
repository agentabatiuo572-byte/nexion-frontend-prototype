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
  <view class="nx-glass-card rounded-2xl" :style="cardStyle">
    <!-- header -->
    <view class="flex items-start justify-between">
      <view class="flex items-center" style="gap: 8px">
        <view class="rounded-xl grid place-items-center" :style="iconBoxStyle">
          <svg v-if="unlocked" width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="tier.tint" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </view>
        <view>
          <text class="block font-display" :style="nameStyle">{{ displayName }}</text>
          <text class="block font-mono-tabular" :style="stockLineStyle">{{ priceLineText }}</text>
        </view>
      </view>
      <text class="font-mono-tabular" :style="badgeStyle">{{ unlocked ? t.quota.unlocked : t.quota.locked }}</text>
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
      <view v-if="unlocked && stockLeft > 0 && tier.available !== false" class="flex items-center justify-center active:opacity-90" :style="buyCtaStyle" role="button" tabindex="0" :aria-label="fmt(t.quota.buyCta, { name: displayName })" @click="emit('navigate', `/pages/store/detail?id=${tier.productId}`)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
        <text :style="{ color: 'var(--v5-on-brand)' }" style="pointer-events: none">{{ fmt(t.quota.buyCta, { name: displayName }) }}</text>
      </view>
      <view v-else-if="stockLeft <= 0 || tier.available === false" class="flex items-center justify-center" :style="lockedCtaStyle" aria-disabled="true">
        <text>{{ t.quota.stockUnavailable }}</text>
      </view>
      <view v-else class="flex items-center justify-center active:opacity-80" :style="lockedCtaStyle" role="button" tabindex="0" :aria-label="t.store.purchaseEligibilityIneligible" @click="emit('navigate', `/pages/store/detail?id=${tier.productId}`)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        <text :style="{ color: 'var(--v5-ink-2)' }" style="pointer-events: none">{{ t.store.purchaseEligibilityIneligible }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import QuotaConditionBar from "./quota-condition-bar.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { nexGridBrandText } from "@/lib/brand-copy";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

export interface QuotaCondition {
  label: string;
  current: number;
  required: number;
  kind: "invites" | "volume";
}
export interface QuotaTier {
  available?: boolean;
  productId: string;
  name: string;
  price: number;
  monthlyStock: number;
  soldThisMonth: number;
  unlockKind: "either" | "all";
  conditions: QuotaCondition[];
  perks: string[];
  tint: string;
  /**
   * 年化 ROI 的**推导输入**。zentao #221:此前只写「约 N% 年化(按美元日收益/售价)」,
   * 而参与计算的两个数(美元日收益、售价)页面上一分都没露 —— 用户复核不了比例来源。
   * 目录读到时由页面填上;缺失(旧服务端/目录未落地)则整行不渲染,而不是显示占位 0。
   */
  roiBasis?: { dailyEarn: number; price: number; roi: number; revision?: string | null };
}

const props = defineProps<{ tier: QuotaTier }>();
const emit = defineEmits<{ navigate: [url: string] }>();

const t = useT();
const displayName = computed(() => nexGridBrandText(props.tier.name));
const { elRef: stockBarRef, inView: stockBarInView } = useScrollGrowProgress();

const unlocked = computed(() => {
  const met = props.tier.conditions.map((c) => c.current >= c.required);
  return props.tier.unlockKind === "either" ? met.some(Boolean) : met.every(Boolean);
});
const stockPct = computed(() => props.tier.monthlyStock > 0 ? Math.min(1, props.tier.soldThisMonth / props.tier.monthlyStock) : 1);
const stockLeft = computed(() => Math.max(0, props.tier.monthlyStock - props.tier.soldThisMonth));
const priceLineText = computed(() =>
  fmt(t.value.quota.priceLine, { price: props.tier.price.toLocaleString() }),
);

// ─── styles ───
// Whitelist tier card: fill only, no border — unlocked keeps the tint-wash
// gradient as the single visual difference vs the locked plain surface.
const cardStyle = computed<CSSProperties>(() => ({ borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  padding: "16px",
  background: "var(--nx-glass-fill)",
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

const roiBasisWrapStyle: CSSProperties = {
  marginTop: "10px",
  paddingTop: "10px",
  borderTop: "1px solid var(--v5-border)",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};
const roiBasisStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-2)" };
const roiNoteStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5 };

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
