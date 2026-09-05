import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

// Ported from Nexion-prototype/lib/v3/exchange.ts (zustand → Pinia).
// Risk-control layer on top of the basic swap store (exchange.ts).
//
// Enforces spec §8 caps:
//   - Per-user daily cap: $50 USDT equivalent
//   - Platform daily cap: $20,000 USDT equivalent (shared, simulated)
//   - Queue: requests over today's cap wait until tomorrow's reset
// 汇率与日限规则保持不变。
//
// `canExchange(usd)` returns the gating decision; `record(usd)` commits after
// success. `resetIfNewDay()` rolls the daily counters at midnight.
// MOCK-ONLY: real backend owns counters server-side (anti-tamper). localStorage
// here is a prototype stub.
export const USER_DAILY_CAP_USD = 50;
export const PLATFORM_DAILY_CAP_USD = 20_000;

export interface QueuedExchange {
  id: string;
  amountUSD: number;
  direction: "nex2usdt" | "usdt2nex";
  requestedAt: number;
}

export type Gate =
  | { ok: true }
  | { ok: false; reason: "user-cap"; usedToday: number; cap: number }
  | { ok: false; reason: "platform-cap"; usedToday: number; cap: number };

// 旧设备级单键 "nexgrid-exchange-v3" 废弃(存量无账号归属,mock 可重建);兑换风控计数按账号分行。
const ACCOUNTS_KEY = "nexgrid-exchange-v3-accounts-v1"; // { [accountKey]: PersistShape }

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PersistShape {
  todayUserUsedUSD: number;
  todayPlatformUsedUSD: number;
  dayKey: string;
  queue: QueuedExchange[];
}

function defaults(): PersistShape {
  return {
    todayUserUsedUSD: 0,
    todayPlatformUsedUSD: 0,
    dayKey: todayKey(),
    queue: [],
  };
}

function hydrate(accountKey: string): PersistShape {
  const row = readAccountRow<Partial<PersistShape>>(ACCOUNTS_KEY, accountKey);
  if (row) return { ...defaults(), ...row };
  return defaults();
}

export const useExchangeV3 = defineStore("exchangeV3", () => {
  // ponytail: todayPlatformUsedUSD 名义是平台共享计数,但整块 stub 落进 per-account 行——
  // store 已声明真后台 server-side 拥有全部计数,demo 里平台日上限 $20k 从不触及,每账号各记
  // 自己那份对显示无差;真后台替换时平台计数归 server 全局、用户计数归 per-user。
  // 关键防泄漏靶:todayUserUsedUSD 换账号不得继承。
  let boundKey = "default";
  const init = hydrate(boundKey);
  const todayUserUsedUSD = ref(init.todayUserUsedUSD);
  const todayPlatformUsedUSD = ref(init.todayPlatformUsedUSD);
  const dayKey = ref(init.dayKey);
  const queue = ref<QueuedExchange[]>(init.queue);

  function persist() {
    writeAccountRow<PersistShape>(ACCOUNTS_KEY, boundKey, {
      todayUserUsedUSD: todayUserUsedUSD.value,
      todayPlatformUsedUSD: todayPlatformUsedUSD.value,
      dayKey: dayKey.value,
      queue: queue.value,
    });
  }

  /** 账号切换重绑:装载该账号的兑换风控计数(防跨账号继承日限)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    const next = hydrate(boundKey);
    todayUserUsedUSD.value = next.todayUserUsedUSD;
    todayPlatformUsedUSD.value = next.todayPlatformUsedUSD;
    dayKey.value = next.dayKey;
    queue.value = next.queue;
  }

  function resetIfNewDay() {
    const t = todayKey();
    if (dayKey.value !== t) {
      dayKey.value = t;
      todayUserUsedUSD.value = 0;
      todayPlatformUsedUSD.value = 0;
      persist();
    }
  }

  function canExchange(usd: number): Gate {
    if (todayUserUsedUSD.value + usd > USER_DAILY_CAP_USD) {
      return { ok: false, reason: "user-cap", usedToday: todayUserUsedUSD.value, cap: USER_DAILY_CAP_USD };
    }
    if (todayPlatformUsedUSD.value + usd > PLATFORM_DAILY_CAP_USD) {
      return { ok: false, reason: "platform-cap", usedToday: todayPlatformUsedUSD.value, cap: PLATFORM_DAILY_CAP_USD };
    }
    return { ok: true };
  }

  function record(usd: number) {
    todayUserUsedUSD.value += usd;
    todayPlatformUsedUSD.value += usd;
    persist();
  }

  function enqueue(req: Omit<QueuedExchange, "id" | "requestedAt">) {
    const item: QueuedExchange = {
      ...req,
      id: `Q-${Date.now().toString(36).slice(-5).toUpperCase()}`,
      requestedAt: Date.now(),
    };
    queue.value = [item, ...queue.value].slice(0, 20);
    persist();
  }

  return {
    todayUserUsedUSD, todayPlatformUsedUSD, dayKey, queue,
    resetIfNewDay, canExchange, record, enqueue, bindAccount,
  };
});

export function dailyUserPctUsed(used: number): number {
  return Math.min(1, used / USER_DAILY_CAP_USD);
}
export function dailyPlatformPctUsed(used: number): number {
  return Math.min(1, used / PLATFORM_DAILY_CAP_USD);
}
