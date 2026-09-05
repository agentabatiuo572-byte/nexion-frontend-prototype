<!--
  TeamLedgerCard — aggregate "this month" commission card: main amount,
  NEX side value, plain growth text, and open 2x2 settlement metrics.
  View-details → /team/commissions.
  i18n read directly via useT (parent passes numeric values as props).
  <div>→<view>; <span>→<text>; <Link>→<view @click>.
-->
<template>
  <view class="relative overflow-hidden" :style="rootStyle">
    <view aria-hidden="true" :style="ambientStyle" />

    <view class="relative" style="z-index: 1">
      <view class="flex items-start justify-between" style="gap: 16px">
        <view class="flex-1 min-w-0">
          <text class="block font-mono-tabular" :style="capLabelStyle">{{ t.teamV3.thisMonth }}</text>
          <text class="block" :style="lifetimeStyle">
            {{ t.teamV3.lifetime }} ${{ totalUSDTLifetime.toFixed(2) }} · {{ contributors }} {{ t.teamV3.contributors }}
          </text>
        </view>
        <view class="nx-team-commissions-link inline-flex items-center active:opacity-70" :style="detailsLinkStyle" @click="goCommissions">
          <text :style="{ fontSize: '13px', color: 'var(--v5-ink-2)' }">{{ t.teamV3.viewDetails }}</text>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </view>
      </view>

      <view :style="amountRowStyle">
        <view>
          <view class="flex items-baseline" style="gap: 6px">
            <text class="font-display tabular-nums" :style="dollarSignStyle">$</text>
            <text class="font-display tabular-nums" :style="bigNumStyle">{{ intPart.toLocaleString() }}<text :style="fracStyle">.{{ fracPart }}</text></text>
          </view>
          <text class="block font-mono-tabular" :style="nexStyle">+ {{ monthNEX.toLocaleString() }} NEX</text>
        </view>
        <view :style="growthStyle">
          <text class="font-mono-tabular">↑ +12.4%</text>
        </view>
      </view>

      <view class="grid" :style="metricGridStyle">
        <view :style="metricItemStyle(0)">
          <text class="block font-mono-tabular tabular-nums" :style="metricLabelStyle('var(--v5-brand)')">{{ t.teamV3.directLabel }} · {{ directPct }}%</text>
          <text class="block tabular-nums font-display" :style="metricValueStyle">${{ directUSDT.toFixed(2) }}</text>
        </view>
        <view :style="metricItemStyle(1)">
          <text class="block font-mono-tabular tabular-nums" :style="metricLabelStyle('var(--v5-brand-2)')">{{ t.teamV3.extendedLabel }} · {{ extendedPct }}%</text>
          <text class="block tabular-nums font-display" :style="metricValueStyle">${{ extendedUSDT.toFixed(2) }}</text>
        </view>
        <view :style="metricItemStyle(2)">
          <text class="block font-mono-tabular" :style="metricLabelStyle('var(--v5-success)')">{{ t.teamV3.settled }}</text>
          <text class="block tabular-nums font-display" :style="metricValueStyle">${{ unlockedUSDT.toFixed(2) }}</text>
        </view>
        <view :style="metricItemStyle(3)">
          <text class="block font-mono-tabular" :style="metricLabelStyle('var(--v5-brand-2)')">{{ t.teamV3.coolingDown }}</text>
          <text class="block tabular-nums font-display" :style="metricValueStyle">${{ coolingUSDT.toFixed(2) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";

const props = defineProps<{
  totalUSDTLifetime: number;
  contributors: number;
  directUSDT: number;
  extendedUSDT: number;
  monthUSDT: number;
  monthNEX: number;
  unlockedUSDT: number;
  coolingUSDT: number;
}>();

const t = useT();

const intPart = computed(() => Math.floor(props.monthUSDT));
const fracPart = computed(() => (props.monthUSDT - intPart.value).toFixed(2).slice(2));
const splitTotal = computed(() => Math.max(0.01, props.directUSDT + props.extendedUSDT));
const directPct = computed(() => Math.round((props.directUSDT / splitTotal.value) * 100));
const extendedPct = computed(() => 100 - directPct.value);

function goCommissions() {
  uni.navigateTo({ url: "/pages/team/commissions", fail: () => {} });
}

// ─── styles ───
const rootStyle: CSSProperties = {
  padding: "24px 22px",
  background:
    "radial-gradient(80% 70% at 92% 2%, color-mix(in srgb, var(--v5-tech-cyan) 13%, transparent) 0%, transparent 60%), radial-gradient(70% 70% at 0% 100%, color-mix(in srgb, var(--v5-brand) 12%, transparent) 0%, transparent 62%), var(--v5-surface)",
  borderRadius: "18px",
};
const ambientStyle: CSSProperties = {
  position: "absolute",
  inset: "0",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--v5-ink) 3%, transparent), transparent 42%)",
  pointerEvents: "none",
  opacity: 0.9,
};
const capLabelStyle: CSSProperties = {
  fontSize: "13px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--v5-ink-3)",
};
const detailsLinkStyle: CSSProperties = {
  minHeight: "44px",
  gap: "4px",
  alignItems: "center",
  justifyContent: "flex-end",
  paddingLeft: "8px",
};
const dollarSignStyle: CSSProperties = {
  fontWeight: 500,
  fontSize: "20px",
  color: "var(--v5-ink-2)",
  opacity: 0.75,
};
const bigNumStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: "50px",
  letterSpacing: "-0.03em",
  lineHeight: 1,
  color: "var(--v5-brand)",
  whiteSpace: "nowrap",
};
const fracStyle: CSSProperties = { color: "var(--v5-ink-2)", fontSize: "26px", fontWeight: 500 };
const nexStyle: CSSProperties = { marginTop: "8px", fontSize: "15px", color: "var(--v5-brand)" };
const lifetimeStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.4,
};
const amountRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "18px",
  marginTop: "28px",
};
const growthStyle: CSSProperties = {
  paddingBottom: "8px",
  color: "var(--v5-success-ink)",
  fontSize: "15px",
  fontWeight: 600,
};
const metricGridStyle: CSSProperties = {
  marginTop: "28px",
  paddingTop: "20px",
  borderTop: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)",
  gridTemplateColumns: "1fr 1fr",
  gap: "0",
};
function metricItemStyle(index: number): CSSProperties {
  return {
    minHeight: "86px",
    paddingTop: index < 2 ? "0" : "18px",
    paddingRight: index % 2 === 0 ? "18px" : "0",
    paddingBottom: index < 2 ? "18px" : "0",
    paddingLeft: index % 2 === 1 ? "18px" : "0",
    borderRight: index % 2 === 0 ? "1px solid color-mix(in srgb, var(--v5-border) 58%, transparent)" : "none",
    borderBottom: index < 2 ? "1px solid color-mix(in srgb, var(--v5-border) 58%, transparent)" : "none",
  };
}
function metricLabelStyle(color: string): CSSProperties {
  return {
    fontSize: "13px",
    letterSpacing: "0.01em",
    color,
    lineHeight: 1.35,
  };
}
const metricValueStyle: CSSProperties = {
  marginTop: "9px",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.016em",
  color: "var(--v5-ink)",
  lineHeight: 1.2,
};
</script>
