import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { questApi, remoteApiEnabled } from "@/api/runtime";
import type { CanonicalQuest, QuestSnapshot } from "@/api/quest-api";

function idempotencyKey(questCode: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `weekly-${questCode}-${suffix}`.slice(0, 120);
}

/** Weekly quests are a read-through projection of the server mission and reward ledger. */
export const useWeeklyQuest = defineStore("weeklyQuest", () => {
  const snapshot = ref<QuestSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const claiming = ref<string | null>(null);
  const claimKeys = new Map<string, string>();
  let accountEpoch = 0;
  let refreshSequence = 0;
  let claimSequence = 0;

  const tier1Quests = computed(() => snapshot.value?.quests.filter((q) => q.layer === "WEEKLY_T1") ?? []);
  const tier2Quests = computed(() => snapshot.value?.quests.filter((q) => q.layer === "WEEKLY_T2") ?? []);
  const multiplier = computed(() => snapshot.value?.questBonusMultiplier ?? 1);

  async function refresh(): Promise<boolean> {
    const epoch = accountEpoch;
    const requestSequence = ++refreshSequence;
    const isCurrentRequest = () => epoch === accountEpoch && requestSequence === refreshSequence;
    if (!remoteApiEnabled) {
      if (isCurrentRequest()) {
        snapshot.value = null;
        error.value = "WEEKLY_QUEST_SERVER_REQUIRED";
        loading.value = false;
      }
      return false;
    }
    loading.value = true;
    error.value = null;
    try {
      const next = await questApi.state();
      if (!isCurrentRequest()) return false;
      snapshot.value = next;
      return true;
    } catch (cause) {
      if (isCurrentRequest()) {
        snapshot.value = null;
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
    if (!remoteApiEnabled || !["COMPLETED", "CLAIMABLE"].includes(quest.status) || claiming.value) return false;
    const key = claimKeys.get(quest.questCode) ?? idempotencyKey(quest.questCode);
    claimKeys.set(quest.questCode, key);
    const epoch = accountEpoch;
    const requestSequence = ++claimSequence;
    const isCurrentRequest = () => epoch === accountEpoch && requestSequence === claimSequence;
    claiming.value = quest.questCode;
    error.value = null;
    try {
      const claimResult = await questApi.claim(quest.questCode, key);
      if (!isCurrentRequest()) return false;
      if (claimResult.questId !== quest.questCode) throw new Error("WEEKLY_QUEST_CLAIM_MISMATCH");
      const readBack = await questApi.state();
      if (!isCurrentRequest()) return false;
      const authoritative = readBack.quests.find((row) => row.questCode === quest.questCode);
      if (!authoritative || authoritative.status !== "CLAIMED") {
        throw new Error("WEEKLY_QUEST_CLAIM_NOT_CONFIRMED");
      }
      snapshot.value = readBack;
      claimKeys.delete(quest.questCode);
      return true;
    } catch (cause) {
      if (isCurrentRequest()) {
        error.value = cause instanceof Error ? cause.message : "WEEKLY_QUEST_CLAIM_FAILED";
      }
      return false;
    } finally {
      if (isCurrentRequest()) claiming.value = null;
    }
  }

  function bindAccount(_accountKey: string) {
    accountEpoch += 1;
    refreshSequence += 1;
    claimSequence += 1;
    snapshot.value = null;
    loading.value = false;
    error.value = null;
    claiming.value = null;
    claimKeys.clear();
    void refresh();
  }

  return { snapshot, loading, error, claiming, tier1Quests, tier2Quests, multiplier, refresh, claim, bindAccount };
});
