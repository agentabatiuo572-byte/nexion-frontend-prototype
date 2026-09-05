import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

// Ported from Nexion-prototype/lib/store/exchange.ts (zustand → Pinia).
// Basic swap store: live-jittered NEX↔USDT rate + swap history.
// MOCK-ONLY: client mints swap id + rate; production submits POST /api/exchange/swap
// (PRD §9.4.3) and subscribes the canonical rate (server is the authority).
export interface SwapEvent {
  id: string;
  ts: number;
  fromSym: "USDT" | "NEX";
  toSym: "USDT" | "NEX";
  fromAmount: number;
  toAmount: number;
  rate: number; // USDT per NEX
}

// 三分:rate 是平台市场态(账号无关,设备共享)→ 仍存旧全局键;history 是用户 swap
// 记录 → 改按账号分行(P2-8 设备级泄漏修复)。旧键里的 history 存量废弃、不迁移。
const GLOBAL_KEY = "nexgrid-exchange-v1"; // { rate } —— 平台市场汇率,设备共享
const ACCOUNTS_KEY = "nexgrid-exchange-accounts-v1"; // { [accountKey]: { history: SwapEvent[] } }

function jitterRate(base = 0.085): number {
  // 1 NEX ≈ $0.07–0.10 with light jitter
  return +(base + (Math.random() - 0.5) * 0.02).toFixed(5);
}

function hydrateGlobalRate(): number {
  try {
    const s = uni.getStorageSync(GLOBAL_KEY) as { rate?: number } | "";
    if (s && typeof s === "object" && typeof s.rate === "number") return s.rate;
  } catch {
    // first run
  }
  return jitterRate();
}

function hydrateHistory(accountKey: string): SwapEvent[] {
  const row = readAccountRow<{ history?: SwapEvent[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.history)) return row.history;
  return [];
}

export const useExchange = defineStore("exchange", () => {
  // 账号维度:仅 history 随账号走;rate 是平台市场态,全局共享(P-031 store 不互 import,
  // 账号确定后由 lib/account-scope 统一重绑)。
  let boundKey = "default";
  const history = ref<SwapEvent[]>(hydrateHistory(boundKey));
  const rate = ref(hydrateGlobalRate());
  const rateUpdatedAt = ref(Date.now());

  function persistHistory() {
    writeAccountRow<{ history: SwapEvent[] }>(ACCOUNTS_KEY, boundKey, { history: history.value });
  }
  function persistRate() {
    try {
      uni.setStorageSync(GLOBAL_KEY, { rate: rate.value });
    } catch {
      // storage unavailable
    }
  }

  /** 账号切换重绑:装载该账号的 swap 记录;顺带刷新全局汇率(平台态,多端可能已跳)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    history.value = hydrateHistory(boundKey);
    rate.value = hydrateGlobalRate();
  }

  function refreshRate() {
    rate.value = jitterRate(rate.value);
    rateUpdatedAt.value = Date.now();
    persistRate();
  }

  function recordSwap(e: Omit<SwapEvent, "id" | "ts">): SwapEvent {
    const evt: SwapEvent = {
      ...e,
      id: `SW-${Date.now().toString(36).slice(-5).toUpperCase()}`,
      ts: Date.now(),
    };
    history.value = [evt, ...history.value].slice(0, 50);
    persistHistory();
    return evt;
  }

  return { history, rate, rateUpdatedAt, refreshRate, recordSwap, bindAccount };
});
