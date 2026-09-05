import { defineStore } from "pinia";
import { ref } from "vue";
import { genesisPointsApi, remoteApiEnabled } from "@/api/runtime";
import type { GenesisPointsProjection } from "@/api/genesis-points-api";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

export const useGenesisPoints = defineStore("genesisPoints", () => {
  let boundKey = "default";
  const epoch = createRemoteAccountEpoch(boundKey);
  const projection = ref<GenesisPointsProjection | null>(null);
  const status = ref<"idle" | "loading" | "ready" | "empty" | "error">(remoteApiEnabled ? "idle" : "ready");

  function bindAccount(accountKey: string): void {
    boundKey = accountKey;
    epoch.bind(boundKey);
    projection.value = null;
    status.value = remoteApiEnabled ? "idle" : "ready";
  }
  async function refresh(request: RemoteAccountRequest = epoch.snapshot()): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    status.value = "loading";
    try {
      const next = await genesisPointsApi.projection();
      if (!epoch.isCurrent(request)) return false;
      projection.value = next;
      status.value = next.leaderboard.length > 0 ? "ready" : "empty";
      return true;
    } catch {
      if (epoch.isCurrent(request)) { projection.value = null; status.value = "error"; }
      return false;
    }
  }
  return { projection, status, bindAccount, refresh };
});
