/** Maps only a server-confirmed volume threshold block to the invite-options entry. */
export function binaryBlockedGuidance(input: {
  remote: boolean;
  blocked: boolean;
  reason?: string;
}): { showInviteOptions: boolean } {
  if (!input.blocked) return { showInviteOptions: false };
  return {
    showInviteOptions: input.remote
      ? input.reason === "BINARY_THRESHOLD_NOT_MET"
      : true,
  };
}
