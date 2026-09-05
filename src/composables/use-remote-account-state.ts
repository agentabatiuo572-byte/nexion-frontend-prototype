import { ref } from "vue";
import { accountApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import type { SecurityState } from "@/api/contracts";

export type RemoteLoadStatus = "idle" | "loading" | "ready" | "error";

const securityState = ref<SecurityState | null>(null);
const securityStatus = ref<RemoteLoadStatus>("idle");
let accountUserId: number | null = null;
let loadVersion = 0;

function resetState(nextUserId: number | null): void {
  loadVersion += 1;
  accountUserId = nextUserId;
  securityState.value = null;
  securityStatus.value = "idle";
}

export function clearRemoteAccountState(): void {
  resetState(null);
}

export async function loadRemoteAccountState(): Promise<void> {
  if (!remoteApiEnabled) return;
  const userId = sessionVault.read()?.user.userId ?? null;
  if (!userId) {
    resetState(null);
    return;
  }
  if (accountUserId !== userId) resetState(userId);
  const version = ++loadVersion;
  securityState.value = null;
  securityStatus.value = "loading";

  await accountApi.securityOverview()
      .then((value) => {
        if (version !== loadVersion || accountUserId !== userId) return;
        securityState.value = value;
        securityStatus.value = "ready";
      })
      .catch(() => {
        if (version !== loadVersion || accountUserId !== userId) return;
        securityState.value = null;
        securityStatus.value = "error";
      });
}

export function useRemoteAccountState() {
  return {
    securityState,
    securityStatus,
  };
}
