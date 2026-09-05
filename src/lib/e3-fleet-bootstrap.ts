import { sessionVault } from "@/api/runtime";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";

/**
 * Complete-sign-in runs before an H5 reLaunch is guaranteed to emit App.onShow.
 * This remote-only recovery path is retained for shared code compatibility.
 * The high-fidelity build never calls it because its runtime is fixed to mock.
 */
export async function refreshRemoteFleetAfterCatalog(accountKey: string): Promise<boolean> {
  const auth = useAuth();
  const serverSession = sessionVault.read();
  if (!serverSession || !auth.isAuthenticated || auth.accountId !== accountKey
      || accountKey !== `user:${serverSession.user.userId}`) {
    return false;
  }
  return useApp().refreshRemoteFleet();
}
