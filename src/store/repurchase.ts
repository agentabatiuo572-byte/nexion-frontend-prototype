import { defineStore } from "pinia";
import { ref } from "vue";
import { remoteApiEnabled, repurchaseApi } from "@/api/runtime";
import { normalizeCommandAmount } from "@/lib/command-amount";
import { createRemoteIntentGate } from "@/lib/g-remote-intent";
import { isSettledRejection } from "@/api/errors";
import type {
  RepurchaseConfig,
  RepurchaseOrder,
  RepurchaseSnapshot,
} from "@/api/repurchase-api";

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "REPURCHASE_REQUEST_FAILED";
}

export const useRepurchase = defineStore("repurchase", () => {
  const config = ref<RepurchaseConfig | null>(null);
  const orders = ref<RepurchaseOrder[]>([]);
  const walletBalanceUsdt = ref(0);
  const serverTime = ref(0);
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref("");
  const historyLoading = ref(false);
  const historyError = ref("");
  const intents = createRemoteIntentGate("g7");
  const pendingOpenAmount = ref<number | null>(null);
  let boundAccount = "";
  let accountGeneration = 0;
  let configGeneration = 0;
  let ordersGeneration = 0;
  let refreshGeneration = 0;
  let commandGeneration = 0;

  function apply(snapshot: RepurchaseSnapshot) {
    const validProvenance = snapshot.sourceEnvironment === "PRODUCTION" && snapshot.runId === "";
    if (!validProvenance) throw new Error("G7_RUNTIME_PROVENANCE_INVALID");
    orders.value = snapshot.orders;
    walletBalanceUsdt.value = snapshot.walletBalanceUsdt;
    serverTime.value = snapshot.serverTime;
    error.value = "";
    historyError.value = "";
  }

  function acceptConfig(nextConfig: RepurchaseConfig): RepurchaseConfig {
    const validProvenance = nextConfig.sourceEnvironment === "PRODUCTION" && nextConfig.runId === "";
    if (!validProvenance) throw new Error("G7_RUNTIME_PROVENANCE_INVALID");
    return nextConfig;
  }

  async function refresh() {
    // There is intentionally no browser-owned repurchase rail. If this store
    // is reached outside server mode, leave its empty state in place instead
    // of manufacturing a product, wallet balance, or order list.
    if (!remoteApiEnabled) {
      config.value = null;
      orders.value = [];
      walletBalanceUsdt.value = 0;
      serverTime.value = 0;
      return null;
    }
    const account = accountGeneration;
    const refreshRequest = ++refreshGeneration;
    const configRequest = ++configGeneration;
    const ordersRequest = ++ordersGeneration;
    historyLoading.value = false;
    loading.value = true;
    error.value = "";
    const configOutcome = repurchaseApi.fetchConfig()
      .then((rawConfig) => {
        const nextConfig = acceptConfig(rawConfig);
        if (account === accountGeneration && configRequest === configGeneration) {
          config.value = nextConfig;
        }
        return { ok: true as const, value: nextConfig };
      })
      .catch((cause: unknown) => {
        if (account === accountGeneration && configRequest === configGeneration) {
          config.value = null;
          error.value = message(cause);
        }
        return { ok: false as const, cause };
      });
    const ordersOutcome = repurchaseApi.fetchOrders()
      .then((snapshot) => {
        if (account === accountGeneration && ordersRequest === ordersGeneration) {
          apply(snapshot);
        }
        return { ok: true as const, value: snapshot };
      })
      .catch((cause: unknown) => {
        if (account === accountGeneration && ordersRequest === ordersGeneration) {
          orders.value = [];
          walletBalanceUsdt.value = 0;
          serverTime.value = 0;
          error.value = message(cause);
        }
        return { ok: false as const, cause };
      });
    const [configResult, ordersResult] = await Promise.all([configOutcome, ordersOutcome]);
    try {
      // 权威不可达是常态输入,不 reject(resilience 门):error/config/orders 降级态
      // 已在各分支落好;null = 本轮没有可用快照(同 mock 分支先例)。
      if (!configResult.ok || !ordersResult.ok) return null;
      return ordersResult.value;
    } finally {
      if (account === accountGeneration && refreshRequest === refreshGeneration) {
        loading.value = false;
      }
    }
  }

  function restorePendingOpen() {
    const pending = boundAccount ? intents.unresolved(boundAccount, "open") : [];
    if (pending.length > 1 || pending.some((amount) => typeof amount !== "number"
        || !Number.isFinite(amount) || amount <= 0)) throw new Error("REMOTE_INTENT_PERSIST_FAILED");
    pendingOpenAmount.value = pending.length ? pending[0] as number : null;
  }

  async function refreshHistory() {
    if (!remoteApiEnabled || !boundAccount) return;
    const account = accountGeneration;
    const request = ++ordersGeneration;
    historyLoading.value = true;
    historyError.value = "";
    try {
      const snapshot = await repurchaseApi.fetchOrders();
      if (account === accountGeneration && request === ordersGeneration) apply(snapshot);
    } catch (cause) {
      // A read failure cannot reverse a confirmed money operation.
      if (account === accountGeneration && request === ordersGeneration) historyError.value = message(cause);
    } finally {
      if (account === accountGeneration && request === ordersGeneration) historyLoading.value = false;
    }
  }

  async function command(scope: string, payload: number | string, action: (idempotencyKey: string) => Promise<RepurchaseSnapshot>) {
    if (submitting.value) throw new Error("REPURCHASE_COMMAND_IN_PROGRESS");
    if (!boundAccount) throw new Error("REMOTE_INTENT_ACCOUNT_INVALID");
    const recovering = intents.unresolved(boundAccount, scope).includes(payload);
    const lease = intents.acquire(boundAccount, scope, payload);
    const account = accountGeneration;
    const request = ++commandGeneration;
    submitting.value = true;
    try {
      restorePendingOpen();
      const snapshot = await action(lease.key);
      if (account !== accountGeneration || request !== commandGeneration) {
        throw new Error("REPURCHASE_ACCOUNT_CHANGED");
      }
      // Commands update orders and wallet, but not the independent config
      // resource. Only invalidate pre-receipt orders reads.
      ordersGeneration += 1;
      historyLoading.value = false;
      apply(snapshot);
      intents.complete(lease, true);
      // A storage cleanup problem cannot undo an acknowledged server receipt.
      try { restorePendingOpen(); } catch (cause) { error.value = message(cause); }
      if (snapshot.orders.length < snapshot.ordersPage.total) {
        // Money is already committed. A paginated receipt is not a complete
        // history; hydrate it without turning a failed GET into a failed POST.
        await refreshHistory();
      }
      return snapshot;
    } catch (cause) {
      // A later rejection cannot disprove an earlier unknown commit.
      intents.complete(lease, !recovering && isSettledRejection(cause));
      if (account === accountGeneration) {
        try { restorePendingOpen(); } catch (storageError) { error.value = message(storageError); }
      }
      // A rejected money command does not invalidate the last canonical config
      // and order snapshot. The page can show the command error in a toast and
      // remain usable; only refresh/read failures put the whole screen in HOLD.
      throw cause;
    } finally {
      if (account === accountGeneration && request === commandGeneration) {
        submitting.value = false;
      }
    }
  }

  async function open(amountUsdt: number) {
    if (!remoteApiEnabled) throw new Error("REPURCHASE_REMOTE_AUTHORITY_REQUIRED");
    restorePendingOpen();
    const commandAmount = normalizeCommandAmount(amountUsdt);
    const recovering = pendingOpenAmount.value !== null;
    if (recovering && pendingOpenAmount.value !== commandAmount) throw new Error("REPURCHASE_PENDING_RECOVERY_REQUIRED");
    const policy = config.value;
    if (!recovering && (!policy || !policy.enabled)) throw new Error("REPURCHASE_PRODUCT_UNAVAILABLE");
    if (!Number.isFinite(amountUsdt) || commandAmount <= 0 || (!recovering && commandAmount < policy!.minAmountUsdt)) {
      throw new Error("REPURCHASE_MIN_AMOUNT_NOT_MET");
    }
    if (!recovering && commandAmount > walletBalanceUsdt.value) throw new Error("REPURCHASE_WALLET_INSUFFICIENT");
    return command("open", commandAmount, (idempotencyKey) =>
      repurchaseApi.open(commandAmount, idempotencyKey));
  }

  async function claim(orderNo: string) {
    if (!remoteApiEnabled) throw new Error("REPURCHASE_REMOTE_AUTHORITY_REQUIRED");
    return command("claim", orderNo, (idempotencyKey) =>
      repurchaseApi.claim(orderNo, idempotencyKey));
  }

  async function earlyWithdraw(orderNo: string) {
    if (!remoteApiEnabled) throw new Error("REPURCHASE_REMOTE_AUTHORITY_REQUIRED");
    return command("early", orderNo, (idempotencyKey) =>
      repurchaseApi.earlyWithdraw(orderNo, idempotencyKey));
  }

  function bindAccount(accountKey: string) {
    boundAccount = accountKey.trim();
    accountGeneration += 1;
    configGeneration += 1;
    ordersGeneration += 1;
    refreshGeneration += 1;
    commandGeneration += 1;
    config.value = null;
    orders.value = [];
    walletBalanceUsdt.value = 0;
    serverTime.value = 0;
    error.value = "";
    loading.value = false;
    historyLoading.value = false;
    historyError.value = "";
    submitting.value = false;
    pendingOpenAmount.value = null;
    try { restorePendingOpen(); } catch (cause) { error.value = message(cause); }
    if (remoteApiEnabled) void refresh();
  }

  return {
    config,
    orders,
    walletBalanceUsdt,
    serverTime,
    loading,
    submitting,
    error,
    historyLoading,
    historyError,
    pendingOpenAmount,
    refresh,
    refreshHistory,
    open,
    claim,
    earlyWithdraw,
    bindAccount,
  };
});
