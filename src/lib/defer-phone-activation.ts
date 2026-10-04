import { onboardingCalibrationApi } from "@/api/runtime";
import { ApiError, isAmbiguousOutcome } from "@/api/errors";
import type { OnboardingCalibration } from "@/api/onboarding-calibration-api";

interface DeferredPhoneActivationCommand {
  revision: number;
  idempotencyKey: string;
}

interface ConfirmDeferredPhoneActivationOptions {
  current?: OnboardingCalibration | null;
  deviceId: string;
  command: (revision: number) => DeferredPhoneActivationCommand;
  isCurrent: () => boolean;
  accept: (result: OnboardingCalibration) => boolean;
}

function stale(): never {
  throw new Error("ONBOARDING_CALIBRATION_SCOPE_STALE");
}

/**
 * Persist an explicit "activate later" choice as a server-authoritative
 * DEFERRED state. A missing calibration is valid here: the backend records a
 * revision-0 tombstone without inventing phone capability or reward facts.
 */
export async function confirmDeferredPhoneActivation(
  options: ConfirmDeferredPhoneActivationOptions,
): Promise<OnboardingCalibration> {
  let current = options.current ?? null;
  if (!current) {
    try {
      current = await onboardingCalibrationApi.result(options.deviceId);
      if (!options.accept(current)) stale();
    } catch (error: unknown) {
      if (!options.isCurrent()) stale();
      if (!(error instanceof ApiError) || error.kind !== "http" || error.status !== 404) throw error;
      current = null;
    }
  }

  if (current?.activationStatus === "DEFERRED") return current;

  const deviceId = current?.deviceId || options.deviceId;
  const command = options.command(current?.revision ?? 0);
  if (!options.isCurrent()) stale();
  try {
    current = await onboardingCalibrationApi.defer(deviceId, command.revision, command.idempotencyKey);
    if (!options.accept(current)) stale();
  } catch (cause: unknown) {
    if (!options.isCurrent()) stale();
    let readback: OnboardingCalibration | null = null;
    try {
      readback = await onboardingCalibrationApi.result(deviceId);
      if (!options.accept(readback)) stale();
    } catch (readbackError: unknown) {
      if (!options.isCurrent()) stale();
      const missing = readbackError instanceof ApiError
        && readbackError.kind === "http"
        && readbackError.status === 404;
      if (!missing && !isAmbiguousOutcome(readbackError)) throw readbackError;
    }
    if (readback?.activationStatus === "DEFERRED") return readback;
    if (!isAmbiguousOutcome(cause)) throw cause;

    // Reuse the exact command after an ambiguous response, including the
    // before-first-calibration case where readback still returns 404. The
    // server either deduplicates a committed request or applies this one once.
    current = await onboardingCalibrationApi.defer(deviceId, command.revision, command.idempotencyKey);
    if (!options.accept(current)) stale();
  }

  if (current.activationStatus !== "DEFERRED") throw new Error("PHONE_DEFER_NOT_CONFIRMED");
  return current;
}
