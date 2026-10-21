export const GUARD_ROUTE_CONTENT = {
  "pages/entry-surfaces/index": '[data-entry-surface="index"]',
  "pages/index/index": ".home-earnings-cluster",
  "pages/me/wallet-withdraw": ".nx-withdraw-submit-cta",
  "pages/onboarding/intro": ".intro-root",
  "pages/login/login": ".lg-root",
};

// Serialized into the browser by Playwright; keep this function self-contained.
export function collectGuardRouteWitness(contentSelectors) {
  const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    && [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
  return {
    hashRoute: location.hash.replace(/^#\/?/, "").split("?")[0],
    stackRoutes: typeof getCurrentPages === "function" ? getCurrentPages().map(page => page.route) : [],
    visiblePages: [...document.querySelectorAll("uni-page")].filter(visible).map(page => ({
      route: page.getAttribute("data-page"),
      contentRoutes: Object.entries(contentSelectors)
        .filter(([, selector]) => [...page.querySelectorAll(selector)].some(visible))
        .map(([route]) => route),
    })),
  };
}

// A delayed dev component may join getCurrentPages() after a completed reset.
// Neither the stale stack nor a hash with an empty/mismatched page proves UI.
export function resolveGuardRouteWitness({ hashRoute, visiblePages }) {
  if (!hashRoute || visiblePages.length !== 1) return "";
  const page = visiblePages[0];
  return page.route === hashRoute && page.contentRoutes.length === 1 && page.contentRoutes[0] === hashRoute
    ? hashRoute : "";
}
