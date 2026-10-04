import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { questApi, remoteApiEnabled } from "@/api/runtime";
import { isAmbiguousOutcome } from "@/api/errors";
import type { CanonicalQuest, QuestSnapshot } from "@/api/quest-api";
import {
  acquireWeeklyQuestCommandKey,
  finishWeeklyQuestCommand,
} from "@/lib/weekly-quest-command-key";
import { useLocaleStore } from "@/store/locale";
import { isCurrentQuest } from "@/lib/actionable-quest";
import { questClaimNoticeFor, type QuestClaimNotice } from "@/lib/quest-claim-notice";

const UNKNOWN_IDEMPOTENCY_RESULTS = new Set([
  "IDEMPOTENCY_RESULT_UNKNOWN",
  "IDEMPOTENCY_REQUEST_IN_PROGRESS",
]);

type ClaimRecovery = "claimed" | "not_claimed" | "unavailable";

/** Weekly quests are a read-through projection of the server mission and reward ledger. */
export const useWeeklyQuest = defineStore("weeklyQuest", () => {
  const locale = useLocaleStore();
  const snapshot = ref<QuestSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const claimErrorQuestCode = ref<string | null>(null);
  const claimNotice = ref<QuestClaimNotice | null>(null);
  const claiming = ref<string | null>(null);
  let accountKeyValue = "default";
  let accountEpoch = 0;
  let refreshSequence = 0;
  let claimSequence = 0;
  let rolloverTimer: ReturnType<typeof setTimeout> | null = null;

  const tier1Quests = computed(() => snapshot.value?.quests.filter((q) => q.layer === "WEEKLY_T1" && isCurrentQuest(q)) ?? []);
  const tier2Quests = computed(() => snapshot.value?.quests.filter((q) => q.layer === "WEEKLY_T2" && isCurrentQuest(q)) ?? []);
  const multiplier = computed(() => snapshot.value?.questBonusMultiplier ?? 1);

  function retireClaimedCommands(next: QuestSnapshot): void {
    for (const quest of next.quests) {
      if (quest.status === "CLAIMED") {
        finishWeeklyQuestCommand(accountKeyValue, quest.questCode, quest.instanceKey);
      }
    }
  }

  function claimOutcomeAmbiguous(cause: unknown): boolean {
    return UNKNOWN_IDEMPOTENCY_RESULTS.has(cause instanceof Error ? cause.message : "")
      || isAmbiguousOutcome(cause);
  }

  async function recoverClaim(
    quest: CanonicalQuest,
    isCurrentRequest: () => boolean,
  ): Promise<ClaimRecovery> {
    try {
      const readBack = await questApi.state(locale.code);
      if (!isCurrentRequest()) return "unavailable";
      const authoritative = readBack.quests.find((row) =>
        row.questCode === quest.questCode && row.instanceKey === quest.instanceKey);
      if (!authoritative) return "unavailable";
      snapshot.value = readBack;
      scheduleRollover(readBack);
      if (authoritative.status === "CLAIMED") {
        finishWeeklyQuestCommand(accountKeyValue, quest.questCode, quest.instanceKey);
        return "claimed";
      }
      return authoritative.eligible
          && ["COMPLETED", "CLAIMABLE"].includes(authoritative.status)
        ? "not_claimed" : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  function scheduleRollover(next: QuestSnapshot | null) {
    if (rolloverTimer) clearTimeout(rolloverTimer);
    rolloverTimer = null;
    const boundary = (next?.quests ?? [])
      .filter((quest) => quest.layer !== "DAY_ONE" && quest.eligible)
      .map((quest) => Date.parse(quest.eligibleUntil))
      .filter(Number.isFinite)
      .reduce((earliest, value) => Math.min(earliest, value), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(boundary)) return;
    const delay = Math.min(Math.max(boundary - Date.now() + 250, 250), 2_147_000_000);
    rolloverTimer = setTimeout(() => void refresh(), delay);
  }

  async function refresh(fromSettledClaim = false): Promise<boolean> {
    const epoch = accountEpoch;
    const requestSequence = ++refreshSequence;
    const startedClaimSequence = claimSequence;
    const startedDuringClaim = claiming.value !== null;
    const isCurrentRequest = () => epoch === accountEpoch && requestSequence === refreshSequence;
    const predatesClaim = () => (startedDuringClaim && !fromSettledClaim) || claimSequence !== startedClaimSequence;
    if (!remoteApiEnabled) {
      if (isCurrentRequest()) {
        snapshot.value = null;
        scheduleRollover(null);
        error.value = "WEEKLY_QUEST_SERVER_REQUIRED";
        claimErrorQuestCode.value = null;
        loading.value = false;
      }
      return false;
    }
    loading.value = true;
    if (!claimErrorQuestCode.value) error.value = null;
    claimNotice.value = null;
    try {
      const next = await questApi.state(locale.code);
      if (!isCurrentRequest() || predatesClaim()) return false;
      snapshot.value = next;
      scheduleRollover(next);
      error.value = null;
      claimErrorQuestCode.value = null;
      try {
        retireClaimedCommands(next);
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : "WEEKLY_QUEST_COMMAND_STORAGE_UNAVAILABLE";
      }
      return true;
    } catch (cause) {
      if (isCurrentRequest() && !predatesClaim() && !claimErrorQuestCode.value) {
        error.value = cause instanceof Error ? cause.message : "WEEKLY_QUEST_LOAD_FAILED";
      }
      return false;
    } finally {
      if (isCurrentRequest()) loading.value = false;
    }
  }

  // Tier 1, Tier 2 and bonus rows share one canonical server command:
  // POST /api/quests/{questCode}/claim. The quest code selects the row; the
  // idempotency key and authoritative state readback make the claim atomic.
  async function claim(quest: CanonicalQuest): Promise<boolean> {
    if (!remoteApiEnabled || !quest.eligible || Date.parse(quest.eligibleUntil) <= Date.now()
        || !["COMPLETED", "CLAIMABLE"].includes(quest.status) || claiming.value) return false;
    const epoch = accountEpoch;
    const requestSequence = ++claimSequence;
    const isCurrentRequest = () => epoch === accountEpoch && requestSequence === claimSequence;
    claiming.value = quest.questCode;
    error.value = null;
    claimErrorQuestCode.value = null;
    claimNotice.value = null;
    try {
      const key = acquireWeeklyQuestCommandKey(accountKeyValue, quest.questCode, quest.instanceKey);
      const claimResult = await questApi.claim(quest.questCode, key, quest.instanceKey);
      if (!isCurrentRequest()) return false;
      if (claimResult.questId !== quest.questCode || claimResult.instanceKey !== quest.instanceKey) {
        throw new Error("WEEKLY_QUEST_CLAIM_MISMATCH");
      }
      const readBack = await questApi.state(locale.code);
      if (!isCurrentRequest()) return false;
      const authoritative = readBack.quests.find((row) =>
        row.questCode === quest.questCode && row.instanceKey === quest.instanceKey);
      if (!authoritative || authoritative.status !== "CLAIMED") {
        throw new Error("WEEKLY_QUEST_CLAIM_NOT_CONFIRMED");
      }
      snapshot.value = readBack;
      scheduleRollover(readBack);
      finishWeeklyQuestCommand(accountKeyValue, quest.questCode, quest.instanceKey);
      return true;
    } catch (cause) {
      if (!isCurrentRequest()) return false;
      claimErrorQuestCode.value = quest.questCode;
      const message = cause instanceof Error ? cause.message : "WEEKLY_QUEST_CLAIM_FAILED";
      if (message.startsWith("WEEKLY_QUEST_COMMAND_")) {
        error.value = message;
        return false;
      }
      if (claimOutcomeAmbiguous(cause)) {
        const recovery = await recoverClaim(quest, isCurrentRequest);
        if (!isCurrentRequest()) return false;
        if (recovery === "claimed") return true;
        if (message === "IDEMPOTENCY_RESULT_UNKNOWN" && recovery === "not_claimed") {
          try {
            finishWeeklyQuestCommand(accountKeyValue, quest.questCode, quest.instanceKey);
          } catch (storageCause) {
            error.value = storageCause instanceof Error
              ? storageCause.message : "WEEKLY_QUEST_COMMAND_STORAGE_UNAVAILABLE";
            return false;
          }
          error.value = "WEEKLY_QUEST_CLAIM_RETRY_REQUIRED";
          return false;
        }
        error.value = "WEEKLY_QUEST_CLAIM_OUTCOME_UNKNOWN";
        return false;
      }
      const notice = questClaimNoticeFor(cause);
      try {
        finishWeeklyQuestCommand(accountKeyValue, quest.questCode, quest.instanceKey);
      } catch (storageCause) {
        error.value = storageCause instanceof Error
          ? storageCause.message : "WEEKLY_QUEST_COMMAND_STORAGE_UNAVAILABLE";
        return false;
      }
      if (notice) {
        await refresh(true);
        if (!isCurrentRequest()) return false;
        // This is a confirmed terminal reply, never a new reward. Read back
        // server state before allowing the UI to explain the changed status.
        claimNotice.value = notice;
        return false;
      }
      error.value = message;
      return false;
    } finally {
      if (isCurrentRequest()) claiming.value = null;
    }
  }

  function bindAccount(accountKey: string) {
    accountEpoch += 1;
    refreshSequence += 1;
    claimSequence += 1;
    snapshot.value = null;
    scheduleRollover(null);
    loading.value = false;
    error.value = null;
    claimErrorQuestCode.value = null;
    claimNotice.value = null;
    claiming.value = null;
    accountKeyValue = accountKey.trim().toLowerCase() || "default";
    void refresh();
  }

  watch(() => locale.code, () => {
    if (remoteApiEnabled) void refresh();
  });

  return { snapshot, loading, error, claimErrorQuestCode, claimNotice, claiming, tier1Quests, tier2Quests, multiplier, refresh, claim, bindAccount };
});
