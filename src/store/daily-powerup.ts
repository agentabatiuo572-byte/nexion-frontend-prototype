import { defineStore } from "pinia";
import { ref } from "vue";
import { pointsApi, remoteApiEnabled } from "@/api/runtime";
import { createAccountRowCommit } from "./account-scoped-storage";
import { normalizeAccountKey } from "./account-cloud";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

/**
 * Ported from Nexion-prototype/lib/store/daily-powerup.ts (zustand persist →
 * Pinia + uni storage). Tracks which streak-tied conversion power-ups the user
 * has claimed (activated). Unlock state is derived from current streak vs
 * threshold at the call site, not stored here — only the "activated" decision
 * is durable.
 */

export type StreakPowerUpId =
  | "royalty_boost"
  | "nex_boost"
  | "staking_boost"
  | "genesis_whitelist";

interface DailyPowerUpData {
  claimed: StreakPowerUpId[];
  claimedAt: Record<string, number>;
}

// 旧设备级单键 "nexgrid-daily-powerup-v1" 废弃(存量无账号归属,mock 可重建);增益领取态按账号分行。
const ACCOUNTS_KEY = "nexgrid-daily-powerup-accounts-v1"; // { [accountKey]: DailyPowerUpData }

function defaults(): DailyPowerUpData {
  return { claimed: [], claimedAt: {} };
}

/** 磁盘行 → 领取态。格式不认识 → null(调用方退回 defaults / 内存态)。 */
function parseRow(raw: unknown): DailyPowerUpData | null {
  const row = raw as Partial<DailyPowerUpData> | null;
  if (!row || !Array.isArray(row.claimed)) return null;
  return {
    claimed: row.claimed,
    claimedAt: row.claimedAt && typeof row.claimedAt === "object" ? row.claimedAt : {},
  };
}

export const useDailyPowerUp = defineStore("dailyPowerUp", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  const claimed = ref<StreakPowerUpId[]>([]);
  const claimedAt = ref<Record<string, number>>({});
  const remotePowerUpIds = ref<Record<string, number>>({});
  let boundKey = "default";
  const remoteAccountEpoch = createRemoteAccountEpoch(boundKey);

  function clearRemoteFacts() {
    claimed.value = [];
    claimedAt.value = {};
    remotePowerUpIds.value = {};
  }

  async function refreshRemote(request: RemoteAccountRequest = remoteAccountEpoch.snapshot()): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    if (!remoteAccountEpoch.isCurrent(request)) return false;
    clearRemoteFacts();
    try {
      const snapshot = await pointsApi.state();
      if (!remoteAccountEpoch.isCurrent(request)) return false;
      remotePowerUpIds.value = Object.fromEntries(snapshot.powerUps.flatMap((powerUp) => [
        [powerUp.powerUpCode, powerUp.powerUpId],
        [powerUp.powerUpCode.toLowerCase(), powerUp.powerUpId],
      ]));
      claimed.value = snapshot.powerUps
        .filter((powerUp) => powerUp.status === "ACTIVATED")
        .map((powerUp) => powerUp.powerUpCode.toLowerCase() as StreakPowerUpId);
      return true;
    } catch {
      if (remoteAccountEpoch.isCurrent(request)) clearRemoteFacts();
      return false;
    }
  }

  async function claimRemote(id: StreakPowerUpId): Promise<boolean> {
    const request = remoteAccountEpoch.snapshot();
    const powerUpId = remotePowerUpIds.value[id];
    if (!powerUpId) return false;
    try {
      await pointsApi.activatePowerUp(powerUpId, `h5-power-up:${powerUpId}`);
      if (!remoteAccountEpoch.isCurrent(request)) return false;
      return refreshRemote(request);
    } catch {
      // Keep the last canonical AVAILABLE row and id so a transient claim
      // failure leaves the CTA retryable. A failed mutation is not evidence
      // that the server snapshot became empty.
      return false;
    }
  }

  // 落盘唯一出口:乐观并发提交器(每日一次性增益被两个标签页各领一次 = 白送一档增益)。
  const rows = createAccountRowCommit<DailyPowerUpData>({
    tableKey: ACCOUNTS_KEY,
    parse: parseRow,
    snapshot: () => ({ claimed: claimed.value, claimedAt: claimedAt.value }),
    sync: (row) => {
      claimed.value = row.claimed;
      claimedAt.value = row.claimedAt;
    },
  });

  /** 账号切换重绑:装载该账号的增益领取态(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    remoteAccountEpoch.bind(boundKey);
    if (remoteApiEnabled) {
      clearRemoteFacts();
      void refreshRemote(remoteAccountEpoch.snapshot());
      return;
    }
    const row = rows.bind(boundKey) ?? defaults();
    claimed.value = row.claimed;
    claimedAt.value = row.claimedAt;
  }
  bindAccount("default");

  /** 领一档增益。🔴 已领判定跑在**磁盘最新状态**上:别处领过的这里就被挡住,不会二次激活。 */
  function claim(id: StreakPowerUpId): { ok: boolean; conflict?: boolean } {
    if (remoteApiEnabled) return { ok: false };
    const r = rows.commit((cur) => {
      if (cur.claimed.includes(id)) return null;
      return {
        next: { claimed: [...cur.claimed, id], claimedAt: { ...cur.claimedAt, [id]: Date.now() } },
        result: true as const,
      };
    });
    return r.ok ? { ok: true } : { ok: false, conflict: r.conflict };
  }

  function hasClaimed(id: StreakPowerUpId): boolean {
    return claimed.value.includes(id);
  }

  function reset() {
    if (remoteApiEnabled) {
      clearRemoteFacts();
      return;
    }
    // persist-verdict-ok: 每日加成状态重置,失败下一次进入重算(非资金)
    rows.commit(() => ({ next: defaults(), result: true as const }));
  }

  return { claimed, claimedAt, claim, claimRemote, hasClaimed, reset, bindAccount, refreshRemote };
});
