import { ApiError } from "@/api/errors";
import type { OnboardingCalibration } from "@/api/onboarding-calibration-api";

export type EstimatorCalibrationReadState = "ready" | "not-started" | "deferred" | "error";

/**
 * Maps only canonical read outcomes to the estimator UI. A missing record is
 * an unstarted calibration, while a persisted DEFERRED record is an explicit
 * user state; neither is a device-detection failure.
 */
export function estimatorCalibrationReadState(result: OnboardingCalibration): EstimatorCalibrationReadState {
  if (result.activationStatus === "DEFERRED") return "deferred";
  return result.calibrationAvailable
    && (result.activationStatus === "CALIBRATED" || result.activationStatus === "ACTIVE")
    ? "ready"
    : "error";
}

export function estimatorCalibrationReadErrorState(error: unknown): EstimatorCalibrationReadState {
  return error instanceof ApiError
    && error.message === "ONBOARDING_CALIBRATION_NOT_FOUND"
    && ((error.kind === "http" && error.status === 404) || (error.kind === "business" && error.code === 404))
    ? "not-started"
    : "error";
}
