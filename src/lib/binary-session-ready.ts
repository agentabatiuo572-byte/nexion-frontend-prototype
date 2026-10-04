export interface BinarySessionReadiness {
  remote: boolean;
  authenticated: boolean;
  accountId: string;
  appAccountKey: string;
  sessionUserId: number | null;
}

/** A protected F3 read starts only after H5 restore binds its current account. */
export function binarySessionReady(input: BinarySessionReadiness): boolean {
  if (!input.remote) return true;
  return input.authenticated
    && input.sessionUserId !== null
    && input.accountId === `user:${input.sessionUserId}`
    && input.appAccountKey === input.accountId;
}
