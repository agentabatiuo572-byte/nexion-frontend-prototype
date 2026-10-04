import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { goalsApi, remoteApiEnabled } from "@/api/runtime";

// Ported from Nexion-prototype/lib/store/goals.ts (zustand+persist → Pinia).
// User-defined earning goals (Sprint A-3 / F.3). Mock mode keeps the legacy
// account row for demos; remote and explicit sandbox modes are server-owned.
// 旧设备级单键 "nexgrid-goals-v1" 废弃(存量无账号归属,mock 可重建);目标按账号分行。
const ACCOUNTS_KEY = "nexgrid-goals-accounts-v1"; // { [accountKey]: { goals: Goal[] } }

export interface Goal {
  id: string;
  targetUSDT: number;
  deadlineMs: number; // user-set deadline (timestamp)
  createdAt: number;
  achieved: boolean;
}

export type GoalsLoadStatus = "idle" | "loading" | "ready" | "error";
export type GoalSaveOutcome = "saved" | "stale";
type GoalSaveInput = Pick<Goal, "targetUSDT" | "deadlineMs"> & { idempotencyKey: string };

function hydrate(accountKey: string): Goal[] {
  if (remoteApiEnabled) return [];
  const row = readAccountRow<{ goals?: Goal[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.goals)) return row.goals;
  return [];
}

export const useGoals = defineStore("goals", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  let scopeEpoch = 0;
  let readEpoch = 0;
  let recommendationEpoch = 0;
  let pendingGoalRead: { scopeEpoch: number; readEpoch: number; promise: Promise<void> } | null = null;
  let pendingGoalSave: { scopeEpoch: number; promise: Promise<GoalSaveOutcome> } | null = null;
  const accountEpoch = ref(0);
  const goals = ref<Goal[]>(remoteApiEnabled ? [] : hydrate(boundKey));
  const lifetimeEarningsUsdt = ref(0);
  const status = ref<GoalsLoadStatus>(remoteApiEnabled ? "idle" : "ready");
  const error = ref("");
  const recommendation = ref<Awaited<ReturnType<typeof goalsApi.recommendation>> | null>(null);
  const recommendationStatus = ref<GoalsLoadStatus>(remoteApiEnabled ? "idle" : "ready");
  const recommendationError = ref<string | null>(null);

  function persist() {
    if (remoteApiEnabled) return;
    writeAccountRow<{ goals: Goal[] }>(ACCOUNTS_KEY, boundKey, { goals: goals.value });
  }

  /** 账号切换重绑:装载该账号的目标(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    const nextBoundKey = normalizeAccountKey(rawAccountKey);
    const accountChanged = nextBoundKey !== boundKey;
    boundKey = nextBoundKey;
    if (accountChanged) accountEpoch.value += 1;
    if (remoteApiEnabled) {
      scopeEpoch += 1;
      recommendationEpoch += 1;
      goals.value = [];
      lifetimeEarningsUsdt.value = 0;
      recommendation.value = null;
      recommendationError.value = null;
      recommendationStatus.value = "idle";
      status.value = "loading";
      void ensure(scopeEpoch);
    } else {
      goals.value = hydrate(boundKey);
    }
  }

  function invalidatePendingReads() {
    readEpoch += 1;
    pendingGoalRead = null;
  }

  function refresh(expectedEpoch = scopeEpoch): Promise<void> {
    if (!remoteApiEnabled) return Promise.resolve();
    const expectedReadEpoch = ++readEpoch;
    status.value = "loading";
    error.value = "";
    const promise = (async () => {
      try {
      const snapshot = await goalsApi.list();
        if (expectedEpoch !== scopeEpoch || expectedReadEpoch !== readEpoch) return;
      goals.value = snapshot.goals.map((goal) => ({
        id: String(goal.id), targetUSDT: goal.targetUsdt, deadlineMs: goal.deadlineAt,
        createdAt: goal.createdAt, achieved: goal.achieved,
      }));
      lifetimeEarningsUsdt.value = snapshot.lifetimeEarningsUsdt;
      status.value = "ready";
      } catch (cause) {
        if (expectedEpoch !== scopeEpoch || expectedReadEpoch !== readEpoch) return;
      status.value = "error";
      error.value = cause instanceof Error ? cause.message : "GOALS_UNAVAILABLE";
      // Keep the last server-confirmed snapshot visible. The error status tells
      // the page that the data may be stale and offers an explicit retry.
      }
    })();
    const pending = { scopeEpoch: expectedEpoch, readEpoch: expectedReadEpoch, promise };
    pendingGoalRead = pending;
    void promise.finally(() => {
      if (pendingGoalRead === pending) pendingGoalRead = null;
    });
    return promise;
  }

  function ensure(expectedEpoch = scopeEpoch): Promise<void> {
    if (!remoteApiEnabled) return Promise.resolve();
    if (pendingGoalRead?.scopeEpoch === expectedEpoch) return pendingGoalRead.promise;
    return refresh(expectedEpoch);
  }

  async function refreshRecommendation(targetUSDT: number, deadlineMs: number) {
    if (!remoteApiEnabled) return;
    const expectedScopeEpoch = scopeEpoch;
    const expectedRecommendationEpoch = ++recommendationEpoch;
    recommendation.value = null;
    recommendationError.value = null;
    recommendationStatus.value = "loading";
    try {
      const nextRecommendation = await goalsApi.recommendation(targetUSDT, deadlineMs);
      if (expectedScopeEpoch !== scopeEpoch || expectedRecommendationEpoch !== recommendationEpoch) return;
      recommendation.value = nextRecommendation;
      recommendationStatus.value = "ready";
    } catch (cause) {
      if (expectedScopeEpoch !== scopeEpoch || expectedRecommendationEpoch !== recommendationEpoch) return;
      recommendation.value = null;
      recommendationError.value = cause instanceof Error ? cause.message : "GOALS_RECOMMENDATION_UNAVAILABLE";
      recommendationStatus.value = "error";
    }
  }

  async function setGoal(g: GoalSaveInput): Promise<GoalSaveOutcome> {
    if (remoteApiEnabled) {
      const expectedEpoch = scopeEpoch;
      if (pendingGoalSave?.scopeEpoch === expectedEpoch) return pendingGoalSave.promise;
      const promise = (async () => {
        const goal = await goalsApi.create({
          targetUsdt: g.targetUSDT,
          deadlineAt: g.deadlineMs,
          idempotencyKey: g.idempotencyKey,
        });
        if (expectedEpoch !== scopeEpoch) return "stale";
        invalidatePendingReads();
        goals.value = [...goals.value, {
          id: String(goal.id), targetUSDT: goal.targetUsdt, deadlineMs: goal.deadlineAt,
          createdAt: goal.createdAt, achieved: goal.achieved,
        }];
        lifetimeEarningsUsdt.value = goal.lifetimeEarningsUsdt;
        status.value = "ready";
        error.value = "";
        return "saved";
      })();
      const pending = { scopeEpoch: expectedEpoch, promise };
      pendingGoalSave = pending;
      try {
        return await promise;
      } finally {
        if (pendingGoalSave === pending) pendingGoalSave = null;
      }
    }
    goals.value = [
      ...goals.value,
      { targetUSDT: g.targetUSDT, deadlineMs: g.deadlineMs, id: `goal-${Date.now()}`, createdAt: Date.now(), achieved: false },
    ];
    persist();
    return "saved";
  }

  async function markAchieved(id: string) {
    if (remoteApiEnabled) {
      const expectedEpoch = scopeEpoch;
      const goal = await goalsApi.setStatus(Number(id), true);
      if (expectedEpoch !== scopeEpoch) return;
      invalidatePendingReads();
      goals.value = goals.value.map((item) => item.id === id ? { ...item, achieved: goal.achieved } : item);
      status.value = "ready";
      error.value = "";
      return;
    }
    goals.value = goals.value.map((g) => (g.id === id ? { ...g, achieved: true } : g));
    persist();
  }

  async function remove(id: string) {
    if (remoteApiEnabled) {
      const expectedEpoch = scopeEpoch;
      await goalsApi.remove(Number(id));
      if (expectedEpoch !== scopeEpoch) return;
      invalidatePendingReads();
    }
    goals.value = goals.value.filter((g) => g.id !== id);
    if (remoteApiEnabled) {
      status.value = "ready";
      error.value = "";
    }
    if (!remoteApiEnabled) persist();
  }

  function clear() {
    if (remoteApiEnabled) {
      goals.value = [];
      return;
    }
    goals.value = [];
    persist();
  }

  return {
    goals, lifetimeEarningsUsdt, status, error, recommendation, recommendationStatus, recommendationError, accountEpoch,
    refresh, ensure, refreshRecommendation, setGoal, markAchieved, remove, clear, bindAccount,
  };
});
