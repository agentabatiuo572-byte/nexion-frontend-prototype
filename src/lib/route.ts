// Map a prototype-style LOGICAL path (the web routes baked into nova /
// notification CTA data, e.g. "/team/commissions", "/genesis",
// "/me/wallet/exchange", "/store") to the actual uni-app route, then navigate.
//
// uni flattens the prototype's nested paths and doubles single-segment landings:
//   /genesis            -> /pages/genesis/genesis      (single segment landing)
//   /team/commissions   -> /pages/team/commissions     (2-seg passes through)
//   /me/wallet/exchange -> /pages/me/wallet-exchange    (3+ seg flattened w/ dashes)
//   /store /team /earn /me / -> tab roots, reLaunch to /pages/x/x
//
// Without this, navigating raw logical hrefs (message-drawer did) or naive
// `/pages${href}` prefixing (nova-drawer did) hits non-existent routes and
// uni's navigateTo silently fails → "点击无跳转". (P-046)

import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useVoucherClaimSheet } from "@/store/voucher-claim-sheet";
import { toast } from "@/store/ui";
import { getT } from "@/i18n/use-t";

const TAB_ROOT: Record<string, string> = {
  "/": "/pages/index/index",
  "/home": "/pages/index/index",
  "/store": "/pages/store/store",
  "/team": "/pages/team/team",
  "/earn": "/pages/earn/earn",
  "/me": "/pages/me/me",
};

function reportNavigationFailure(): void {
  // Bare Intro/Terms/session-ended pages do not mount GlobalUi. Native feedback
  // must be first even when Pinia is active, for every kind of navigation.
  let title = "Unable to open this page. Please try again.";
  try { title = getT().ui.navigationFailed; } catch { /* i18n is not mounted yet */ }
  try {
    uni.showToast({ title, icon: "none" });
  } catch {
    try { toast.error(title); } catch { /* Neither renderer is mounted yet. */ }
  }
}

function closeTransientNavigationSheets(): void {
  // Navigation can be triggered by startup/deep-link code before Pinia is
  // active. Overlay cleanup is best-effort and must never block routing.
  try { useTrialClaimSheet().closeTransient(); } catch { /* store unavailable */ }
  try { useVoucherClaimSheet().closeTransient(); } catch { /* store unavailable */ }
}

function isUsableNavigationHref(href: unknown): href is string {
  return typeof href === "string" && !!href.trim() && href.trim() !== "#";
}

export function toUniRoute(href: string): { url: string; tab: boolean } {
  const qi = href.indexOf("?");
  const path = qi >= 0 ? href.slice(0, qi) : href;
  const query = qi >= 0 ? href.slice(qi) : "";
  // Already a uni route → pass through, while still recognizing real tab roots.
  // Calling navigateTo for a tabBar page fails on App/mini-program runtimes.
  if (path.startsWith("/pages/")) {
    return { url: href, tab: Object.values(TAB_ROOT).includes(path) };
  }
  if (TAB_ROOT[path]) return { url: TAB_ROOT[path] + query, tab: true };
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return { url: "/pages/index/index" + query, tab: true };
  if (segs.length === 1) return { url: `/pages/${segs[0]}/${segs[0]}` + query, tab: false };
  // 2+ segments: first segment is the directory; flatten the rest with dashes
  // (matches uni's flattened filenames: me/wallet/exchange → me/wallet-exchange).
  return { url: `/pages/${segs[0]}/${segs.slice(1).join("-")}` + query, tab: false };
}

type ForcedNavigationOptions = UniApp.ReLaunchOptions;

/** Keep auth/terms resets as resets; never fall back to pushing a business page. */
export function navReset(target: string | ForcedNavigationOptions): Promise<boolean> {
  return forceNavigation(target, false);
}

/** Replace the current page, with a same-destination reset if replacement fails. */
export function navReplace(target: string | ForcedNavigationOptions): Promise<boolean> {
  return forceNavigation(target, true);
}

function forceNavigation(target: string | ForcedNavigationOptions, replace: boolean): Promise<boolean> {
  closeTransientNavigationSheets();
  const options = typeof target === "string" ? { url: target } : target;
  if (!options || !isUsableNavigationHref(options.url)) {
    reportNavigationFailure();
    return Promise.resolve(false);
  }
  const { url } = toUniRoute(options.url.trim());
  return new Promise((resolve) => {
    let settled = false;
    const invoke = (callback: Function | undefined, result: unknown) => {
      try { callback?.(result); } catch { reportNavigationFailure(); }
    };
    const finish = (ok: boolean, result: unknown) => {
      if (settled) return;
      settled = true;
      if (!ok) reportNavigationFailure();
      invoke(ok ? options.success : options.fail, result);
      invoke(options.complete, result);
      resolve(ok);
    };
    const attempt = (retry: boolean) => {
      let responded = false;
      const success = (result: unknown) => {
        if (responded || settled) return;
        responded = true;
        finish(true, result);
      };
      const fail = (result: unknown) => {
        if (responded || settled) return;
        responded = true;
        if (!retry) attempt(true);
        else finish(false, result);
      };
      try {
        if (replace && !retry) uni.redirectTo({ ...options, url, success, fail, complete: undefined });
        else uni.reLaunch({ ...options, url, success, fail, complete: undefined });
      } catch (cause) { fail(cause); }
    };
    attempt(false);
  });
}

/**
 * Go back one page, falling back to a declared href on cold-open / empty stack.
 *
 * uni-app H5 quirk (P-054): on a single-entry page stack (deep-link / refresh →
 * getCurrentPages().length === 1) `uni.navigateBack()` returns SUCCESS as a
 * silent no-op — the `fail` callback NEVER fires. So the old
 * `navigateBack({ fail: () => <fallback> })` pattern left the back button dead on
 * cold-open ("点返回无反应"). Guard on the real stack depth instead.
 */
export function navBack(fallbackHref?: string): void {
  // Back navigation is still navigation: a Home offer may have been opened
  // just before the current page was pushed. Close only the in-memory sheets
  // before popping/replacing so their backdrop cannot consume the next tap on
  // the destination page. Cooldown and server state remain untouched.
  closeTransientNavigationSheets();
  let len = 1;
  try { len = getCurrentPages().length; } catch { /* unavailable → treat as cold-open */ }
  if (len > 1) {
    // Real history: pop (restores the previous page + its scroll position).
    uni.navigateBack({
      fail: () => {
        if (fallbackHref) void navReplace(fallbackHref);
        else reportNavigationFailure();
      },
    });
    return;
  }
  // Cold-open / no history: navigateBack would no-op here, so go to the declared
  // back target. reLaunch (not navigateTo) replaces the lone page instead of stacking.
  if (fallbackHref !== undefined && !isUsableNavigationHref(fallbackHref)) {
    reportNavigationFailure();
    return;
  }
  if (fallbackHref) {
    const { url } = toUniRoute(fallbackHref);
    uni.reLaunch({ url, fail: () => void navReplace(fallbackHref) });
    return;
  }
  // No declared back target on a singleton stack — never leave the back button a
  // dead end; fall back to home so a cold-opened caller without a backHref still moves.
  uni.reLaunch({ url: "/pages/index/index", fail: reportNavigationFailure });
}

type NavigationAttempt = (
  success: (result: unknown) => void,
  fail: (result: unknown) => void,
) => void;

// Uni H5 can drop a navigateTo query from the visible hash route. Keep only
// this navigation's query until the destination page consumes it.
let pendingNavigationQuery: { path: string; query: string } | null = null;

export function takeNavigationQuery(path: string): string {
  let query = pendingNavigationQuery?.path === path ? pendingNavigationQuery.query : "";
  pendingNavigationQuery = null;
  // A hard refresh has no in-memory navigation. Uni H5 may omit the hash
  // query from onLoad, so read it only when it belongs to this page.
  if (!query) {
    try {
      const hash = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
      const question = hash.indexOf("?");
      if (question >= 0 && hash.slice(0, question) === path) query = hash.slice(question);
    } catch { /* native runtime has no location */ }
  }
  return query;
}

function runNavigationChain(attempts: NavigationAttempt[]): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let cursor = 0;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (!ok) reportNavigationFailure();
      resolve(ok);
    };
    const attemptNext = () => {
      if (settled) return;
      const attempt = attempts[cursor++];
      if (!attempt) {
        finish(false);
        return;
      }
      let responded = false;
      const success = (result: unknown) => {
        if (responded || settled) return;
        responded = true;
        finish(true);
      };
      const fail = (result: unknown) => {
        if (responded || settled) return;
        responded = true;
        attemptNext();
      };
      try { attempt(success, fail); } catch (cause) { fail(cause); }
    };
    attemptNext();
  });
}

/** Navigate to a logical-or-uni href, picking reLaunch for tab roots. */
export function navTo(href: string): Promise<boolean> {
  // A transient Home offer must never remain above the destination page and
  // steal its first tap. Persistent cooldown state is intentionally untouched;
  // this only arbitrates the in-memory overlay before navigation.
  closeTransientNavigationSheets();
  if (!isUsableNavigationHref(href)) {
    reportNavigationFailure();
    return Promise.resolve(false);
  }
  const { url, tab } = toUniRoute(href);
  const question = url.indexOf("?");
  pendingNavigationQuery = question < 0 ? null : { path: url.slice(0, question), query: url.slice(question) };
  const queryForThisNavigation = pendingNavigationQuery;
  const result = tab
    ? runNavigationChain([
      (success, fail) => uni.reLaunch({ url, success, fail }),
      (success, fail) => uni.redirectTo({ url, success, fail }),
      (success, fail) => uni.navigateTo({ url, success, fail }),
    ])
    : runNavigationChain([
    (success, fail) => uni.navigateTo({ url, success, fail }),
    (success, fail) => uni.redirectTo({ url, success, fail }),
    (success, fail) => uni.reLaunch({ url, success, fail }),
  ]);
  return result.then((ok) => {
    if (!ok && pendingNavigationQuery === queryForThisNavigation) pendingNavigationQuery = null;
    return ok;
  });
}
