import { defineStore } from "pinia";
import { ref } from "vue";
import { genesisPointsApi, remoteApiEnabled } from "@/api/runtime";
import type { GenesisPointsProjection } from "@/api/genesis-points-api";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { captureRuntimeRevision, isCurrentRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";

export const useGenesisPoints = defineStore("genesisPoints", () => {
  let boundKey = "default";
  const epoch = createRemoteAccountEpoch(boundKey);
  let refreshGeneration = 0;
  const projection = ref<GenesisPointsProjection | null>(null);
  const status = ref<"idle" | "loading" | "ready" | "empty" | "error">(remoteApiEnabled ? "idle" : "ready");

  function bindAccount(accountKey: string): void {
    boundKey = accountKey;
    refreshGeneration += 1;
    epoch.bind(boundKey);
    projection.value = null;
    status.value = remoteApiEnabled ? "idle" : "ready";
  }
  function isCurrent(request: RemoteAccountRequest, runScope: RuntimeRevisionScope): boolean {
    return epoch.isCurrent(request) && isCurrentRuntimeRevision(runScope);
  }
  async function refresh(
    request: RemoteAccountRequest = epoch.snapshot(),
    runScope: RuntimeRevisionScope = captureRuntimeRevision(),
  ): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    const generation = ++refreshGeneration;
    projection.value = null;
    status.value = "loading";
    try {
      const next = await genesisPointsApi.projection();
      if (generation !== refreshGeneration || !isCurrent(request, runScope)) return false;
      projection.value = next;
      status.value = next.leaderboard.length > 0 ? "ready" : "empty";
      return true;
    } catch {
      if (generation === refreshGeneration && isCurrent(request, runScope)) { projection.value = null; status.value = "error"; }
      return false;
    }
  }
  return { projection, status, bindAccount, refresh };
});
