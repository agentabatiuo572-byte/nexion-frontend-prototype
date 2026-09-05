import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface CanonicalE3Device {
  id: number;
  rowVersion: number;
  instanceNo: string;
  name: string;
  deviceType: string;
  productCode: string;
  status: string;
  pendingDeactivate: boolean;
  activatedAt: number | null;
  purchasedAt: number | null;
  dailyUsdt: number;
  dailyNex: number;
  todayEarningsUsdt: number;
  todayEarningsNex: number;
  gpuModel: string;
  vramTotalGb: number;
  basePowerW: number;
  location: string;
  capacityPct: number;
  capacityAgeMonths: number;
  capacityConfigKey: string;
  capacitySubsidized: boolean;
  capacitySubsidyDays: number;
  actualPaidUsdt: number;
  cumulativeOutputUsdt: number;
}

export interface CanonicalE3Fleet {
  dailyUsdt: number;
  dailyNex: number;
  realizedTodayUsdt: number;
  realizedTodayNex: number;
  walletUsdt: number;
  walletNex: number;
  userJoinedAt: number;
  serverNow: number;
  timezone: string;
  slotCap: number;
  devices: CanonicalE3Device[];
  capacitySchedule: Record<string, string>;
  source: string;
}

export interface CanonicalTradeinConfig {
  enabled: boolean;
  eligibility: string;
  outputRatioCutsPct: number[];
  creditRatesPct: number[];
  requireHigherPrice: boolean;
  maxDevicesPerOrder: number;
  source: string;
}

export interface CanonicalTradeinEligibilitySource {
  sourceDeviceId: number;
  sourceProductName: string | null;
  eligible: boolean;
  reasonCode: string;
}

export interface CanonicalTradeinEligibility {
  enabled: boolean;
  eligible: boolean;
  decisionCode: string;
  targetProductId: number | null;
  targetProductNo: string;
  targetProductName: string | null;
  targetPriceUsdt: number | null;
  requireHigherPrice: boolean;
  maxDevicesPerOrder: number;
  sources: CanonicalTradeinEligibilitySource[];
  decisionSource: "server";
}

export interface CanonicalTradeinQuote {
  sourceDeviceId: number;
  sourceProductName: string;
  targetProductId: number;
  targetProductNo: string;
  targetProductName: string;
  sourceActualPaidUsdt: number;
  cumulativeOutputUsdt: number;
  outputRatioPct: number;
  creditRatePct: number;
  discountUsdt: number;
  targetPriceUsdt: number;
  payableUsdt: number;
  walletBalanceUsdt: number;
  walletShortfallUsdt: number;
  sufficientFunds: boolean;
  discountToWallet: false;
  pricingSource: string;
}

export interface CanonicalTradeinResult {
  tradeinNo: string;
  orderNo: string;
  sourceDeviceId: number;
  targetDeviceId: number;
  applicationStatus: string;
  orderStatus: string;
  discountUsdt: number;
  walletDebitUsdt: number;
  walletBalanceAfterUsdt: number;
}

export interface CanonicalDeviceCommandResult {
  deviceId: number;
  instanceNo: string;
  status: "ACTIVE" | "DEACTIVATED" | "PENDING_DEACTIVATE";
  rowVersion: number;
  alreadyApplied: boolean;
}

export type CapacityReplaceDecision = "CAPACITY_AVAILABLE" | "NO_ACTIVE_DEVICE" | "REPLACE_REQUIRED";

export interface CanonicalCapacityReplaceQuote {
  decision: CapacityReplaceDecision;
  activeDevices: number;
  maxActiveDevices: number;
  sourceDeviceId: number | null;
  sourceDeviceName: string | null;
  targetProductId: number;
  targetProductNo: string;
  targetProductName: string;
  targetPriceUsdt: number;
  payableUsdt: number;
  walletBalanceUsdt: number;
  sufficientFunds: boolean;
  decisionSource: "server";
}

export interface DeviceE3Api {
  fleet(): Promise<CanonicalE3Fleet>;
  tradeinConfig(): Promise<CanonicalTradeinConfig>;
  eligibility(targetProductNo: string): Promise<CanonicalTradeinEligibility>;
  quote(sourceDeviceId: number, targetProductNo: string): Promise<CanonicalTradeinQuote>;
  capacityQuote(targetProductNo: string): Promise<CanonicalCapacityReplaceQuote>;
  capacityReplace(
    sourceDeviceId: number,
    targetProductNo: string,
    idempotencyKey: string,
    expectedQuote: CanonicalCapacityReplaceQuote,
  ): Promise<CanonicalTradeinResult>;
  submit(
    sourceDeviceId: number,
    targetProductNo: string,
    idempotencyKey: string,
    expectedQuote: CanonicalTradeinQuote,
  ): Promise<CanonicalTradeinResult>;
  activate(deviceId: number, expectedVersion: number, clientMaxDevices: number, idempotencyKey: string): Promise<CanonicalDeviceCommandResult>;
  deactivate(deviceId: number, expectedVersion: number, idempotencyKey: string): Promise<CanonicalDeviceCommandResult>;
  deactivateAfterTask(deviceId: number, expectedVersion: number, idempotencyKey: string): Promise<CanonicalDeviceCommandResult>;
}

function invalid(message = "E3_CANONICAL_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function string(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string") return invalid();
  const normalized = value.trim();
  if (!allowEmpty && !normalized) return invalid();
  return normalized;
}

function number(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) return invalid();
  return value;
}

function integer(value: unknown, minimum = 0): number {
  const parsed = number(value, minimum);
  if (!Number.isInteger(parsed)) return invalid();
  return parsed;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") return invalid();
  return value;
}

function timestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return invalid();
}

function numberArray(value: unknown, length: number): number[] {
  if (!Array.isArray(value) || value.length !== length) return invalid();
  return value.map((entry) => number(entry));
}

function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (!key.trim() || typeof entry !== "string" || !entry.trim()) return invalid();
    result[key] = entry;
  }
  return result;
}

function device(value: unknown): CanonicalE3Device {
  const source = record(value);
  return {
    id: integer(source.id, 1),
    rowVersion: integer(source.rowVersion),
    instanceNo: string(source.instanceNo),
    name: string(source.name),
    deviceType: string(source.deviceType),
    productCode: string(source.productCode),
    status: string(source.status).toUpperCase(),
    pendingDeactivate: boolean(source.pendingDeactivate),
    activatedAt: timestamp(source.activatedAt),
    purchasedAt: timestamp(source.purchasedAt),
    dailyUsdt: number(source.dailyUsdt),
    dailyNex: number(source.dailyNex),
    todayEarningsUsdt: number(source.todayEarningsUsdt),
    todayEarningsNex: number(source.todayEarningsNex),
    gpuModel: string(source.gpuModel),
    vramTotalGb: integer(source.vramTotalGb),
    basePowerW: number(source.basePowerW),
    location: string(source.location),
    capacityPct: number(source.capacityPct),
    capacityAgeMonths: integer(source.capacityAgeMonths),
    capacityConfigKey: string(source.capacityConfigKey),
    capacitySubsidized: boolean(source.capacitySubsidized),
    capacitySubsidyDays: integer(source.capacitySubsidyDays),
    actualPaidUsdt: number(source.actualPaidUsdt),
    cumulativeOutputUsdt: number(source.cumulativeOutputUsdt),
  };
}

function fleet(value: unknown): CanonicalE3Fleet {
  const source = record(value);
  if (!Array.isArray(source.devices)) return invalid();
  const devices = source.devices.map(device);
  if (new Set(devices.map((entry) => entry.id)).size !== devices.length) return invalid();
  return {
    dailyUsdt: number(source.dailyUsdt),
    dailyNex: number(source.dailyNex),
    realizedTodayUsdt: number(source.realizedTodayUsdt),
    realizedTodayNex: number(source.realizedTodayNex),
    walletUsdt: number(source.walletUsdt),
    walletNex: number(source.walletNex),
    userJoinedAt: integer(source.userJoinedAt),
    serverNow: integer(source.serverNow),
    timezone: string(source.timezone),
    slotCap: integer(source.slotCap, 1),
    devices,
    capacitySchedule: stringMap(source.capacitySchedule),
    source: string(source.source),
  };
}

function config(value: unknown): CanonicalTradeinConfig {
  const source = record(value);
  const cuts = numberArray(source.outputRatioCutsPct, 4);
  const credits = numberArray(source.creditRatesPct, 5);
  if (!cuts.every((entry, index) => index === 0 || cuts[index - 1] < entry)) return invalid();
  if (!credits.every((entry, index) => index === 0 || credits[index - 1] > entry)) return invalid();
  return {
    enabled: boolean(source.enabled),
    eligibility: string(source.eligibility),
    outputRatioCutsPct: cuts,
    creditRatesPct: credits,
    requireHigherPrice: boolean(source.requireHigherPrice),
    maxDevicesPerOrder: integer(source.maxDevicesPerOrder, 1),
    source: string(source.source),
  };
}

function quote(value: unknown): CanonicalTradeinQuote {
  const source = record(value);
  const discountToWallet = boolean(source.discountToWallet);
  if (discountToWallet) return invalid("TRADEIN_WALLET_CREDIT_FORBIDDEN");
  const result: CanonicalTradeinQuote = {
    sourceDeviceId: integer(source.sourceDeviceId, 1),
    sourceProductName: string(source.sourceProductName),
    targetProductId: integer(source.targetProductId, 1),
    targetProductNo: string(source.targetProductNo),
    targetProductName: string(source.targetProductName),
    sourceActualPaidUsdt: number(source.sourceActualPaidUsdt),
    cumulativeOutputUsdt: number(source.cumulativeOutputUsdt),
    outputRatioPct: number(source.outputRatioPct),
    creditRatePct: number(source.creditRatePct),
    discountUsdt: number(source.discountUsdt),
    targetPriceUsdt: number(source.targetPriceUsdt),
    payableUsdt: number(source.payableUsdt),
    walletBalanceUsdt: number(source.walletBalanceUsdt),
    walletShortfallUsdt: number(source.walletShortfallUsdt),
    sufficientFunds: boolean(source.sufficientFunds),
    discountToWallet: false,
    pricingSource: string(source.pricingSource),
  };
  if (
    result.discountUsdt > result.targetPriceUsdt
    || result.outputRatioPct > 100
    || result.creditRatePct > 100
    || Math.abs((result.targetPriceUsdt - result.discountUsdt) - result.payableUsdt) > 0.00001
    || Math.abs(result.walletShortfallUsdt - Math.max(0, result.payableUsdt - result.walletBalanceUsdt)) > 0.00001
    || result.sufficientFunds !== (result.walletBalanceUsdt >= result.payableUsdt)
  ) return invalid();
  return result;
}

function result(value: unknown): CanonicalTradeinResult {
  const source = record(value);
  const parsed = {
    tradeinNo: string(source.tradeinNo),
    orderNo: string(source.orderNo),
    sourceDeviceId: integer(source.sourceDeviceId, 1),
    targetDeviceId: integer(source.targetDeviceId, 1),
    applicationStatus: string(source.applicationStatus).toUpperCase(),
    orderStatus: string(source.orderStatus).toUpperCase(),
    discountUsdt: number(source.discountUsdt),
    walletDebitUsdt: number(source.walletDebitUsdt),
    walletBalanceAfterUsdt: number(source.walletBalanceAfterUsdt),
  };
  if (parsed.applicationStatus !== "COMPLETED" || parsed.orderStatus !== "COMPLETED") return invalid();
  return parsed;
}

function eligibility(value: unknown): CanonicalTradeinEligibility {
  const source = record(value);
  const decisionCodes = new Set([
    "ELIGIBLE", "NO_ELIGIBLE_SOURCE", "TRADEIN_DISABLED", "TRADEIN_ELIGIBILITY_NOT_MET",
    "TARGET_NOT_ACTIVE", "TARGET_OUT_OF_STOCK", "TARGET_NOT_RELEASED",
  ]);
  const sourceReasonCodes = new Set([
    "OK", "SOURCE_PAID_PRICE_UNAVAILABLE", "TARGET_MUST_DIFFER", "HIGHER_PRICE_REQUIRED",
  ]);
  const decisionCode = string(source.decisionCode);
  if (!decisionCodes.has(decisionCode)) return invalid("TRADEIN_ELIGIBILITY_RESPONSE_INVALID");
  if (!Array.isArray(source.sources)) return invalid("TRADEIN_ELIGIBILITY_RESPONSE_INVALID");
  const sources = source.sources.map((value) => {
    const row = record(value);
    const eligible = boolean(row.eligible);
    const reasonCode = string(row.reasonCode);
    if (!sourceReasonCodes.has(reasonCode)
        || eligible !== (reasonCode === "OK")) return invalid("TRADEIN_ELIGIBILITY_RESPONSE_INVALID");
    const sourceProductName = nullableString(row.sourceProductName);
    if (eligible && sourceProductName === null) return invalid("TRADEIN_ELIGIBILITY_RESPONSE_INVALID");
    return {
      sourceDeviceId: integer(row.sourceDeviceId, 1),
      sourceProductName,
      eligible,
      reasonCode,
    };
  });
  const targetProductId = nullableInteger(source.targetProductId);
  const targetProductName = nullableString(source.targetProductName);
  const targetPriceUsdt = nullableNumber(source.targetPriceUsdt);
  const parsed: CanonicalTradeinEligibility = {
    enabled: boolean(source.enabled),
    eligible: boolean(source.eligible),
    decisionCode,
    targetProductId,
    targetProductNo: string(source.targetProductNo),
    targetProductName,
    targetPriceUsdt,
    requireHigherPrice: boolean(source.requireHigherPrice),
    maxDevicesPerOrder: integer(source.maxDevicesPerOrder, 1),
    sources,
    decisionSource: source.decisionSource === "server" ? "server" : invalid("TRADEIN_ELIGIBILITY_RESPONSE_INVALID"),
  };
  const hasTarget = parsed.targetProductId !== null;
  const hasEligibleSource = parsed.sources.some((row) => row.eligible);
  if ((hasTarget !== (parsed.targetProductName !== null && parsed.targetPriceUsdt !== null))
      || parsed.eligible !== (parsed.decisionCode === "ELIGIBLE" && hasEligibleSource)
      || (parsed.decisionCode === "ELIGIBLE" && !hasTarget)
      || (parsed.decisionCode === "TRADEIN_DISABLED" && parsed.enabled)
      || (!parsed.enabled && parsed.decisionCode !== "TRADEIN_DISABLED")
      || (parsed.decisionCode === "TRADEIN_DISABLED" && sources.length > 0)) {
    return invalid("TRADEIN_ELIGIBILITY_RESPONSE_INVALID");
  }
  return parsed;
}

function deviceCommand(
  value: unknown,
  expectedStatus: CanonicalDeviceCommandResult["status"] | ReadonlyArray<CanonicalDeviceCommandResult["status"]>,
): CanonicalDeviceCommandResult {
  const source = record(value);
  const status = string(source.status).toUpperCase();
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expected.includes(status as CanonicalDeviceCommandResult["status"])) return invalid("DEVICE_COMMAND_RESPONSE_INVALID");
  return {
    deviceId: integer(source.deviceId, 1),
    instanceNo: string(source.instanceNo),
    status: status as CanonicalDeviceCommandResult["status"],
    rowVersion: integer(source.rowVersion),
    alreadyApplied: status === "ACTIVE"
      ? boolean(source.alreadyActive)
      : status === "PENDING_DEACTIVATE"
        ? boolean(source.alreadyPending)
        : boolean(source.alreadyDeactivated),
  };
}

function sameMoney(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 0.000001;
}

function assertResultMatchesQuote(
  parsed: CanonicalTradeinResult,
  expected: { sourceDeviceId: number; discountUsdt: number; payableUsdt: number; walletBalanceUsdt: number },
): CanonicalTradeinResult {
  if (parsed.sourceDeviceId !== expected.sourceDeviceId
      || !sameMoney(parsed.discountUsdt, expected.discountUsdt)
      || !sameMoney(parsed.walletDebitUsdt, expected.payableUsdt)
      || !sameMoney(parsed.walletBalanceAfterUsdt, expected.walletBalanceUsdt - expected.payableUsdt)) {
    return invalid("E3_TRADEIN_RESULT_QUOTE_MISMATCH");
  }
  return parsed;
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return integer(value, 1);
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return string(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return number(value);
}

function capacityQuote(value: unknown): CanonicalCapacityReplaceQuote {
  const source = record(value);
  const decision = string(source.decision).toUpperCase() as CapacityReplaceDecision;
  if (!["CAPACITY_AVAILABLE", "NO_ACTIVE_DEVICE", "REPLACE_REQUIRED"].includes(decision)) return invalid();
  const parsed: CanonicalCapacityReplaceQuote = {
    decision,
    activeDevices: integer(source.activeDevices),
    maxActiveDevices: integer(source.maxActiveDevices, 1),
    sourceDeviceId: nullableInteger(source.sourceDeviceId),
    sourceDeviceName: nullableString(source.sourceDeviceName),
    targetProductId: integer(source.targetProductId, 1),
    targetProductNo: string(source.targetProductNo),
    targetProductName: string(source.targetProductName),
    targetPriceUsdt: number(source.targetPriceUsdt),
    payableUsdt: number(source.payableUsdt),
    walletBalanceUsdt: number(source.walletBalanceUsdt),
    sufficientFunds: boolean(source.sufficientFunds),
    decisionSource: source.decisionSource === "server" ? "server" : invalid(),
  };
  if (parsed.payableUsdt !== parsed.targetPriceUsdt
      || parsed.sufficientFunds !== (parsed.walletBalanceUsdt >= parsed.payableUsdt)
      || (parsed.sourceDeviceId === null) !== (parsed.sourceDeviceName === null)) return invalid();
  const belowCap = parsed.activeDevices < parsed.maxActiveDevices;
  if (belowCap) {
    if (decision !== "CAPACITY_AVAILABLE" || parsed.sourceDeviceId !== null) return invalid();
  } else if (decision === "REPLACE_REQUIRED") {
    if (parsed.sourceDeviceId === null || parsed.sourceDeviceName === null) return invalid();
  } else if (decision === "NO_ACTIVE_DEVICE") {
    if (parsed.sourceDeviceId !== null || parsed.sourceDeviceName !== null) return invalid();
  } else {
    return invalid();
  }
  return parsed;
}

function validTargetNo(value: string): string {
  if (typeof value !== "string") {
    throw new ApiError({ kind: "configuration", message: "TRADEIN_TARGET_PRODUCT_INVALID" });
  }
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(normalized)) {
    throw new ApiError({ kind: "configuration", message: "TRADEIN_TARGET_PRODUCT_INVALID" });
  }
  return normalized;
}

export function createDeviceE3Api(client: ApiClient): DeviceE3Api {
  return {
    async fleet() {
      return fleet(await client.request<unknown>({ path: "/api/devices/earnings" }));
    },
    async tradeinConfig() {
      return config(await client.request<unknown>({ path: "/api/app/trade-in/config" }));
    },
    async eligibility(targetProductNo) {
      return eligibility(await client.request<unknown>({
        method: "POST",
        path: "/api/app/trade-in/eligibility",
        body: { targetProductNo: validTargetNo(targetProductNo) },
      }));
    },
    async quote(sourceDeviceId, targetProductNo) {
      return quote(await client.request<unknown>({
        method: "POST",
        path: "/api/app/trade-in/quote",
        body: { sourceDeviceId: integer(sourceDeviceId, 1), targetProductNo: validTargetNo(targetProductNo) },
      }));
    },
    async capacityQuote(targetProductNo) {
      return capacityQuote(await client.request<unknown>({
        method: "POST",
        path: "/api/app/trade-in/capacity-quote",
        body: { targetProductNo: validTargetNo(targetProductNo) },
      }));
    },
    async capacityReplace(sourceDeviceId, targetProductNo, idempotencyKey, expectedQuote) {
      const key = idempotencyKey.trim();
      if (!key) throw new ApiError({ kind: "configuration", message: "IDEMPOTENCY_KEY_REQUIRED" });
      if (expectedQuote.decision !== "REPLACE_REQUIRED"
          || expectedQuote.sourceDeviceId !== sourceDeviceId
          || expectedQuote.targetProductNo !== targetProductNo
          || expectedQuote.decisionSource !== "server") {
        throw new ApiError({ kind: "configuration", message: "CAPACITY_REPLACEMENT_QUOTE_CONTEXT_INVALID" });
      }
      return assertResultMatchesQuote(result(await client.request<unknown>({
        method: "POST",
        path: "/api/app/trade-in/capacity-replace",
        body: {
          sourceDeviceId: integer(sourceDeviceId, 1),
          targetProductNo: validTargetNo(targetProductNo),
          expectedPayableUsdt: number(expectedQuote.payableUsdt),
        },
        idempotencyKey: key,
      })), {
        sourceDeviceId,
        discountUsdt: 0,
        payableUsdt: expectedQuote.payableUsdt,
        walletBalanceUsdt: expectedQuote.walletBalanceUsdt,
      });
    },
    async submit(sourceDeviceId, targetProductNo, idempotencyKey, expectedQuote) {
      const key = idempotencyKey.trim();
      if (!key) throw new ApiError({ kind: "configuration", message: "IDEMPOTENCY_KEY_REQUIRED" });
      if (expectedQuote.sourceDeviceId !== sourceDeviceId
          || expectedQuote.targetProductNo !== targetProductNo) {
        throw new ApiError({ kind: "configuration", message: "TRADEIN_QUOTE_CONTEXT_INVALID" });
      }
      return assertResultMatchesQuote(result(await client.request<unknown>({
        method: "POST",
        path: "/api/app/trade-in/submit",
        body: {
          sourceDeviceId: integer(sourceDeviceId, 1),
          targetProductNo: validTargetNo(targetProductNo),
          expectedPayableUsdt: number(expectedQuote.payableUsdt),
          expectedDiscountUsdt: number(expectedQuote.discountUsdt),
        },
        idempotencyKey: key,
      })), expectedQuote);
    },
    async activate(deviceId, expectedVersion, clientMaxDevices, idempotencyKey) {
      const key = idempotencyKey.trim();
      if (!key) throw new ApiError({ kind: "configuration", message: "IDEMPOTENCY_KEY_REQUIRED" });
      const id = integer(deviceId, 1);
      const result = deviceCommand(await client.request<unknown>({
        method: "POST",
        path: "/api/devices/activate",
        body: { deviceId: id, expectedVersion: integer(expectedVersion), clientMaxDevices: integer(clientMaxDevices, 1) },
        idempotencyKey: key,
      }), "ACTIVE");
      if (result.deviceId !== id || result.rowVersion < expectedVersion) return invalid("DEVICE_COMMAND_RESPONSE_INVALID");
      return result;
    },
    async deactivate(deviceId, expectedVersion, idempotencyKey) {
      const key = idempotencyKey.trim();
      if (!key) throw new ApiError({ kind: "configuration", message: "IDEMPOTENCY_KEY_REQUIRED" });
      const id = integer(deviceId, 1);
      const result = deviceCommand(await client.request<unknown>({
        method: "POST",
        path: `/api/device/${deviceId}/deactivate`,
        body: { expectedVersion: integer(expectedVersion) },
        idempotencyKey: key,
      }), "DEACTIVATED");
      if (result.deviceId !== id || result.rowVersion < expectedVersion) return invalid("DEVICE_COMMAND_RESPONSE_INVALID");
      return result;
    },
    async deactivateAfterTask(deviceId, expectedVersion, idempotencyKey) {
      const key = idempotencyKey.trim();
      if (!key) throw new ApiError({ kind: "configuration", message: "IDEMPOTENCY_KEY_REQUIRED" });
      const id = integer(deviceId, 1);
      const result = deviceCommand(await client.request<unknown>({
        method: "POST",
        path: `/api/device/${deviceId}/deactivate-after-task`,
        body: { expectedVersion: integer(expectedVersion) },
        idempotencyKey: key,
      }), ["PENDING_DEACTIVATE", "DEACTIVATED"]);
      if (result.deviceId !== id || result.rowVersion < expectedVersion) return invalid("DEVICE_COMMAND_RESPONSE_INVALID");
      return result;
    },
  };
}
