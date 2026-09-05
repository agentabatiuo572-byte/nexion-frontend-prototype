import { defineStore } from "pinia";
import { ref } from "vue";
import { networkRankApi, remoteApiEnabled } from "@/api/runtime";
import type { NetworkRankSnapshot } from "@/api/network-rank-api";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

export const useNetworkRank = defineStore("networkRank", () => {
  let boundKey = "default";
  const epoch = createRemoteAccountEpoch(boundKey);
  const snapshot = ref<NetworkRankSnapshot | null>(null);
  const status = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
  function bindAccount(accountKey: string): void {
    boundKey = accountKey;
    epoch.bind(boundKey);
    snapshot.value = null;
    status.value = remoteApiEnabled ? "idle" : "ready";
  }
  async function refresh(request: RemoteAccountRequest = epoch.snapshot()): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    status.value = "loading";
    try {
      const next = await networkRankApi.snapshot();
      if (!epoch.isCurrent(request)) return false;
      snapshot.value = next;
      status.value = "ready";
      return true;
    } catch {
      if (epoch.isCurrent(request)) { snapshot.value = null; status.value = "error"; }
      return false;
    }
  }
  return { snapshot, status, bindAccount, refresh };
});
