import type { CalibrationRequestSignals, OnboardingCalibration, OnboardingCalibrationApi } from "@/api/onboarding-calibration-api";
import { ApiError } from "@/api/errors";

interface Options {
  deviceId: string;
  accountKey: string;
  isCurrent: () => boolean;
  /** Only an explicit remeasurement may replace an existing result. */
  recalibrate?: boolean;
}

export function calibrationBelongsTo(result: OnboardingCalibration, accountKey: string, deviceId: string): boolean {
  return result.serverCanonical === true && result.source === "server"
    && result.sourceEnvironment === "PRODUCTION" && result.runId === ""
    && accountKey === `user:${result.userId}` && result.deviceId === deviceId;
}

/** A page owns this intent; retries keep its exact observations, revision and key. */
export function createPhoneCalibrationFlow(deps: {
  api: Pick<OnboardingCalibrationApi, "result" | "calibrate">;
  collect: () => CalibrationRequestSignals;
  key: () => string;
}) {
  let intent: { accountKey: string; deviceId: string; signals: CalibrationRequestSignals;
    expectedRevision: number; hadResult: boolean; idempotencyKey: string } | null = null;

  return {
    reset() { intent = null; },
    async run(options: Options): Promise<OnboardingCalibration> {
      const check = () => {
        if (!options.isCurrent()) throw new Error("ONBOARDING_CALIBRATION_SCOPE_STALE");
      };
      const accept = (result: OnboardingCalibration) => {
        check();
        if (!calibrationBelongsTo(result, options.accountKey, options.deviceId)) {
          throw new ApiError({ kind: "protocol", message: "ONBOARDING_CALIBRATION_SCOPE_INVALID" });
        }
        return result;
      };
      check();
      if (intent && (intent.accountKey !== options.accountKey || intent.deviceId !== options.deviceId)) intent = null;
      let current: OnboardingCalibration | null = null;
      try {
        current = accept(await deps.api.result(options.deviceId));
      } catch (error) {
        check();
        // A missing record is the normal first-registration path, not a failed
        // hardware test. An unavailable endpoint/session is never permission to write.
        if (!(error instanceof ApiError) || error.status !== 404
            || error.message !== "ONBOARDING_CALIBRATION_NOT_FOUND") throw error;
      }
      check();
      // Read after an uncertain POST (or another tab's write) wins over replay.
      // In particular, never overwrite a newer ACTIVE or DEFERRED decision.
      if (current && (!options.recalibrate || (intent && (!intent.hadResult || current.revision > intent.expectedRevision)))) {
        intent = null;
        return current;
      }
      if (!intent) {
        intent = { accountKey: options.accountKey, deviceId: options.deviceId,
          signals: deps.collect(), expectedRevision: current?.revision ?? 0, hadResult: current !== null, idempotencyKey: deps.key() };
      }
      const command = intent;
      check();
      try {
        const result = accept(await deps.api.calibrate(command.deviceId, command.signals,
          command.expectedRevision, command.idempotencyKey));
        intent = null;
        return result;
      } catch (cause) {
        check();
        // The response may have been lost after commit. Reconcile from the
        // authoritative read without creating a second calibration/activation.
        try {
          const readback = accept(await deps.api.result(command.deviceId));
          // The first inserted row has revision 0, just like its create request.
          if (!command.hadResult || readback.revision > command.expectedRevision) {
            intent = null;
            return readback;
          }
        } catch { check(); }
        throw cause;
      }
    },
  };
}
