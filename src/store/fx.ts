import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { computeQuoteRate, isFxQuoteUsable } from "./fx-core";
import { paymentApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { remoteAccountScope, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

// 汇率牌价 store(PAY-规格 [FEAT-PAY03])。FxQuoteConfig 单源 = 后台 [D6],
// client 只读;VND 仅出现在银行转账流程,全站其余场景维持 USDT 单币展示。
//
// MOCK-ONLY: load() 用种子模拟 GET /api/config/fx(~300ms 延迟)。PROD 切换:
// seed 段整体删除,改为真实拉取;失败/超时由请求层置 syncFailed = true(对齐
// config.ts syncFailed 语义:通道置灰禁下单,禁回退写死默认价继续接单)。
const MOCK_FX_SEED = { baseRateVndPerUsdt: 26_000, buySpreadPct: 1.5, lockWindowMin: 30, minDepositUsdt: 10, maxDepositUsdt: 5000, todayRemainingDepositUsdt: 5000, todayRemainingVnd: 131_950_000, feeVnd: 0, feeUsdt: 0 };
const MOCK_LATENCY_MS = 300;

export const useFx = defineStore("fx", () => {
  // FxQuoteConfig 镜像(未拉取 = 0/null;组件按「未返回」渲染占位「—」,不显示 0)。
  const baseRateVndPerUsdt = ref(0);
  const buySpreadPct = ref(0);
  const lockWindowMin = ref(0);
  const syncedAt = ref<number | null>(null);
  const syncFailed = ref(false);
  const loading = ref(false);
  const configReady = ref(false);
  const vietQrEnabled = ref(false);
  const minDepositUsdt = ref(0);
  const maxDepositUsdt = ref(0);
  const todayRemainingDepositUsdt = ref(0);
  const todayRemainingVnd = ref(0);
  const dailyCapacityKnown = ref(true);
  const feeVnd = ref(0);
  const feeUsdt = ref(0);
  let inFlightLoad: Promise<void> | null = null;
  let loadScope: RemoteAccountRequest | null = null;
  let loadSessionUserId: number | null = null;
  let devFailureInjected = false;

  function ownsLoad(scope: RemoteAccountRequest, sessionUserId: number | null): boolean {
    return !remoteApiEnabled || (remoteAccountScope.isCurrent(scope)
      && (sessionVault.read()?.user.userId ?? null) === sessionUserId);
  }

  function resetRemoteState(): void {
    baseRateVndPerUsdt.value = 0;
    buySpreadPct.value = 0;
    lockWindowMin.value = 0;
    syncedAt.value = null;
    configReady.value = false;
    vietQrEnabled.value = false;
    minDepositUsdt.value = 0;
    maxDepositUsdt.value = 0;
    todayRemainingDepositUsdt.value = 0;
    todayRemainingVnd.value = 0;
    dailyCapacityKnown.value = true;
    feeVnd.value = 0;
    feeUsdt.value = 0;
  }

  // 牌价派生不缓存、禁双写(规格 ③):始终从 base + spread 现算,无第二份存储。
  const quoteRate = computed(() => computeQuoteRate(baseRateVndPerUsdt.value, buySpreadPct.value));

  // 可用性(规格 ② 异常1/3):syncFailed / 缺字段(base=0)/ spread 越界 [0,3] /
  // quoteRate ≤ 0 任一即不可用 —— A4 银行轨用它禁下单,牌价行组件用它转灰态。
  const fxAvailable = computed(
    () => !syncFailed.value && isFxQuoteUsable(baseRateVndPerUsdt.value, buySpreadPct.value),
  );

  /** 拉取牌价配置(并发去重)。MOCK 种子;PROD = GET /api/config/fx([D6] 单源)。 */
  function load(): Promise<void> {
    if (inFlightLoad && loadScope && ownsLoad(loadScope, loadSessionUserId)) return inFlightLoad;
    if (remoteApiEnabled && loadScope && !ownsLoad(loadScope, loadSessionUserId)) {
      resetRemoteState();
      syncFailed.value = false;
    }
    const scope = remoteAccountScope.snapshot();
    const sessionUserId = remoteApiEnabled ? sessionVault.read()?.user.userId ?? null : null;
    loadScope = scope;
    loadSessionUserId = sessionUserId;
    loading.value = true;
    inFlightLoad = (async () => {
      try {
        if (remoteApiEnabled) {
          const [config, quote] = await Promise.all([paymentApi.config(), paymentApi.fxQuote()]);
          if (devFailureInjected || !ownsLoad(scope, sessionUserId)) return;
          syncFailed.value = false;
          baseRateVndPerUsdt.value = quote.baseRateVndPerUsdt;
          buySpreadPct.value = quote.buySpreadPct;
          lockWindowMin.value = quote.lockWindowMinutes;
          vietQrEnabled.value = config.vietQr.enabled;
          minDepositUsdt.value = config.vietQr.minDepositUsdt;
          maxDepositUsdt.value = config.vietQr.maxDepositUsdt;
          todayRemainingDepositUsdt.value = config.vietQr.todayRemainingDepositUsdt;
          todayRemainingVnd.value = config.vietQr.todayRemainingVnd;
          dailyCapacityKnown.value = config.vietQr.dailyCapacityKnown !== false;
          feeVnd.value = config.vietQr.feeVnd;
          feeUsdt.value = config.vietQr.feeUsdt;
          configReady.value = true;
          syncedAt.value = Date.now();
        } else {
          await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
          if (!devFailureInjected) {
            syncFailed.value = false;
            baseRateVndPerUsdt.value = MOCK_FX_SEED.baseRateVndPerUsdt;
            buySpreadPct.value = MOCK_FX_SEED.buySpreadPct;
            lockWindowMin.value = MOCK_FX_SEED.lockWindowMin;
            minDepositUsdt.value = MOCK_FX_SEED.minDepositUsdt;
            maxDepositUsdt.value = MOCK_FX_SEED.maxDepositUsdt;
            todayRemainingDepositUsdt.value = MOCK_FX_SEED.todayRemainingDepositUsdt;
            todayRemainingVnd.value = MOCK_FX_SEED.todayRemainingVnd;
            dailyCapacityKnown.value = true;
            feeVnd.value = MOCK_FX_SEED.feeVnd;
            feeUsdt.value = MOCK_FX_SEED.feeUsdt;
            vietQrEnabled.value = true;
            configReady.value = true;
            syncedAt.value = Date.now();
          }
        }
      } catch {
        if (!ownsLoad(scope, sessionUserId)) return;
        // Remote and explicit App sandbox payment facts are server-owned.  A
        // failed config/quote must also evict any prior snapshot so a stale
        // quote or local-looking numeric default cannot keep the rail usable.
        if (remoteApiEnabled) resetRemoteState();
        syncFailed.value = true;
        configReady.value = false;
      } finally {
        if (loadScope === scope) {
          loading.value = false;
          inFlightLoad = null;
        }
      }
    })();
    return inFlightLoad;
  }

  /** ⚠️ DEV/DEMO-ONLY:注入牌价拉取失败态,演 [FEAT-PAY03] ② 异常1(tester 驱动)。 */
  function _devSetFxFailure(value: boolean) {
    if (import.meta.env.PROD) return;
    devFailureInjected = value;
    syncFailed.value = value;
  }

  // tester 驱动通道:DEV 挂 globalThis.__nxDev(guard 双层之外层)。合并不覆盖:
  // Object.assign 到既有对象,防与 deposits.ts 等其它 store 的挂载互相清掉。
  if (!import.meta.env.PROD) {
    const g = globalThis as unknown as { __nxDev?: Record<string, unknown> };
    Object.assign((g.__nxDev ??= {}), { setFxFailure: _devSetFxFailure });
  }

  return {
    baseRateVndPerUsdt,
    buySpreadPct,
    lockWindowMin,
    syncedAt,
    syncFailed,
    loading,
    configReady,
    vietQrEnabled,
    minDepositUsdt,
    maxDepositUsdt,
    todayRemainingDepositUsdt,
    todayRemainingVnd,
    dailyCapacityKnown,
    feeVnd,
    feeUsdt,
    quoteRate,
    fxAvailable,
    load,
    _devSetFxFailure,
  };
});
