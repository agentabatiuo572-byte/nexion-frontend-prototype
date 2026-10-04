export interface RemoteOrdersRefreshState {
  loading: boolean;
  failed: boolean;
}

/**
 * Run one account-scoped order projection refresh and expose only states the
 * Me page can safely render. The store owns account/epoch fencing; this small
 * adapter owns the user-visible loading/error contract.
 */
export async function runRemoteOrdersRefresh(
  refresh: () => Promise<void>,
  publish: (state: RemoteOrdersRefreshState) => void,
): Promise<boolean> {
  publish({ loading: true, failed: false });
  try {
    await refresh();
    publish({ loading: false, failed: false });
    return true;
  } catch {
    publish({ loading: false, failed: true });
    return false;
  }
}
