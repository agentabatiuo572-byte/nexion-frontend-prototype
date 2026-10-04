import type {
  GenesisAccountState,
  GenesisEligibility,
  GenesisPublicState,
} from "@/api/genesis-api";
import { ApiError } from "@/api/errors";

export interface GenesisRemoteReadApi {
  state(): Promise<GenesisPublicState>;
  account(): Promise<GenesisAccountState>;
  eligibility(): Promise<GenesisEligibility>;
}

export interface GenesisRemoteReadScope {
  hasAuthority(): boolean;
  isCurrent(): boolean;
  clear(): void;
  /** Clears only public market facts after a failed public read while keeping a
   * separately successful account projection intact. */
  clearPublic?(): void;
  clearAccount(): void;
  applyEligibilityError?(reason: GenesisEligibilityReadError): void;
  applyPublicError?(reason: GenesisPublicReadError): void;
  applyPublicState(state: GenesisPublicState): void;
  applyAccount(state: GenesisAccountState): void;
  applyEligibility(eligibility: GenesisEligibility): void;
}

export type GenesisEligibilityReadError = "GENESIS_ELIGIBILITY_UNAVAILABLE" | "GENESIS_SERIES_UNAVAILABLE";
export type GenesisPublicReadError = "GENESIS_PUBLIC_UNAVAILABLE" | "GENESIS_SERIES_UNAVAILABLE";

function seriesUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "http" && error.status === 503
    && error.code === 503 && error.message === "GENESIS_SERIES_UNAVAILABLE";
}

function eligibilityReadError(...errors: unknown[]): GenesisEligibilityReadError {
  return errors.length > 0 && errors.every(seriesUnavailable)
    ? "GENESIS_SERIES_UNAVAILABLE" : "GENESIS_ELIGIBILITY_UNAVAILABLE";
}

function publicReadError(error: unknown): GenesisPublicReadError {
  return seriesUnavailable(error) ? "GENESIS_SERIES_UNAVAILABLE" : "GENESIS_PUBLIC_UNAVAILABLE";
}

/**
 * Read Genesis projections without making the public market snapshot a
 * prerequisite for account-scoped holder facts. The public state is a
 * separate capability (sale/market controls); a schema/transport failure in
 * that capability must not erase a valid account + eligibility projection.
 *
 * Account and RunID fences remain checked immediately before committing any
 * result. A wrong account is rejected before issuing a protected request, and
 * a stale response is never written into the active store.
 */
export async function readGenesisRemoteFacts(
  api: GenesisRemoteReadApi,
  scope: GenesisRemoteReadScope,
): Promise<boolean> {
  if (!scope.hasAuthority()) {
    // Supply, sale and market state are intentionally public. Anonymous users
    // may read those facts, but protected account/eligibility endpoints must
    // remain untouched and any prior account projection must be removed.
    let failure: unknown;
    const publicState = await api.state().catch((error) => { failure = error; return null; });
    if (!scope.isCurrent()) return false;
    if (!publicState) {
      scope.clear();
      scope.applyPublicError?.(publicReadError(failure));
      return false;
    }
    scope.clearAccount();
    scope.applyPublicState(publicState);
    return true;
  }

  // Public and protected projections are independent capabilities. A fresh
  // account can temporarily lack its holder projection, but that must not
  // erase canonical public supply and make a live sale look sold out.
  const [publicResult, accountResult, eligibilityResult] = await Promise.allSettled([
    api.state(),
    api.account(),
    api.eligibility(),
  ]);

  if (!scope.isCurrent() || !scope.hasAuthority()) {
    if (scope.isCurrent()) scope.clear();
    return false;
  }
  const publicAvailable = publicResult.status === "fulfilled";
  // BUG 174: 账号投影(含订单历史)与资格是**两件独立的事**。Genesis 未开放 /
  // 资格不可用时,GET /api/genesis/account 仍然能如实返回该账号的持仓与订单
  // (通常是空列表)。把两者绑成同一可用性,会让「没有资格」把已经读到的订单
  // 一起清空,订单页于是把资格故障升级成「订单目录同步失败」。
  const accountAvailable = accountResult.status === "fulfilled";
  const eligibilityAvailable = eligibilityResult.status === "fulfilled";
  if (!publicAvailable && !accountAvailable && !eligibilityAvailable) {
    scope.clear();
    scope.applyPublicError?.(publicReadError(publicResult.reason));
    scope.applyEligibilityError?.(eligibilityReadError(
      accountResult.status === "rejected" ? accountResult.reason : null,
      eligibilityResult.status === "rejected" ? eligibilityResult.reason : null,
    ));
    return false;
  }
  // Commit the public control plane first, then let an authenticated account
  // projection overlay only its explicitly scoped facts. This keeps a
  // just-confirmed purchase visible without changing public supply ownership.
  if (publicAvailable) scope.applyPublicState(publicResult.value);
  else {
    scope.clearPublic?.();
    scope.applyPublicError?.(publicReadError(publicResult.reason));
  }
  if (accountAvailable) scope.applyAccount(accountResult.value);
  else scope.clearAccount();
  if (eligibilityAvailable) scope.applyEligibility(eligibilityResult.value);
  else scope.applyEligibilityError?.(eligibilityReadError(
    accountResult.status === "rejected" ? accountResult.reason : null,
    eligibilityResult.status === "rejected" ? eligibilityResult.reason : null,
  ));
  if (!accountAvailable || !eligibilityAvailable) {
    console.warn("GENESIS_PROTECTED_READ_UNAVAILABLE", {
      reason: eligibilityReadError(
        accountResult.status === "rejected" ? accountResult.reason : null,
        eligibilityResult.status === "rejected" ? eligibilityResult.reason : null,
      ),
      accountAvailable,
      eligibilityAvailable,
    });
  }
  return true;
}
