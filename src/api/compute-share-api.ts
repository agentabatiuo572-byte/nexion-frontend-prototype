import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type ComputeShareEnrollmentStatus = "PENDING" | "CONNECTED" | "EXPIRED";

export interface ComputeShareEnrollment {
  enrollmentNo: string;
  pairingCode: string | null;
  status: ComputeShareEnrollmentStatus;
  requestedGpuModel: string;
  expiresAt: string;
  deviceId: number | null;
  source: "server";
}

export interface ComputeShareApi {
  create(requestedGpuModel: string, idempotencyKey: string): Promise<ComputeShareEnrollment>;
  status(enrollmentNo: string): Promise<ComputeShareEnrollment>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "COMPUTE_SHARE_ENROLLMENT_RESPONSE_INVALID" });
}

function normalizeGpuModel(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 128) {
    throw new ApiError({ kind: "configuration", message: "COMPUTE_SHARE_GPU_MODEL_INVALID" });
  }
  return normalized;
}

function normalizeEnrollmentNo(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^CSE-[A-Z0-9]{1,64}$/.test(normalized)) {
    throw new ApiError({ kind: "configuration", message: "COMPUTE_SHARE_ENROLLMENT_NO_INVALID" });
  }
  return normalized;
}

function parse(value: unknown, requirePairingCode: boolean): ComputeShareEnrollment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  const enrollmentNo = typeof row.enrollmentNo === "string" ? row.enrollmentNo.trim().toUpperCase() : "";
  const status = typeof row.status === "string" ? row.status.trim().toUpperCase() : "";
  const requestedGpuModel = typeof row.requestedGpuModel === "string" ? row.requestedGpuModel.trim() : "";
  const expiresAt = typeof row.expiresAt === "string" ? row.expiresAt.trim() : "";
  const expiresAtMs = Date.parse(expiresAt);
  const pairingCode = row.pairingCode === null || row.pairingCode === undefined
    ? null
    : typeof row.pairingCode === "string" ? row.pairingCode.trim() : invalid();
  const deviceId = row.deviceId === null || row.deviceId === undefined
    ? null
    : typeof row.deviceId === "number" && Number.isSafeInteger(row.deviceId) && row.deviceId > 0
      ? row.deviceId
      : invalid();
  if (!/^CSE-[A-Z0-9]{1,64}$/.test(enrollmentNo)
      || !["PENDING", "CONNECTED", "EXPIRED"].includes(status)
      || requestedGpuModel.length < 3 || requestedGpuModel.length > 128
      || !Number.isFinite(expiresAtMs)
      || row.source !== "server"
      || (requirePairingCode && status === "PENDING" && !/^\d{6}$/.test(pairingCode ?? ""))
      || (status === "CONNECTED" && deviceId === null)) return invalid();
  return {
    enrollmentNo,
    pairingCode,
    status: status as ComputeShareEnrollmentStatus,
    requestedGpuModel,
    expiresAt,
    deviceId,
    source: "server",
  };
}

export function createComputeShareApi(client: ApiClient): ComputeShareApi {
  return {
    async create(requestedGpuModel, idempotencyKey) {
      const key = idempotencyKey.trim();
      if (!key || key.length > 128) {
        throw new ApiError({ kind: "configuration", message: "IDEMPOTENCY_KEY_REQUIRED" });
      }
      return parse(await client.request<unknown>({
        method: "POST",
        path: "/api/app/compute-share/enrollments",
        body: { requestedGpuModel: normalizeGpuModel(requestedGpuModel) },
        idempotencyKey: key,
      }), true);
    },
    async status(enrollmentNo) {
      return parse(await client.request<unknown>({
        path: `/api/app/compute-share/enrollments/${encodeURIComponent(normalizeEnrollmentNo(enrollmentNo))}`,
      }), false);
    },
  };
}
