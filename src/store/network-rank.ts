import { defineStore } from "pinia";
import { onScopeDispose, ref } from "vue";
import { networkRankApi, remoteApiEnabled } from "@/api/runtime";
import type { NetworkRankSnapshot } from "@/api/network-rank-api";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import {
  captureRuntimeRevision,
  isCurrentRuntimeRevision,
  subscribeRuntimeRevision,
  type RuntimeRevisionScope,
} from "@/api/order-api";

export const useNetworkRank = defineStore("networkRank", () => {
  const HEALTHY_SNAPSHOT_MS = 10_000;
  let boundKey = "default";
  const epoch = createRemoteAccountEpoch(boundKey);
  let lastSuccessAt = 0;
  let lastSuccessRun: RuntimeRevisionScope | null = null;
  let requestGeneration = 0;
  let refreshInFlight: { key: string; request: Promise<boolean> } | null = null;
  const snapshot = ref<NetworkRankSnapshot | null>(null);
  const status = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  function invalidate(): void {
    requestGeneration += 1;
    snapshot.value = null;
    status.value = remoteApiEnabled ? "idle" : "ready";
    lastSuccessAt = 0;
    lastSuccessRun = null;
    refreshInFlight = null;
  }
  function bindAccount(accountKey: string): void {
    boundKey = accountKey;
    epoch.bind(boundKey);
    invalidate();
  }
  function refresh(request: RemoteAccountRequest = epoch.snapshot()): Promise<boolean> {
    if (!remoteApiEnabled) return Promise.resolve(true);
    if (!epoch.isCurrent(request)) return Promise.resolve(false);
    const runScope = captureRuntimeRevision();
    if (!isCurrentRuntimeRevision(runScope)) return Promise.resolve(false);
    if (snapshot.value !== null && status.value === "ready"
      && lastSuccessRun !== null && isCurrentRuntimeRevision(lastSuccessRun)
      && Date.now() - lastSuccessAt < HEALTHY_SNAPSHOT_MS) {
      return Promise.resolve(true);
    }
    const generation = requestGeneration;
    const current = () => generation === requestGeneration
      && epoch.isCurrent(request)
      && isCurrentRuntimeRevision(runScope);
    const key = `${request.accountKey}:${request.epoch}:${runScope.epoch}:${runScope.runId ?? "production"}`;
    if (refreshInFlight?.key === key) return refreshInFlight.request;
    const pending = (async () => {
      status.value = "loading";
      try {
        const next = await networkRankApi.snapshot();
        if (!current()) return false;
        snapshot.value = next;
        status.value = "ready";
        lastSuccessAt = Date.now();
        lastSuccessRun = runScope;
        return true;
      } catch {
        // A transient rank failure must not erase the last server-confirmed
        // placement. Status stays actionable so callers render stale/error UI.
        if (current()) status.value = "error";
        return false;
      }
    })();
    refreshInFlight = { key, request: pending };
    void pending.finally(() => {
      if (refreshInFlight?.request === pending) refreshInFlight = null;
    });
    return pending;
  }
  const unsubscribeCommerceRun = subscribeRuntimeRevision(() => {
    if (!remoteApiEnabled) return;
    invalidate();
    void refresh();
  });
  onScopeDispose(unsubscribeCommerceRun);
  return { snapshot, status, bindAccount, refresh };
});
