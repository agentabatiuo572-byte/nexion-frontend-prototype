export type RemoteReadStatus = "idle" | "loading" | "ready" | "error";
export type FinancialFactState = "ready" | "loading" | "refreshing" | "stale" | "unavailable";

export interface FinancialFactSource {
  hasSnapshot: boolean;
  status: RemoteReadStatus;
}

/**
 * A remote financial amount is safe to show only when every source has a
 * same-account snapshot. A retained snapshot remains readable during an
 * ordinary refresh, but it cannot authorize an action until every source is
 * current again. A failed read is never presented as a current quote.
 */
export function financialFactState(
  remote: boolean,
  sources: readonly FinancialFactSource[],
): FinancialFactState {
  if (!remote) return "ready";
  if (sources.some((source) => source.status === "error")) {
    return "unavailable";
  }
  if (sources.some((source) => !source.hasSnapshot)) return "loading";
  if (sources.some((source) => source.status === "loading")) return "refreshing";
  if (sources.some((source) => source.status !== "ready")) return "stale";
  return "ready";
}

/** Only two fully current fact sets can authorize a new financial action. */
export function withdrawalFactsActionsFresh(
  withdrawalFacts: FinancialFactState,
  dailyFacts: FinancialFactState,
): boolean {
  return withdrawalFacts === "ready" && dailyFacts === "ready";
}

/** Both the normal and small-amount preflight must use current financial facts. */
export function shouldRequestWithdrawalEligibility(input: {
  remote: boolean;
  factsFresh: boolean;
  policyVersion: string | undefined;
  amount: number;
  addressLength: number;
}): boolean {
  return input.remote
    && input.factsFresh
    && Boolean(input.policyVersion)
    && input.amount > 0
    && input.addressLength > 10;
}
