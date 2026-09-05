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

const TAB_ROOT: Record<string, string> = {
  "/": "/pages/index/index",
  "/home": "/pages/index/index",
  "/store": "/pages/store/store",
  "/team": "/pages/team/team",
  "/earn": "/pages/earn/earn",
  "/me": "/pages/me/me",
};

export function toUniRoute(href: string): { url: string; tab: boolean } {
  const qi = href.indexOf("?");
  const path = qi >= 0 ? href.slice(0, qi) : href;
  const query = qi >= 0 ? href.slice(qi) : "";
  // Already a uni route → pass through.
  if (path.startsWith("/pages/")) return { url: href, tab: false };
  if (TAB_ROOT[path]) return { url: TAB_ROOT[path] + query, tab: true };
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return { url: "/pages/index/index" + query, tab: true };
  if (segs.length === 1) return { url: `/pages/${segs[0]}/${segs[0]}` + query, tab: false };
  // 2+ segments: first segment is the directory; flatten the rest with dashes
  // (matches uni's flattened filenames: me/wallet/exchange → me/wallet-exchange).
  return { url: `/pages/${segs[0]}/${segs.slice(1).join("-")}` + query, tab: false };
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
  let len = 1;
  try { len = getCurrentPages().length; } catch { /* unavailable → treat as cold-open */ }
  if (len > 1) {
    // Real history: pop (restores the previous page + its scroll position).
    uni.navigateBack({ fail: () => { if (fallbackHref) navTo(fallbackHref); } });
    return;
  }
  // Cold-open / no history: navigateBack would no-op here, so go to the declared
  // back target. reLaunch (not navigateTo) replaces the lone page instead of stacking.
  if (fallbackHref) {
    const { url } = toUniRoute(fallbackHref);
    uni.reLaunch({ url, fail: () => navTo(fallbackHref) });
    return;
  }
  // No declared back target on a singleton stack — never leave the back button a
  // dead end; fall back to home so a cold-opened caller without a backHref still moves.
  uni.reLaunch({ url: "/pages/index/index", fail: () => {} });
}

/** Navigate to a logical-or-uni href, picking reLaunch for tab roots. */
export function navTo(href: string): void {
  const { url, tab } = toUniRoute(href);
  if (tab) {
    uni.reLaunch({
      url,
      fail: () => uni.redirectTo({
        url,
        fail: () => uni.navigateTo({ url, fail: () => {} }),
      }),
    });
    return;
  }
  uni.navigateTo({
    url,
    fail: () => uni.redirectTo({
      url,
      fail: () => uni.reLaunch({ url, fail: () => {} }),
    }),
  });
}
