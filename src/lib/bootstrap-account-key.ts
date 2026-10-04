export interface BootstrapAccountKeyInput {
  remote: boolean;
  email?: string | null;
  accountId?: string | null;
  sessionUserId?: number | null;
}

/**
 * Resolve the key used to bind account-scoped client state at application
 * startup. In remote mode, only the authenticated server session is a valid
 * authority: a persisted local email is merely profile display data and must
 * never select a remote account scope.
 */
export function resolveBootstrapAccountKey({
  remote,
  email,
  accountId,
  sessionUserId,
}: BootstrapAccountKeyInput): string | null {
  if (!remote) return email || accountId || "default";
  if (!Number.isSafeInteger(sessionUserId) || !sessionUserId || sessionUserId < 0) return null;

  const canonicalAccountKey = `user:${sessionUserId}`;
  return accountId === canonicalAccountKey ? canonicalAccountKey : null;
}
