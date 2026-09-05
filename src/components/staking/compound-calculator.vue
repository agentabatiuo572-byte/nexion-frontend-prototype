<!--
  CompoundCalculator — single vs compound payout comparison (staking/page.tsx
  CompoundCalculator). Amount input + term selector (inline 4-segment pills, the
  source segmented control) + two scroll-grow bars + a footnote nudging toward
  re-staking. Uses stakingV3.calc i18n. Bars use useScrollGrowProgress (P-019
  $el-safe).
-->
<template>
  <view class="relative overflow-hidden" :style="cardStyle">
    <!-- aurora + grid -->
    <view aria-hidden class="gen-anim" :style="auroraStyle" />
    <view aria-hidden :style="gridStyle" />

    <view class="relative">
      <!-- meta-row -->
      <view class="flex items-center justify-between" style="margin-bottom: 14px">
        <text class="inline-flex items-center" :style="headStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
          <text>{{ w.label }}</text>
        </text>
        <text class="tabular-nums" :style="apyChipStyle">{{ apy * 100 }}% · {{ term }}d</text>
      </view>

      <!-- Input row -->
      <view class="flex items-baseline" style="gap: 8px">
        <text :style="dollarStyle">$</text>
        <input class="flex-1 min-w-0 tabular-nums" :style="inputStyle" type="text" inputmode="decimal" :value="amount" @input="onAmountInput" />
      </view>

      <!-- Term selector (inline segmented) -->
      <view class="grid grid-cols-4" :style="segWrapStyle">
        <view v-for="(tm, i) in terms" :key="tm" class="active:opacity-70 transition-opacity" :style="segPillStyle(i === termIdx)" role="button" tabindex="0" @click="termIdx = i">
          <text>{{ tm }}d</text>
        </view>
      </view>

      <template v-if="amountNum > 0">
        <text class="block" :style="periodLabelStyle">{{ fmt(t.uiChrome.afterDays, { n: 365 }) }}</text>

        <!-- Single bar -->
        <view class="flex items-center" style="margin-top: 8px; gap: 10px">
          <view ref="singleBarRef" class="flex-1 relative overflow-hidden" :style="barTrackStyle">
            <view :style="singleFillStyle" />
            <text class="block absolute flex items-center" :style="barLabelStyle">{{ w.singlePayout }}</text>
          </view>
          <view class="text-right" style="min-width: 88px">
            <text class="block tabular-nums" :style="barAmtStyle('var(--v5-ink)')">${{ singleText }}</text>
            <text class="block tabular-nums" :style="barDeltaStyle">+${{ singleProfitText }}</text>
          </view>
        </view>

        <!-- Compound bar -->
        <view class="flex items-center" style="margin-top: 8px; gap: 10px">
          <view ref="compoundBarRef" class="flex-1 relative overflow-hidden" :style="barTrackStyle">
            <view :style="compoundFillStyle" />
            <text class="block absolute flex items-center" :style="barLabelStyle">{{ compoundLabel }}</text>
          </view>
          <view class="text-right" style="min-width: 88px">
            <text class="block tabular-nums" :style="barAmtStyle('var(--v5-brand)')">${{ compoundText }}</text>
            <text class="block tabular-nums" :style="barDeltaStyle">+${{ compoundProfitText }}</text>
          </view>
        </view>

        <!-- Footnote nudging toward re-staking -->
        <view v-if="extraFromCompounding > 0" class="tabular-nums" :style="footnoteStyle">
          <text style="color: var(--v5-brand); font-weight: 500">+${{ extraText }}</text>
          <!-- 分隔空格显式拼在表达式里,不藏在词典值的前导空格里(不可见契约,trim 型格式化会静默吃掉);
               也不能只在模板里打一个空格 —— Vue 的空白折叠会把标签边上的空白删掉(实景实测粘成 `+$550来自复投`)。 -->
          <text>{{ " " + fmt(t.stakingV3.calc.compoundSuffix, { n: cycles }) }}</text>
        </view>
      </template>

      <text class="block" :style="disclaimerStyle">{{ w.disclaimer }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { STAKING_APY, type StakingTerm } from "@/store/staking";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

const t = useT();
const w = computed(() => t.value.stakingV3.calc);

const terms: StakingTerm[] = [30, 90, 180, 365];
const amount = ref("1000");
const termIdx = ref(2); // default 180d

const term = computed(() => terms[termIdx.value]);
const amountNum = computed(() => parseFloat(amount.value) || 0);
const apy = computed(() => STAKING_APY[term.value]);
const single = computed(() => amountNum.value * (1 + (apy.value * term.value) / 365));
const singleProfit = computed(() => single.value - amountNum.value);
const cycles = computed(() => Math.floor(365 / term.value));
const compound = computed(() => {
  let c = amountNum.value;
  for (let i = 0; i < cycles.value; i++) c *= 1 + (apy.value * term.value) / 365;
  return c;
});
const compoundProfit = computed(() => compound.value - amountNum.value);
const extraFromCompounding = computed(() => compound.value - single.value);

const compoundBarPct = 100;
const singleBarPct = computed(() => (compound.value > 0 ? Math.max(20, (single.value / compound.value) * 100) : 20));

const { elRef: singleBarRef, inView: singleBarInView } = useScrollGrowProgress();
const { elRef: compoundBarRef, inView: compoundBarInView } = useScrollGrowProgress();

const singleText = computed(() => single.value.toFixed(0));
const singleProfitText = computed(() => singleProfit.value.toFixed(0));
const compoundText = computed(() => compound.value.toFixed(0));
const compoundProfitText = computed(() => compoundProfit.value.toFixed(0));
const extraText = computed(() => extraFromCompounding.value.toFixed(0));
const compoundLabel = computed(() => fmt(w.value.compoundPayout, { n: cycles.value }));

function onAmountInput(e: Event) {
  const raw = (e as unknown as { detail: { value: string } }).detail.value;
  amount.value = raw.replace(/[^0-9.]/g, "");
}

const cardStyle: CSSProperties = {
  padding: "18px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
const auroraStyle: CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-tech-cyan-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-brand-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 70% 90%, rgba(255,203,148,0.25) 0%, transparent 60%)",
  filter: "blur(8px)",
  pointerEvents: "none",
  opacity: 0.85,
  animation: "v5-aurora-drift 14s ease-in-out infinite",
};
const gridStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, var(--v5-ink) 4%, transparent) 1px, transparent 1px)," +
    "linear-gradient(to bottom, color-mix(in srgb, var(--v5-ink) 4%, transparent) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  pointerEvents: "none",
};
const headStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const apyChipStyle: CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
};
const dollarStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};
const inputStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "34px",
  fontWeight: 600,
  letterSpacing: "-0.024em",
  lineHeight: 1.1,
  color: "var(--v5-ink)",
  background: "transparent",
};
const segWrapStyle: CSSProperties = {
  marginTop: "12px",
  gap: "6px",
  padding: "4px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
};
function segPillStyle(active: boolean): CSSProperties {
  return {
    height: "34px",
    borderRadius: "8px",
    background: active ? "var(--v5-brand)" : "transparent",
    color: active ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
const periodLabelStyle: CSSProperties = {
  marginTop: "14px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  letterSpacing: "0.02em",
};
const barTrackStyle: CSSProperties = {
  height: "28px",
  borderRadius: "6px",
  background: "var(--v5-surface-2)",
};
const singleFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${singleBarInView.value ? singleBarPct.value : 0}%`,
  background: "var(--v5-ink-4)",
  borderRadius: "6px",
  transition: singleBarInView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
}));
const compoundFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${compoundBarInView.value ? compoundBarPct : 0}%`,
  background: "linear-gradient(90deg, var(--v5-brand) 0%, var(--v5-tech-cyan) 100%)",
  borderRadius: "6px",
  transition: compoundBarInView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
}));
const barLabelStyle: CSSProperties = {
  top: 0,
  bottom: 0,
  left: "12px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink)",
  fontWeight: 500,
  pointerEvents: "none",
};
function barAmtStyle(tint: string): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "15px",
    fontWeight: 600,
    color: tint,
    lineHeight: 1.1,
  };
}
const barDeltaStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-success)",
  marginTop: "1px",
};
const footnoteStyle: CSSProperties = {
  // 去线(主人 2026-08-17 全站令):总间距沿用有线时代的 12+12。
  marginTop: "24px",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
};
const disclaimerStyle: CSSProperties = {
  marginTop: "12px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  lineHeight: 1.45,
};
</script>
