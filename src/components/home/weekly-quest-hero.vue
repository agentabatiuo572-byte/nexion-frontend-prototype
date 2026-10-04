<!-- Weekly Tier 1 is rendered and claimed only from the authenticated server projection. -->
<template>
  <view v-if="visible" class="mt-3">
    <view class="nx-glass-card relative overflow-hidden" :style="cardStyle">
      <!-- top edge accent line — warning amber sweep -->
      <view aria-hidden :style="accentLineStyle" />
      <!-- soft top-right radial wash -->
      <view aria-hidden :style="washStyle" />

      <view class="relative">
        <!-- mono 11/500 label — warning accent -->
        <view class="inline-flex items-center" :style="labelStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
          <text>{{ w.heroLabel }}</text>
          <text v-if="quest" :style="categoryStyle">{{ categoryText }}</text>
          <text v-if="quest" :style="periodStyle">{{ periodText }}</text>
        </view>

        <!-- Card title h-md 18 / 600 ink -->
        <text class="block" :style="titleStyle">{{ titleText }}</text>
        <!-- Body 12.5 ink-3 -->
        <text class="block" :style="bodyStyle">{{ bodyText }}</text>
        <text v-if="quest && wq.error && wq.claimErrorQuestCode === quest.questCode" class="block" role="status" :style="claimErrorStyle">{{ claimErrorText }}</text>

        <view class="mt-3 flex items-center justify-between" style="gap: 10px">
          <view class="flex items-baseline" style="gap: 4px">
            <!-- Page H1 24 / 600 warning amber + tabular -->
            <text class="tabular-nums" :style="rewardStyle">+{{ rewardDisplay }}</text>
            <text :style="nexUnitStyle">NEX</text>
            <text v-if="mult > 1" class="inline-flex items-center" :style="promoChipStyle">{{ promoChipText }}</text>
          </view>

          <!-- primary h-md pill warning amber (quest accent) -->
          <!-- 🔴 目标业务已暂停时,CTA 不能还是「去完成」(zentao #127/#155)。
               此前只有 onClick 被 questTargetClosed 挡住,标签、琥珀色 pill 和
               role=button/tabindex=0 全都照旧 —— 用户看到的仍是一个可点的进行中任务,
               点下去却什么也不发生,而任务卡还挂着倒计时。conversion-banner(首页周任务卡)
               早就这么做:停用态改文案、撤 role/tabindex 并置灰。这里对齐同一形态。 -->
          <view
            v-if="!completed"
            class="inline-flex items-center shrink-0"
            :class="questTargetClosed ? 'opacity-60' : 'active:opacity-85'"
            :role="questTargetClosed ? undefined : 'button'"
            :tabindex="questTargetClosed ? -1 : 0"
            :aria-disabled="questTargetClosed ? 'true' : 'false'"
            :style="questTargetClosed ? closedCtaStyle : ctaStyle"
            @click="onCta"
          >
            <text>{{ questTargetClosed ? w.targetClosed : ctaText }}</text>
            <svg v-if="!questTargetClosed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
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
import { genesisBlockIsKnownUnavailable } from "@/store/genesis-config";
import { questTargetBusiness, unclaimableBusinessQuests, questBusinessContractViolation, type QuestTargetAvailability } from "@/lib/quest-business-availability";
import { useQuestTargetAvailability } from "@/composables/use-quest-target-availability";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { useNow } from "@/composables/use-now";
import { isCurrentQuest } from "@/lib/actionable-quest";
import { toast } from "@/store/ui";
import { weeklyQuestDisplayName } from "@/lib/quest-presentation";

const t = useT();
const locale = useLocaleStore();
const w = computed(() => t.value.weeklyQuest);
const wq = useWeeklyQuest();
const nowTick = useNow();

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

// 质押 / 兑换不可用时派了对应任务 —— 同一套纪律:只报警,不过滤(#127 / #155)。
// 独立于上面那条 watch:那条的接线由 selfcheck-quest-genesis-tripwire 的数据流判据看着,
// 把新判据塞进同一个回调会把它的变异锚点挪走(判据失锚 = 门空转),两件事本就互不相干。
const targetAvailability = useQuestTargetAvailability();
watch(
  [() => wq.snapshot, genesisBlock, targetAvailability],
  ([snap, block, availability]) => {
    const resolved = { ...availability, genesisBlocked: genesisBlockIsKnownUnavailable(block) };
    const offenders = unclaimableBusinessQuests(snap?.quests ?? [], resolved);
    if (offenders.length > 0) console.error(questBusinessContractViolation(offenders, resolved));
  },
  { immediate: true },
);

onMounted(() => {
  void wq.refresh();
});

const quest = computed<CanonicalQuest | null>(() => wq.tier1Quests.find((q) => isCurrentQuest(q, nowTick.value * 1000)) ?? null);
const mult = computed(() => wq.multiplier);
const reward = computed(() => (quest.value ? Math.round(quest.value.rewardNex * mult.value) : 0));
const rewardDisplay = computed(() => reward.value.toLocaleString());
const completed = computed(() => !!quest.value && ["COMPLETED", "CLAIMABLE"].includes(quest.value.status));
const visible = computed(() => !!quest.value && quest.value.status !== "CLAIMED");
const periodExpired = computed(() => Date.parse(quest.value?.eligibleUntil ?? "") <= nowTick.value * 1000);

const titleText = computed(() => quest.value ? weeklyQuestDisplayName(quest.value, locale.code, t.value) : "");
const categoryText = computed(() => quest.value ? ({
  wallet: t.value.home.dayOneCatWallet,
  explore: t.value.home.dayOneCatExplore,
  recommend: t.value.home.dayOneCatRecommend,
  identity: t.value.home.dayOneCatIdentity,
  social: t.value.home.dayOneCatSocial,
})[quest.value.category] : "");
const bodyText = computed(() => quest.value?.status === "PENDING" ? w.value.progressVerified : w.value.rewardReady);
const ctaText = computed(() => wq.loading ? w.value.refreshing : w.value.goComplete);
const promoChipText = computed(() => fmt(w.value.promoChip, { mult: mult.value.toFixed(1) }));
const claimText = computed(() => fmt(w.value.claim, { n: rewardDisplay.value }));
const claimErrorText = computed(() => wq.error === "WEEKLY_QUEST_CLAIM_OUTCOME_UNKNOWN"
  ? w.value.claimOutcomeUnknown : w.value.claimFailed);
const claimErrorStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-danger)" };
const periodText = computed(() => {
  const remainingMs = Date.parse(quest.value?.eligibleUntil ?? "") - nowTick.value * 1000;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return fmt(w.value.periodEndsIn, { time: "00:00:00" });
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return fmt(w.value.periodEndsIn, { time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` });
});

/**
 * 这条 Tier-1 任务指向的业务现在整体不可用吗(BUG 127 / 155)。
 *
 * 🔴 与上面的报警器**同一份读数**(useQuestTargetAvailability + 创世闸):
 *   任务卡继续给「去完成」,就是把用户送进一个他立刻撞上的墙 —— 实测形态是
 *   四个质押方案全部「暂停售卖」、兑换页明说「已暂停兑换」,卡片还在倒计时给按钮。
 *   `genesisBlockIsKnownUnavailable` 排除 `configUnavailable`(那是「还不知道」,
 *   不是「已经关了」),所以冷启动窗口不会把 CTA 误停一层。
 */
const questTargetClosed = computed(() => {
  const q = quest.value;
  if (!q || questTargetBusiness(q) === null) return false;
  const availability: QuestTargetAvailability = {
    // 「还不知道」不等于「已经关了」:configUnavailable 属前者,不能停 CTA。
    genesisBlocked: genesisBlockIsKnownUnavailable(genesisBlock.value),
    stakingClosed: targetAvailability.value.stakingClosed,
    exchangeClosed: targetAvailability.value.exchangeClosed,
  };
  return unclaimableBusinessQuests([{ ...q, status: "PENDING" }], availability).length > 0;
});

function onCta() {
  const q = quest.value;
  if (!q || wq.loading || periodExpired.value || questTargetClosed.value) return;
  navTo(q.actionRoute);
}

async function onClaim() {
  const q = quest.value;
  if (!completed.value || !q || periodExpired.value) return;
  const claimed = await wq.claim(q);
  if (!claimed && wq.claimNotice) toast.info(t.value.questClaim[wq.claimNotice]);
}

// ── styles ──
const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  position: "relative",
  padding: "18px",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
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
const categoryStyle: CSSProperties = {
  marginLeft: "4px",
  padding: "2px 6px",
  borderRadius: "999px",
  background: "var(--v5-warning-soft)",
  color: "var(--v5-ink-3)",
  letterSpacing: "normal",
};
const periodStyle: CSSProperties = {
  marginLeft: "4px",
  color: "var(--v5-ink-4)",
  letterSpacing: "normal",
  fontVariantNumeric: "tabular-nums",
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
/** 停用态:不再用「可点的主操作」配色 —— 灰底 + 次级墨色,与 conversion-banner 同形。 */
const closedCtaStyle: CSSProperties = {
  ...ctaStyle,
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-4)",
  border: "1px solid var(--v5-border)",
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
