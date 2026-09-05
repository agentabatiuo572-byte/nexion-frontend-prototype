import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

// Ported from Nexion-prototype/lib/store/goals.ts (zustand+persist → Pinia).
// User-defined earning goals (Sprint A-3 / F.3). Stored locally so a target +
// deadline survives a refresh and the page can surface "X days to goal".
// 旧设备级单键 "nexgrid-goals-v1" 废弃(存量无账号归属,mock 可重建);目标按账号分行。
const ACCOUNTS_KEY = "nexgrid-goals-accounts-v1"; // { [accountKey]: { goals: Goal[] } }

export interface Goal {
  id: string;
  targetUSDT: number;
  deadlineMs: number; // user-set deadline (timestamp)
  createdAt: number;
  achieved: boolean;
}

function hydrate(accountKey: string): Goal[] {
  const row = readAccountRow<{ goals?: Goal[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.goals)) return row.goals;
  return [];
}

export const useGoals = defineStore("goals", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  const goals = ref<Goal[]>(hydrate(boundKey));

  function persist() {
    writeAccountRow<{ goals: Goal[] }>(ACCOUNTS_KEY, boundKey, { goals: goals.value });
  }

  /** 账号切换重绑:装载该账号的目标(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    goals.value = hydrate(boundKey);
  }

  function setGoal(g: Pick<Goal, "targetUSDT" | "deadlineMs">) {
    goals.value = [
      ...goals.value,
      { ...g, id: `goal-${Date.now()}`, createdAt: Date.now(), achieved: false },
    ];
    persist();
  }

  function markAchieved(id: string) {
    goals.value = goals.value.map((g) => (g.id === id ? { ...g, achieved: true } : g));
    persist();
  }

  function remove(id: string) {
    goals.value = goals.value.filter((g) => g.id !== id);
    persist();
  }

  function clear() {
    goals.value = [];
    persist();
  }

  return { goals, setGoal, markAchieved, remove, clear, bindAccount };
});
