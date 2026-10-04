import type { LegalTermsCurrent } from "@/api/legal-terms-api";
import { safeReturnTo } from "@/routing/safe-return-to";

export const LEGAL_TERMS_ROUTE = "/pages/onboarding/terms";
export const PRIVACY_POLICY_ROUTE = "/pages/onboarding/privacy";
export const LOGIN_ROUTE = "/pages/login/login";

export interface LegalTermsSessionFence {
  accessToken: string;
  userId: number;
  /** Authentication generation, independent of product/fleet refreshes. */
  sessionRevision?: number;
}

function internalReturnTo(raw: string | null | undefined, fallback: string): string {
  const safe = safeReturnTo(raw, fallback);
  return safe.startsWith("/pages/") ? safe : fallback;
}

/**
 * Unwrap Terms routes that were carried through login more than once.  The
 * login page receives its return parameter decoded once, so without this
 * normalization a Terms gate can redirect to another Terms gate after a
 * successful acknowledgement instead of the user's original destination.
 */
export function canonicalLegalTermsReturnTo(raw: string | null | undefined, fallback: string): string {
  let current = internalReturnTo(raw, fallback);
  for (let depth = 0; depth < 4; depth += 1) {
    const question = current.indexOf("?");
    const path = question < 0 ? current : current.slice(0, question);
    if (path !== LEGAL_TERMS_ROUTE) return current;
    const query = question < 0 ? "" : current.slice(question + 1);
    const nested = new URLSearchParams(query).get("return");
    if (!nested) return fallback;
    const next = internalReturnTo(nested, fallback);
    if (next === current) return fallback;
    current = next;
  }
  return fallback;
}

/** Build the only login redirect used by the Terms acknowledgment flow. */
export function buildLegalTermsLoginRoute(returnTo = LEGAL_TERMS_ROUTE): string {
  const safe = internalReturnTo(returnTo, LEGAL_TERMS_ROUTE);
  const canonical = safe === LEGAL_TERMS_ROUTE ? safe : safe.startsWith(`${LEGAL_TERMS_ROUTE}?`)
    ? buildLegalTermsRoute(safe)
    : safe;
  return `${LOGIN_ROUTE}?return=${encodeURIComponent(canonical)}`;
}

/** Preserve the original internal destination after a required re-ack. */
export function buildLegalTermsRoute(returnTo = "/pages/index/index"): string {
  const safe = canonicalLegalTermsReturnTo(returnTo, "/pages/index/index");
  return `${LEGAL_TERMS_ROUTE}?return=${encodeURIComponent(safe)}`;
}

export function isLegalTermsAcknowledged(snapshot: LegalTermsCurrent): boolean {
  return snapshot.source === "server" && snapshot.acknowledged === true;
}

/** Fail closed only for an authenticated remote-account acknowledgement flow. */
export function shouldBlockLegalTermsExit(
  remote: boolean,
  authenticated: boolean,
  snapshot: LegalTermsCurrent | null,
): boolean {
  return remote && authenticated && (!snapshot || !isLegalTermsAcknowledged(snapshot));
}

/** Legal documents remain readable while every business route stays gated. */
export function isLegalTermsGateExemptRoute(route: string): boolean {
  const path = `/${route.replace(/^#?\/?/, "").split("?", 1)[0]}`;
  return path === LEGAL_TERMS_ROUTE
    || path === PRIVACY_POLICY_ROUTE
    || path === "/pages/me/risk-disclosure";
}

/** Only canonical development/production Terms facts are accepted. */
export function sameLegalTermsRun(snapshot: LegalTermsCurrent, _runtimeRunId?: null): boolean {
  return snapshot.sourceEnvironment === "PRODUCTION" && snapshot.runId === "";
}

/** Claim a single re-ack redirect until the account or published version changes. */
export function claimLegalTermsRedirect(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export function sameLegalTermsSession(
  expected: LegalTermsSessionFence | null,
  actual: LegalTermsSessionFence | null,
): boolean {
  if (!expected || !actual) return false;
  return expected.accessToken === actual.accessToken
    && expected.userId === actual.userId
    && (expected.sessionRevision === undefined || actual.sessionRevision === expected.sessionRevision);
}
