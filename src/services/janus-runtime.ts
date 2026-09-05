import { JANUS_STATUSES, type JanusStatus } from "@/api/janus-api";

export interface JanusRuntimeState {
  status: JanusStatus;
  revision: number;
  remoteUrlKey?: string;
  remoteTargetVersion?: number;
  remoteTargetCatalogVersion?: number;
  remoteTargetUrl?: string;
  appliedAt: number;
  commandId?: string;
  commandVersion?: number;
  deviceAppVersion?: string;
  handoffReceipt?: string;
  proofMode?: "SANDBOX" | "PRODUCTION";
  executorId?: string;
  proofNonce?: string;
  proofTimestamp?: number;
  proofSignature?: string;
}

export interface JanusApplyEvidence { handoffReceipt: string }
export type JanusRemoteNavigator = (url: string) => Promise<JanusApplyEvidence>;

export const JANUS_RUNTIME_KEY = "nexgrid-janus-runtime-v2";
const REMOTE_STATUSES = new Set<JanusStatus>(["HIT", "ACTIVATED", "MANUAL_FORCED"]);
const STATUS_SET = new Set<string>(JANUS_STATUSES);

function normalizeRemoteUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || parsed.origin === "null"
    ) throw new Error("invalid");
    return parsed.toString();
  } catch {
    throw new Error("JANUS_REMOTE_TARGET_URL_INVALID");
  }
}

async function defaultRemoteNavigator(url: string): Promise<JanusApplyEvidence> {
  const runtime = (globalThis as unknown as {
    plus?: {
      runtime?: {
        openURL?: (
          target: string,
          success: () => void,
          failure: (error: { message?: string }) => void,
        ) => void;
      };
    };
  }).plus?.runtime;
  if (runtime?.openURL) {
    await new Promise<void>((resolve, reject) => {
      runtime.openURL!(
        url,
        resolve,
        (error) => reject(new Error(error.message || "JANUS_REMOTE_APPLY_FAILED")),
      );
    });
    throw new Error("JANUS_HANDOFF_PROOF_UNAVAILABLE");
  }
  if (typeof window !== "undefined" && window.location) {
    window.location.assign(url);
    throw new Error("JANUS_HANDOFF_PROOF_UNAVAILABLE");
  }
  throw new Error("JANUS_REMOTE_TARGET_UNSUPPORTED");
}

export function readJanusRuntime(): JanusRuntimeState | null {
  const runtime = uni.getStorageSync(JANUS_RUNTIME_KEY) as Partial<JanusRuntimeState> | "";
  if (!runtime || typeof runtime !== "object" || !Number.isSafeInteger(runtime.revision)
      || Number(runtime.revision) <= 0 || typeof runtime.status !== "string"
      || !STATUS_SET.has(runtime.status.toUpperCase())) {
    return null;
  }
  return { ...runtime, status: runtime.status.toUpperCase() as JanusStatus } as JanusRuntimeState;
}

export async function applyJanusRuntime(
  runtime: JanusRuntimeState,
  navigateRemote: JanusRemoteNavigator = defaultRemoteNavigator,
  signal?: AbortSignal,
): Promise<JanusRuntimeState> {
  if (signal?.aborted) throw new Error("JANUS_SYNC_CANCELLED");
  const next: JanusRuntimeState = {
    ...runtime,
    status: runtime.status.toUpperCase() as JanusStatus,
  };
  if (!STATUS_SET.has(next.status)) throw new Error("JANUS_RUNTIME_STATUS_INVALID");
  if (!Number.isSafeInteger(next.revision) || next.revision <= 0) {
    throw new Error("JANUS_RUNTIME_REVISION_INVALID");
  }
  const current = readJanusRuntime();
  const currentVersion = Number(current?.commandVersion || current?.revision || 0);
  const nextVersion = Number(next.commandVersion || next.revision);
  if (currentVersion > nextVersion) throw new Error("JANUS_STALE_COMMAND_REJECTED");
  if (currentVersion === nextVersion && current?.commandId && next.commandId && current.commandId !== next.commandId) {
    throw new Error("JANUS_COMMAND_VERSION_COLLISION");
  }
  if (current && currentVersion === nextVersion && current.commandId === next.commandId
      && current.status === next.status && current.remoteUrlKey === next.remoteUrlKey
      && current.handoffReceipt) return current;
  if (REMOTE_STATUSES.has(next.status)) {
    if (
      !next.remoteUrlKey?.trim()
      || !Number.isSafeInteger(next.remoteTargetVersion)
      || Number(next.remoteTargetVersion) <= 0
      || !Number.isSafeInteger(next.remoteTargetCatalogVersion)
      || Number(next.remoteTargetCatalogVersion) <= 0
      || !next.remoteTargetUrl
    ) throw new Error("JANUS_REMOTE_TARGET_BINDING_INVALID");
    next.remoteUrlKey = next.remoteUrlKey.trim();
    next.remoteTargetUrl = normalizeRemoteUrl(next.remoteTargetUrl);
    if (signal?.aborted) throw new Error("JANUS_SYNC_CANCELLED");
    const evidence = await navigateRemote(next.remoteTargetUrl);
    if (signal?.aborted) throw new Error("JANUS_SYNC_CANCELLED");
    if (!evidence?.handoffReceipt?.trim()) throw new Error("JANUS_HANDOFF_PROOF_UNAVAILABLE");
    next.handoffReceipt = evidence.handoffReceipt.trim();
  } else {
    delete next.remoteUrlKey;
    delete next.remoteTargetVersion;
    delete next.remoteTargetCatalogVersion;
    delete next.remoteTargetUrl;
    next.handoffReceipt = `reset:${next.commandId || "status"}:${nextVersion}:${next.appliedAt}`;
  }
  if (signal?.aborted) throw new Error("JANUS_SYNC_CANCELLED");
  uni.setStorageSync(JANUS_RUNTIME_KEY, next);
  return next;
}
