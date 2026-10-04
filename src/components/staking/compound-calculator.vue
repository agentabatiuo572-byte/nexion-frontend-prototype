<!--
  CompoundCalculator — single vs compound payout comparison (staking/page.tsx
  CompoundCalculator). Amount input + term selector (inline 4-segment pills, the
  source segmented control) + two scroll-grow bars + a footnote nudging toward
  re-staking. Uses stakingV3.calc i18n. Bars use useScrollGrowProgress (P-019
  $el-safe).
-->
<template>
  <view v-if="configAvailable && hasSellablePlan" class="nx-glass-card relative overflow-hidden nx-compound-calculator" :style="cardStyle">
    <CalculatorWebviewAccessibility :amount-label="w.amountLabel" />
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
        <text class="tabular-nums" :style="apyChipStyle">{{ formatStakingPercentage(apy) }}% · {{ term }}d</text>
      </view>

      <!-- Input row -->
      <view class="flex items-baseline" style="gap: 8px">
        <text :style="dollarStyle">$</text>
        <input class="flex-1 min-w-0 tabular-nums" :style="inputStyle" type="text" inputmode="decimal" :value="amount" :aria-label="w.amountLabel" @input="onAmountInput" />
      </view>

<GlassSegments semantics="radio" :model-value="term" :options="termOptions" :label="w.termLabel" @select="selectTerm" style="margin-top: 14px" />

      <template v-if="amountNum > 0">
        <!-- Single bar -->
        <view class="flex items-center" style="margin-top: 8px; gap: 10px">
          <view ref="singleBarRef" class="flex-1 relative overflow-hidden" :style="barTrackStyle">
            <view :style="singleFillStyle" />
            <text class="block absolute flex items-center" :style="barLabelStyle">{{ singleLabel }}</text>
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
          <text>{{ " " + fmt(t.stakingV3.calc.compoundSuffix, { n: reinvestments }) }}</text>
        </view>
      </template>

      <text class="block" :style="disclaimerStyle">{{ w.disclaimer }}</text>
    </view>
  </view>
  <view v-else class="relative overflow-hidden" :style="unavailableStyle">
    <!-- 两种「不可计算」必须分开说:快照没到(重试可能好)vs 快照到了但全部停售(重试没用)。
         合并成一句会让停售看起来像临时故障。 -->
    <text>{{ configAvailable ? t.home.quickStakeStopped : t.staking.remoteUnavailableClosed }}</text>
  </view>
</template>

<script setup lang="ts">
import { formatStakingPercentage } from "@/lib/staking-percentage";
import CalculatorWebviewAccessibility from "./calculator-webview-accessibility.vue";
import { ref, computed, onMounted, nextTick, watch, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useStaking, STAKING_APY, STAKING_PENALTY, STAKING_MIN, type StakingTerm } from "@/store/staking";
import { canOpenStakingPool, resolveStakingPool } from "@/lib/staking-canonical";
import { compoundDurationDays, reinvestmentCount } from "@/lib/compound-cycles";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

const t = useT();
const w = computed(() => t.value.stakingV3.calc);
const staking = useStaking();
onMounted(() => {
  if (!staking.isMockMode) void staking.syncRemote();
});

const terms: StakingTerm[] = [30, 90, 180, 365];
const DEFAULT_TERM: StakingTerm = 180;
const amount = ref("1000");

const stakingState = computed(() => ({
  isMockMode: staking.isMockMode,
  remoteReady: staking.remoteReady,
  pools: staking.pools,
}));
/**
 * 当前**可售**的档位。远程档未就绪或全部停售时为空 —— 那时一个收益都不该算:
 * 拿停售档位的 APY 算出「投 $1000 赚 $395」是在为买不到的产品报价。
 */
const sellableTerms = computed(() => terms.filter((tm) => canOpenStakingPool(stakingState.value, tm)));
// 计算参数来自当前可售的服务端方案:默认 180d,它不可售时落到第一个可售档位。
const term = ref<StakingTerm>(DEFAULT_TERM);
watch(sellableTerms, (list) => {
  const [first] = list;
  if (first !== undefined && !list.includes(term.value)) term.value = first;
}, { immediate: true });

const amountNum = computed(() => parseFloat(amount.value) || 0);
const pool = computed(() => resolveStakingPool(
  stakingState.value,
  term.value,
  { apy: STAKING_APY[term.value], penalty: STAKING_PENALTY[term.value], minAmountUsdt: STAKING_MIN[term.value] },
));
const apy = computed(() => pool.value?.apy ?? 0);
const configAvailable = computed(() => pool.value !== null);
/** 至少要有一个可售档位才算得出收益;否则渲染暂停态,不报价。 */
const hasSellablePlan = computed(() => sellableTerms.value.length > 0);
const single = computed(() => amountNum.value * (1 + (apy.value * term.value) / 365));
const singleProfit = computed(() => single.value - amountNum.value);
const cycles = computed(() => Math.floor(365 / term.value));
const reinvestments = computed(() => reinvestmentCount(cycles.value));
const compoundDays = computed(() => compoundDurationDays(term.value));
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
const singleLabel = computed(() => fmt(w.value.singlePayoutDuration, { days: term.value }));
const compoundLabel = computed(() => fmt(w.value.compoundPayoutDuration, {
  reinvestments: reinvestments.value,
  days: compoundDays.value,
}));

function onAmountInput(e: Event) {
  const raw = (e as unknown as { detail: { value: string } }).detail.value;
  amount.value = raw.replace(/[^0-9.]/g, "");
}
/** 只允许选到可售档位 —— 停售档位不出现在组里,这里再挡一次(handler 内守卫)。 */
function selectTerm(next: StakingTerm): void {
  if (!sellableTerms.value.includes(next)) return;
  term.value = next;
}
/** 单选组的左右方向键:在可售档位间移一格并选上,焦点跟到新选中项(roving tabindex 的标准行为)。 */
function moveTerm(delta: number): void {
  const list = sellableTerms.value;
  const at = list.indexOf(term.value);
  const next = list[((((at < 0 ? 0 : at) + delta) % list.length) + list.length) % list.length];
  if (next === undefined) return;
  selectTerm(next);
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('.nx-compound-term[aria-checked="true"]')?.focus();
  });
}

const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "18px",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
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
// 列数跟可售档位数走(原为固定 grid-cols-4 = repeat(4, minmax(0,1fr)))。
const segWrapStyle = computed<CSSProperties>(() => ({
  marginTop: "12px",
  gap: "6px",
  padding: "4px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  gridTemplateColumns: `repeat(${sellableTerms.value.length}, minmax(0, 1fr))`,
}));
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
const unavailableStyle: CSSProperties = {
  padding: "18px",
  borderRadius: "16px",
  background: "var(--v5-warning-soft)",
  color: "var(--v5-ink-2)",
  fontSize: "13px",
};

import GlassSegments from "@/components/glass-segments.vue";
const termOptions = computed(() => sellableTerms.value.map(value => ({ value, label: `${value}d` })));
</script>
