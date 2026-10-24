/** All pages governed by the shared staking/repurchase visibility switch. */
export function isStakingVisibilityRoute(href: string): boolean {
  const path = href.split("?")[0].replace(/\/$/, "");
  return path === "/staking" || path.startsWith("/staking/")
    || path.startsWith("/pages/staking/")
    || path === "/me/wallet/repurchase" || path === "/me/wallet/repurchase/how"
    || path === "/pages/me/wallet-repurchase" || path === "/pages/me/wallet-repurchase-how";
}
