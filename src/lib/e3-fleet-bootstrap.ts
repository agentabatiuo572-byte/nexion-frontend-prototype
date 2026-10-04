import { apiRuntimeConfig, sessionVault } from "@/api/runtime";
import { refreshProductCatalog } from "@/store/product-catalog";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";

/**
 * Complete-sign-in runs before an H5 reLaunch is guaranteed to emit App.onShow.
 * In the explicit sandbox, issue the catalog RunID first and only then ask the
 * App store to read E3. A missing/stale server session or catalog stays
 * fail-closed; no local fleet is synthesized as a fallback.
 */
export async function refreshRemoteFleetAfterCatalog(accountKey: string): Promise<boolean> {
  const auth = useAuth();
  const serverSession = sessionVault.read();
  if (!serverSession || !auth.isAuthenticated || auth.accountId !== accountKey
      || accountKey !== `user:${serverSession.user.userId}`) {
    return false;
  }
  if (apiRuntimeConfig.environment === "dev" && !(await refreshProductCatalog())) return false;
  return useApp().refreshRemoteFleet(undefined, { coalesce: true });
}
