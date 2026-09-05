import { defineStore } from "pinia";
import { reactive } from "vue";
import { eventsApi, remoteApiEnabled } from "@/api/runtime";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

/**
 * Event-quest store — ported from Nexion-prototype/lib/store/event-quest.ts
 * (zustand persist → Pinia + uni storage).
 *
 * Tracks which trackable events the user has joined / claimed. The source
 * persisted two string[] sets; here (per PITFALL P-027) membership is modeled
 * as reactive<Record<string, boolean>> so template `.has()`-style reads stay
 * reactive across join/claim mutations (Vue does not track Set internals).
 *
 * Backend-replaceable: join → POST /api/events/:id/join, claim →
 * POST /api/events/:id/claim (PRD §9.11e atomic pattern). Persist key carries
 * a version suffix for forward migration.
 */

// 旧设备级单键 "nexgrid-event-quest-v1" 废弃(存量无账号归属,mock 可重建);活动参与态按账号分行。
const ACCOUNTS_KEY = "nexgrid-event-quest-accounts-v1"; // { [accountKey]: PersistShape }

interface PersistShape {
  joined: string[];
  claimed: string[];
}

function hydrate(accountKey: string): PersistShape {
  const row = readAccountRow<Partial<PersistShape>>(ACCOUNTS_KEY, accountKey);
  if (row) {
    return {
      joined: Array.isArray(row.joined) ? row.joined : [],
      claimed: Array.isArray(row.claimed) ? row.claimed : [],
    };
  }
  return { joined: [], claimed: [] };
}

export const useEventQuest = defineStore("eventQuest", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  const init = remoteApiEnabled ? { joined: [], claimed: [] } : hydrate(boundKey);
  // Record<id, true> membership maps (P-027: reactive Record, not Set/ref).
  const joinedMap = reactive<Record<string, boolean>>({});
  const claimedMap = reactive<Record<string, boolean>>({});
  const remoteAccountEpoch = createRemoteAccountEpoch(boundKey);
  for (const id of init.joined) joinedMap[id] = true;
  for (const id of init.claimed) claimedMap[id] = true;

  function clearRemoteFacts() {
    for (const key of Object.keys(joinedMap)) delete joinedMap[key];
    for (const key of Object.keys(claimedMap)) delete claimedMap[key];
  }

  async function refreshRemote(request: RemoteAccountRequest = remoteAccountEpoch.snapshot()): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    clearRemoteFacts();
    try {
      const snapshot = await eventsApi.state();
      if (!remoteAccountEpoch.isCurrent(request)) return false;
      for (const event of snapshot.events) {
        if (["JOINED", "CLAIMABLE", "CLAIMED"].includes(event.userStatus)) joinedMap[event.eventCode] = true;
        if (event.userStatus === "CLAIMED") claimedMap[event.eventCode] = true;
      }
      return true;
    } catch {
      if (remoteAccountEpoch.isCurrent(request)) clearRemoteFacts();
      return false;
    }
  }

  async function joinRemote(id: string): Promise<boolean> {
    if (!remoteApiEnabled) return join(id);
    const request = remoteAccountEpoch.snapshot();
    try {
      await eventsApi.join(id, `h4-event-join:${id}`);
      return remoteAccountEpoch.isCurrent(request) && refreshRemote(request);
    } catch {
      if (remoteAccountEpoch.isCurrent(request)) clearRemoteFacts();
      return false;
    }
  }

  async function claimRemote(id: string): Promise<boolean> {
    if (!remoteApiEnabled) return claim(id);
    const request = remoteAccountEpoch.snapshot();
    try {
      await eventsApi.claim(id, `h4-event-claim:${id}`);
      return remoteAccountEpoch.isCurrent(request) && refreshRemote(request);
    } catch {
      if (remoteAccountEpoch.isCurrent(request)) clearRemoteFacts();
      return false;
    }
  }

  function persist() {
    writeAccountRow<PersistShape>(ACCOUNTS_KEY, boundKey, {
      joined: Object.keys(joinedMap).filter((k) => joinedMap[k]),
      claimed: Object.keys(claimedMap).filter((k) => claimedMap[k]),
    });
  }

  /** 账号切换重绑:清空并装载该账号的活动参与/领取态(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    remoteAccountEpoch.bind(boundKey);
    clearRemoteFacts();
    if (remoteApiEnabled) {
      void refreshRemote(remoteAccountEpoch.snapshot());
      return;
    }
    const next = hydrate(boundKey);
    for (const id of next.joined) joinedMap[id] = true;
    for (const id of next.claimed) claimedMap[id] = true;
  }

  function isJoined(id: string): boolean {
    return joinedMap[id] === true;
  }
  function isClaimed(id: string): boolean {
    return claimedMap[id] === true;
  }

  /** Returns true if this call newly joined (was not already joined). */
  function join(id: string): boolean {
    if (remoteApiEnabled) {
      void joinRemote(id);
      return false;
    }
    if (joinedMap[id]) return false;
    joinedMap[id] = true;
    persist();
    return true;
  }

  /** Returns true if this call newly claimed (was not already claimed). */
  function claim(id: string): boolean {
    if (remoteApiEnabled) {
      void claimRemote(id);
      return false;
    }
    if (claimedMap[id]) return false;
    claimedMap[id] = true;
    persist();
    return true;
  }

  return { joinedMap, claimedMap, isJoined, isClaimed, join, claim, joinRemote, claimRemote, refreshRemote, bindAccount };
});
