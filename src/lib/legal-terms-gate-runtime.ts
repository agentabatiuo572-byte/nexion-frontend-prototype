import { navReset } from "@/lib/route";
import { legalTermsApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { useLocaleStore } from "@/store/locale";
import { getT } from "@/i18n/use-t";
import { captureRuntimeRevision } from "@/api/order-api";
import { ApiError } from "@/api/errors";
import { pendingProfileLocaleHydration } from "./locale-profile-hydration";
import {
  buildLegalTermsRoute,
  claimLegalTermsRedirect,
  isLegalTermsGateExemptRoute,
  LEGAL_TERMS_ROUTE,
  PRIVACY_POLICY_ROUTE,
  sameLegalTermsRun,
  isLegalTermsAcknowledged,
  sameLegalTermsSession,
  type LegalTermsSessionFence,
} from "@/lib/legal-terms-gate";

let inFlight: { key: string; locale: string; generation: number; promise: Promise<void> } | null = null;
let readGeneration = 0;
const failedKeys = new Set<string>();
const redirectedKeys = new Set<string>();
const verificationKeys = new Set<string>();
const REDIRECT_RETRY_MS = 5_000;
let lastRedirectAttempt: { key: string; url: string; at: number } | null = null;
let pendingRequirement: {
  key: string;
  locale: string;
  version: string;
  reason: "verification" | "verification-failed" | "acknowledgement";
  sessionFence: LegalTermsSessionFence;
  retryInPlace?: boolean;
  retryReturnTo?: string;
  registrationCompletionReturnTo?: string;
} | null = null;
const latestGateRouteByKey = new Map<string, string>();
let acknowledgedSession: { locale: string; sessionFence: LegalTermsSessionFence } | null = null;
let retryPrompt: object | null = null;
let afterAcknowledgement: { sessionFence: LegalTermsSessionFence; run: () => Promise<boolean | void> } | null = null;

/** Login work survives the Terms page, but never a different login session. */
export function afterLegalTermsAcknowledged(run: () => Promise<boolean | void>): void {
  const current = fence();
  afterAcknowledgement = current ? { sessionFence: current, run } : null;
}

function hasPriorAcknowledgement(locale: string): boolean {
  const current = fence();
  const previous = acknowledgedSession;
  return !!current && !!previous && previous.locale === locale && previous.sessionFence.userId === current.userId
    && (sameLegalTermsSession(previous.sessionFence, current)
      || sessionVault.isRefreshContinuation(previous.sessionFence.sessionRevision ?? -1));
}

function promptVerificationRetry(returnTo: string): void {
  const pending = currentPendingRequirement();
  if (!pending?.retryInPlace || pending.reason !== "verification-failed" || retryPrompt) return;
  const prompt = {};
  retryPrompt = prompt;
  const t = getT();
  uni.showModal({
    title: t.terms.navTitle, content: t.terms.loadFailed, confirmText: t.ui.retry, showCancel: false,
    success(result) {
      if (retryPrompt === prompt) retryPrompt = null;
      const current = currentPendingRequirement();
      // A modal opened for an earlier identity, language or read cannot retry on its behalf.
      if (result.confirm && current?.reason === "verification-failed" && current.retryInPlace
          && pending.locale === useLocaleStore().code && current.locale === pending.locale
          && pending.sessionFence.userId === current.sessionFence.userId
          && (sameLegalTermsSession(pending.sessionFence, fence())
            || sessionVault.isRefreshContinuation(pending.sessionFence.sessionRevision ?? -1))) {
        void scheduleLegalTermsGate(current.retryReturnTo ?? returnTo);
      }
    },
    complete() { if (retryPrompt === prompt) retryPrompt = null; },
  });
}

function registrationCompletionReturnTo(returnTo: string): string | undefined {
  return returnTo === "/pages/register/success" || returnTo === "/pages/onboarding/estimator"
    ? returnTo : undefined;
}

function fence(): LegalTermsSessionFence | null {
  const session = sessionVault.read();
  if (!session?.accessToken) return null;
  return { accessToken: session.accessToken, userId: session.user.userId, sessionRevision: sessionVault.revision() };
}

function sessionKey(value: LegalTermsSessionFence): string {
  return `${value.userId}:${value.accessToken}:${value.sessionRevision ?? 0}`;
}

function rescheduleAfterSessionChange(expected: LegalTermsSessionFence, returnTo: string): Promise<void> {
  const current = fence();
  if (!current
      || current.userId !== expected.userId
      || sameLegalTermsSession(expected, current)) {
    return Promise.resolve();
  }
  return scheduleLegalTermsGate(returnTo);
}

function currentPendingRequirement(): typeof pendingRequirement {
  const current = fence();
  if (!current || !pendingRequirement) return null;
  return pendingRequirement.key === sessionKey(current)
    || (pendingRequirement.sessionFence.userId === current.userId
      && sessionVault.isRefreshContinuation(pendingRequirement.sessionFence.sessionRevision ?? -1))
    ? pendingRequirement : null;
}

function beginVerification(key: string): void {
  verificationKeys.add(key);
  uni.showLoading({ title: "", mask: true });
}

function finishVerification(key: string): void {
  if (!verificationKeys.delete(key)) return;
  if (verificationKeys.size === 0) uni.hideLoading();
}

function redirectToRequiredTerms(key: string, returnTo: string): void {
  const url = buildLegalTermsRoute(returnTo);
  const now = Date.now();
  // The App guard polls every second. Keep the obligation active but avoid
  // concurrent reset storms and a fresh platform toast on every guard tick.
  if (lastRedirectAttempt?.key === key && lastRedirectAttempt.url === url
      && now - lastRedirectAttempt.at < REDIRECT_RETRY_MS) return;
  lastRedirectAttempt = { key, url, at: now };
  void navReset(url);
}

/**
 * Report a known obligation without redirecting. Legal-document routes are
 * readable while pending, but they must not restart earnings or order loops.
 */
export function hasPendingLegalTermsRequirement(): boolean {
  if (!remoteApiEnabled) return false;
  return currentPendingRequirement() !== null;
}

/**
 * Re-apply a known unacknowledged requirement synchronously. This closes the
 * browser-history/system-back gap without another network round trip.
 */
export function enforcePendingLegalTermsGate(returnTo: string): boolean {
  if (!remoteApiEnabled) return false;
  const pending = currentPendingRequirement();
  if (!pending) return false;
  const path = `/${returnTo.replace(/^#?\/?/, "").split("?", 1)[0]}`;
  if (path === PRIVACY_POLICY_ROUTE) return false;
  // While current() is unresolved, the masked loading layer blocks input and
  // App treats true as a signal to stop every business loop. Do not flash an
  // already-acknowledged user through the Terms page merely to verify state.
  if (pending.reason === "verification") return true;
  if (isLegalTermsGateExemptRoute(path)) return false;
  if (pending.reason === "verification-failed" && pending.retryInPlace) {
    pending.retryReturnTo = returnTo;
    promptVerificationRetry(returnTo);
    return true;
  }
  // The route watcher can still see the form while its async reset to Terms
  // is rendering. Preserve the registration-owned destination in that window;
  // the in-flight route map has already been cleared after the Terms read.
  const destination = path === "/pages/register/register"
    ? pending.registrationCompletionReturnTo ?? returnTo : returnTo;
  redirectToRequiredTerms(pending.key, destination);
  return true;
}

/** Clear the current account obligation after an authoritative current snapshot. */
export function recordLegalTermsAcknowledged(
  snapshot: Parameters<typeof isLegalTermsAcknowledged>[0],
  requestedLocale = snapshot.requestedLocale,
): void {
  const current = fence();
  if (!current || !sameLegalTermsRun(snapshot, captureRuntimeRevision().runId)
      || !isLegalTermsAcknowledged(snapshot) || requestedLocale !== useLocaleStore().code) return;
  const key = sessionKey(current);
  acknowledgedSession = { locale: requestedLocale, sessionFence: current };
  // A page-owned confirmation may supersede a still-pending global read. The
  // selected request locale also permits an explicitly displayed fallback doc.
  if (inFlight?.key === key) inFlight = null;
  finishVerification(key);
  const pending = currentPendingRequirement();
  if (pending) {
    finishVerification(pending.key);
    pendingRequirement = null;
    if (lastRedirectAttempt?.key === pending.key) lastRedirectAttempt = null;
  }
  if (lastRedirectAttempt?.key === key) lastRedirectAttempt = null;
  failedKeys.delete(key);
  latestGateRouteByKey.delete(key);
  const continuation = afterAcknowledgement;
  if (continuation) {
    afterAcknowledgement = null;
    void Promise.resolve().then(async () => {
      const latest = fence();
      if (!latest || latest.userId !== continuation.sessionFence.userId
          || !(sameLegalTermsSession(continuation.sessionFence, latest)
            || sessionVault.isRefreshContinuation(continuation.sessionFence.sessionRevision ?? -1))) return;
      const completed = await continuation.run();
      if (completed === false && !afterAcknowledgement) afterAcknowledgement = continuation;
    }).catch(() => { /* Individual business reads retain their own retry states. */ });
  }
}

/**
 * Check the server's current version after login and on session restore.
 * The request is fenced to the exact in-memory bearer + account; a late
 * response can never redirect a subsequent account. A failed recheck of an
 * acknowledged login stays on its page with a retry prompt; the obligation
 * remains closed until a fresh authoritative response confirms acknowledgement.
 */
export function scheduleLegalTermsGate(returnTo = "/pages/index/index"): Promise<void> {
  if (!remoteApiEnabled) return Promise.resolve();
  // The Terms page owns its own snapshot/ack flow.  Re-running the global
  // gate while that page is visible loses its query return target because the
  // App route reader intentionally strips query strings.
  const path = `/${returnTo.replace(/^#?\/?/, "").split("?", 1)[0]}`;
  if (path === LEGAL_TERMS_ROUTE) return Promise.resolve();
  const requestFence = fence();
  if (!requestFence) return Promise.resolve();
  const requestLocale = useLocaleStore().code;
  const key = sessionKey(requestFence);
  latestGateRouteByKey.set(key, returnTo);
  const publicPrivacyRoute = path === PRIVACY_POLICY_ROUTE;
  // A known obligation is authoritative until acknowledgement succeeds. Do
  // not let browser history or a repeated failed check downgrade it to the
  // non-redirecting verification state or replace its original return target.
  if (pendingRequirement?.key === key
      && pendingRequirement.locale === requestLocale
      && pendingRequirement.reason === "acknowledgement") return Promise.resolve();
  if (inFlight?.key === key && inFlight.locale === requestLocale) {
    if (publicPrivacyRoute) finishVerification(key);
    return inFlight.promise;
  }
  // Every authoritative recheck is fail-closed, including a previously
  // acknowledged session: a newly published version must not gain a network
  // response window in which business activity can continue.
  pendingRequirement = { key, locale: requestLocale, version: "", reason: "verification", sessionFence: requestFence };
  const generation = ++readGeneration;
  const ownsRead = () => inFlight?.generation === generation;
  failedKeys.delete(key);
  if (!publicPrivacyRoute) beginVerification(key);
  else finishVerification(key);
  if (inFlight && inFlight.key !== key) {
    finishVerification(inFlight.key);
    latestGateRouteByKey.delete(inFlight.key);
  }
  const read = Promise.resolve().then(async () => {
    // The synchronous locale-selection watcher registers its write in the same
    // turn. Resolve the barrier after that turn, while verification stays closed.
    const languageHydration = pendingProfileLocaleHydration({ accountId: `user:${requestFence.userId}`, revision: requestFence.sessionRevision ?? 0 });
    if (languageHydration) await languageHydration;
    if (!ownsRead() || !sameLegalTermsSession(requestFence, fence()) || requestLocale !== useLocaleStore().code) {
      throw new Error("LEGAL_TERMS_LANGUAGE_HYDRATION_SUPERSEDED");
    }
    try {
      return await legalTermsApi.current(requestLocale, "GLOBAL", true);
    } catch (error) {
      if (!(error instanceof ApiError) || !error.retryable) throw error;
      // Keep business actions gated while one transient read gets a second chance.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!ownsRead() || !sameLegalTermsSession(requestFence, fence()) || requestLocale !== useLocaleStore().code) throw error;
      return legalTermsApi.current(requestLocale, "GLOBAL", true);
    }
  });
  const promise = read
    .then((snapshot) => {
      if (!ownsRead()) return;
      if (!sameLegalTermsSession(requestFence, fence())) {
        return rescheduleAfterSessionChange(requestFence, returnTo);
      }
      if (requestLocale !== useLocaleStore().code) {
        return scheduleLegalTermsGate(latestGateRouteByKey.get(key) ?? returnTo);
      }
      if (snapshot.requestedLocale !== requestLocale) throw new Error("LEGAL_TERMS_LOCALE_MISMATCH");
      if (!sameLegalTermsRun(snapshot, captureRuntimeRevision().runId)) return;
      if (!isLegalTermsAcknowledged(snapshot)) {
        acknowledgedSession = null;
        finishVerification(key);
        const currentReturnTo = latestGateRouteByKey.get(key) ?? returnTo;
        pendingRequirement = {
          key, locale: requestLocale, version: snapshot.version, reason: "acknowledgement", sessionFence: requestFence,
          registrationCompletionReturnTo: registrationCompletionReturnTo(currentReturnTo),
        };
        const currentPath = `/${currentReturnTo.replace(/^#?\/?/, "").split("?", 1)[0]}`;
        const redirectKey = `${key}:${snapshot.sourceEnvironment}:${snapshot.runId}:${snapshot.version}:${currentReturnTo}`;
        if (currentPath !== PRIVACY_POLICY_ROUTE && claimLegalTermsRedirect(redirectedKeys, redirectKey)) {
          redirectToRequiredTerms(key, currentReturnTo);
        }
      } else {
        recordLegalTermsAcknowledged(snapshot, requestLocale);
      }
    })
    .catch(() => {
      if (!ownsRead()) return;
      if (!sameLegalTermsSession(requestFence, fence())) {
        return rescheduleAfterSessionChange(requestFence, returnTo);
      }
      if (requestLocale !== useLocaleStore().code) {
        return scheduleLegalTermsGate(latestGateRouteByKey.get(key) ?? returnTo);
      }
      if (failedKeys.has(key)) return;
      finishVerification(key);
      const currentReturnTo = latestGateRouteByKey.get(key) ?? returnTo;
      pendingRequirement = {
        key, locale: requestLocale, version: "", reason: "verification-failed", sessionFence: requestFence,
        retryInPlace: hasPriorAcknowledgement(requestLocale),
        retryReturnTo: currentReturnTo,
        registrationCompletionReturnTo: registrationCompletionReturnTo(currentReturnTo),
      };
      failedKeys.add(key);
      const currentPath = `/${currentReturnTo.replace(/^#?\/?/, "").split("?", 1)[0]}`;
      if (currentPath !== PRIVACY_POLICY_ROUTE) {
        if (pendingRequirement.retryInPlace) promptVerificationRetry(currentReturnTo);
        else redirectToRequiredTerms(key, currentReturnTo);
      }
    })
    .finally(() => {
      // Same-account locale reads share a loading mask; only its current owner
      // may release it. A completed old account can release its own mask key.
      if (ownsRead()) {
        finishVerification(key);
        inFlight = null;
        latestGateRouteByKey.delete(key);
      } else if (inFlight?.key !== key) {
        finishVerification(key);
        latestGateRouteByKey.delete(key);
      }
    });
  inFlight = { key, locale: requestLocale, generation, promise };
  return promise;
}
