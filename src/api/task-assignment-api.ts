import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import { matchesRuntimeProvenance, type ServerSourceEnvironment } from "./runtime-provenance";
import type { ApiEnvironment } from "./runtime-config";

export interface CanonicalTaskAssignment {
  taskNo: string;
  deviceId: number;
  taskId: string;
  taskName: string;
  taskClass: "IG" | "VG" | "LL" | "FT" | "EM" | "SP";
  model: string;
  client: string;
  status: "CLAIMED" | "RUNNING" | "PAUSED" | "COMPLETED";
  rewardUsdt: number;
  requiredSeconds: number;
  startedAt: number;
  completableAt: number | null;
  completedAt: number | null;
  receiptNo: string | null;
  proofNonce: string | null;
  proofExpiresAt: number | null;
  source: "server";
  sourceEnvironment: ServerSourceEnvironment;
  runId: string;
  serverCanonical: true;
}

export interface CanonicalTaskDeviceState {
  deviceId: number;
  instanceNo: string;
  deviceType: string;
  lockUntil: number | null;
  currentTask: CanonicalTaskAssignment | null;
  recentTasks: CanonicalTaskAssignment[];
}

export interface CanonicalTaskAssignments {
  serverNow: number;
  devices: CanonicalTaskDeviceState[];
  source: "server";
  sourceEnvironment: ServerSourceEnvironment;
  runId: string;
  serverCanonical: true;
}

export interface CanonicalComputeReceipt {
  receiptNo: string;
  taskNo: string;
  deviceId: number;
  deviceInstanceNo: string;
  deviceName: string;
  deviceType: string;
  deviceGpu: string;
  vramTotalGb: number | null;
  taskId: string;
  taskName: string;
  taskClass: CanonicalTaskAssignment["taskClass"];
  model: string;
  client: string;
  rewardUsdt: number;
  rewardNex: number;
  earningStatus: string;
  proofHash: string;
  startedAt: number;
  completedAt: number;
  settledAt: number;
  durationSec: number;
  source: "server";
  sourceEnvironment: ServerSourceEnvironment;
  runId: string;
  serverCanonical: true;
}

export interface CanonicalComputeReceiptSummary {
  receiptNo: string;
  taskNo: string;
  taskClass: CanonicalTaskAssignment["taskClass"];
  model: string;
  client: string;
  rewardUsdt: number;
  rewardNex: number;
  earningStatus: string;
  completedAt: number;
}

export interface CanonicalComputeReceiptPage {
  items: CanonicalComputeReceiptSummary[];
  nextOffset: number | null;
  /** Server-validated seek boundary for the next stable receipt page. */
  nextCursor: string | null;
  /** Null means an older compatible server has not exposed a canonical total. */
  total: number | null;
  source: "server";
  sourceEnvironment: ServerSourceEnvironment;
  runId: string;
  serverCanonical: true;
}

export interface TaskAssignmentApi {
  state(): Promise<CanonicalTaskAssignments>;
  reportPhoneRuntime(calibrationDeviceId: string, batteryLevel: number | null, networkReachable: boolean, isCharging: boolean | null): Promise<void>;
  receipt(receiptNo: string): Promise<CanonicalComputeReceipt>;
  receipts(offset?: number, limit?: number, cursor?: string | null): Promise<CanonicalComputeReceiptPage>;
}

function invalid(message = "TASK_ASSIGNMENT_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, optional = false): string {
  if (typeof value !== "string") return invalid();
  const normalized = value.trim();
  if (!optional && !normalized) return invalid();
  return normalized;
}

function integer(value: unknown, minimum = 0): number {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < minimum) return invalid();
  return parsed;
}

function decimal(value: unknown): number {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) return invalid();
  return parsed;
}

function timestamp(value: unknown, optional = false): number | null {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const normalized = value.trim();
    // Java serializes the task-assignment boundary as LocalDateTime. Those
    // values are business-clock facts in Asia/Shanghai, not browser-local
    // timestamps; parsing them with Date.parse alone shifts the business day
    // whenever the viewer is outside UTC+08 (for example Japan at UTC+09).
    const shanghaiLocal = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(normalized);
    const parsed = Date.parse(shanghaiLocal
      ? `${normalized.replace(" ", "T")}+08:00`
      : normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return invalid();
}

function provenance(source: Record<string, unknown>, mode: ApiEnvironment): {
  source: "server";
  sourceEnvironment: ServerSourceEnvironment;
  runId: string;
  serverCanonical: true;
} {
  if (source.serverCanonical !== true || !matchesRuntimeProvenance(source, mode, "server")) {
    return invalid("TASK_ASSIGNMENT_PROVENANCE_INVALID");
  }
  return {
    source: "server",
    sourceEnvironment: source.sourceEnvironment,
    runId: source.runId,
    serverCanonical: true,
  };
}

function task(value: unknown, mode: ApiEnvironment): CanonicalTaskAssignment {
  const source = record(value);
  const proof = provenance(source, mode);
  const taskClass = text(source.taskClass).toUpperCase();
  const status = text(source.status).toUpperCase();
  if (!/^(IG|VG|LL|FT|EM|SP)$/.test(taskClass) || !/^(CLAIMED|RUNNING|PAUSED|COMPLETED)$/.test(status)) return invalid();
  const startedAt = timestamp(source.startedAt) as number;
  const completableAt = timestamp(source.completableAt, status === "PAUSED");
  if ((status !== "PAUSED" && completableAt === null) || (completableAt !== null && completableAt < startedAt)) return invalid();
  const completedAt = timestamp(source.completedAt, true);
  if (status === "COMPLETED" && completedAt === null) return invalid();
  return {
    taskNo: text(source.taskNo),
    deviceId: integer(source.deviceId, 1),
    taskId: text(source.taskId),
    taskName: text(source.taskName),
    taskClass: taskClass as CanonicalTaskAssignment["taskClass"],
    model: text(source.model, true),
    client: text(source.client),
    status: status as CanonicalTaskAssignment["status"],
    rewardUsdt: decimal(source.rewardUsdt),
    requiredSeconds: integer(source.requiredSeconds, 1),
    startedAt,
    completableAt,
    completedAt,
    receiptNo: source.receiptNo == null ? null : text(source.receiptNo),
    proofNonce: source.proofNonce == null ? null : text(source.proofNonce),
    proofExpiresAt: timestamp(source.proofExpiresAt, true),
    ...proof,
  };
}

function device(value: unknown, mode: ApiEnvironment): CanonicalTaskDeviceState {
  const source = record(value);
  if (!Array.isArray(source.recentTasks)) return invalid();
  const currentTask = source.currentTask == null ? null : task(source.currentTask, mode);
  const recentTasks = source.recentTasks.map((entry) => task(entry, mode));
  const deviceId = integer(source.deviceId, 1);
  if (currentTask && currentTask.deviceId !== deviceId) return invalid();
  if (recentTasks.some((entry) => entry.deviceId !== deviceId || entry.status !== "COMPLETED")) return invalid();
  return {
    deviceId,
    instanceNo: text(source.instanceNo),
    deviceType: text(source.deviceType),
    lockUntil: timestamp(source.lockUntil, true),
    currentTask,
    recentTasks,
  };
}

function state(value: unknown, mode: ApiEnvironment): CanonicalTaskAssignments {
  const source = record(value);
  const proof = provenance(source, mode);
  if (!Array.isArray(source.devices)) return invalid();
  const devices = source.devices.map((entry) => device(entry, mode));
  if (new Set(devices.map((entry) => entry.deviceId)).size !== devices.length) return invalid();
  return { serverNow: timestamp(source.serverNow) as number, devices, ...proof };
}

function receipt(value: unknown, mode: ApiEnvironment): CanonicalComputeReceipt {
  const source = record(value);
  const proof = provenance(source, mode);
  const taskClass = text(source.taskClass).toUpperCase();
  const proofHash = text(source.proofHash).toLowerCase();
  if (!/^(IG|VG|LL|FT|EM|SP)$/.test(taskClass) || !/^[a-f0-9]{64,128}$/.test(proofHash)) {
    return invalid("TASK_RECEIPT_RESPONSE_INVALID");
  }
  const startedAt = timestamp(source.startedAt) as number;
  const completedAt = timestamp(source.completedAt) as number;
  const durationSec = integer(source.durationSec);
  if (completedAt < startedAt) return invalid("TASK_RECEIPT_RESPONSE_INVALID");
  return {
    receiptNo: text(source.receiptNo),
    taskNo: text(source.taskNo),
    deviceId: integer(source.deviceId, 1),
    deviceInstanceNo: text(source.deviceInstanceNo),
    deviceName: text(source.deviceName),
    deviceType: text(source.deviceType),
    deviceGpu: text(source.deviceGpu, true),
    vramTotalGb: source.vramTotalGb == null ? null : integer(source.vramTotalGb),
    taskId: text(source.taskId),
    taskName: text(source.taskName),
    taskClass: taskClass as CanonicalTaskAssignment["taskClass"],
    model: text(source.model, true),
    client: text(source.client),
    rewardUsdt: decimal(source.rewardUsdt),
    rewardNex: decimal(source.rewardNex),
    earningStatus: text(source.earningStatus),
    proofHash,
    startedAt,
    completedAt,
    settledAt: completedAt,
    durationSec,
    ...proof,
  };
}

function receiptSummary(value: unknown): CanonicalComputeReceiptSummary {
  const source = record(value);
  const taskClass = text(source.taskClass).toUpperCase();
  const earningStatus = text(source.earningStatus).toUpperCase();
  if (!/^(IG|VG|LL|FT|EM|SP)$/.test(taskClass)
      || !/^(POSTED|SUCCESS|SETTLED|CREDITED|PAID)$/.test(earningStatus)) {
    return invalid("TASK_RECEIPT_PAGE_RESPONSE_INVALID");
  }
  return {
    receiptNo: text(source.receiptNo),
    taskNo: text(source.taskNo),
    taskClass: taskClass as CanonicalTaskAssignment["taskClass"],
    model: text(source.model, true),
    client: text(source.client),
    rewardUsdt: decimal(source.rewardUsdt),
    rewardNex: decimal(source.rewardNex),
    earningStatus,
    completedAt: timestamp(source.completedAt) as number,
  };
}

function receiptPage(value: unknown, mode: ApiEnvironment): CanonicalComputeReceiptPage {
  const source = record(value);
  const proof = provenance(source, mode);
  if (!Array.isArray(source.items)) return invalid("TASK_RECEIPT_PAGE_RESPONSE_INVALID");
  const items = source.items.map(receiptSummary);
  if (new Set(items.map((item) => item.receiptNo)).size !== items.length) {
    return invalid("TASK_RECEIPT_PAGE_RESPONSE_INVALID");
  }
  const nextOffset = source.nextOffset == null ? null : integer(source.nextOffset);
  const nextCursor = source.nextCursor == null ? null : text(source.nextCursor);
  const total = source.total == null ? null : integer(source.total);
  if (total !== null && total < items.length) return invalid("TASK_RECEIPT_PAGE_RESPONSE_INVALID");
  return { items, nextOffset, nextCursor, total, ...proof };
}

export function createTaskAssignmentApi(client: ApiClient, mode: ApiEnvironment): TaskAssignmentApi {
  return {
    async state() {
      return state(await client.request<unknown>({ path: "/api/tasks/assignments" }), mode);
    },
    async reportPhoneRuntime(calibrationDeviceId, batteryLevel, networkReachable, isCharging) {
      const localDeviceId = typeof calibrationDeviceId === "string" ? calibrationDeviceId.trim() : "";
      const validBattery = batteryLevel === null
        ? networkReachable === false
        : Number.isInteger(batteryLevel) && batteryLevel >= 0 && batteryLevel <= 100;
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(localDeviceId) || !validBattery
        || typeof networkReachable !== "boolean"
        || (isCharging !== null && typeof isCharging !== "boolean")) {
        throw new ApiError({ kind: "configuration", message: "PHONE_RUNTIME_SIGNALS_INVALID" });
      }
      await client.request<unknown>({
        path: "/api/tasks/phone/runtime",
        method: "POST",
        body: { calibrationDeviceId: localDeviceId, batteryLevel, networkReachable, isCharging },
      });
    },
    async receipt(receiptNo) {
      const normalizedReceiptNo = text(receiptNo);
      const detail = receipt(await client.request<unknown>({
        path: `/api/tasks/receipts/${encodeURIComponent(normalizedReceiptNo)}`,
      }), mode);
      if (detail.receiptNo !== normalizedReceiptNo) {
        return invalid("TASK_RECEIPT_RESPONSE_INVALID");
      }
      return detail;
    },
    async receipts(offset = 0, limit = 20, cursor = null) {
      const normalizedOffset = integer(offset);
      const normalizedLimit = integer(limit, 1);
      const normalizedCursor = cursor == null ? null : text(cursor);
      if (normalizedOffset > 1_000_000 || normalizedLimit > 50) {
        throw new ApiError({ kind: "configuration", message: "TASK_RECEIPT_PAGE_INVALID" });
      }
      return receiptPage(await client.request<unknown>({
        path: `/api/tasks/receipts?offset=${normalizedOffset}&limit=${normalizedLimit}`
          + (normalizedCursor === null ? "" : `&cursor=${encodeURIComponent(normalizedCursor)}`),
      }), mode);
    },
  };
}
