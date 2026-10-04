import { defineStore } from "pinia";
import { reactive, ref, watch } from "vue";
import { questApi, remoteApiEnabled } from "@/api/runtime";
import type { CanonicalQuest, DayOneSnapshotStatus } from "@/api/quest-api";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { useLocaleStore } from "./locale";
import { questClaimNoticeFor, type QuestClaimNotice } from "@/lib/quest-claim-notice";
import { dayOneClaimState } from "@/lib/day-one-claim-state";

/** Formal mode reads server task facts and explicitly claims the DayOne group.
 * Local completion/reward persistence is retained only for non-remote previews. */

export type QuestTaskId =
  | "bind_bank_card"
  | "visit_earn"
  | "visit_store"
  | "view_product_roi"
  | "setup_profile"
  | "invite_friend";

export interface QuestTaskDef {
  id: QuestTaskId;
  /** i18n key suffix — `quest.t_<i18nKey>` is the task title in en/zh. */
  i18nKey: string;
  /** Logical route href (matched/translated to a uni path by the watcher). */
  href: string;
  nexReward: number;
  usdtReward?: number;
  /** Display order (1-based). */
  order: number;
}

/**
 * Legacy non-remote fallback table. Formal server mode never uses it for task
 * presentation or route completion; PC H3 and nx_mission remain authoritative.
 */
export const QUEST_TASKS: readonly QuestTaskDef[] = [
  { id: "bind_bank_card", i18nKey: "bind_bank_card", href: "/me/wallet/cards/new", nexReward: 50, order: 1 },
  { id: "visit_earn", i18nKey: "visit_earn", href: "/earn", nexReward: 30, order: 2 },
  { id: "visit_store", i18nKey: "visit_store", href: "/store", nexReward: 50, order: 3 },
  { id: "view_product_roi", i18nKey: "view_product_roi", href: "/store/stellarbox-s1", nexReward: 100, order: 4 },
  { id: "setup_profile", i18nKey: "setup_profile", href: "/me/profile", nexReward: 80, order: 5 },
  { id: "invite_friend", i18nKey: "invite_friend", href: "/team", nexReward: 200, usdtReward: 1, order: 6 },
];

/** Final bonus when all tasks are complete (display side; mirrors source). */
export const QUEST_FINAL_BONUS_NEX = 500;

// 旧设备级单键 "nexgrid-quest-v1" 废弃(存量无账号归属,mock 可重建);任务完成态按账号分行。
const ACCOUNTS_KEY = "nexgrid-quest-accounts-v1"; // { [accountKey]: PersistShape }

/** Result of a markComplete call — App.vue uses this to compose creditNex + toast. */
export interface QuestCompleteResult {
  /** True only on the first completion of this id (idempotent guard). */
  firstTime: boolean;
  /** NEX to credit on first completion (0 when not first time / unknown id). */
  rewardNex: number;
  /** USDT to credit on first completion (0 when none / not first time). */
  rewardUsdt: number;
}

interface PersistShape {
  completed: string[];
}

function hydrate(accountKey: string): string[] {
  const row = readAccountRow<Partial<PersistShape>>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.completed)) return row.completed;
  return [];
}

export const useQuest = defineStore("quest", () => {
  // P-027: reactive Record<id, true> membership map (Vue can't track Set internals)。
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  let accountEpoch = 0;
  let refreshSequence = 0;
  let claimSequence = 0;
  let eligibilityTimer: ReturnType<typeof setTimeout> | null = null;
  let hasRemoteSnapshot = false;
  const completedMap = reactive<Record<string, boolean>>({});
  const rewardMap = reactive<Record<string, number>>({});
  const remoteQuests = ref<CanonicalQuest[]>([]);
  const claimNotice = ref<QuestClaimNotice | null>(null);
  const dayOneClaiming = ref(false);
  const dayOneClaimError = ref(false);
  const dayOneRewardNex = ref(0);
  const dayOneRequiredTaskCount = ref<number | null>(null);
  const dayOneSnapshotStatus = ref<DayOneSnapshotStatus>("LEGACY_UNVERIFIED");
  const remoteStatus = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  if (!remoteApiEnabled) for (const id of hydrate(boundKey)) completedMap[id] = true;

  function clearRemoteFacts() {
    if (eligibilityTimer) clearTimeout(eligibilityTimer);
    eligibilityTimer = null;
    for (const key of Object.keys(completedMap)) delete completedMap[key];
    for (const key of Object.keys(rewardMap)) delete rewardMap[key];
    remoteQuests.value = [];
    dayOneRewardNex.value = 0;
    dayOneRequiredTaskCount.value = null;
    dayOneSnapshotStatus.value = "LEGACY_UNVERIFIED";
  }

  function scheduleEligibilityRefresh(rows: CanonicalQuest[]) {
    if (eligibilityTimer) clearTimeout(eligibilityTimer);
    eligibilityTimer = null;
    const nextBoundary = rows
      .filter((row) => row.eligible)
      .map((row) => Date.parse(row.eligibleUntil))
      .filter(Number.isFinite)
      .reduce((earliest, value) => Math.min(earliest, value), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(nextBoundary)) return;
    const delay = Math.min(Math.max(nextBoundary - Date.now() + 250, 250), 2_147_000_000);
    eligibilityTimer = setTimeout(() => void refreshRemote(), delay);
  }

  function discardRemoteSnapshot() {
    hasRemoteSnapshot = false;
    clearRemoteFacts();
  }

  async function refreshRemote(): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    const epoch = accountEpoch;
    const requestSequence = ++refreshSequence;
    const isCurrentRequest = () => epoch === accountEpoch && requestSequence === refreshSequence;
    claimNotice.value = null;
    // Background refreshes use stale-while-revalidate semantics: a route or
    // module switch must not erase the last server-confirmed task catalogue.
    // Account changes explicitly discard it in bindAccount() below.
    if (!hasRemoteSnapshot) remoteStatus.value = "loading";
    try {
      const snapshot = await questApi.state(useLocaleStore().code);
      if (!isCurrentRequest()) return false;
      const nextQuests = snapshot.quests.map((quest) => ({ ...quest }));
      const nextRewards: Record<string, number> = {};
      const nextCompleted: Record<string, boolean> = {};
      for (const quest of snapshot.quests) {
        nextRewards[quest.questCode] = quest.rewardNex;
        if (quest.status === "CLAIMED") nextCompleted[quest.questCode] = true;
      }

      // Build and validate the complete replacement before touching the
      // visible snapshot. A malformed response must not partially clear it.
      clearRemoteFacts();
      remoteQuests.value = nextQuests;
      dayOneRewardNex.value = snapshot.dayOneRewardNex;
      dayOneRequiredTaskCount.value = snapshot.dayOneRequiredTaskCount;
      dayOneSnapshotStatus.value = snapshot.dayOneSnapshotStatus;
      Object.assign(rewardMap, nextRewards);
      Object.assign(completedMap, nextCompleted);
      hasRemoteSnapshot = true;
      remoteStatus.value = "ready";
      scheduleEligibilityRefresh(nextQuests);
      return true;
    } catch {
      if (isCurrentRequest()) {
        if (hasRemoteSnapshot) {
          remoteStatus.value = "ready";
        } else {
          discardRemoteSnapshot();
          remoteStatus.value = "error";
        }
      }
      return false;
    }
  }

  watch(
    () => useLocaleStore().code,
    () => {
      // The home carousel consumes this store directly. Refresh an already
      // confirmed server catalogue so a deliberate language switch never
      // leaves it showing a previous locale's authored task name.
      if (remoteApiEnabled && hasRemoteSnapshot) void refreshRemote();
    },
  );

  async function claimRemote(id: string): Promise<boolean> {
    if (!remoteApiEnabled) return false;
    const currentQuest = remoteQuests.value.find((quest) => quest.questCode === id);
    if (!currentQuest?.eligible || Date.parse(currentQuest.eligibleUntil) <= Date.now()
        || !["COMPLETED", "CLAIMABLE"].includes(currentQuest.status)) return false;
    const epoch = accountEpoch;
    const requestSequence = ++claimSequence;
    const isCurrentRequest = () => epoch === accountEpoch && requestSequence === claimSequence;
    claimNotice.value = null;
    try {
      const result = await questApi.claim(
        id,
        `h3-quest-claim:${id}:${currentQuest.instanceKey}`,
        currentQuest.instanceKey,
      );
      if (!isCurrentRequest()) return false;
      if (result.status !== "CLAIMED" || result.instanceKey !== currentQuest.instanceKey) return false;
      return refreshRemote();
    } catch (cause) {
      // A failed route-triggered claim is not evidence that the last confirmed
      // task snapshot became invalid. Leave the read model untouched.
      const notice = questClaimNoticeFor(cause);
      if (notice) {
        await refreshRemote();
        if (isCurrentRequest()) claimNotice.value = notice;
      }
      return false;
    }
  }

  async function claimDayOne(): Promise<boolean> {
    if (!remoteApiEnabled || remoteStatus.value !== "ready" || dayOneClaiming.value) return false;
    const code = dayOneClaimState(
      remoteQuests.value, dayOneRequiredTaskCount.value, dayOneSnapshotStatus.value, Date.now(),
    ).claimCode;
    if (!code) return false;
    const instanceKey = remoteQuests.value.find(row => row.questCode === code)?.instanceKey;
    const epoch = accountEpoch;
    dayOneClaiming.value = true;
    dayOneClaimError.value = false;
    try {
      const refreshed = await refreshRemote();
      if (epoch !== accountEpoch) return false;
      if (!refreshed || dayOneClaimState(
        remoteQuests.value, dayOneRequiredTaskCount.value, dayOneSnapshotStatus.value, Date.now(),
      ).claimCode !== code
          || remoteQuests.value.find(row => row.questCode === code)?.instanceKey !== instanceKey) {
        dayOneClaimError.value = true;
        return false;
      }
      const accepted = await claimRemote(code);
      const claimed = accepted && dayOneClaimState(
        remoteQuests.value, dayOneRequiredTaskCount.value, dayOneSnapshotStatus.value, Date.now(),
      ).claimed
        && remoteQuests.value.some(row => row.questCode === code
        && row.instanceKey === instanceKey && row.status === "CLAIMED");
      if (epoch === accountEpoch) dayOneClaimError.value = !claimed;
      return epoch === accountEpoch && claimed;
    } finally {
      if (epoch === accountEpoch) dayOneClaiming.value = false;
    }
  }

  function persist() {
    writeAccountRow<PersistShape>(ACCOUNTS_KEY, boundKey, {
      completed: Object.keys(completedMap).filter((k) => completedMap[k]),
    });
  }

  /** 账号切换重绑:清空并装载该账号的任务完成态(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    accountEpoch += 1;
    refreshSequence += 1;
    claimSequence += 1;
    boundKey = normalizeAccountKey(rawAccountKey);
    dayOneClaiming.value = false;
    dayOneClaimError.value = false;
    claimNotice.value = null;
    discardRemoteSnapshot();
    remoteStatus.value = remoteApiEnabled ? "idle" : "ready";
    if (remoteApiEnabled) {
      void refreshRemote();
      return;
    }
    for (const id of hydrate(boundKey)) completedMap[id] = true;
  }

  function isComplete(id: string): boolean {
    return completedMap[id] === true;
  }

  function rewardFor(id: string): number | null {
    return typeof rewardMap[id] === "number" ? rewardMap[id] : null;
  }

  /**
   * Mark a task complete. Idempotent — re-calling for an already-completed id
   * returns { firstTime: false, rewardNex: 0, rewardUsdt: 0 } so the caller
   * never double-credits. On first completion, returns the task's reward so
   * App.vue can creditNex / creditBalance + emit a toast.
   */
  function markComplete(id: QuestTaskId): QuestCompleteResult {
    if (remoteApiEnabled) {
      // Route visitors are not proof that a server mission is claimable. The
      // H3 endpoint remains the only authority for completion and reward.
      void refreshRemote();
      return { firstTime: false, rewardNex: 0, rewardUsdt: 0 };
    }
    if (completedMap[id]) {
      return { firstTime: false, rewardNex: 0, rewardUsdt: 0 };
    }
    const task = QUEST_TASKS.find((tk) => tk.id === id);
    if (!task) {
      // Unknown id — don't record, nothing to reward.
      return { firstTime: false, rewardNex: 0, rewardUsdt: 0 };
    }
    completedMap[id] = true;
    persist();
    return {
      firstTime: true,
      rewardNex: task.nexReward,
      rewardUsdt: task.usdtReward ?? 0,
    };
  }

  function reset() {
    if (remoteApiEnabled) {
      discardRemoteSnapshot();
      remoteStatus.value = "idle";
      return;
    }
    for (const k of Object.keys(completedMap)) delete completedMap[k];
    persist();
  }

  return { completedMap, remoteQuests, dayOneRewardNex, dayOneRequiredTaskCount, dayOneSnapshotStatus, QUEST_TASKS, isComplete, rewardFor, markComplete, reset, bindAccount, refreshRemote, claimRemote, remoteStatus, claimNotice, claimDayOne, dayOneClaiming, dayOneClaimError };
});
