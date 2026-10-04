<template>
  <view class="nx-glass-card team-ledger">
    <view class="team-ledger__header">
      <text class="team-ledger__title">{{ t.teamV3.thisMonth }}</text>
      <view class="nx-team-commissions-link team-ledger__details" role="link" tabindex="0" @click="goCommissions">
        <text>{{ t.teamV3.viewDetails }}</text>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
      </view>
    </view>
    <text class="team-ledger__amount tabular-nums">{{ '$' + monthUSDT.toFixed(2) }}</text>
    <text class="team-ledger__nex tabular-nums">+ {{ monthNEX.toLocaleString() }} NEX</text>
    <text class="team-ledger__lifetime">{{ t.teamV3.lifetime }} ${{ totalUSDTLifetime.toFixed(2) }} · {{ contributors }} {{ t.teamV3.contributors }}</text>

    <view class="team-ledger__bar" aria-hidden="true">
      <view :style="{ width: directPct + '%', background: 'var(--v5-brand)' }" />
      <view :style="{ width: extendedPct + '%', background: 'var(--v5-brand-2)' }" />
    </view>
    <view class="team-ledger__split">
      <view>
        <view class="team-ledger__label"><view class="team-ledger__dot" /><text>{{ t.teamV3.directLabel }} · {{ directPct }}%</text></view>
        <text class="team-ledger__value tabular-nums">${{ directUSDT.toFixed(2) }}</text>
      </view>
      <view>
        <view class="team-ledger__label"><view class="team-ledger__dot team-ledger__dot--extended" /><text>{{ t.teamV3.extendedLabel }} · {{ extendedPct }}%</text></view>
        <text class="team-ledger__value tabular-nums">${{ extendedUSDT.toFixed(2) }}</text>
      </view>
    </view>
    <view class="team-ledger__settlement">
      <view><text>{{ t.teamV3.settled }}</text><text class="tabular-nums">${{ unlockedUSDT.toFixed(2) }}</text></view>
      <view><text>{{ t.teamV3.coolingDown }}</text><text class="tabular-nums">${{ coolingUSDT.toFixed(2) }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
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
const splitTotal = computed(() => Math.max(0, props.directUSDT + props.extendedUSDT));
const directPct = computed(() => splitTotal.value === 0 ? 0 : Math.round((props.directUSDT / splitTotal.value) * 100));
const extendedPct = computed(() => splitTotal.value === 0 ? 0 : 100 - directPct.value);

function goCommissions() {
  navTo("/pages/team/commissions");
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
  fontSize: "44px",
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

<style scoped>
.team-ledger { padding: 8px 20px 16px; }
.team-ledger__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.team-ledger__title { font-size: 15px; font-weight: 600; }
.team-ledger__details { display: flex; align-items: center; justify-content: flex-end; gap: 5px; min-height: 44px; color: var(--v5-ink-3); font-size: 12px; flex-shrink: 0; }
.team-ledger__details:active { opacity: .7; }
.team-ledger__details:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-ledger__amount { display: block; font-family: var(--font-v5); font-size: 34px; line-height: 1.1; font-weight: 600; letter-spacing: -.03em; overflow-wrap: anywhere; }
.team-ledger__nex { display: block; font-size: 13px; line-height: 18px; font-weight: 500; color: var(--v5-tech-cyan-ink); overflow-wrap: anywhere; }
.team-ledger__lifetime { display: block; margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); }
.team-ledger__bar { display: flex; height: 6px; margin-top: 8px; border-radius: 999px; overflow: hidden; background: var(--v5-surface-2); }
.team-ledger__bar > view { height: 100%; }
.team-ledger__split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 12px; }
.team-ledger__split > view { min-width: 0; }
.team-ledger__label { display: flex; align-items: center; gap: 7px; font-size: 12px; line-height: 1.4; color: var(--v5-ink-3); }
.team-ledger__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--v5-brand); }
.team-ledger__dot--extended { background: var(--v5-brand-2); }
.team-ledger__value { display: block; margin: 2px 0 0 15px; font-size: 20px; font-weight: 600; line-height: 1.1; overflow-wrap: anywhere; }
.team-ledger__settlement { margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--v5-border); display: flex; flex-direction: column; }
.team-ledger__settlement > view { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-size: 13px; line-height: 1.5; color: var(--v5-ink-3); }
.team-ledger__settlement .tabular-nums { color: var(--v5-ink); text-align: right; overflow-wrap: anywhere; min-width: 0; }
</style>
