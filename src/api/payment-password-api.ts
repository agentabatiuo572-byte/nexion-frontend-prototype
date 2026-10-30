import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type PaymentPasswordAuthorization = { paymentPassword: string; credentialVersion: number; attemptNo: string };

export interface PaymentPasswordState {
  configured: boolean;
  credentialVersion: number;
  lockedUntil: string | null;
  remainingAttempts: number;
  serverTime: string;
}
export interface PaymentPasswordReceipt {
  commandKey: string;
  status: "SUCCEEDED" | "REJECTED" | "PROCESSING" | "NOT_SEEN" | "INDETERMINATE";
  state?: PaymentPasswordState;
  code?: number;
  message?: string;
  canResumeSameKey: boolean;
}
export interface PaymentPasswordChallenge {
  phoneMasked: string;
  challengeNo: string;
  resendAfterSec: number;
  expiresAt: string;
}
export interface PaymentPasswordProof { resetProof: string; expiresAt: string }
export interface PaymentPasswordApi {
  status(): Promise<PaymentPasswordState>;
  setup(input: { newPassword: string; confirmPassword: string; commandKey: string }): Promise<PaymentPasswordReceipt>;
  change(input: { currentPassword: string; newPassword: string; confirmPassword: string; expectedCredentialVersion: number; attemptNo: string; commandKey: string }): Promise<PaymentPasswordReceipt>;
  receipt(commandKey: string): Promise<PaymentPasswordReceipt>;
  challenge(): Promise<PaymentPasswordChallenge>;
  verify(challengeNo: string, code: string): Promise<PaymentPasswordProof>;
  reset(input: { resetProof: string; newPassword: string; confirmPassword: string; expectedCredentialVersion: number; commandKey: string }): Promise<PaymentPasswordReceipt>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function invalid(): ApiError { return new ApiError({ kind: "protocol", message: "PAYMENT_PASSWORD_RESPONSE_INVALID" }); }
function date(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
export function parsePaymentPasswordState(value: unknown): PaymentPasswordState {
  const data = object(value);
  if (typeof data.configured !== "boolean" || !Number.isSafeInteger(data.credentialVersion)
    || (data.credentialVersion as number) < 0 || (data.configured ? data.credentialVersion === 0 : data.credentialVersion !== 0)
    || !Number.isSafeInteger(data.remainingAttempts) || (data.remainingAttempts as number) < 0
    || !date(data.serverTime) || (data.lockedUntil !== null && !date(data.lockedUntil))) throw invalid();
  return { configured: data.configured, credentialVersion: data.credentialVersion as number,
    remainingAttempts: data.remainingAttempts as number, serverTime: data.serverTime, lockedUntil: data.lockedUntil as string | null };
}
function receipt(value: unknown, commandKey: string): PaymentPasswordReceipt {
  const data = object(value);
  if (data.commandKey !== commandKey || !["SUCCEEDED", "REJECTED", "PROCESSING", "NOT_SEEN", "INDETERMINATE"].includes(data.status as string)
    || (data.canResumeSameKey !== undefined && typeof data.canResumeSameKey !== "boolean")
    || (data.code !== undefined && !Number.isSafeInteger(data.code)) || (data.message !== undefined && typeof data.message !== "string")) throw invalid();
  const state = data.state === undefined ? undefined : parsePaymentPasswordState(data.state);
  if (data.status === "SUCCEEDED" && !state) throw invalid();
  return { commandKey: data.commandKey, status: data.status as PaymentPasswordReceipt["status"], state,
    code: data.code as number | undefined, message: data.message as string | undefined, canResumeSameKey: data.canResumeSameKey === true };
}

export function createPaymentPasswordApi(client: ApiClient): PaymentPasswordApi {
  const base = "/api/app/security/payment-password";
  const mutate = async (path: string, input: { commandKey: string; [key: string]: unknown }) => {
    const { commandKey, ...body } = input;
    return receipt(await client.request({ method: "POST", path: `${base}/${path}`, body, idempotencyKey: commandKey, retryAfterAuth: false }), commandKey);
  };
  return {
    status: async () => parsePaymentPasswordState(await client.request({ path: base })),
    setup: input => mutate("setup", input),
    change: input => mutate("change", input),
    reset: input => mutate("reset", input),
    receipt: async key => receipt(await client.request({ path: `${base}/commands/${encodeURIComponent(key)}` }), key),
    challenge: async () => {
      const data = object(await client.request({ method: "POST", path: `${base}/reset/challenge` }));
      if (typeof data.phoneMasked !== "string" || !data.phoneMasked || typeof data.challengeNo !== "string" || !data.challengeNo
        || !Number.isSafeInteger(data.resendAfterSec) || (data.resendAfterSec as number) < 0 || !date(data.expiresAt)) throw invalid();
      return data as unknown as PaymentPasswordChallenge;
    },
    verify: async (challengeNo, code) => {
      const data = object(await client.request({ method: "POST", path: `${base}/reset/verify`, body: { challengeNo, code }, retryAfterAuth: false }));
      if (typeof data.resetProof !== "string" || !data.resetProof || !date(data.expiresAt)) throw invalid();
      return data as unknown as PaymentPasswordProof;
    },
  };
}
