<!--
  VRankCard — ZONE 4 V-rank progress (ported from mission-control.tsx VRankCard).
  Current rank + next-rank progress bar (scroll-grow) + missing conditions + next
  NEX-reward chip (cultivationBonus; 实物奖已删,与后台 F1 同步). `missing[]` 是
  nextRankProgress 给的**结构化缺口**,措辞由 lib/v-rank-copy 按当前语言拼
  (2026-08-17 起;此前是 store 直接拼英文句子,中越界面直出英文)。
-->
<template>
  <view class="block" style="background: var(--v5-surface); border-radius: 16px; padding: 14px 16px; position: relative; overflow: hidden" @click="goRank">
    <view class="flex justify-between items-center font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">
      <text>{{ t.home.rankYourRank }}</text>
      <text style="color: var(--v5-ink-4)">{{ t.home.rankStep }} <text style="color: var(--v5-ink)">{{ myRank + 1 }}</text>/{{ totalRanks }}</text>
    </view>

    <view class="mt-1.5 flex items-baseline gap-2">
      <text style="font-family: var(--font-v5); font-weight: 600; font-size: 26px; color: var(--v5-ink); letter-spacing: -0.022em; line-height: 1">V{{ myRank }}</text>
      <text style="font-family: var(--font-v5); font-weight: 500; font-size: 15px; color: var(--v5-ink-2); letter-spacing: -0.010em">{{ myDef.title }}</text>
    </view>

    <template v-if="next">
      <view class="mt-3 flex justify-between items-baseline font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">
        <text>{{ t.home.rankNext }} · <text style="color: var(--v5-brand); font-weight: 500">V{{ next.v }} {{ next.title }}</text></text>
        <text class="tabular-nums" style="color: var(--v5-success); font-weight: 500">{{ pct }}%</text>
      </view>
      <view ref="elRef" class="mt-1.5 h-1.5 rounded-full overflow-hidden" style="background: var(--v5-surface-3)">
        <view class="h-full rounded-full" :style="barStyle" />
      </view>
      <text v-if="missing.length > 0" class="block mt-1.5 font-mono-tabular truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ missingText }}</text>
      <view v-if="rewardNex > 0" class="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style="background: var(--v5-brand-2-soft); font-size: 12px; color: var(--v5-brand-2); font-weight: 500">
        <text>🎁</text>
        <text style="color: var(--v5-brand-2)">{{ rewardText }} · {{ unlockAtText }}</text>
      </view>
    </template>
    <text v-else class="block mt-3" style="font-size: 12px; color: var(--v5-ink-3); font-family: var(--font-v5)">{{ t.home.rankTopTier }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useVRank, nextRankProgress, V_RANKS } from "@/store/v-rank";
import { rankGapText } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";

const t = useT();
const vrank = useVRank();
const { elRef, inView } = useScrollGrowProgress();

const myRank = computed(() => vrank.myRank);
const totalRanks = V_RANKS.length;
const myDef = computed(() => V_RANKS[myRank.value]);
const rankInfo = computed(() => nextRankProgress(vrank));
const next = computed(() => rankInfo.value.next);
const pct = computed(() => Math.round(rankInfo.value.progressPct * 100));
const missing = computed(() => rankInfo.value.missing);
const isZh = computed(() => useLocaleStore().code === "zh");
const missingText = computed(() => missing.value.map((g) => rankGapText(t.value, g, isZh.value, vrank.ladder)).join(" · "));
const unlockAtText = computed(() => (next.value ? fmt(t.value.home.rankUnlockAt, { n: next.value.v }) : ""));
// 实物奖已删 → 改展示下一阶的 NEX 培育奖(cultivationBonus);为 0 时不显示 chip
const rewardNex = computed(() => next.value?.cultivationBonus ?? 0);
const rewardText = computed(() => fmt(t.value.home.rankReward, { n: rewardNex.value.toLocaleString() }));

const barStyle = computed<CSSProperties>(() => ({
  width: `${inView.value ? pct.value : 0}%`,
  transition: inView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
  background: "linear-gradient(90deg, var(--v5-brand), var(--v5-success))",
}));

function goRank() {
  uni.navigateTo({ url: "/pages/team/rank", fail: () => {} });
}
</script>
