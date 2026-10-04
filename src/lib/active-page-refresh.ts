export type ActivePageRefresh = () => Promise<unknown> | unknown;

let activeRefresh: ActivePageRefresh | null = null;

/**
 * Registers the refresh operation for the page that is currently visible.
 * The disposer is identity-safe so a hidden older page cannot unregister a
 * newer page that has already become active.
 */
export function registerActivePageRefresh(refresh: ActivePageRefresh): () => void {
  activeRefresh = refresh;
  return () => {
    if (activeRefresh === refresh) activeRefresh = null;
  };
}

export async function refreshActivePage(): Promise<void> {
  const refresh = activeRefresh;
  if (refresh) await refresh();
}

export function resetActivePageRefreshForTest(): void {
  activeRefresh = null;
}
