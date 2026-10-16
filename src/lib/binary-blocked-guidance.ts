/** Uses the confirmed reason for the heading; only threshold blocks offer invite options. */
export function binaryBlockedGuidance(input: {
  remote: boolean;
  blocked: boolean;
  reason?: string;
}): { showInviteOptions: boolean; titleKey: "blocked" | "settlementPending" | "settlementUnavailable" } {
  const reason = input.remote && input.blocked ? input.reason : undefined;
  return {
    titleKey: reason === "F3_BINARY_PAUSED" ? "blocked"
      : reason === "F3_SETTLEMENT_NOT_DUE" ? "settlementPending" : "settlementUnavailable",
    showInviteOptions: input.blocked && (input.remote ? reason === "BINARY_THRESHOLD_NOT_MET" : true),
  };
}
