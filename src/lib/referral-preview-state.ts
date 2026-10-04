export type ReferralPreviewState = "idle" | "loading" | "ready" | "unavailable";
export type ReferralCtaMode = "referral" | "ordinary" | "pending";

/** A remote referral may be attributed only after its public preview succeeds. */
export function referralCtaMode(
  remoteApiEnabled: boolean,
  state: ReferralPreviewState,
): ReferralCtaMode {
  if (!remoteApiEnabled || state === "ready") return "referral";
  if (state === "loading") return "pending";
  return "ordinary";
}

export function resolveReferralAttributionCode(
  remoteApiEnabled: boolean,
  state: ReferralPreviewState,
  code: string,
): string | null {
  if (remoteApiEnabled && state !== "ready") return null;
  return code || null;
}
