export interface RegistrationSuccessSession {
  remote: boolean;
  authenticated: boolean;
  accountId: string;
  accessToken?: string | null;
  serverUserId?: number | null;
}

/** A registration receipt describes a benefit; it never authorizes this screen. */
export function canRenderRegistrationSuccess(session: RegistrationSuccessSession): boolean {
  if (!session.authenticated) return false;
  if (!session.remote) return session.accountId !== "default";
  return Boolean(session.accessToken)
    && Number.isSafeInteger(session.serverUserId)
    && session.serverUserId! > 0
    && session.accountId === `user:${session.serverUserId}`;
}
