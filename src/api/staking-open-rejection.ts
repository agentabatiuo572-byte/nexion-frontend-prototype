import { ApiError } from "./errors";

export type StakingOpenRejectionReason = "insufficient" | "minimum" | "unavailable" | "invalid";

// These OPEN refusals either precede the debit or roll back the entire OPEN.
// HTTP conflicts and business
// errors outside this exact contract remain unknown, including idempotency errors.
const refusals: Record<string, { code: number; reason: StakingOpenRejectionReason }> = {
  STAKING_WALLET_INSUFFICIENT: { code: 409, reason: "insufficient" },
  STAKING_POOL_NOT_ACTIVE: { code: 409, reason: "unavailable" },
  STAKING_POOL_KILLED: { code: 409, reason: "unavailable" },
  STAKING_POOL_STOPPED: { code: 409, reason: "unavailable" },
  STAKING_GLOBAL_GATE_DISABLED: { code: 409, reason: "unavailable" },
  STAKING_MIN_AMOUNT_NOT_MET: { code: 422, reason: "minimum" },
  STAKING_AMOUNT_INVALID: { code: 422, reason: "invalid" },
  STAKING_TIER_INVALID: { code: 422, reason: "invalid" },
  // Strict outbox validation throws inside AppStakingService.open rollbackFor=Exception.
  A4_SCHEMA_PROPERTY_NOT_REGISTERED: { code: 422, reason: "unavailable" },
  A4_SCHEMA_PROPERTY_TYPE_MISMATCH: { code: 422, reason: "unavailable" },
  A4_SCHEMA_REQUIRED_PROPERTY_MISSING: { code: 422, reason: "unavailable" },
};

export function classifyStakingOpenRejection(cause: unknown): StakingOpenRejectionReason | null {
  if (!(cause instanceof ApiError)) return null;
  const refusal = Object.prototype.hasOwnProperty.call(refusals, cause.message) ? refusals[cause.message] : undefined;
  if (!refusal || cause.code !== refusal.code) return null;
  if (cause.kind === "http" && cause.status === refusal.code) return refusal.reason;
  if (cause.kind === "business" && cause.status !== undefined && cause.status >= 200 && cause.status < 300) return refusal.reason;
  return null;
}

/** Issued only by the store for its owned fresh OPEN, after attempting exact-key retirement. */
export class StakingOpenRejectedError extends Error {
  constructor(readonly reason: StakingOpenRejectionReason, readonly retired: boolean) {
    super("STAKING_OPEN_REJECTED");
    this.name = "StakingOpenRejectedError";
  }
}
