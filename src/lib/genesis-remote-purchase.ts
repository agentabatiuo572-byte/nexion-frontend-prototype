import { ApiError } from "@/api/errors";

export type RemoteGenesisPurchaseFailure =
  | "sold-out"
  | "market-closed"
  | "insufficient-funds"
  | "cap"
  | "not-eligible"
  | "unavailable";

/** Map only explicit backend domain outcomes; every unknown remote failure is unavailable. */
export function classifyRemoteGenesisPurchaseError(error: unknown): RemoteGenesisPurchaseFailure {
  if (error instanceof ApiError && error.message === "GENESIS_WALLET_INSUFFICIENT") return "insufficient-funds";
  if (error instanceof ApiError && error.message === "GENESIS_USER_CAP_REACHED") return "cap";
  if (error instanceof ApiError && (
    error.message === "GENESIS_ACCOUNT_AGE_REQUIRED"
    || error.message === "GENESIS_COUNTRY_REQUIRED"
    || error.message === "GENESIS_GEO_BLOCKED"
    || error.message === "GENESIS_PRODUCTION_USER_REQUIRED"
  )) return "not-eligible";
  if (error instanceof ApiError && error.message === "GENESIS_SOLD_OUT") return "sold-out";
  if (error instanceof ApiError && (
    error.message === "GENESIS_MARKET_PAUSED"
    || error.message === "GENESIS_PRESALE_NOT_OPEN"
    || error.message === "GENESIS_SALE_POLICY_UNAVAILABLE"
  )) return "market-closed";
  return "unavailable";
}

export type RemoteGenesisPurchaseResolution<T> =
  | { ok: true; state: T }
  | { ok: false; reason: RemoteGenesisPurchaseFailure };

/** Resolve one remote mutation without adding a success-path readback. The
 * mutation receipt is authoritative; recovery reads are reserved for thrown
 * or otherwise unknown outcomes and are deliberately non-blocking. */
export async function resolveRemoteGenesisPurchase<T>(operations: {
  execute: () => Promise<T>;
  isCurrent: () => boolean;
  applyReceipt: (state: T) => void;
  retireIntent: () => unknown;
  recoverUnknown: () => Promise<unknown>;
}): Promise<RemoteGenesisPurchaseResolution<T>> {
  let state: T;
  try {
    state = await operations.execute();
  } catch (error) {
    const reason = classifyRemoteGenesisPurchaseError(error);
    if (reason === "unavailable") {
      void operations.recoverUnknown().catch(() => undefined);
    }
    return { ok: false, reason };
  }
  if (!operations.isCurrent()) return { ok: false, reason: "unavailable" };
  operations.applyReceipt(state);
  // Local pending-key retirement is housekeeping. Its false-like return value
  // cannot downgrade a transaction the server has already committed.
  operations.retireIntent();
  return { ok: true, state };
}
