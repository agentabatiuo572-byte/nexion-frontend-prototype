import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { questApi, remoteApiEnabled } from "@/api/runtime";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

/**
 * Quest store — ported from Nexion-prototype/lib/store/quest.ts + lib/mock/quest.ts
 * (zustand persist → Pinia + uni storage).
 *
 * First-day onboarding quest: route-/action-based tasks, each unlocking an
 * incremental NEX (and optionally USDT) micro-reward on FIRST completion.
 * This store owns only the *data + reward* side of the quest:
 *   - the canonical task definitions (id / i18nKey / href / rewards / order)
 *   - which task ids have been completed (persisted, idempotent)
 *   - markComplete(id) → tells the caller whether this was a first completion
 *     and how much to credit. It does NOT touch balances or bills — by
 *     architecture rule, stores don't import each other; cross-store
 *     orchestration (creditNex + bills + toast) is composed at the call site:
 *     App.vue route watcher (visit tasks), lib/share.ts (invite_friend), or
 *     the acting page (bind_bank_card in wallet-cards-new.vue). Each calls
 *     markComplete here, then credits + toasts on { firstTime: true }.
 *
 * The card display side (day-one-quest-card.vue on the protected home page)
 * currently renders a HARD-CODED `done` set and is intentionally NOT wired to
 * this store — see flag returned to the owner. Only the watcher/reward side
 * (globally safe) is built here.
 *
 * Backend-replaceable: task defs come from the same canonical shape the real
 * backend would serve (GET /api/quest); markComplete maps to
 * POST /api/quest/complete which returns { firstTime, rewardNex, rewardUsdt }
 * + the canonical balance/ledger rows. Swapping the local Record for an API
 * call requires zero changes to callers.
 */

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
 * Canonical task table — mirrors Nexion-prototype/lib/mock/quest.ts QUEST_TASKS
 * (same ids / rewards / order). Frozen so callers can't mutate the seed.
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
  const completedMap = reactive<Record<string, boolean>>({});
  const rewardMap = reactive<Record<string, number>>({});
  const remoteStatus = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  if (!remoteApiEnabled) for (const id of hydrate(boundKey)) completedMap[id] = true;

  function clearRemoteFacts() {
    for (const key of Object.keys(completedMap)) delete completedMap[key];
    for (const key of Object.keys(rewardMap)) delete rewardMap[key];
  }

  async function refreshRemote(): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    const epoch = accountEpoch;
    const requestSequence = ++refreshSequence;
    const isCurrentRequest = () => epoch === accountEpoch && requestSequence === refreshSequence;
    remoteStatus.value = "loading";
    clearRemoteFacts();
    try {
      const snapshot = await questApi.state();
      if (!isCurrentRequest()) return false;
      clearRemoteFacts();
      for (const quest of snapshot.quests) {
        rewardMap[quest.questCode] = quest.rewardNex;
        if (quest.status === "CLAIMED") completedMap[quest.questCode] = true;
      }
      remoteStatus.value = "ready";
      return true;
    } catch {
      // Do not leave a previous account's progress visible after an authority
      // failure. A retry may refill this map only from the server snapshot.
      if (isCurrentRequest()) { clearRemoteFacts(); remoteStatus.value = "error"; }
      return false;
    }
  }

  async function claimRemote(id: QuestTaskId): Promise<boolean> {
    if (!remoteApiEnabled) return false;
    const epoch = accountEpoch;
    const requestSequence = ++claimSequence;
    const isCurrentRequest = () => epoch === accountEpoch && requestSequence === claimSequence;
    try {
      const result = await questApi.claim(id, `h3-quest-claim:${id}`);
      if (!isCurrentRequest()) return false;
      if (result.status !== "CLAIMED") return false;
      return refreshRemote();
    } catch {
      if (isCurrentRequest()) clearRemoteFacts();
      return false;
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
    clearRemoteFacts();
    remoteStatus.value = remoteApiEnabled ? "idle" : "ready";
    if (remoteApiEnabled) {
      void refreshRemote();
      return;
    }
    for (const id of hydrate(boundKey)) completedMap[id] = true;
  }

  function isComplete(id: QuestTaskId): boolean {
    return completedMap[id] === true;
  }

  function rewardFor(id: QuestTaskId): number | null {
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
      clearRemoteFacts();
      return;
    }
    for (const k of Object.keys(completedMap)) delete completedMap[k];
    persist();
  }

  return { completedMap, QUEST_TASKS, isComplete, rewardFor, markComplete, reset, bindAccount, refreshRemote, claimRemote, remoteStatus };
});
