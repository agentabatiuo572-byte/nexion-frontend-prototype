<!-- DayOneQuestCard — homepage newcomer task card. -->
<template>
  <view
    id="home-newcomer-task-card"
    class="nx-glass-card newcomer-task"
    :class="{ 'newcomer-task--expanded': expanded }"
    :style="rootStyle"
    :aria-hidden="!props.active"
  >
    <view class="newcomer-task__summary">
      <view style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px">
        <view style="min-width: 0">
          <view style="display: flex; align-items: center; flex-wrap: wrap; gap: 7px">
            <view class="newcomer-task__mark" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="m13 2-9 12h8l-1 8 9-12h-8z" />
              </svg>
            </view>
            <text class="newcomer-task__eyebrow">{{ t.home.dayOneFirstDayReward }}</text>
            <text class="newcomer-task__count">{{ taskCountText }}</text>
          </view>
          <view class="newcomer-task__reward">
            <text class="newcomer-task__reward-value">{{ rewardText === "—" ? "—" : `+${rewardText}` }}</text>
            <text style="font-size: 13px; color: var(--v5-nex); font-family: var(--font-jet-mono), ui-monospace, monospace; font-weight: 500; margin-left: 2px">NEX</text>
          </view>
        </view>
        <view v-if="!questUnavailable && (!remoteApiEnabled || dayOneWindow)" style="text-align: right; flex-shrink: 0">
          <text v-if="!dayOneExpired" class="block" style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-4); letter-spacing: 0.04em">{{ t.home.dayOneEndsIn }}</text>
          <text class="block" :style="{ marginTop: dayOneExpired ? '0' : '4px' }" style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-weight: 500; font-size: 15px; color: var(--v5-quest-violet-ink); font-variant-numeric: tabular-nums; line-height: 1" :aria-label="dayOneExpired ? t.home.dayOneExpired : undefined">{{ dayOneExpired ? t.quest.expired : remainingLabel }}</text>
        </view>
      </view>

      <view style="margin-top: 10px">
        <view ref="elRef" style="height: 6px; border-radius: 999px; overflow: hidden; background: var(--v5-surface-2); position: relative">
          <view :style="barStyle" />
        </view>
        <view style="margin-top: 5px; display: flex; justify-content: space-between; font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px">
          <text v-if="questUnavailable" style="color: var(--v5-ink-4)">{{ unavailableLabel }}</text>
          <template v-else>
            <text style="color: var(--v5-ink-4)"><text style="color: var(--v5-ink); font-weight: 500">{{ completedCount }}</text>/{{ total }} {{ t.home.dayOneDoneSuffix }}</text>
            <text v-if="remoteApiEnabled" style="color: var(--v5-nex)">{{ claimState.empty ? t.home.dayOneNoActiveTasks : claimState.claimed ? t.home.dayOneRewardClaimed : claimState.unverified ? t.home.dayOneSnapshotUnverified : t.home.dayOneRewardUnclaimed }}</text>
            <text v-else style="color: var(--v5-nex); font-variant-numeric: tabular-nums">{{ nexEarnedText === "—" ? "—" : `+${nexEarnedText}` }} {{ t.home.dayOneEarnedSuffix }}</text>
          </template>
        </view>
      </view>

      <!-- 去线(主人 2026-08-17 全站令):总间距沿用有线时代的 12+12 -->
      <view v-if="expanded" style="margin-top: 24px; display: flex; flex-direction: column; gap: 4px">
        <view
          v-for="task in tasks"
          :key="task.id"
          :class="isActionable(task) ? 'active:scale-[0.98] active:opacity-80 transition-transform' : ''"
          :style="rowStyle(task)"
          role="button"
          :tabindex="props.active && isActionable(task) ? 0 : -1"
          :aria-disabled="!isActionable(task)"
          @click="onRowTap(task)"

          @keydown.enter.prevent="onRowTap(task)" @keydown.space.prevent="onRowTap(task)"
        >
          <view :style="circleStyle(task)">
            <!-- 勾色按填充色配对(task.onColor),不能一刀切:quest 两色双主题恒浅
                 → on-quest 恒深墨(6.32/6.64);brand 随主题翻转 → on-brand。
                 两次实测教训:一刀切 on-brand 亮色白勾压浅紫=2.98;一刀切 on-quest
                 深墨压亮色品牌蓝=2.77。 -->
            <svg v-if="isDone(task)" width="10" height="10" viewBox="0 0 24 24" fill="none" :stroke="task.onColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
            <text v-else style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; font-weight: 500" :style="{ color: task.color }">{{ task.order }}</text>
          </view>
          <view style="display: flex; align-items: baseline; gap: 6px; min-width: 0">
            <text class="truncate" :style="labelStyle(task)">{{ task.label }}</text>
            <text :style="catStyle(task)">{{ task.cat }}</text>
          </view>
          <text :style="rewardStyle(task)">{{ task.nex === null ? "—" : `+${task.nex} NEX` }}<text v-if="task.usdt" :style="{ color: isDone(task) ? 'var(--v5-ink-4)' : 'var(--v5-brand-2)', marginLeft: '4px' }">+${{ task.usdt }}</text></text>
          <view>
            <svg v-if="isActionable(task)" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </view>
        </view>
      </view>
    </view>

    <view v-if="remoteApiEnabled && !questUnavailable && !claimState.empty && (claimState.claimCode || quest.dayOneClaiming)"
      class="newcomer-task__claim" role="button"
      :tabindex="props.active && !quest.dayOneClaiming ? 0 : -1"
      :aria-disabled="!props.active || quest.dayOneClaiming"
      @click="onClaim"  @keydown.enter.prevent="onClaim" @keydown.space.prevent="onClaim">
      <text>{{ quest.dayOneClaiming ? t.home.dayOneClaiming : t.home.dayOneClaimReward }}</text>
    </view>
    <text v-if="remoteApiEnabled && quest.dayOneClaimError" role="status" class="newcomer-task__claim-error">
      {{ quest.claimNotice ? t.questClaim[quest.claimNotice] : t.home.dayOneClaimUnconfirmed }}
    </text>

    <view
      class="nx-glass-action newcomer-task__toggle"
      :style="toggleStyle"
      role="button"
      :tabindex="props.active && (!questUnavailable || questLoadError) ? 0 : -1"
      :aria-expanded="expanded"
      :aria-disabled="questUnavailable && !questLoadError"
      :aria-label="toggleLabel"
      @click="toggleExpanded"

      @keydown.enter.prevent="toggleExpanded" @keydown.space.prevent="toggleExpanded"
    >
      <text style="font-family: var(--font-v5); font-size: 13px; font-weight: 500; color: var(--v5-ink-3)">{{ toggleLabel }}</text>
      <svg v-if="!questUnavailable" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path :d="expanded ? 'M19 15l-7-7-7 7' : 'M5 9l7 7 7-7'" />
      </svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, watch, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNow } from "@/composables/use-now";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";
import { useQuest } from "@/store/quest";
import { useLocaleStore } from "@/store/locale";
import { remoteApiEnabled } from "@/api/runtime";
import type { QuestTaskCategory } from "@/api/quest-api";
import { selectHomeQuestRows } from "./home-quest-source";
import { dayOneClaimState } from "@/lib/day-one-claim-state";
import { dayOneQuestDisplayName } from "@/lib/quest-presentation";

interface QuestTask {
  id: string;
  order: number;
  label: string;
  nex: number | null;
  usdt?: number;
  href: string;
  cat: string;
  color: string;
  /** 该填充色之上的前景色(勾/序号)。quest 两色恒浅 → on-quest 恒深墨;
   *  brand 随主题翻转 → 必须配同样翻转的 on-brand。用错会在某一主题糊掉。 */
  onColor: string;
  eligible: boolean;
}

const props = withDefaults(defineProps<{ active?: boolean; expanded?: boolean }>(), {
  active: true,
  expanded: false,
});
const emit = defineEmits<{
  (event: "update:expanded", value: boolean): void;
  (event: "content-resize"): void;
}>();
const expanded = computed({
  get: () => props.expanded,
  set: (value: boolean) => emit("update:expanded", value),
});

const t = useT();
const locale = useLocaleStore();
const nowTick = useNow();
const { elRef, inView } = useScrollGrowProgress();
const quest = useQuest();
const mockReward = 500;

const categoryLabel = (category: QuestTaskCategory): string => ({
  wallet: t.value.home.dayOneCatWallet,
  explore: t.value.home.dayOneCatExplore,
  recommend: t.value.home.dayOneCatRecommend,
  identity: t.value.home.dayOneCatIdentity,
  social: t.value.home.dayOneCatSocial,
})[category];

const fallbackTasks = computed<QuestTask[]>(() => [
  { id: "bind_bank_card", order: 1, label: t.value.home.dayOneTaskBindCard, nex: 50, href: "/pages/me/wallet-cards-new", cat: t.value.home.dayOneCatWallet, color: "var(--v5-quest-violet)", onColor: "var(--v5-on-quest)", eligible: true },
  { id: "visit_earn", order: 2, label: t.value.home.dayOneTaskVisitEarn, nex: 30, href: "/pages/earn/earn", cat: t.value.home.dayOneCatExplore, color: "var(--v5-quest-ember)", onColor: "var(--v5-on-quest)", eligible: true },
  { id: "visit_store", order: 3, label: t.value.home.dayOneTaskVisitStore, nex: 50, href: "/pages/store/store", cat: t.value.home.dayOneCatExplore, color: "var(--v5-quest-ember)", onColor: "var(--v5-on-quest)", eligible: true },
  { id: "view_product_roi", order: 4, label: t.value.home.dayOneTaskSeeRoi, nex: 100, href: "/pages/store/detail?id=stellarbox-s1", cat: t.value.home.dayOneCatRecommend, color: "var(--v5-brand)", onColor: "var(--v5-on-brand)", eligible: true },
  { id: "setup_profile", order: 5, label: t.value.home.dayOneTaskSetupProfile, nex: 80, href: "/pages/me/profile", cat: t.value.home.dayOneCatIdentity, color: "var(--v5-quest-violet)", onColor: "var(--v5-on-quest)", eligible: true },
  { id: "invite_friend", order: 6, label: t.value.home.dayOneTaskInviteFriend, nex: 200, usdt: 1, href: "/pages/team/team", cat: t.value.home.dayOneCatSocial, color: "var(--v5-quest-ember)", onColor: "var(--v5-on-quest)", eligible: true },
]);
const remoteTasks = computed<QuestTask[]>(() => {
  const palette = [
    { color: "var(--v5-quest-violet)", onColor: "var(--v5-on-quest)" },
    { color: "var(--v5-quest-ember)", onColor: "var(--v5-on-quest)" },
    { color: "var(--v5-brand)", onColor: "var(--v5-on-brand)" },
  ];
  return quest.remoteQuests
    .filter((row) => row.layer === "DAY_ONE")
    .map((row, index) => ({
      id: row.questCode,
      order: index + 1,
      label: dayOneQuestDisplayName(row, locale.code, t.value),
      nex: null,
      href: row.actionRoute,
      cat: categoryLabel(row.category),
      eligible: row.eligible,
      ...palette[index % palette.length],
    }));
});
const questUnavailable = computed(() => remoteApiEnabled && quest.remoteStatus !== "ready");
const questLoadError = computed(() => remoteApiEnabled && quest.remoteStatus === "error");
const unavailableLabel = computed(() => questLoadError.value
  ? t.value.home.dayOneUnavailable : t.value.home.dayOneLoading);
const tasks = computed<QuestTask[]>(() => selectHomeQuestRows(
  remoteApiEnabled,
  quest.remoteStatus === "ready",
  remoteTasks.value,
  fallbackTasks.value,
));

const total = computed(() => tasks.value.length);
const claimState = computed(() => dayOneClaimState(
  quest.remoteQuests, quest.dayOneRequiredTaskCount, quest.dayOneSnapshotStatus, nowTick.value * 1000,
));
watch(() => [expanded.value, props.active, claimState.value.claimCode, claimState.value.empty, quest.dayOneClaiming,
  quest.dayOneClaimError, tasks.value.length, t.value.home.dayOneClaimReward, t.value.home.dayOneClaimUnconfirmed,
  t.value.home.dayOneNoActiveTasks, t.value.home.dayOneFirstDayReward],
  () => emit("content-resize"), { flush: "post", immediate: true });
const completedCount = computed(() => tasks.value.filter(isDone).length);
const progressPct = computed(() => total.value > 0 ? (completedCount.value / total.value) * 100 : 0);
const nexEarned = computed(() => {
  const completed = tasks.value.filter((task) => quest.isComplete(task.id));
  if (remoteApiEnabled && quest.remoteStatus !== "ready") return null;
  if (remoteApiEnabled) return total.value > 0 && completed.length === total.value ? quest.dayOneRewardNex : 0;
  return completed.reduce((sum, task) => sum + (task.nex ?? 0), 0);
});
const nexEarnedText = computed(() => nexEarned.value === null ? "—" : String(nexEarned.value));
const viewTasksText = computed(() => fmt(t.value.home.dayOneViewTasks, { n: total.value }));
const taskCountText = computed(() => questUnavailable.value
  ? unavailableLabel.value
  : fmt(t.value.home.dayOneTaskCount, { n: total.value }));
const toggleLabel = computed(() => questLoadError.value
  ? t.value.home.dayOneRetryLoad
  : questUnavailable.value ? t.value.home.dayOneLoading
  : expanded.value ? t.value.home.dayOneHideTasks : viewTasksText.value);
const rewardText = computed(() => {
  if (!remoteApiEnabled) return String(mockReward);
  if (quest.remoteStatus !== "ready") return "—";
  return quest.dayOneRewardNex > 0 ? String(quest.dayOneRewardNex) : "—";
});
const dayOneWindow = computed(() => quest.remoteQuests.find((row) => row.layer === "DAY_ONE") ?? null);

const remainingMs = computed(() => remoteApiEnabled
    ? Date.parse(dayOneWindow.value?.eligibleUntil ?? "") - nowTick.value * 1000
    : 18 * 60 * 60 * 1000 + 24 * 60 * 1000 - ((nowTick.value * 1000) % 60_000));
const dayOneExpired = computed(() => remoteApiEnabled && Number.isFinite(remainingMs.value) && remainingMs.value <= 0);
watch(dayOneExpired, () => emit("content-resize"), { flush: "post" });
const remainingLabel = computed(() => {
  const remaining = remainingMs.value;
  if (!Number.isFinite(remaining)) return "—";
  if (remaining <= 0) return t.value.home.dayOneExpired;
  const hours = Math.floor(remaining / 3600_000);
  const minutes = Math.floor((remaining % 3600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
});

function isDone(task: QuestTask) {
  return remoteApiEnabled ? claimState.value.completedCodes.includes(task.id) : quest.isComplete(task.id);
}

function onClaim() {
  if (!props.active || questUnavailable.value || !claimState.value.claimCode || quest.dayOneClaiming) return;
  void quest.claimDayOne();
}

function isActionable(task: QuestTask) {
  return task.eligible && !dayOneExpired.value && !isDone(task);
}

function onRowTap(task: QuestTask) {
  if (!isActionable(task)) return;
  navTo(task.href);
}

function toggleExpanded() {
  if (questLoadError.value) {
    void quest.refreshRemote();
    return;
  }
  if (questUnavailable.value) return;
  expanded.value = !expanded.value;
}

const barStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${inView.value ? progressPct.value : 0}%`,
  transition: inView.value ? PROGRESS_GROW_TRANSITION : "none",
  willChange: "width",
  background: "linear-gradient(90deg, var(--v5-brand) 0%, var(--v5-tech-cyan) 100%)",
  borderRadius: "4px",
  boxShadow: "0 0 8px rgba(198,255,58,0.55)",
}));

function rowStyle(task: QuestTask): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "20px 1fr auto 14px",
    gap: "10px",
    alignItems: "center",
    padding: "8px 0",
    cursor: isActionable(task) ? "pointer" : "default",
  };
}

function circleStyle(task: QuestTask): CSSProperties {
  const done = isDone(task);
  return {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: done ? task.color : "transparent",
    border: done ? "none" : `1px solid ${task.color}55`,
    display: "grid",
    placeItems: "center",
  };
}

function labelStyle(task: QuestTask): CSSProperties {
  const done = isDone(task);
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    color: done ? "var(--v5-ink-4)" : "var(--v5-ink)",
    fontWeight: 500,
    textDecoration: done ? "line-through" : "none",
  };
}

function catStyle(task: QuestTask): CSSProperties {
  const done = isDone(task);
  return {
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    color: done ? "var(--v5-ink-4)" : task.color,
    opacity: done ? 0.5 : 0.8,
    letterSpacing: "0.04em",
  };
}

function rewardStyle(task: QuestTask): CSSProperties {
  const done = isDone(task);
  return {
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    color: done ? "var(--v5-ink-4)" : "var(--v5-nex)",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
  };
}

const rootStyle = computed<CSSProperties>(() => ({ boxShadow: "var(--nx-glass-edge)",
  position: "relative",
  boxSizing: "border-box",
  height: "auto",
  minHeight: "var(--home-task-card-height, 184px)",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
  overflow: "hidden",
  color: "var(--v5-ink)",
  display: "flex",
  flexDirection: "column",
}));

const toggleStyle: CSSProperties = {
  margin: "14px 16px",
  width: "auto",
  minHeight: "44px",
  borderRadius: "var(--nx-glass-radius)",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
};


</script>

<style scoped>
.newcomer-task__claim {
  margin: 12px 16px 0;
  padding: 12px;
  border-radius: 12px;
  text-align: center;
  background: var(--v5-brand);
  color: var(--v5-on-brand);
  cursor: pointer;
}
.newcomer-task__claim[aria-disabled="true"] { opacity: 0.6; }
.newcomer-task__claim-error { margin: 8px 16px 0; font-size: 12px; color: var(--v5-ink-3); }
.newcomer-task__summary {
  box-sizing: border-box;
  min-height: 112px;
  padding: 14px 16px 0;
}

.newcomer-task__mark {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  place-items: center;
  border-radius: 6px;
  background: var(--v5-brand-soft);
}

.newcomer-task__eyebrow {
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink-2);
  letter-spacing: 0.01em;
}

.newcomer-task__count {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  font-family: var(--font-jet-mono), ui-monospace, monospace;
  font-size: 12px;
  color: var(--v5-ink-4);
  white-space: nowrap;
}

.newcomer-task__reward {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.newcomer-task__reward-value {
  font-family: var(--font-v5);
  font-size: 34px;
  font-weight: 500;
  color: var(--v5-nex);
  letter-spacing: -0.022em;
}

.newcomer-task__toggle {
  flex: 0 0 44px;
  cursor: pointer;
  transition: opacity 0.15s;
}
/* 《08》§2:展开/收起是这张卡的主要交互,按下去原先零反馈 */
.newcomer-task__toggle:active {
  opacity: 0.7;
}

.newcomer-task--expanded .newcomer-task__toggle {
  margin-top: 14px;
}
</style>
