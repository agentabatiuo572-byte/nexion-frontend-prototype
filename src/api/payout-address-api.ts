import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type PayoutAddressNetwork = "USDT-TRC20" | "USDT-BEP20" | "USDT-ERC20";

export interface PayoutAddressRow {
  network: PayoutAddressNetwork;
  address: string;
  status: "ACTIVE";
  effectiveAt: string;
  createdAt: string;
  nextChangeAllowedAt: string;
  changePending: boolean;
}

export interface PayoutAddressSnapshot {
  addresses: PayoutAddressRow[];
  serverCanonical: true;
  changeCooldownDays: number;
  effectiveDelayHours: number;
  inFlightWithdrawalBlocked: true;
}

export interface PayoutAddressOtpChallenge {
  challengeNo: string;
  expiresInSeconds: number;
}

export interface PayoutAddressApi {
  list(): Promise<PayoutAddressSnapshot>;
  sendOtp(): Promise<PayoutAddressOtpChallenge>;
  save(input: {
    network: PayoutAddressNetwork;
    address: string;
    challengeNo: string;
    code: string;
    idempotencyKey: string;
  }): Promise<PayoutAddressRow>;
}

const NETWORKS = new Set<PayoutAddressNetwork>(["USDT-TRC20", "USDT-BEP20", "USDT-ERC20"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseRow(value: unknown): PayoutAddressRow {
  const row = record(value);
  if (
    !row
    || !NETWORKS.has(row.network as PayoutAddressNetwork)
    || typeof row.address !== "string"
    || !row.address.trim()
    || row.status !== "ACTIVE"
    || !timestamp(row.effectiveAt)
    || !timestamp(row.createdAt)
    || !timestamp(row.nextChangeAllowedAt)
    || typeof row.changePending !== "boolean"
  ) {
    throw new ApiError({ kind: "protocol", message: "PAYOUT_ADDRESS_RESPONSE_INVALID" });
  }
  return row as unknown as PayoutAddressRow;
}

function parseSnapshot(value: unknown): PayoutAddressSnapshot {
  const row = record(value);
  if (!row || row.serverCanonical !== true || !Array.isArray(row.addresses)
      || typeof row.changeCooldownDays !== "number" || !Number.isSafeInteger(row.changeCooldownDays)
      || row.changeCooldownDays <= 0
      || typeof row.effectiveDelayHours !== "number" || !Number.isSafeInteger(row.effectiveDelayHours)
      || row.effectiveDelayHours <= 0 || row.inFlightWithdrawalBlocked !== true) {
    throw new ApiError({ kind: "protocol", message: "PAYOUT_ADDRESS_RESPONSE_INVALID" });
  }
  const addresses = row.addresses.map(parseRow);
  if (new Set(addresses.map((item) => item.network)).size !== addresses.length) {
    throw new ApiError({ kind: "protocol", message: "PAYOUT_ADDRESS_RESPONSE_INVALID" });
  }
  return {
    addresses,
    serverCanonical: true,
    changeCooldownDays: row.changeCooldownDays,
    effectiveDelayHours: row.effectiveDelayHours,
    inFlightWithdrawalBlocked: true,
  };
}

function parseChallenge(value: unknown): PayoutAddressOtpChallenge {
  const row = record(value);
  if (
    !row
    || typeof row.challengeNo !== "string"
    || !/^PAYOUT-[A-Z0-9]+$/.test(row.challengeNo)
    || typeof row.expiresInSeconds !== "number"
    || !Number.isSafeInteger(row.expiresInSeconds)
    || row.expiresInSeconds <= 0
  ) {
    throw new ApiError({ kind: "protocol", message: "PAYOUT_ADDRESS_OTP_RESPONSE_INVALID" });
  }
  return { challengeNo: row.challengeNo, expiresInSeconds: row.expiresInSeconds };
}

export function createPayoutAddressApi(client: ApiClient): PayoutAddressApi {
  return {
    list: async () => parseSnapshot(await client.request({
      method: "GET",
      path: "/api/payout-addresses",
    })),
    sendOtp: async () => parseChallenge(await client.request({
      method: "POST",
      path: "/api/payout-addresses/otp/send",
    })),
    save: async (input) => parseRow(await client.request({
      method: "PUT",
      path: "/api/payout-addresses",
      body: {
        network: input.network,
        address: input.address,
        challengeNo: input.challengeNo,
        code: input.code,
      },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 30_000,
    })),
  };
}
