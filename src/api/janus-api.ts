import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export const JANUS_STATUSES = [
  "NEW",
  "OBSERVING",
  "RECOMMENDED",
  "HIT",
  "ACTIVATED",
  "ENV_FILTERED",
  "MANUAL_HOLD",
  "MANUAL_FORCED",
  "BLOCKED",
  "STALE",
  "RESET",
  "ERROR",
] as const;

export type JanusStatus = typeof JANUS_STATUSES[number];
export type JanusPlatform = "iOS" | "Android" | "windows" | "mac" | "linux" | "unknown";

export interface JanusReport {
  reportId: string;
  deviceId: string;
  reportedAt: number;
  firstSeenAt: number;
  installAt: number;
  channel: "official" | "invite" | "ad" | "test" | "internal";
  ua: string;
  platform: JanusPlatform;
  model: string;
  osName: string;
  browser: string;
  maturity: {
    appOpenCount: number;
    sessionCount: number;
    foregroundDurationSeconds: number;
    repeatStreakDays: number;
    benchmarkViewed: boolean;
    optimizeDone: boolean;
    marketViewed: boolean;
    walletViewed: boolean;
  };
  environment: {
    isHeadless: boolean;
    automationSignalCount: number;
    fpBlocklistHit: boolean;
    screenAnomaly: boolean;
    timezoneMismatch: boolean;
    languageMismatch: boolean;
  };
  latestSession: {
    sessionId: string;
    startedAt: number;
    lastSeenAt: number;
    foregroundDurationSeconds: number;
  };
}

export interface JanusReportedDevice {
  sid: string;
  status: JanusStatus;
  version: number;
  remoteUrlKey?: string;
  remoteTargetVersion?: number;
  remoteTargetCatalogVersion?: number;
}

export type JanusPendingCommand =
  | { hasCommand: false }
  | {
      hasCommand: true;
      sid: string;
      revision: number;
      desiredStatus: JanusStatus;
      remoteUrlKey?: string;
      remoteTargetVersion?: number;
      remoteTargetCatalogVersion?: number;
      remoteTargetUrl?: string;
    }
  | {
      hasCommand: true;
      sid: string;
      commandType: "ACTIVATE" | "CHANGE_TARGET" | "REVOKE" | "QUERY_APPLIED";
      commandId: string;
      commandVersion: number;
      remoteUrlKey?: string;
      remoteTargetVersion?: number;
      remoteTargetCatalogVersion?: number;
      remoteTargetUrl?: string;
      reconciliationId?: string;
    };

export interface JanusTakeoverProgress {
  deviceId: string;
  commandId: string;
  commandVersion: number;
  phase: "RECEIVED" | "LOADING" | "HANDOFF_FETCHING" | "HANDOFF_MERGING" | "HANDOFF_ACKED" | "SUCCEEDED" | "FAILED" | "REVOKED" | "REVOKE_FAILED";
  actualTargetId?: string;
  actualTargetVersion?: number;
  actualTargetCatalogVersion?: number;
  deviceAppliedVersion?: number;
  deviceAppVersion?: string;
  handoffReceipt?: string;
  failureCode?: string;
  failureClass?: "delivery" | "target" | "webview" | "handoff" | "lease" | "cleanup" | "contract";
  failureMessage?: string;
  reconciliationId?: string;
  proofMode?: "SANDBOX" | "PRODUCTION";
  executorId?: string;
  proofNonce?: string;
  proofTimestamp?: number;
  proofSignature?: string;
}

export interface JanusAck {
  deviceId: string;
  revision: number;
  success: boolean;
  appliedStatus?: JanusStatus;
  message: string;
  handoffReceipt?: string;
  deviceAppliedVersion?: number;
  deviceAppVersion?: string;
  actualTargetId?: string;
  actualTargetVersion?: number;
  actualTargetCatalogVersion?: number;
  proofMode?: "SANDBOX" | "PRODUCTION";
  executorId?: string;
  proofNonce?: string;
  proofTimestamp?: number;
  proofSignature?: string;
}

export interface JanusAckResult {
  sid: string;
  revision: number;
  state: "ACKED" | "FAILED";
}

export interface JanusApi {
  report(report: JanusReport, signal?: AbortSignal): Promise<JanusReportedDevice>;
  pending(deviceId: string, signal?: AbortSignal): Promise<JanusPendingCommand>;
  ack(ack: JanusAck, signal?: AbortSignal): Promise<JanusAckResult>;
  progress(progress: JanusTakeoverProgress, signal?: AbortSignal): Promise<void>;
}

const STATUS_SET = new Set<string>(JANUS_STATUSES);
const REMOTE_STATUSES = new Set<JanusStatus>(["HIT", "ACTIVATED", "MANUAL_FORCED"]);

function invalid(message: string): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function optionalPositiveInteger(value: unknown): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  return positiveInteger(value);
}

function status(value: unknown): JanusStatus | null {
  const normalized = text(value)?.toUpperCase();
  return normalized && STATUS_SET.has(normalized) ? normalized as JanusStatus : null;
}

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return text(value);
}

function approvedHttpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || parsed.origin === "null"
    ) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseReportedDevice(value: unknown): JanusReportedDevice {
  const row = record(value);
  const sid = text(row?.sid);
  const currentStatus = status(row?.status);
  const version = nonNegativeInteger(row?.version);
  const remoteUrlKey = optionalText(row?.remoteUrlKey);
  const remoteTargetVersion = optionalPositiveInteger(row?.remoteTargetVersion);
  const remoteTargetCatalogVersion = optionalPositiveInteger(row?.remoteTargetCatalogVersion);
  const bindingCount = [remoteUrlKey, remoteTargetVersion, remoteTargetCatalogVersion]
    .filter((item) => item !== undefined).length;
  if (!row || !sid || !currentStatus || version === null
      || remoteUrlKey === null || remoteTargetVersion === null || remoteTargetCatalogVersion === null
      || (bindingCount !== 0 && bindingCount !== 3)) {
    return invalid("JANUS_REPORT_RESPONSE_INVALID");
  }
  return {
    sid,
    status: currentStatus,
    version,
    remoteUrlKey,
    remoteTargetVersion,
    remoteTargetCatalogVersion,
  };
}

function parsePending(value: unknown): JanusPendingCommand {
  const row = record(value);
  if (!row || typeof row.hasCommand !== "boolean") return invalid("JANUS_PENDING_RESPONSE_INVALID");
  if (!row.hasCommand) {
    if (Object.keys(row).some((key) => key !== "hasCommand")) return invalid("JANUS_PENDING_RESPONSE_INVALID");
    return { hasCommand: false };
  }
  const commandType = text(row.commandType)?.toUpperCase();
  if (commandType && ["ACTIVATE", "CHANGE_TARGET", "REVOKE", "QUERY_APPLIED"].includes(commandType)) {
    const sid = text(row.sid);
    const commandId = text(row.commandId);
    const commandVersion = positiveInteger(row.commandVersion);
    const remoteUrlKey = optionalText(row.expectedTargetId);
    const remoteTargetVersion = optionalPositiveInteger(row.expectedTargetVersion);
    const remoteTargetCatalogVersion = optionalPositiveInteger(row.expectedTargetCatalogVersion);
    const remoteTargetUrl = row.remoteTargetUrl == null ? undefined : approvedHttpsUrl(row.remoteTargetUrl);
    const reconciliationId = optionalText(row.reconciliationId);
    if (!sid || !commandId || commandVersion === null || remoteUrlKey === null
        || remoteTargetVersion === null || remoteTargetCatalogVersion === null
        || remoteTargetUrl === null || reconciliationId === null) invalid("JANUS_TAKEOVER_PENDING_INVALID");
    if (["ACTIVATE", "CHANGE_TARGET"].includes(commandType)
        && (!remoteUrlKey || !remoteTargetVersion || !remoteTargetCatalogVersion || !remoteTargetUrl)) {
      invalid("JANUS_TAKEOVER_PENDING_INVALID");
    }
    if (commandType === "QUERY_APPLIED" && !reconciliationId) invalid("JANUS_TAKEOVER_PENDING_INVALID");
    return {
      hasCommand: true,
      sid,
      commandType: commandType as "ACTIVATE" | "CHANGE_TARGET" | "REVOKE" | "QUERY_APPLIED",
      commandId,
      commandVersion,
      remoteUrlKey,
      remoteTargetVersion,
      remoteTargetCatalogVersion,
      remoteTargetUrl,
      reconciliationId,
    };
  }
  const sid = text(row.sid);
  const revision = positiveInteger(row.revision);
  const desiredStatus = status(row.desiredStatus);
  const remoteUrlKey = optionalText(row.remoteUrlKey);
  const remoteTargetVersion = optionalPositiveInteger(row.remoteTargetVersion);
  const remoteTargetCatalogVersion = optionalPositiveInteger(row.remoteTargetCatalogVersion);
  const remoteTargetUrl = row.remoteTargetUrl === undefined || row.remoteTargetUrl === null
    ? undefined
    : approvedHttpsUrl(row.remoteTargetUrl);
  if (!sid || revision === null || !desiredStatus
      || remoteUrlKey === null || remoteTargetVersion === null || remoteTargetCatalogVersion === null
      || remoteTargetUrl === null) {
    return invalid("JANUS_PENDING_RESPONSE_INVALID");
  }
  const bindingCount = [remoteUrlKey, remoteTargetVersion, remoteTargetCatalogVersion, remoteTargetUrl]
    .filter((item) => item !== undefined).length;
  if (REMOTE_STATUSES.has(desiredStatus) ? bindingCount !== 4 : bindingCount !== 0) {
    return invalid("JANUS_PENDING_RESPONSE_INVALID");
  }
  return {
    hasCommand: true,
    sid,
    revision,
    desiredStatus,
    remoteUrlKey,
    remoteTargetVersion,
    remoteTargetCatalogVersion,
    remoteTargetUrl,
  };
}

function parseAck(value: unknown): JanusAckResult {
  const row = record(value);
  const sid = text(row?.sid);
  const revision = positiveInteger(row?.revision);
  const state = text(row?.state)?.toUpperCase();
  if (!row || !sid || revision === null || !["ACKED", "FAILED"].includes(state ?? "")) {
    return invalid("JANUS_ACK_RESPONSE_INVALID");
  }
  return { sid, revision, state: state as JanusAckResult["state"] };
}

export function createJanusApi(client: ApiClient): JanusApi {
  return {
    report: async (report, signal) => parseReportedDevice(await client.request({
      method: "POST",
      path: "/api/app/janus/reports",
      body: report,
      timeoutMs: 30_000,
      signal,
    })),
    pending: async (deviceId, signal) => {
      const normalized = deviceId.trim();
      if (!normalized || normalized.length > 128) return invalid("JANUS_DEVICE_ID_INVALID");
      return parsePending(await client.request({
        method: "GET",
        path: `/api/app/janus/commands/pending?deviceId=${encodeURIComponent(normalized)}`,
        signal,
      }));
    },
    ack: async (ack, signal) => parseAck(await client.request({
      method: "POST",
      path: "/api/app/janus/commands/ack",
      body: ack,
      timeoutMs: 30_000,
      signal,
    })),
    progress: async (progress, signal) => {
      await client.request({
        method: "POST",
        path: "/api/app/janus/takeover/progress",
        body: progress,
        timeoutMs: 30_000,
        signal,
      });
    },
  };
}
