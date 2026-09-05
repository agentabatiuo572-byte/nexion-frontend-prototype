import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface CanonicalTaskAssignment {
  taskNo: string;
  deviceId: number;
  taskId: string;
  taskName: string;
  taskClass: "IG" | "VG" | "LL" | "FT" | "EM" | "SP";
  model: string;
  client: string;
  status: "CLAIMED" | "RUNNING" | "COMPLETED";
  rewardUsdt: number;
  requiredSeconds: number;
  startedAt: number;
  completableAt: number;
  completedAt: number | null;
  receiptNo: string | null;
  proofNonce: string | null;
  proofExpiresAt: number | null;
}

export interface TrustedTaskCompletionProof {
  resultHash: string;
  proofMode: "PRODUCTION" | "SANDBOX";
  executorId: string;
  proofNonce: string;
  proofTimestamp: number;
  proofSignature: string;
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
  source: string;
}

export interface TaskAssignmentApi {
  state(): Promise<CanonicalTaskAssignments>;
  claim(deviceId: number, idempotencyKey: string): Promise<CanonicalTaskAssignment>;
  complete(taskNo: string, proof: TrustedTaskCompletionProof, idempotencyKey: string): Promise<CanonicalTaskAssignment>;
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
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return invalid();
}

function task(value: unknown): CanonicalTaskAssignment {
  const source = record(value);
  const taskClass = text(source.taskClass).toUpperCase();
  const status = text(source.status).toUpperCase();
  if (!/^(IG|VG|LL|FT|EM|SP)$/.test(taskClass) || !/^(CLAIMED|RUNNING|COMPLETED)$/.test(status)) return invalid();
  const startedAt = timestamp(source.startedAt) as number;
  const completableAt = timestamp(source.completableAt) as number;
  if (completableAt < startedAt) return invalid();
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
    completedAt: timestamp(source.completedAt, true),
    receiptNo: source.receiptNo == null ? null : text(source.receiptNo),
    proofNonce: source.proofNonce == null ? null : text(source.proofNonce),
    proofExpiresAt: timestamp(source.proofExpiresAt, true),
  };
}

function device(value: unknown): CanonicalTaskDeviceState {
  const source = record(value);
  if (!Array.isArray(source.recentTasks)) return invalid();
  const currentTask = source.currentTask == null ? null : task(source.currentTask);
  const recentTasks = source.recentTasks.map(task);
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

function state(value: unknown): CanonicalTaskAssignments {
  const source = record(value);
  if (!Array.isArray(source.devices)) return invalid();
  const devices = source.devices.map(device);
  if (new Set(devices.map((entry) => entry.deviceId)).size !== devices.length) return invalid();
  return { serverNow: timestamp(source.serverNow) as number, devices, source: text(source.source) };
}

function key(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ApiError({ kind: "configuration", message: "IDEMPOTENCY_KEY_REQUIRED" });
  return normalized;
}

export function createTaskAssignmentApi(client: ApiClient): TaskAssignmentApi {
  return {
    async state() {
      return state(await client.request<unknown>({ path: "/api/tasks/assignments" }));
    },
    async claim(deviceId, idempotencyKey) {
      return task(await client.request<unknown>({
        method: "POST",
        path: "/api/tasks/assignments/claim",
        body: { deviceId: integer(deviceId, 1) },
        idempotencyKey: key(idempotencyKey),
      }));
    },
    async complete(taskNo, proof, idempotencyKey) {
      const normalizedTaskNo = text(taskNo);
      if (!proof || !/^[a-f0-9]{64}$/i.test(text(proof.resultHash))
          || !/^[a-f0-9]{64}$/i.test(text(proof.proofNonce))
          || !Number.isSafeInteger(proof.proofTimestamp) || proof.proofTimestamp <= 0
          || !/^(PRODUCTION|SANDBOX)$/.test(text(proof.proofMode).toUpperCase())) {
        throw new ApiError({ kind: "configuration", message: "TASK_ASSIGNMENT_PROOF_INVALID" });
      }
      return task(await client.request<unknown>({
        method: "POST",
        path: `/api/tasks/assignments/${encodeURIComponent(normalizedTaskNo)}/complete`,
        body: {
          resultHash: proof.resultHash.toLowerCase(),
          proofMode: proof.proofMode,
          executorId: text(proof.executorId),
          proofNonce: proof.proofNonce.toLowerCase(),
          proofTimestamp: proof.proofTimestamp,
          proofSignature: text(proof.proofSignature),
        },
        idempotencyKey: key(idempotencyKey),
      }));
    },
  };
}
