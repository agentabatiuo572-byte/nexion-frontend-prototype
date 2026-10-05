import { deviceE3Api, onboardingCalibrationApi } from "@/api/runtime";
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

/** H5 initial setup only: never convert an existing calibration/phone to DEFERRED. */
export async function confirmInitialWebPhoneDeferral(
  options: ConfirmDeferredPhoneActivationOptions,
): Promise<OnboardingCalibration> {
  const check = () => { if (!options.isCurrent()) stale(); };
  const read = async () => {
    check();
    const result = await onboardingCalibrationApi.result(options.deviceId);
    if (!options.accept(result)) stale();
    return result;
  };
  const deferred = (result: OnboardingCalibration) => {
    if (result.activationStatus !== "DEFERRED") throw new Error("PHONE_WEB_SETUP_READ_ONLY");
    return result;
  };
  try { return deferred(await read()); }
  catch (cause) {
    check();
    if (!(cause instanceof ApiError) || cause.kind !== "http" || cause.status !== 404
        || cause.message !== "ONBOARDING_CALIBRATION_NOT_FOUND") throw cause;
  }
  // Read the real fleet, including inactive phone records. A browser must not
  // use its missing installation row to stop a phone bound on another install.
  const fleet = await deviceE3Api.fleet();
  check();
  if (fleet.serverCanonical !== true || fleet.sourceEnvironment !== "PRODUCTION" || fleet.runId !== "") stale();
  if (fleet.devices.some(device => /phone|mobile/i.test(device.deviceType))) {
    throw new Error("PHONE_WEB_SETUP_READ_ONLY");
  }
  const command = options.command(0);
  check();
  try {
    const result = await onboardingCalibrationApi.defer(options.deviceId, 0, command.idempotencyKey);
    if (!options.accept(result)) stale();
    deferred(result);
  } catch (cause) {
    check();
    // A lost reply may already have committed. Recover only by the same scoped
    // GET; a later explicit retry reads first and reuses this page's command.
    try { return deferred(await read()); }
    catch (readError) {
      check();
      if (readError instanceof Error && readError.message === "ONBOARDING_CALIBRATION_SCOPE_STALE") throw readError;
      throw cause;
    }
  }
  // A POST acknowledgement alone never completes the browser's setup.
  return deferred(await read());
}
