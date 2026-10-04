<!-- Weekly Tier 2 is server-authoritative; pending rows use PC-configured routes. -->
<template>
  <view v-if="mounted && wq.error && !wq.snapshot" class="nx-glass-card mx-4 mt-3 px-4 py-3 active:opacity-70" :style="cardStyle" role="button" tabindex="0" @click="retry">
    <text :style="pendingLabelStyle">{{ w.loadError }}</text>
  </view>
  <view v-else-if="mounted && !wq.snapshot" class="nx-glass-card mx-4 mt-3 px-4 py-3" :style="cardStyle">
    <text :style="pendingLabelStyle">{{ w.loading }}</text>
  </view>
  <view v-else-if="mounted" class="nx-glass-card mx-4 mt-3 overflow-hidden" :style="cardStyle">
    <!-- Header -->
    <view class="px-4 py-3 flex items-center justify-between" :style="headerStyle">
      <text :style="tier2LabelStyle">{{ w.tier2Label }}</text>
      <view style="text-align: right">
        <text class="block tabular-nums" :style="countStyle">{{ progressText }}</text>
        <text v-if="tier2Quests[0]" class="block tabular-nums" :style="periodStyle">{{ periodText }}</text>
      </view>
    </view>

    <view v-if="wq.error && !wq.claimErrorQuestCode" class="px-4 py-2 active:opacity-70" role="button" tabindex="0" :style="refreshErrorStyle" @click="retry">
      <text>{{ w.refreshError }}</text>
    </view>

    <!-- Quest rows -->
    <view>
      <view v-for="(q, i) in tier2Quests" :key="`${q.questCode}:${q.instanceKey}`" :style="{ borderBottom: i === tier2Quests.length - 1 ? 'none' : '1px solid var(--v5-border)' }">
        <!-- claimed: struck-through done -->
        <view v-if="isClaimed(q)" class="flex items-center px-4 py-3" :style="claimedRowStyle">
          <view class="grid place-items-center shrink-0" :style="checkBoxStyle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </view>
          <view class="flex-1">
            <text class="block" :style="claimedLabelStyle">{{ titleOf(q) }}</text>
            <text class="block" :style="categoryLabelStyle">{{ t.questClaim.alreadyClaimed }}</text>
          </view>
          <text :style="claimedRewardStyle">+{{ rewardOf(q) }} NEX</text>
        </view>

        <!-- completed: claimable button -->
        <view v-else-if="isCompleted(q)" class="flex items-center px-4 py-3 active:opacity-80" role="button" tabindex="0" :style="completedRowStyle" @click="onClaimRow(q)">
          <view class="grid place-items-center shrink-0" :style="sparkBoxStyle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
          </view>
          <view class="flex-1">
            <text class="block" :style="pendingLabelStyle">{{ titleOf(q) }}</text>
            <text class="block" :style="categoryLabelStyle">{{ w.rewardReady }}</text>
            <text v-if="wq.error && wq.claimErrorQuestCode === q.questCode" class="block" role="status" :style="claimErrorStyle">{{ claimErrorText }}</text>
          </view>
          <text :style="claimRewardStyle">{{ claimTextFor(q) }}</text>
        </view>

        <!-- pending: navigate to target route -->
        <view v-else class="flex items-center px-4 py-3" :class="rowInactive(q) ? 'opacity-50' : 'active:opacity-80'" :role="rowInactive(q) ? undefined : 'button'" :tabindex="rowInactive(q) ? -1 : 0" :aria-disabled="rowInactive(q)" :style="pendingRowStyle" @click="onRowCta(q)">
          <view class="grid place-items-center shrink-0" :style="numberBoxStyle">
            <text>{{ i + 1 }}</text>
          </view>
          <view class="flex-1">
            <text class="block" :style="pendingLabelStyle">{{ titleOf(q) }}</text>
            <text class="block" :style="categoryLabelStyle">{{ categoryOf(q) }}</text>
          </view>
          <view class="flex items-baseline" style="gap: 4px">
            <!-- 目标业务停摆时不给可赚取数字:它与「不可完成」同屏是自相矛盾的。 -->
            <text v-if="targetClosed(q)" :style="pendingPausedStyle">{{ t.questClaim.definitionInactive }}</text>
            <text v-else :style="pendingRewardStyle">+{{ rewardOf(q) }} NEX</text>
          </view>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 8px; flex-shrink: 0"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>
      <view v-if="tier2Quests.length === 0" class="px-4 py-3" :style="pendingLabelStyle" @click="retry">
        {{ w.empty }}
      </view>
    </view>

  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import type { CanonicalQuest } from "@/api/quest-api";
import { useWeeklyQuest } from "@/store/weekly-quest";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { useNow } from "@/composables/use-now";
import { toast } from "@/store/ui";
import { bindPageVisibilityRefresh, createPageVisibilityRefresh } from "@/lib/page-visibility-refresh";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { genesisBlockIsKnownUnavailable } from "@/store/genesis-config";
import { questTargetBusiness, unclaimableBusinessQuests, type QuestTargetAvailability } from "@/lib/quest-business-availability";
import { useQuestTargetAvailability } from "@/composables/use-quest-target-availability";
import { weeklyQuestDisplayName } from "@/lib/quest-presentation";

const t = useT();
const locale = useLocaleStore();
const w = computed(() => t.value.weeklyQuest);
const wq = useWeeklyQuest();
const mounted = ref(false);
const nowTick = useNow();

const weeklyQuestVisibility = createPageVisibilityRefresh(() => {
  void wq.refresh().finally(() => { mounted.value = true; });
});
bindPageVisibilityRefresh(weeklyQuestVisibility, {
  mounted: (callback) => onMounted(callback),
  shown: (callback) => onShow(callback),
  hidden: (callback) => onHide(callback),
});

const tier2Quests = computed<CanonicalQuest[]>(() => mounted.value ? wq.tier2Quests : []);

const mult = computed(() => wq.multiplier);
const completedCount = computed(() => tier2Quests.value.filter((q) =>
  ["COMPLETED", "CLAIMABLE", "CLAIMED"].includes(q.status)).length);
const progressText = computed(() => fmt(t.value.quest.progress, {
  done: completedCount.value,
  total: tier2Quests.value.length,
}));
const periodText = computed(() => {
  const remainingMs = Date.parse(tier2Quests.value[0]?.eligibleUntil ?? "") - nowTick.value * 1000;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return fmt(w.value.periodEndsIn, { time: "00:00:00" });
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return fmt(w.value.periodEndsIn, { time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` });
});
const claimErrorText = computed(() => wq.error === "WEEKLY_QUEST_CLAIM_OUTCOME_UNKNOWN"
  ? w.value.claimOutcomeUnknown : w.value.claimFailed);

function isClaimed(q: CanonicalQuest): boolean {
  return q.status === "CLAIMED";
}
function isCompleted(q: CanonicalQuest): boolean {
  return !isExpired(q) && ["COMPLETED", "CLAIMABLE"].includes(q.status);
}
function isExpired(q: CanonicalQuest): boolean {
  return Date.parse(q.eligibleUntil) <= nowTick.value * 1000;
}
function rewardOf(q: CanonicalQuest): number {
  return Math.round(q.rewardNex * mult.value);
}
function titleOf(q: CanonicalQuest): string {
  return weeklyQuestDisplayName(q, locale.code, t.value);
}
function categoryOf(q: CanonicalQuest): string {
  return ({
    wallet: t.value.home.dayOneCatWallet,
    explore: t.value.home.dayOneCatExplore,
    recommend: t.value.home.dayOneCatRecommend,
    identity: t.value.home.dayOneCatIdentity,
    social: t.value.home.dayOneCatSocial,
  })[q.category];
}
function claimTextFor(q: CanonicalQuest): string {
  return fmt(w.value.claim, { n: rewardOf(q).toLocaleString() });
}

/**
 * 这条任务的**目标业务现在整体不可用**吗(BUG 127 / 155)。
 *
 * 🔴 与 hero 用**同一份读数**:`useQuestTargetAvailability` + 创世闸(唯一派生)。
 *   列表在这里独立判一次会与 hero 漂移 —— 同页两处对同一条任务给出两种结论,
 *   正是本缺陷的形态。
 * 🔴 `configUnavailable`(不知道)不算停:Cold start 配置还没到就撤掉 CTA,
 *   用户看到的是任务莫名消失。
 */
const { block: genesisBlock, secondaryBlock: genesisSecondaryBlock } = useGenesisSaleGate();
const targetAvailability = useQuestTargetAvailability();

function targetClosed(q: CanonicalQuest): boolean {
  const domain = questTargetBusiness(q);
  if (domain === null) return false;
  const closed: QuestTargetAvailability = {
    genesisBlocked: domain === "genesis"
      // 二级挂单承接的是他人存量,售罄档仍然可逛 —— 与闸完全同源。
      ? (q.actionRoute.startsWith("/pages/genesis/marketplace")
        ? genesisSecondaryBlock.value !== null
        : genesisBlockIsKnownUnavailable(genesisBlock.value))
      : false,
    stakingClosed: targetAvailability.value.stakingClosed,
    exchangeClosed: targetAvailability.value.exchangeClosed,
  };
  return unclaimableBusinessQuests([{ ...q, status: "PENDING" }], closed).length > 0;
}

/** 过期与「目标业务停摆」都是不可点:一处判据,渲染点只用它。 */
function rowInactive(q: CanonicalQuest): boolean {
  return isExpired(q) || targetClosed(q);
}

function onRowCta(q: CanonicalQuest) {
  if (rowInactive(q)) return;
  navTo(q.actionRoute);
}

function retry() {
  void wq.refresh();
}

async function onClaimRow(q: CanonicalQuest) {
  const claimed = await wq.claim(q);
  if (!claimed && wq.claimNotice) toast.info(t.value.questClaim[wq.claimNotice]);
}

// ── styles ──
// Form-b: filled container, no border — quest rows keep their hairline dividers,
// tinted claim states, and champion bonus row inside.
const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
};
const headerStyle: CSSProperties = { borderBottom: "1px solid var(--v5-border)" };
const tier2LabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const countStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-2)",
};
const claimedRowStyle: CSSProperties = { gap: "12px", opacity: 0.65 };
const checkBoxStyle: CSSProperties = { width: "22px", height: "22px", borderRadius: "999px", background: "var(--v5-success)" };
const claimedLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-4)",
  textDecoration: "line-through",
};
const claimedRewardStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-nex)",
};
const completedRowStyle: CSSProperties = { gap: "12px", minHeight: "48px", background: "var(--v5-warning-soft)" };
const sparkBoxStyle: CSSProperties = { width: "22px", height: "22px", borderRadius: "999px", background: "var(--v5-warning)" };
const claimLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-warning)",
  letterSpacing: "-0.005em",
};
const claimRewardStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontWeight: 500,
  fontSize: "12px",
  color: "var(--v5-nex)",
};
const pendingRowStyle: CSSProperties = { gap: "12px", minHeight: "48px" };
const numberBoxStyle: CSSProperties = {
  width: "22px",
  height: "22px",
  borderRadius: "999px",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "12px",
};
const pendingLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink)",
};
const periodStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const categoryLabelStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const claimErrorStyle: CSSProperties = { ...categoryLabelStyle, color: "var(--v5-danger)" };
const refreshErrorStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-warning)", borderBottom: "1px solid var(--v5-border)" };
/** 「未开放」标记与奖励数字同槽位:同样是 12px 等宽,但不得像可赚取的金额一样抢眼。 */
const pendingPausedStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const pendingRewardStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontWeight: 500,
  fontSize: "12px",
  color: "var(--v5-nex)",
};
const pendingUsdtStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-success)",
};
const bonusRowStyle: CSSProperties = {
  borderTop: "1px solid var(--v5-success-soft)",
  background: "var(--v5-success-soft)",
};
const bonusBtnStyle: CSSProperties = {
  gap: "6px",
  height: "44px",
  borderRadius: "999px",
  background: "linear-gradient(90deg, var(--v5-success), var(--v5-warning))",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
const bonusDoneStyle: CSSProperties = {
  gap: "8px",
  borderTop: "1px solid var(--v5-success-soft)",
  background: "var(--v5-success-soft)",
};
const bonusDoneTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-success)",
  fontWeight: 500,
};


</script>
