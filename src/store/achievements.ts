import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

/**
 * Achievement records. Ported from Nexion-prototype/lib/store/achievements.ts
 * (zustand persist → Pinia + uni storage). Tracks unlocked/claimed state per
 * achievement id; definitions + reward amounts live in mock/achievements.ts.
 */

export interface AchievementRecord {
  id: string;
  unlockedAt: number;
  claimed: boolean;
}

// 旧设备级单键 "nexgrid-achievements-v1" 废弃(存量无账号归属,mock 可重建);成就记录按账号分行。
const ACCOUNTS_KEY = "nexgrid-achievements-accounts-v1"; // { [accountKey]: { records: AchievementRecord[] } }

function hydrate(accountKey: string): AchievementRecord[] {
  const row = readAccountRow<{ records?: AchievementRecord[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.records)) return row.records;
  return [];
}

export const useAchievements = defineStore("achievements", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  const records = ref<AchievementRecord[]>(hydrate(boundKey));

  function persist() {
    writeAccountRow<{ records: AchievementRecord[] }>(ACCOUNTS_KEY, boundKey, { records: records.value });
  }

  /** 账号切换重绑:装载该账号的成就记录(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    records.value = hydrate(boundKey);
  }

  /** Returns true if newly unlocked. */
  function unlock(id: string): boolean {
    if (records.value.find((r) => r.id === id)) return false;
    records.value = [...records.value, { id, unlockedAt: Date.now(), claimed: false }];
    persist();
    return true;
  }

  /** Returns true if newly claimed. */
  function claim(id: string): boolean {
    const rec = records.value.find((r) => r.id === id);
    if (!rec || rec.claimed) return false;
    records.value = records.value.map((r) => (r.id === id ? { ...r, claimed: true } : r));
    persist();
    return true;
  }

  function isUnlocked(id: string): boolean {
    return !!records.value.find((r) => r.id === id);
  }

  function isClaimed(id: string): boolean {
    return !!records.value.find((r) => r.id === id && r.claimed);
  }

  function unlockedCount(): number {
    return records.value.length;
  }

  return { records, unlock, claim, isUnlocked, isClaimed, unlockedCount, bindAccount };
});
