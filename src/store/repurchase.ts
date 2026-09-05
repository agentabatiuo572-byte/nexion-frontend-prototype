import { defineStore } from "pinia";
import { ref } from "vue";
import { remoteApiEnabled, repurchaseApi } from "@/api/runtime";
import type {
  RepurchaseConfig,
  RepurchaseOrder,
  RepurchaseSnapshot,
} from "@/api/repurchase-api";

let sequence = 0;

function newKey(operation: string): string {
  sequence += 1;
  return `g7-${operation}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

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
  const pendingKeys = new Map<string, string>();
  let accountGeneration = 0;
  let configGeneration = 0;
  let ordersGeneration = 0;
  let refreshGeneration = 0;
  let commandGeneration = 0;

  function apply(snapshot: RepurchaseSnapshot) {
    orders.value = snapshot.orders;
    walletBalanceUsdt.value = snapshot.walletBalanceUsdt;
    serverTime.value = snapshot.serverTime;
    error.value = "";
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
    loading.value = true;
    error.value = "";
    const configOutcome = repurchaseApi.fetchConfig()
      .then((nextConfig) => {
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

  function key(scope: string): string {
    const existing = pendingKeys.get(scope);
    if (existing) return existing;
    const created = newKey(scope.replace(/[^a-z0-9-]/gi, "-").toLowerCase());
    pendingKeys.set(scope, created);
    return created;
  }

  async function command(scope: string, action: (idempotencyKey: string) => Promise<RepurchaseSnapshot>) {
    if (submitting.value) throw new Error("REPURCHASE_COMMAND_IN_PROGRESS");
    const account = accountGeneration;
    const request = ++commandGeneration;
    submitting.value = true;
    try {
      const snapshot = await action(key(scope));
      if (account !== accountGeneration || request !== commandGeneration) {
        throw new Error("REPURCHASE_ACCOUNT_CHANGED");
      }
      pendingKeys.delete(scope);
      // Commands update orders and wallet, but not the independent config
      // resource. Only invalidate pre-receipt orders reads.
      ordersGeneration += 1;
      apply(snapshot);
      return snapshot;
    } catch (cause) {
      if (account === accountGeneration && request === commandGeneration) {
        error.value = message(cause);
      }
      throw cause;
    } finally {
      if (account === accountGeneration && request === commandGeneration) {
        submitting.value = false;
      }
    }
  }

  async function open(amountUsdt: number) {
    if (!remoteApiEnabled) throw new Error("REPURCHASE_REMOTE_AUTHORITY_REQUIRED");
    const policy = config.value;
    if (!policy || !policy.enabled) throw new Error("REPURCHASE_PRODUCT_UNAVAILABLE");
    if (!Number.isFinite(amountUsdt) || amountUsdt < policy.minAmountUsdt) {
      throw new Error("REPURCHASE_MIN_AMOUNT_NOT_MET");
    }
    if (amountUsdt > walletBalanceUsdt.value) throw new Error("REPURCHASE_WALLET_INSUFFICIENT");
    return command(`open:${amountUsdt}`, (idempotencyKey) =>
      repurchaseApi.open(amountUsdt, idempotencyKey));
  }

  async function claim(orderNo: string) {
    if (!remoteApiEnabled) throw new Error("REPURCHASE_REMOTE_AUTHORITY_REQUIRED");
    return command(`claim:${orderNo}`, (idempotencyKey) =>
      repurchaseApi.claim(orderNo, idempotencyKey));
  }

  async function earlyWithdraw(orderNo: string) {
    if (!remoteApiEnabled) throw new Error("REPURCHASE_REMOTE_AUTHORITY_REQUIRED");
    return command(`early:${orderNo}`, (idempotencyKey) =>
      repurchaseApi.earlyWithdraw(orderNo, idempotencyKey));
  }

  function bindAccount() {
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
    submitting.value = false;
    pendingKeys.clear();
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
    refresh,
    open,
    claim,
    earlyWithdraw,
    bindAccount,
  };
});
