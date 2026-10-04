import { market24hSummary } from "@/lib/market-24h-summary";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { marketApi, remoteApiEnabled } from "@/api/runtime";
import type { NexMarketSnapshot } from "@/api/market-api";

// Local curves are deliberately available only when VITE_API_MODE=mock. Remote
// mode starts empty: an unavailable authority must never be rendered as a quote.
const HOURLY_SEED = [
  0.142, 0.143, 0.141, 0.144, 0.146, 0.148, 0.151, 0.153, 0.155, 0.158, 0.162, 0.165,
  0.168, 0.171, 0.169, 0.172, 0.175, 0.178, 0.176, 0.174, 0.172, 0.170, 0.169, 0.171,
];
const DAILY_SEED = [
  0.082, 0.085, 0.088, 0.091, 0.094, 0.097, 0.102, 0.108, 0.115, 0.121, 0.118, 0.124, 0.131, 0.128, 0.135,
  0.142, 0.139, 0.146, 0.153, 0.149, 0.155, 0.161, 0.158, 0.164, 0.168, 0.172, 0.169, 0.175, 0.171, 0.171,
];

export const useMarket = defineStore("market", () => {
  const isMockMode = !remoteApiEnabled;
  const nexPriceUSDT = ref(isMockMode ? 0.171 : 0);
  const open24h = ref(isMockMode ? 0.142 : 0);
  const high24h = ref(isMockMode ? 0.178 : 0);
  const low24h = ref(isMockMode ? 0.139 : 0);
  const change24hPct = ref(isMockMode ? 20.4 : 0);
  const change24hAvailable = ref(isMockMode);
  // The G3 endpoint does not authorise volume/supply. Zero means unavailable,
  // not a client estimate.
  const volume24hUSDT = ref(0);
  const circulating = ref(0);
  const costBasis = ref(isMockMode ? 0.085 : 0);
  const klineHourly = ref<number[]>(isMockMode ? [...HOURLY_SEED] : []);
  const klineDaily = ref<number[]>(isMockMode ? [...DAILY_SEED] : []);
  const historySamples = ref<NexMarketSnapshot["history"]>([]);
  const lastTickTs = ref(0);
  const remoteError = ref<string | null>(null);
  const remoteReady = ref(isMockMode);
  const marketRunId = ref<string | null>(null);
  let lastRemoteFetchAt = 0;
  let nexGeneration = 0;
  let syncInFlight: Promise<boolean> | null = null;
  const marketCap = computed(() => nexPriceUSDT.value * circulating.value);

  function clearRemoteState() {
    nexPriceUSDT.value = 0;
    open24h.value = 0;
    high24h.value = 0;
    low24h.value = 0;
    change24hPct.value = 0;
    change24hAvailable.value = false;
    volume24hUSDT.value = 0;
    circulating.value = 0;
    costBasis.value = 0;
    klineHourly.value = [];
    klineDaily.value = [];
    historySamples.value = [];
    lastTickTs.value = 0;
    remoteReady.value = false;
  }

  function commitNex(snapshot: Awaited<ReturnType<typeof marketApi.fetch>>) {
    const summary = market24hSummary(snapshot.history, snapshot.currentPrice);
    nexPriceUSDT.value = snapshot.currentPrice;
    costBasis.value = snapshot.costBasis;
    open24h.value = summary?.open ?? 0;
    high24h.value = summary?.high ?? 0;
    low24h.value = summary?.low ?? 0;
    change24hPct.value = summary?.changePct ?? 0;
    change24hAvailable.value = summary !== null;
    klineHourly.value = summary?.prices ?? [];
    klineDaily.value = snapshot.sparkline;
    historySamples.value = snapshot.history;
    lastTickTs.value = Date.now();
    remoteError.value = null;
    remoteReady.value = true;
  }

  // 权威不可达是常态输入,不 reject(resilience 门同族;z6 审计 P0:
  // wallet-nex 的 setInterval 裸发 tickPrice → 原 throw 每 3s 一个 unhandledRejection)。
  function syncRemote(): Promise<boolean> {
    if (!remoteApiEnabled) return Promise.resolve(true);
    if (syncInFlight) return syncInFlight;
    if (remoteReady.value && Date.now() - lastRemoteFetchAt < 30_000) return Promise.resolve(true);
    lastRemoteFetchAt = Date.now();
    const generation = ++nexGeneration;
    const operation = (async () => {
      try {
        const snapshot = await marketApi.fetch();
        if (generation !== nexGeneration) return false;
        marketRunId.value = snapshot.runId;
        commitNex(snapshot);
        return true;
      } catch {
        if (generation !== nexGeneration) return false;
        marketRunId.value = null;
        clearRemoteState();
        remoteError.value = "G3_REMOTE_AUTHORITY_UNAVAILABLE";
        return false;
      }
    })();
    syncInFlight = operation;
    void operation.finally(() => {
      if (syncInFlight === operation) syncInFlight = null;
    });
    return operation;
  }

  function tickPrice() {
    if (remoteApiEnabled) return syncRemote();
    const t = Date.now();
    if (t - lastTickTs.value < 3000) return;
    const cur = nexPriceUSDT.value;
    const delta = (Math.random() < 0.08 ? 0.06 : 0.012) * (Math.random() - 0.5);
    const next = Math.max(0.001, cur + cur * delta);
    nexPriceUSDT.value = next;
    high24h.value = Math.max(high24h.value, next);
    low24h.value = Math.min(low24h.value, next);
    change24hPct.value = ((next - open24h.value) / open24h.value) * 100;
    klineHourly.value = [...klineHourly.value.slice(1), next];
    lastTickTs.value = t;
  }

  return {
    isMockMode, nexPriceUSDT, open24h, high24h, low24h, change24hPct, change24hAvailable, volume24hUSDT,
    circulating, costBasis, klineHourly, klineDaily, historySamples, lastTickTs, marketCap, remoteError, remoteReady,
    marketRunId, syncRemote, tickPrice,
  };
});
