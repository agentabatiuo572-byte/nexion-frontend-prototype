import { apiRuntimeConfig, sessionVault } from "@/api/runtime";
import { refreshProductCatalog } from "@/store/product-catalog";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";

/**
 * Complete-sign-in runs before an H5 reLaunch is guaranteed to emit App.onShow.
 * Every remote account rebind clears the catalog, so start its replacement
 * here as well. Development fleet reads still wait for the catalog; production
 * fleet reads remain independent. A missing/stale session stays fail-closed.
 */
export async function refreshRemoteFleetAfterCatalog(accountKey: string): Promise<boolean> {
  const auth = useAuth();
  const serverSession = sessionVault.read();
  if (!serverSession || !auth.isAuthenticated || auth.accountId !== accountKey
      || accountKey !== `user:${serverSession.user.userId}`) {
    return false;
  }
  if (apiRuntimeConfig.environment !== "dev") void refreshProductCatalog();
  if (apiRuntimeConfig.environment === "dev" && !(await refreshProductCatalog())) return false;
  return useApp().refreshRemoteFleet(undefined, { coalesce: true });
}
