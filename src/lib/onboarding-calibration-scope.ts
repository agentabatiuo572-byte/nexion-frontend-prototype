export interface OnboardingCalibrationScope {
  accountKey: string;
  accountEpoch: number;
  generation: number;
}

/** A calibration response may mutate UI only while its account and route scope remain current. */
export function isCurrentOnboardingCalibrationScope(
  request: OnboardingCalibrationScope,
  current: OnboardingCalibrationScope,
): boolean {
  return request.accountKey === current.accountKey
    && request.accountEpoch === current.accountEpoch
    && request.generation === current.generation;
}
