import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type OnboardingCalibrationEnvironment = "PRODUCTION";
export type PhoneActivationStatus = "CALIBRATED" | "ACTIVE" | "DEFERRED";

export interface CalibrationSignals {
  platform?: string;
  soc?: string;
  memGB: number | null;
  cores: number | null;
  model: string;
  brand: string;
  gpu: string;
  pxDensity: number | null;
  pingMs: number | null;
  batteryLevel: number | null;
  charging: boolean | null;
  networkReachable: boolean | null;
  /** iPhone OS version, screen in points and screen scale, for the server's model consistency checks; omitted when unknown. */
  osVersion?: string;
  screenWidth?: number;
  screenHeight?: number;
  pixelRatio?: number;
}

/** Raw device observations may be unavailable; null is preserved to the server. */
export type CalibrationRequestSignals = CalibrationSignals;

export interface CalibrationComparison {
  key: string;
  label: string;
  dailyUsdt: number;
  dailyNex: number;
  sortOrder: number;
}

/** iPhone calibration: matched by model; the server drew computeValue once and keeps the range to itself. */
export interface IosModelMatch {
  method: "IOS_MODEL_RANGE";
  model: string;
}

interface OnboardingCalibrationBase {
  userDeviceId?: number | null;
  iosModel?: IosModelMatch;
  calibrationStatus?: "MATCHED" | "PENDING_VERIFICATION";
  pendingReason?: string;
  computeValue?: number | null;
  ruleId?: string | null;
  ruleVersion?: number | null;
  computeUnit?: "platform";
  userId: number;
  deviceId: string;
  serverCanonical: true;
  source: "server";
  sourceEnvironment: OnboardingCalibrationEnvironment;
  runId: string;
  revision: number;
  configRevision: number;
  activationStatus: PhoneActivationStatus;
  comparisonConfig: CalibrationComparison[];
}

export interface MeasuredOnboardingCalibration extends OnboardingCalibrationBase {
  calibrationAvailable: true;
  score: number;
  tier: number;
  tierName: string;
  tops: number;
  baseRateUsdt: number;
  baseRateNex: number;
  signals: CalibrationSignals;
}

export interface DeferredOnboardingCalibration extends OnboardingCalibrationBase {
  activationStatus: "DEFERRED";
  calibrationAvailable: false;
  score: null;
  tier: null;
  tierName: null;
  tops: null;
  baseRateUsdt: null;
  baseRateNex: null;
  signals: null;
}

export interface PendingOnboardingCalibration extends Omit<DeferredOnboardingCalibration, "activationStatus" | "signals"> {
  activationStatus: PhoneActivationStatus;
  calibrationStatus: "PENDING_VERIFICATION";
  signals: CalibrationSignals;
}
export type OnboardingCalibration = MeasuredOnboardingCalibration | DeferredOnboardingCalibration | PendingOnboardingCalibration;

export interface PhoneActivationVersions {
  expectedBindingVersion: number | null;
  expectedPolicyVersion: number | null;
  replacementConfirmed: boolean;
  exceptionGrantId?: string;
}

export interface PhoneActivationEligibility {
  binding: { installationId: string; bindingVersion: number } | null;
  policyVersion: number | null;
  canActivate: boolean;
  blockedReasons: string[];
  grantId?: string;
}

export interface OnboardingCalibrationApi {
  activationEligibility(): Promise<PhoneActivationEligibility>;
  activationFailed(idempotencyKey: string): Promise<boolean>;
  phoneLogin(deviceId: string): Promise<string>;
  bindingStatus(): Promise<boolean>;
  calibrate(deviceId: string, signals: CalibrationRequestSignals, expectedRevision: number, idempotencyKey: string): Promise<OnboardingCalibration>;
  result(deviceId: string): Promise<OnboardingCalibration>;
  activate(deviceId: string, expectedRevision: number, idempotencyKey: string, versions: PhoneActivationVersions): Promise<OnboardingCalibration>;
  defer(deviceId: string, expectedRevision: number, idempotencyKey: string, initialOnly?: boolean): Promise<OnboardingCalibration>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "ONBOARDING_CALIBRATION_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}

function optionalText(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) return invalid();
  return value;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") return invalid();
  return value;
}

function number(value: unknown, min = 0, max = Number.POSITIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return invalid();
  return value;
}

function integer(value: unknown, min = 0): number {
  const result = number(value, min);
  if (!Number.isInteger(result)) return invalid();
  return result;
}

function boundedInteger(value: unknown, min: number, max: number): number {
  const result = integer(value, min);
  if (result > max) return invalid();
  return result;
}

function nullableNumber(value: unknown, min = 0, max = Number.POSITIVE_INFINITY): number | null {
  return value === null ? null : number(value, min, max);
}

function nullableBoundedInteger(value: unknown, min: number, max: number): number | null {
  return value === null ? null : boundedInteger(value, min, max);
}

function signals(value: unknown): CalibrationSignals {
  const row = record(value);
  return {
    platform: row.platform == null ? "" : optionalText(row.platform, 32),
    soc: row.soc == null ? "" : optionalText(row.soc, 128),
    memGB: nullableNumber(row.memGB, 0, 128), cores: nullableBoundedInteger(row.cores, 1, 256), model: optionalText(row.model, 128), brand: optionalText(row.brand, 128),
    gpu: optionalText(row.gpu, 256), pxDensity: nullableNumber(row.pxDensity, 1, 10_000), pingMs: nullableNumber(row.pingMs, 0, 5_000),
    batteryLevel: nullableBoundedInteger(row.batteryLevel, 0, 100), charging: row.charging === null ? null : bool(row.charging), networkReachable: row.networkReachable === null ? null : bool(row.networkReachable),
    ...(row.osVersion == null ? {} : { osVersion: optionalText(row.osVersion, 32) }),
    ...(row.screenWidth == null ? {} : { screenWidth: boundedInteger(row.screenWidth, 1, 10_000) }),
    ...(row.screenHeight == null ? {} : { screenHeight: boundedInteger(row.screenHeight, 1, 10_000) }),
    ...(row.pixelRatio == null ? {} : { pixelRatio: number(row.pixelRatio, 1, 10) }),
  };
}

export function parseOnboardingCalibration(
  value: unknown,
  expectedEnvironment?: OnboardingCalibrationEnvironment,
): OnboardingCalibration {
  const row = record(value);
  if (row.serverCanonical !== true || row.source !== "server") return invalid();
  const sourceEnvironment = row.sourceEnvironment;
  const runId = row.runId;
  if (sourceEnvironment !== "PRODUCTION"
      || (expectedEnvironment !== undefined && sourceEnvironment !== expectedEnvironment)
      || typeof runId !== "string"
      || runId !== "") return invalid();
  if (row.activationStatus !== "CALIBRATED" && row.activationStatus !== "ACTIVE" && row.activationStatus !== "DEFERRED") return invalid();
  if (typeof row.calibrationAvailable !== "boolean") return invalid();
  const status = row.calibrationStatus;
  if (status !== undefined && status !== "MATCHED" && status !== "PENDING_VERIFICATION") return invalid();
  if (status && row.computeUnit !== "platform") return invalid();
  if (status === "PENDING_VERIFICATION" && row.calibrationAvailable) return invalid();
  if (status === "MATCHED" && (!row.calibrationAvailable || row.computeValue !== row.tops
      || row.ruleId == null || row.ruleVersion == null)) return invalid();
  const comparisonConfig = Array.isArray(row.comparisonConfig) ? row.comparisonConfig.map((entry) => {
    const item = record(entry);
    return { key: text(item.key), label: text(item.label),
      dailyUsdt: number(item.dailyUsdt, Number.MIN_VALUE, 999_999_999_999.999999),
      dailyNex: number(item.dailyNex, Number.MIN_VALUE, 999_999_999_999.999999),
      sortOrder: integer(item.sortOrder) };
  }) : invalid();
  let iosModel: IosModelMatch | undefined;
  if (row.calibrationMethod !== undefined) {
    if (row.calibrationMethod !== "IOS_MODEL_RANGE" || status !== "MATCHED") return invalid();
    const value = number(row.computeValue, Number.MIN_VALUE, 1_000_000);
    if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) return invalid(); // drawn with two decimals
    iosModel = { method: "IOS_MODEL_RANGE", model: text(row.model) };
  }
  const common = {
    userId: integer(row.userId, 1), deviceId: text(row.deviceId), serverCanonical: true, source: "server",
    sourceEnvironment, runId,
    revision: integer(row.revision), configRevision: integer(row.configRevision), activationStatus: row.activationStatus,
    userDeviceId: row.userDeviceId == null ? null : integer(row.userDeviceId, 1),
    ...(iosModel ? { iosModel } : {}),
    ...(status ? {
      calibrationStatus: status as "MATCHED" | "PENDING_VERIFICATION", computeUnit: "platform" as const,
      computeValue: row.computeValue === null ? null : number(row.computeValue, Number.MIN_VALUE, 1_000_000),
      ruleId: row.ruleId == null ? null : text(row.ruleId),
      ruleVersion: row.ruleVersion == null ? null : integer(row.ruleVersion, status === "MATCHED" ? 1 : 0),
      pendingReason: row.pendingReason == null ? "" : text(row.pendingReason),
    } : {}),
  } as const;
  if (!row.calibrationAvailable) {
    if (status === "PENDING_VERIFICATION") {
      if (row.activationStatus === "ACTIVE" || comparisonConfig.length !== 0
          || row.score !== null || row.tier !== null || row.tierName !== null || row.tops !== null
          || row.baseRateUsdt !== null || row.baseRateNex !== null || row.computeValue !== null) return invalid();
      return { ...common, calibrationStatus: "PENDING_VERIFICATION", calibrationAvailable: false,
        score: null, tier: null, tierName: null, tops: null, baseRateUsdt: null, baseRateNex: null,
        signals: signals(row.signals), comparisonConfig };
    }
    if (row.activationStatus !== "DEFERRED" || common.configRevision !== 0 || comparisonConfig.length !== 0
        || row.score !== null || row.tier !== null || row.tierName !== null || row.tops !== null
        || row.baseRateUsdt !== null || row.baseRateNex !== null || row.signals !== null) return invalid();
    return {
      ...common, activationStatus: "DEFERRED", calibrationAvailable: false, score: null, tier: null, tierName: null, tops: null,
      baseRateUsdt: null, baseRateNex: null, signals: null, comparisonConfig,
    };
  }
  if (!Number.isInteger(row.tier) || (row.tier as number) < 1 || (row.tier as number) > 5) return invalid();
  return {
    ...common, calibrationAvailable: true,
    score: status === "MATCHED" ? boundedInteger(row.score, 0, 1_000_000) : boundedInteger(row.score, 62, 98),
    tier: row.tier as number, tierName: text(row.tierName), tops: status === "MATCHED" ? number(row.tops, Number.MIN_VALUE, 1_000_000) : number(row.tops, 8, 58),
    baseRateUsdt: number(row.baseRateUsdt, Number.MIN_VALUE), baseRateNex: number(row.baseRateNex, Number.MIN_VALUE), signals: signals(row.signals), comparisonConfig,
  };
}

function key(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(normalized)) {
    throw new ApiError({ kind: "configuration", message: "IDEMPOTENCY_KEY_REQUIRED" });
  }
  return normalized;
}

export function createOnboardingCalibrationApi(client: ApiClient, environment: OnboardingCalibrationEnvironment = "PRODUCTION"): OnboardingCalibrationApi {
  return {
    async activationEligibility() {
      const response = record(await client.request({ method: "GET", path: "/api/onboarding/phone-installation/replacement-eligibility" }));
      const policy = record(response.policy);
      const version = (value: unknown): number | null => {
        if (value === null) return null;
        if (!Number.isSafeInteger(value) || (value as number) < 1) return invalid();
        return value as number;
      };
      const binding = response.binding === null ? null : record(response.binding);
      const bindingVersion = binding ? version(binding.bindingVersion) : null;
      if (binding && bindingVersion === null || typeof response.canReplace !== "boolean"
          || !Array.isArray(response.blockedReasons) || !response.blockedReasons.every(reason => typeof reason === "string")) return invalid();
      const grant = response.grant == null ? null : record(response.grant);
      return {
        binding: binding ? { installationId: text(binding.installationId), bindingVersion: bindingVersion! } : null,
        policyVersion: version(policy.policyVersion), canActivate: response.canReplace,
        blockedReasons: response.blockedReasons as string[],
        ...(grant ? { grantId: text(grant.grantId) } : {}),
      };
    },
    async activationFailed(idempotencyKey) {
      const response = await client.request({ method: "GET", path: `/api/onboarding/phone-installation/replacement-operations/by-key?commandType=PHONE_ACTIVATE&idempotencyKey=${encodeURIComponent(key(idempotencyKey))}` });
      if (response === null) return false;
      const receipt = record(response);
      return receipt.commandType === "PHONE_ACTIVATE" && receipt.status === "FAILED";
    },
    async bindingStatus() {
      const response = record(await client.request({ method: "GET", path: "/api/onboarding/calibrate/binding-status" }));
      if (response.serverCanonical !== true || response.sourceEnvironment !== "PRODUCTION" || response.runId !== ""
          || typeof response.hasBinding !== "boolean") return invalid();
      return response.hasBinding;
    },
    async phoneLogin(deviceId) {
      const response = record(await client.request({
        method: "POST", path: "/api/onboarding/phone-installation/login", body: { deviceId: text(deviceId) },
      }));
      if (!["BOUND", "NEEDS_CALIBRATION", "REPLACEMENT_REQUIRED", "PHONE_REPLACEMENT_DISABLED",
        "PHONE_REPLACEMENT_COOLDOWN", "PHONE_REPLACEMENT_POLICY_UNAVAILABLE"].includes(String(response.status))) return invalid();
      return String(response.status);
    },
    async calibrate(deviceId, rawSignals, expectedRevision, idempotencyKey) {
      const normalizedDeviceId = text(deviceId);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new ApiError({ kind: "configuration", message: "ONBOARDING_REVISION_INVALID" });
      }
      const response = await client.request({
        method: "POST", path: "/api/onboarding/calibrate", idempotencyKey: key(idempotencyKey),
        body: { deviceId: normalizedDeviceId, expectedRevision, signals: rawSignals },
      });
      return parseOnboardingCalibration(response, environment);
    },
    async result(deviceId) {
      const normalizedDeviceId = text(deviceId);
      const response = await client.request({
        method: "GET", path: `/api/onboarding/calibrate/result?deviceId=${encodeURIComponent(normalizedDeviceId)}`,
      });
      return parseOnboardingCalibration(response, environment);
    },
    async activate(deviceId, expectedRevision, idempotencyKey, versions) {
      const normalizedDeviceId = text(deviceId);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new ApiError({ kind: "configuration", message: "ONBOARDING_REVISION_INVALID" });
      }
      const validVersion = (value: unknown) => value === null || Number.isSafeInteger(value) && (value as number) > 0;
      if (!versions || !validVersion(versions.expectedBindingVersion) || !validVersion(versions.expectedPolicyVersion)
          || typeof versions.replacementConfirmed !== "boolean") {
        throw new ApiError({ kind: "configuration", message: "PHONE_ACTIVATION_VERSIONS_REQUIRED" });
      }
      const response = await client.request({
        method: "POST", path: "/api/onboarding/calibrate/activate", idempotencyKey: key(idempotencyKey),
        body: { deviceId: normalizedDeviceId, expectedRevision,
          expectedBindingVersion: versions.expectedBindingVersion, expectedPolicyVersion: versions.expectedPolicyVersion,
          replacementConfirmed: versions.replacementConfirmed,
          ...(versions.exceptionGrantId ? { exceptionGrantId: text(versions.exceptionGrantId) } : {}),
        },
      });
      return parseOnboardingCalibration(response, environment);
    },
    async defer(deviceId, expectedRevision, idempotencyKey, initialOnly = false) {
      const normalizedDeviceId = text(deviceId);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new ApiError({ kind: "configuration", message: "ONBOARDING_REVISION_INVALID" });
      }
      const response = await client.request({
        method: "POST", path: "/api/onboarding/calibrate/defer", idempotencyKey: key(idempotencyKey),
        body: { deviceId: normalizedDeviceId, expectedRevision, ...(initialOnly ? { initialOnly: true } : {}) },
      });
      return parseOnboardingCalibration(response, environment);
    },
  };
}
