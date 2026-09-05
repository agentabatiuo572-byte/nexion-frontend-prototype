import {
  JANUS_STATUSES,
  type JanusAck,
  type JanusApi,
  type JanusPlatform,
  type JanusReport,
  type JanusStatus,
  type JanusTakeoverProgress,
} from "@/api/janus-api";
import { getDeviceIdentity } from "@/lib/device-id";
import type { JanusRuntimeState } from "./janus-runtime";

const REPORT_KEY = "nexgrid-janus-pending-report-v2";
const ACK_KEY = "nexgrid-janus-pending-ack-v2";
const COUNTERS_KEY = "nexgrid-janus-counters-v2";
const STATUS_SET = new Set<string>(JANUS_STATUSES);
const DEVICE_APP_VERSION = "NX1.0-UniApp";

/**
 * The formal UniApp is a remote user interface, not a Janus device executor.
 * It has no device-bound claim signer on any target platform, so posting a
 * report would inevitably fail the server's executor-claim contract. Keep
 * that limitation explicit for any surface that renders the runtime state.
 */
export type JanusSyncAvailability = {
  state: "HOLD";
  code: "JANUS_NATIVE_EXECUTOR_REQUIRED";
};

function janusSyncAvailability(): JanusSyncAvailability {
  // NX1.0-Janus alone owns Sandbox enrollment and the production native
  // bridge. A native UniApp container is still not proof of executor identity.
  return { state: "HOLD", code: "JANUS_NATIVE_EXECUTOR_REQUIRED" };
}

export function currentJanusSyncAvailability(): JanusSyncAvailability {
  return janusSyncAvailability();
}

interface KeyValueStore {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
  delete(key: string): unknown;
}

interface JanusCounters {
  installAt: number;
  firstSeenAt: number;
  appOpenCount: number;
  sessionCount: number;
  foregroundDurationSeconds: number;
  repeatStreakDays: number;
  lastSeenDay: string;
  visibleAt?: number;
}

interface CoordinatorOptions {
  api: JanusApi;
  storage: KeyValueStore;
  buildReport: () => JanusReport;
  applyRuntime: (state: JanusRuntimeState, signal?: AbortSignal) => Promise<JanusRuntimeState>;
  now: () => number;
  scope?: () => string;
}

function scoped(base: string, options: CoordinatorOptions): string {
  const scope = options.scope?.().trim();
  return scope ? `${base}:${scope}` : base;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message.slice(0, 500) : "JANUS_REMOTE_APPLY_FAILED";
}

function throwIfJanusSyncCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("JANUS_SYNC_CANCELLED");
}

function isJanusSyncCancelled(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.message === "JANUS_SYNC_CANCELLED");
}

export function createJanusCoordinator(options: CoordinatorOptions) {
  async function progress(value: JanusTakeoverProgress, signal?: AbortSignal): Promise<void> {
    throwIfJanusSyncCancelled(signal);
    await options.api.progress(value, signal);
    throwIfJanusSyncCancelled(signal);
  }

  async function applyRuntime(value: JanusRuntimeState, signal?: AbortSignal): Promise<JanusRuntimeState> {
    throwIfJanusSyncCancelled(signal);
    const applied = await options.applyRuntime(value, signal);
    throwIfJanusSyncCancelled(signal);
    return applied;
  }

  async function applyTakeover(command: Extract<Awaited<ReturnType<JanusApi["pending"]>>, { hasCommand: true; commandType: string }>, deviceId: string, signal?: AbortSignal): Promise<void> {
    throwIfJanusSyncCancelled(signal);
    const base = {
      deviceId,
      commandId: command.commandId,
      commandVersion: command.commandVersion,
      deviceAppVersion: DEVICE_APP_VERSION,
    };
    if (command.commandType === "QUERY_APPLIED") {
      throwIfJanusSyncCancelled(signal);
      const applied = (options.storage.get("nexgrid-janus-runtime-v2") || {}) as Partial<JanusRuntimeState>;
      const reset = applied.status === "RESET";
      if (applied.commandVersion !== command.commandVersion || !applied.handoffReceipt?.trim()
          || (!reset && (!applied.remoteUrlKey?.trim() || !Number.isSafeInteger(applied.remoteTargetVersion)
            || !Number.isSafeInteger(applied.remoteTargetCatalogVersion)))) return;
      await progress({
        ...base,
        phase: "SUCCEEDED",
        actualTargetId: reset ? "none" : applied.remoteUrlKey,
        actualTargetVersion: reset ? 0 : applied.remoteTargetVersion,
        actualTargetCatalogVersion: reset ? 0 : applied.remoteTargetCatalogVersion,
        deviceAppliedVersion: applied.commandVersion,
        handoffReceipt: applied.handoffReceipt,
        proofMode: applied.proofMode,
        executorId: applied.executorId,
        proofNonce: applied.proofNonce,
        proofTimestamp: applied.proofTimestamp,
        proofSignature: applied.proofSignature,
        reconciliationId: command.reconciliationId,
      }, signal);
      return;
    }
    if (command.commandType === "REVOKE") {
      try {
        const applied = await applyRuntime({
          status: "RESET",
          revision: command.commandVersion,
          commandId: command.commandId,
          commandVersion: command.commandVersion,
          deviceAppVersion: DEVICE_APP_VERSION,
          appliedAt: options.now(),
        }, signal);
        await progress({ ...base, phase: "REVOKED", actualTargetId: "none", actualTargetVersion: 0, actualTargetCatalogVersion: 0, deviceAppliedVersion: command.commandVersion, handoffReceipt: applied.handoffReceipt, proofMode: applied.proofMode, executorId: applied.executorId, proofNonce: applied.proofNonce, proofTimestamp: applied.proofTimestamp, proofSignature: applied.proofSignature }, signal);
      } catch (error) {
        if (isJanusSyncCancelled(error, signal)) throw error;
        await progress({
          ...base,
          phase: "REVOKE_FAILED",
          failureCode: "RUNTIME_REVOKE_FAILED",
          failureClass: "cleanup",
          failureMessage: errorMessage(error),
        }, signal);
        throw error;
      }
      return;
    }
    await progress({ ...base, phase: "RECEIVED" }, signal);
    await progress({ ...base, phase: "LOADING" }, signal);
    try {
      const applied = await applyRuntime({
        status: "ACTIVATED",
        revision: command.commandVersion,
        commandId: command.commandId,
        commandVersion: command.commandVersion,
        deviceAppVersion: DEVICE_APP_VERSION,
        remoteUrlKey: command.remoteUrlKey,
        remoteTargetVersion: command.remoteTargetVersion,
        remoteTargetCatalogVersion: command.remoteTargetCatalogVersion,
        remoteTargetUrl: command.remoteTargetUrl,
        appliedAt: options.now(),
      }, signal);
      await progress({ ...base, phase: "HANDOFF_FETCHING" }, signal);
      await progress({ ...base, phase: "HANDOFF_MERGING" }, signal);
      await progress({ ...base, phase: "HANDOFF_ACKED" }, signal);
      await progress({
        ...base,
        phase: "SUCCEEDED",
        actualTargetId: command.remoteUrlKey,
        actualTargetVersion: command.remoteTargetVersion,
        actualTargetCatalogVersion: command.remoteTargetCatalogVersion,
        deviceAppliedVersion: command.commandVersion,
        handoffReceipt: applied.handoffReceipt,
        proofMode: applied.proofMode,
        executorId: applied.executorId,
        proofNonce: applied.proofNonce,
        proofTimestamp: applied.proofTimestamp,
        proofSignature: applied.proofSignature,
      }, signal);
    } catch (error) {
      if (isJanusSyncCancelled(error, signal)) throw error;
      const contractFailure = errorMessage(error) === "JANUS_HANDOFF_PROOF_UNAVAILABLE";
      await progress({
        ...base,
        phase: "FAILED",
        failureCode: contractFailure ? "HANDOFF_PROOF_UNAVAILABLE" : "WEBVIEW_APPLY_FAILED",
        failureClass: contractFailure ? "contract" : "webview",
        failureMessage: errorMessage(error),
      }, signal);
      throw error;
    }
  }

  async function sendPendingAck(signal?: AbortSignal): Promise<void> {
    throwIfJanusSyncCancelled(signal);
    const key = scoped(ACK_KEY, options);
    const pending = options.storage.get(key);
    if (!pending || typeof pending !== "object") return;
    const ack = pending as JanusAck;
    const confirmed = await options.api.ack(ack, signal);
    throwIfJanusSyncCancelled(signal);
    const expectedState = ack.success ? "ACKED" : "FAILED";
    if (confirmed.revision !== ack.revision || confirmed.state !== expectedState) {
      throw new Error("JANUS_ACK_CONFIRMATION_MISMATCH");
    }
    options.storage.delete(key);
  }

  async function acknowledge(ack: JanusAck, signal?: AbortSignal): Promise<void> {
    throwIfJanusSyncCancelled(signal);
    const key = scoped(ACK_KEY, options);
    options.storage.set(key, ack);
    await sendPendingAck(signal);
  }

  async function sync(signal?: AbortSignal): Promise<void> {
    throwIfJanusSyncCancelled(signal);
    await sendPendingAck(signal);
    throwIfJanusSyncCancelled(signal);
    const reportKey = scoped(REPORT_KEY, options);
    const existing = options.storage.get(reportKey);
    const report = existing && typeof existing === "object"
      ? existing as JanusReport
      : options.buildReport();
    if (!existing) {
      throwIfJanusSyncCancelled(signal);
      options.storage.set(reportKey, report);
    }
    const reported = await options.api.report(report, signal);
    throwIfJanusSyncCancelled(signal);
    options.storage.delete(reportKey);
    const command = await options.api.pending(report.deviceId, signal);
    throwIfJanusSyncCancelled(signal);
    if (command.hasCommand) {
      if ("commandType" in command) {
        await applyTakeover(command, report.deviceId, signal);
        return;
      }
      const runtime: JanusRuntimeState = {
        status: command.desiredStatus,
        revision: command.revision,
        remoteUrlKey: command.remoteUrlKey,
        remoteTargetVersion: command.remoteTargetVersion,
        remoteTargetCatalogVersion: command.remoteTargetCatalogVersion,
        remoteTargetUrl: command.remoteTargetUrl,
        appliedAt: options.now(),
      };
      try {
        await applyRuntime(runtime, signal);
      } catch (error) {
        if (isJanusSyncCancelled(error, signal)) throw error;
        try {
          await acknowledge({
            deviceId: report.deviceId,
            revision: command.revision,
            success: false,
            message: errorMessage(error),
          }, signal);
        } catch {
          // The stable failure ACK remains persisted. Preserve the actual
          // application error for diagnosis and retry the ACK on next sync.
        }
        throw error;
      }
      const applied = (options.storage.get("nexgrid-janus-runtime-v2") || {}) as Partial<JanusRuntimeState>;
      await acknowledge({
        deviceId: report.deviceId,
        revision: command.revision,
        success: true,
        appliedStatus: command.desiredStatus,
        message: "applied",
        handoffReceipt: applied.handoffReceipt,
        deviceAppliedVersion: command.revision,
        deviceAppVersion: DEVICE_APP_VERSION,
        // 🔴 没有实际目标就**不报这个字段**,不要填 "none"(2026-08-12 合并收口):
        // 后台 K6 拿 actualTargetId 与「批准目标」逐字比对来报「目标不一致 / 对账未完成」,
        // 填一个伪值会让它把「设备没报」误判成「设备报了个叫 none 的目标」;契约本身
        // (janus-api.ts actualTargetId?: string)就允许缺省。门:hard-block-k6。
        actualTargetId: applied.remoteUrlKey || undefined,
        actualTargetVersion: applied.remoteTargetVersion || 0,
        actualTargetCatalogVersion: applied.remoteTargetCatalogVersion || 0,
        proofMode: applied.proofMode,
        executorId: applied.executorId,
        proofNonce: applied.proofNonce,
        proofTimestamp: applied.proofTimestamp,
        proofSignature: applied.proofSignature,
      }, signal);
      return;
    }
    if (!STATUS_SET.has(reported.status)) throw new Error("JANUS_REPORT_RESPONSE_INVALID");
    if (!["HIT", "ACTIVATED", "MANUAL_FORCED"].includes(reported.status)) {
      await applyRuntime({
        status: reported.status,
        revision: Math.max(1, reported.version),
        appliedAt: options.now(),
      }, signal);
    }
  }

  return { sync };
}

function uid(prefix: string): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function day(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function readCounters(now = Date.now()): JanusCounters {
  const raw = uni.getStorageSync(COUNTERS_KEY) as Partial<JanusCounters> | "";
  const row = raw && typeof raw === "object" ? raw : {};
  const installAt = Number(row.installAt) > 0 ? Number(row.installAt) : now;
  const currentDay = day(now);
  const priorDay = typeof row.lastSeenDay === "string" ? row.lastSeenDay : "";
  const priorStreak = Math.max(0, Number(row.repeatStreakDays) || 0);
  return {
    installAt,
    firstSeenAt: Number(row.firstSeenAt) > 0 ? Number(row.firstSeenAt) : installAt,
    appOpenCount: Math.max(0, Number(row.appOpenCount) || 0),
    sessionCount: Math.max(0, Number(row.sessionCount) || 0),
    foregroundDurationSeconds: Math.max(0, Number(row.foregroundDurationSeconds) || 0),
    repeatStreakDays: !priorDay || priorDay === currentDay ? Math.max(1, priorStreak) : priorStreak + 1,
    lastSeenDay: currentDay,
    visibleAt: Number(row.visibleAt) > 0 ? Number(row.visibleAt) : undefined,
  };
}

function saveCounters(value: JanusCounters): void {
  uni.setStorageSync(COUNTERS_KEY, value);
}

export function markJanusVisible(now = Date.now()): void {
  const value = readCounters(now);
  value.appOpenCount += 1;
  value.sessionCount += 1;
  value.visibleAt = now;
  saveCounters(value);
}

export function markJanusHidden(now = Date.now()): void {
  const value = readCounters(now);
  if (value.visibleAt && now > value.visibleAt) {
    value.foregroundDurationSeconds += Math.floor((now - value.visibleAt) / 1000);
  }
  delete value.visibleAt;
  saveCounters(value);
}

function platform(value: unknown): JanusPlatform {
  switch (String(value || "").trim().toLowerCase()) {
    case "ios": return "iOS";
    case "android": return "Android";
    case "windows":
    case "win32": return "windows";
    case "mac":
    case "macos": return "mac";
    case "linux": return "linux";
    default: return "unknown";
  }
}

export function buildJanusReport(now = Date.now()): JanusReport {
  const counters = readCounters(now);
  const identity = getDeviceIdentity();
  const info = uni.getSystemInfoSync() as {
    platform?: string;
    model?: string;
    deviceModel?: string;
    system?: string;
    osName?: string;
  };
  const normalizedPlatform = platform(info.platform);
  const model = String(info.model || info.deviceModel || "unknown").slice(0, 128);
  const osName = String(info.system || info.osName || normalizedPlatform).slice(0, 128);
  let ua = `${normalizedPlatform}/${model}/${osName}`;
  let browser = "native";
  let isHeadless = false;
  let screenAnomaly = false;
  if (typeof navigator !== "undefined" && typeof window !== "undefined") {
    ua = navigator.userAgent.slice(0, 512);
    browser = navigator.userAgent.slice(0, 128);
    isHeadless = navigator.webdriver === true;
    screenAnomaly = window.screen.width < 240 || window.screen.height < 320;
  }
  return {
    reportId: uid("report"),
    deviceId: identity.deviceId,
    reportedAt: now,
    firstSeenAt: counters.firstSeenAt,
    installAt: counters.installAt,
    channel: "official",
    ua,
    platform: normalizedPlatform,
    model,
    osName,
    browser,
    maturity: {
      appOpenCount: counters.appOpenCount,
      sessionCount: counters.sessionCount,
      foregroundDurationSeconds: counters.foregroundDurationSeconds,
      repeatStreakDays: counters.repeatStreakDays,
      benchmarkViewed: false,
      optimizeDone: false,
      marketViewed: false,
      walletViewed: false,
    },
    environment: {
      isHeadless,
      automationSignalCount: isHeadless ? 1 : 0,
      fpBlocklistHit: false,
      screenAnomaly,
      timezoneMismatch: false,
      languageMismatch: false,
    },
    latestSession: {
      sessionId: uid("session"),
      startedAt: counters.visibleAt || now,
      lastSeenAt: now,
      foregroundDurationSeconds: counters.foregroundDurationSeconds,
    },
  };
}

export function currentJanusStatus(): JanusStatus | null {
  const raw = uni.getStorageSync("nexgrid-janus-runtime-v2") as { status?: unknown } | "";
  const value = raw && typeof raw === "object" ? String(raw.status || "").toUpperCase() : "";
  return STATUS_SET.has(value) ? value as JanusStatus : null;
}
