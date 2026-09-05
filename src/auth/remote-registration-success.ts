/**
 * A freshly issued remote session remains in the in-memory vault. Keep only
 * its non-secret identity here until the success screen's explicit Continue
 * action binds the local UI shell. This intentionally does not persist across
 * a browser refresh or app restart.
 */
let pendingIdentity: string | null = null;

export function stagePendingRemoteRegistrationSuccess(userId: string | number): void {
  pendingIdentity = `user:${userId}`;
}

/** One-time consume prevents repeated taps from completing the UI login twice. */
export function consumePendingRemoteRegistrationSuccess(): string | null {
  const identity = pendingIdentity;
  pendingIdentity = null;
  return identity;
}

/** The success screen must bind to the same runtime session that registered. */
export function hasPendingRemoteRegistrationSuccess(userId: string | number): boolean {
  return pendingIdentity === `user:${userId}`;
}

export function clearPendingRemoteRegistrationSuccess(): void {
  pendingIdentity = null;
}
