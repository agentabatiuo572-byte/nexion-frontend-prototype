<!-- Weekly Tier 1 is rendered and claimed only from the authenticated server projection. -->
<template>
  <view v-if="visible" class="mt-3">
    <view class="relative overflow-hidden" :style="cardStyle">
      <!-- top edge accent line — warning amber sweep -->
      <view aria-hidden :style="accentLineStyle" />
      <!-- soft top-right radial wash -->
      <view aria-hidden :style="washStyle" />

      <view class="relative">
        <!-- mono 11/500 label — warning accent -->
        <view class="inline-flex items-center" :style="labelStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
          <text>{{ w.heroLabel }}</text>
        </view>

        <!-- Card title h-md 18 / 600 ink -->
        <text class="block" :style="titleStyle">{{ titleText }}</text>
        <!-- Body 12.5 ink-3 -->
        <text class="block" :style="bodyStyle">{{ bodyText }}</text>

        <view class="mt-3 flex items-center justify-between" style="gap: 10px">
          <view class="flex items-baseline" style="gap: 4px">
            <!-- Page H1 24 / 600 warning amber + tabular -->
            <text class="tabular-nums" :style="rewardStyle">+{{ rewardDisplay }}</text>
            <text :style="nexUnitStyle">NEX</text>
            <text v-if="mult > 1" class="inline-flex items-center" :style="promoChipStyle">{{ promoChipText }}</text>
          </view>

          <!-- primary h-md pill warning amber (quest accent) -->
          <view
            v-if="!completed"
            class="inline-flex items-center shrink-0 active:opacity-85"
            role="button" tabindex="0"
            :style="ctaStyle"
            @click="onCta"
          >
            <text>{{ ctaText }}</text>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </view>
          <view
            v-else
            class="inline-flex items-center shrink-0 active:opacity-85"
            role="button" tabindex="0"
            :style="claimStyle"
            @click="onClaim"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
            <text>{{ claimText }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, watch, type CSSProperties } from "vue";
import type { CanonicalQuest } from "@/api/quest-api";
import { useWeeklyQuest } from "@/store/weekly-quest";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { unclaimableGenesisQuests, genesisQuestContractViolation } from "@/lib/quest-genesis-tripwire";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const t = useT();
const w = computed(() => t.value.weeklyQuest);
const wq = useWeeklyQuest();

// 🔴 观测闸,**不是过滤器**——为什么客户端不过滤,见 lib/quest-genesis-tripwire.ts 顶部。
//   判定走唯一消费入口 useGenesisSaleGate,本文件不自判(GEN10 ④「单一派生」)。
//   代价交底:接这个 composable = 本页多持一个共享秒级时钟 + 15s 配置轮询(它自带,
//   引用计数全局共享)。绕开它自己读 config 才是真问题,GEN10 ④b 会红,也该红。
//   挂在 hero 而不是 list:hero 看得到整份 snapshot,一处接线覆盖 Tier1 + Tier2。
const { block: genesisBlock } = useGenesisSaleGate();
watch(
  [() => wq.snapshot, genesisBlock],
  ([snap, block]) => {
    const offenders = unclaimableGenesisQuests(snap?.quests ?? [], block);
    if (offenders.length > 0) console.error(genesisQuestContractViolation(offenders, block));
  },
  { immediate: true },
);

onMounted(() => {
  void wq.refresh();
});

const quest = computed<CanonicalQuest | null>(() => wq.tier1Quests[0] ?? null);
const mult = computed(() => wq.multiplier);
const reward = computed(() => (quest.value ? Math.round(quest.value.rewardNex * mult.value) : 0));
const rewardDisplay = computed(() => reward.value.toLocaleString());
const completed = computed(() => !!quest.value && ["COMPLETED", "CLAIMABLE"].includes(quest.value.status));
const visible = computed(() => !!quest.value && quest.value.status !== "CLAIMED");

const titleText = computed(() => quest.value?.name ?? "");
const bodyText = computed(() => quest.value?.status === "PENDING" ? w.value.progressVerified : w.value.rewardReady);
const ctaText = computed(() => wq.loading ? w.value.refreshing : w.value.refreshStatus);
const promoChipText = computed(() => fmt(w.value.promoChip, { mult: mult.value.toFixed(1) }));
const claimText = computed(() => fmt(w.value.claim, { n: rewardDisplay.value }));

function onCta() {
  void wq.refresh();
}

async function onClaim() {
  const q = quest.value;
  if (!completed.value || !q) return;
  await wq.claim(q);
}

// ── styles ──
const cardStyle: CSSProperties = {
  position: "relative",
  padding: "18px",
  borderRadius: "16px",
  background: "var(--v5-surface)",
};
const accentLineStyle: CSSProperties = {
  position: "absolute",
  left: "0",
  right: "0",
  top: "0",
  height: "2px",
  background: "linear-gradient(90deg, transparent, var(--v5-warning), transparent)",
  opacity: 0.7,
  pointerEvents: "none",
};
const washStyle: CSSProperties = {
  position: "absolute",
  top: "-50px",
  right: "-50px",
  width: "120px",
  height: "120px",
  borderRadius: "50%",
  background: "radial-gradient(circle, var(--v5-warning-soft), transparent 70%)",
  opacity: 0.55,
  pointerEvents: "none",
};
const labelStyle: CSSProperties = {
  gap: "6px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-warning)",
  letterSpacing: "0.06em",
};
const titleStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
  lineHeight: 1.3,
};
const bodyStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.5,
};
const rewardStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "26px",
  letterSpacing: "-0.018em",
  color: "var(--v5-nex)",
  lineHeight: 1,
};
const nexUnitStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-nex)",
  marginLeft: "2px",
};
const usdtStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-success)",
  marginLeft: "6px",
};
const promoChipStyle: CSSProperties = {
  marginLeft: "8px",
  padding: "2px 6px",
  borderRadius: "4px",
  background: "var(--v5-brand-2-soft)",
  color: "var(--v5-brand-2)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
};
const ctaStyle: CSSProperties = {
  gap: "6px",
  height: "44px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "var(--v5-warning)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
};
const claimStyle: CSSProperties = {
  gap: "6px",
  height: "44px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "linear-gradient(90deg, var(--v5-warning), var(--v5-success))",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
};
</script>
