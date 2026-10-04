import type { ComputeShareEnrollment } from "@/api/compute-share-api";
import type {
  ComputeShareEnrollmentJournal,
  ComputeSharePendingEnrollment,
} from "./enrollment-recovery";

export interface ComputeShareEnrollmentFlowOptions {
  accountKey: string;
  requestedGpuModel: string;
  journal: ComputeShareEnrollmentJournal;
  createKey: () => string;
  isCurrent: () => boolean;
  isEnabled: () => boolean;
  now?: () => number;
  create(requestedGpuModel: string, idempotencyKey: string): Promise<ComputeShareEnrollment>;
  status(enrollmentNo: string): Promise<ComputeShareEnrollment>;
}

export type ComputeShareEnrollmentFlowResult =
  | { kind: "blocked" }
  | { kind: "recovery-required" }
  | { kind: "enrollment"; enrollment: ComputeShareEnrollment };

export interface InMemoryComputeSharePairingCode {
  accountKey: string;
  enrollmentNo: string;
  pairingCode: string;
}

export function preserveInMemoryPairingCode(
  candidate: ComputeShareEnrollment,
  current: InMemoryComputeSharePairingCode | null,
  accountKey: string,
): { enrollment: ComputeShareEnrollment; pairingCode: InMemoryComputeSharePairingCode | null } {
  if (candidate.status !== "PENDING") return { enrollment: candidate, pairingCode: null };
  if (candidate.pairingCode) {
    return {
      enrollment: candidate,
      pairingCode: { accountKey, enrollmentNo: candidate.enrollmentNo, pairingCode: candidate.pairingCode },
    };
  }
  if (current && current.accountKey === accountKey && current.enrollmentNo === candidate.enrollmentNo) {
    return { enrollment: { ...candidate, pairingCode: current.pairingCode }, pairingCode: current };
  }
  return { enrollment: candidate, pairingCode: null };
}

function mayDispatch(options: ComputeShareEnrollmentFlowOptions): boolean {
  return options.isCurrent() && options.isEnabled();
}

// AdminIdempotencyService retains a receipt for 24h. Keep a full hour of margin;
// beyond this window the same key can execute a NEW command. Unknown/legacy
// timestamps must never be renewed and must not cause an automatic second POST.
export const COMPUTE_SHARE_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;
function mayReplay(options: ComputeShareEnrollmentFlowOptions, intent: ComputeSharePendingEnrollment): boolean {
  const now = (options.now ?? Date.now)();
  return intent.createdAt !== undefined && Number.isSafeInteger(now)
    && now >= intent.createdAt && now - intent.createdAt < COMPUTE_SHARE_REPLAY_WINDOW_MS;
}

function retainPairingCode(
  verified: ComputeShareEnrollment,
  receipt: ComputeShareEnrollment,
): ComputeShareEnrollment {
  if (verified.status !== "PENDING" || verified.enrollmentNo !== receipt.enrollmentNo || !receipt.pairingCode) {
    return verified;
  }
  return { ...verified, pairingCode: receipt.pairingCode };
}

async function recoverKnownEnrollment(
  options: ComputeShareEnrollmentFlowOptions,
  intent: ComputeSharePendingEnrollment,
): Promise<ComputeShareEnrollmentFlowResult> {
  if (!intent.enrollmentNo || !mayDispatch(options)) return { kind: "blocked" };
  const verified = await options.status(intent.enrollmentNo);
  if (!mayDispatch(options)) return { kind: "blocked" };
  if (verified.status !== "PENDING" || verified.pairingCode) return { kind: "enrollment", enrollment: verified };

  // The status endpoint withholds the code. Only replay inside the retained
  // receipt window; known enrollments can still be read after that window.
  if (!mayReplay(options, intent)) return { kind: "recovery-required" };
  const replay = await options.create(intent.requestedGpuModel, intent.idempotencyKey);
  if (!mayDispatch(options)) return { kind: "blocked" };
  if (replay.enrollmentNo !== intent.enrollmentNo) return { kind: "blocked" };
  return { kind: "enrollment", enrollment: retainPairingCode(verified, replay) };
}

export async function runComputeShareEnrollmentFlow(
  options: ComputeShareEnrollmentFlowOptions,
): Promise<ComputeShareEnrollmentFlowResult> {
  if (!mayDispatch(options)) return { kind: "blocked" };
  const retained = options.journal.retainOrCreate(options.accountKey, options.requestedGpuModel, options.createKey);
  if (retained.kind !== "intent" || !mayDispatch(options)) return { kind: "blocked" };
  const { intent } = retained;
  if (intent.enrollmentNo) return recoverKnownEnrollment(options, intent);
  if (!options.journal.save(options.accountKey, intent) || !mayDispatch(options)) return { kind: "blocked" };
  if (!mayReplay(options, intent)) return { kind: "recovery-required" };

  const receipt = await options.create(intent.requestedGpuModel, intent.idempotencyKey);
  if (!mayDispatch(options) || !options.journal.attachEnrollmentNo(options.accountKey, receipt.enrollmentNo)) {
    return { kind: "blocked" };
  }
  const verified = await options.status(receipt.enrollmentNo);
  if (!mayDispatch(options)) return { kind: "blocked" };
  return { kind: "enrollment", enrollment: retainPairingCode(verified, receipt) };
}
