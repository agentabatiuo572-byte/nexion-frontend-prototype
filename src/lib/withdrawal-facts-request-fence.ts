/**
 * Financial reads may update a quote only while they still belong to the same
 * signed-in account, runtime generation, and most-recent request.  Keeping the
 * comparison pure makes the page use the exact same fence for policy and both
 * eligibility probes.
 */
export interface WithdrawalFactsRequestScope {
  accountKey: string;
  /** A same-id sign-in/rebind is still a new financial authority boundary. */
  accountBindingEpoch: number;
  runtimeEpoch: number;
  sequence: number;
}

export function isCurrentWithdrawalFactsRequest(
  requested: WithdrawalFactsRequestScope,
  current: WithdrawalFactsRequestScope,
): boolean {
  return requested.accountKey === current.accountKey
    && requested.accountBindingEpoch === current.accountBindingEpoch
    && requested.runtimeEpoch === current.runtimeEpoch
    && requested.sequence === current.sequence;
}
