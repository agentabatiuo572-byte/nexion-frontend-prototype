import type { LocaleProfileScope } from "./locale-profile-sync";

let hydration: { scope: LocaleProfileScope; promise: Promise<void> } | null = null;

/** Legal reads wait for the current account language; old accounts never block new ones. */
export function trackProfileLocaleHydration(scope: LocaleProfileScope, work: Promise<void>): void {
  const entry = { scope, promise: work };
  hydration = entry;
  const clear = () => { if (hydration === entry) hydration = null; };
  // A failed account-language read/write remains a barrier until that account
  // retries. Dropping it would permit consent for a language not saved by the server.
  void work.then(clear, () => {});
}

export function isProfileLocaleHydrationError(error: unknown): boolean {
  return error instanceof Error && (error.message === "PROFILE_LANGUAGE_SYNC_FAILED" || error.message === "PROFILE_LANGUAGE_LOAD_FAILED");
}

export function pendingProfileLocaleHydration(scope: LocaleProfileScope): Promise<void> | null {
  return hydration && sameScope(scope, hydration.scope) ? hydration.promise : null;
}

function sameScope(left: LocaleProfileScope | null, right: LocaleProfileScope): boolean {
  return left !== null && left.accountId === right.accountId;
}

/**
 * Accept a server preference only when the same authenticated session still
 * owns the UI and no explicit picker action superseded the read.
 */
export function canHydrateProfileLocale(
  requestScope: LocaleProfileScope,
  currentScope: LocaleProfileScope | null,
  explicitRevisionAtRequest: number,
  currentExplicitRevision: number,
): boolean {
  return sameScope(currentScope, requestScope) && explicitRevisionAtRequest === currentExplicitRevision;
}
