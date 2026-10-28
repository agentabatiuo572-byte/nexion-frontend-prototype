import { defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import { apiRuntimeConfig, apiRuntimeClientOrigin, networkRankApi, remoteApiEnabled } from "@/api/runtime";
import type { NetworkRankSnapshot } from "@/api/network-rank-api";
import { ApiError } from "@/api/errors";
import { runPassiveTabRead, passiveTabReadScope, invalidatePassiveTabRead, invalidateBeforePassiveTabRead, rememberPassiveTabRead } from "@/lib/passive-tab-read";
import { useLocaleStore } from "./locale";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import {
  captureRuntimeRevision,
  isCurrentRuntimeRevision,
  subscribeRuntimeRevision,
} from "@/api/order-api";

export const useNetworkRank = defineStore("networkRank", () => {
  let boundKey = "default";
  const epoch = createRemoteAccountEpoch(boundKey);
  let requestGeneration = 0;
  let retryAt = 0;
  let environmentInvalidated = false;
  let refreshInFlight: { key: string; request: Promise<boolean> } | null = null;
  const snapshot = ref<NetworkRankSnapshot | null>(null);
  const status = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  function invalidate(): void {
    invalidatePassiveTabRead("network-device-rank");
    requestGeneration += 1;
    snapshot.value = null;
    status.value = remoteApiEnabled ? environmentInvalidated || Date.now() < retryAt ? "error" : "idle" : "ready";
    refreshInFlight = null;
  }
  function invalidateEnvironment(): void { environmentInvalidated = true; invalidate(); }
  function currentClient(): boolean {
    if (!environmentInvalidated && (apiRuntimeConfig.environment !== apiRuntimeClientOrigin.environment || apiRuntimeConfig.baseUrl !== apiRuntimeClientOrigin.baseUrl)) invalidateEnvironment();
    return !environmentInvalidated;
  }
  watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl], invalidateEnvironment, { flush: "sync" });
  watch(() => useLocaleStore().code, invalidate, { flush: "sync" });
  function bindAccount(accountKey: string): void {
    boundKey = accountKey;
    epoch.bind(boundKey);
    retryAt = 0;
    invalidate();
  }
  function refresh(request: RemoteAccountRequest = epoch.snapshot()): Promise<boolean> {
    if (!remoteApiEnabled) return Promise.resolve(true);
    if (!currentClient()) return Promise.resolve(false);
    if (Date.now() < retryAt) return Promise.resolve(false);
    if (!epoch.isCurrent(request)) return Promise.resolve(false);
    const runScope = captureRuntimeRevision();
    if (!isCurrentRuntimeRevision(runScope)) return Promise.resolve(false);
    const generation = requestGeneration;
    const readScope = passiveTabReadScope();
    const current = () => generation === requestGeneration
      && epoch.isCurrent(request)
      && isCurrentRuntimeRevision(runScope) && currentClient() && readScope === passiveTabReadScope();
    const key = JSON.stringify([request, runScope, readScope]);
    if (refreshInFlight?.key === key) return refreshInFlight.request;
    invalidateBeforePassiveTabRead("network-device-rank");
    const pending = (async () => {
      status.value = "loading";
      if (!current()) return false;
      try {
        const next = await networkRankApi.snapshot();
        if (!current()) return false;
        snapshot.value = next;
        if (!current()) return false;
        retryAt = 0;
        status.value = "ready";
        return current();
      } catch (cause) {
        // Failed estimates cannot reappear as a fallback while a retry is loading.
        if (current()) {
          if (cause instanceof ApiError && cause.kind === "http" && cause.status === 429) retryAt = Date.now() + (cause.retryAfterMs ?? 30_000);
          snapshot.value = null;
          if (!current()) return false;
          status.value = "error";
        }
        return false;
      }
    })();
    if (!current()) return pending;
    refreshInFlight = { key, request: pending };
    rememberPassiveTabRead("network-device-rank", pending, [request, runScope]);
    void pending.finally(() => {
      if (refreshInFlight?.request === pending) refreshInFlight = null;
    });
    return pending;
  }
  function ensure(): Promise<boolean> {
    if (!currentClient()) return Promise.resolve(false);
    if (Date.now() < retryAt) return Promise.resolve(false);
    const request = epoch.snapshot(), runtime = captureRuntimeRevision();
    return runPassiveTabRead("network-device-rank", () => refresh(request), [request, runtime]);
  }
  const unsubscribeCommerceRun = subscribeRuntimeRevision(() => {
    if (!remoteApiEnabled) return;
    invalidate();
    void refresh();
  });
  onScopeDispose(unsubscribeCommerceRun);
  return { snapshot, status, bindAccount, refresh, ensure };
});
