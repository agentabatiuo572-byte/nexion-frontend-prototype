export interface GenesisAuthoritySession {
  accessToken: string;
  user: { userId: number };
}

/**
 * A Genesis account/eligibility read is allowed only after the OAuth/login
 * exchange has committed a bearer token for the same account being rebound.
 * This prevents an account-scope rebind from issuing a protected request with
 * an empty or previous-account session during H5 login transitions.
 */
export function hasGenesisAuthorityForAccount(
  session: GenesisAuthoritySession | null | undefined,
  accountKey: string,
): boolean {
  if (!session?.accessToken?.trim() || !Number.isSafeInteger(session.user?.userId) || session.user.userId <= 0) {
    return false;
  }
  return accountKey.trim().toLowerCase() === `user:${session.user.userId}`;
}
