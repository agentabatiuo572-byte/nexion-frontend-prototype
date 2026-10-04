export type RemoteMutationToken = {
  scopeKey: string;
  revision: number;
  finish: () => void;
};

type ScopeState = {
  revision: number;
  pending: number;
  waiters: Array<() => void>;
};

/**
 * Serialises authority reads behind mutations in the same account and rejects
 * reads that started before a mutation. Different accounts never block each
 * other, which keeps account-switch recovery responsive.
 */
export function createRemoteAuthorityCoordinator() {
  const scopes = new Map<string, ScopeState>();

  const stateFor = (scopeKey: string): ScopeState => {
    const existing = scopes.get(scopeKey);
    if (existing) return existing;
    const created: ScopeState = { revision: 0, pending: 0, waiters: [] };
    scopes.set(scopeKey, created);
    return created;
  };

  function beginMutation(scopeKey: string): RemoteMutationToken {
    const state = stateFor(scopeKey);
    state.revision += 1;
    state.pending += 1;
    const revision = state.revision;
    let finished = false;
    return {
      scopeKey,
      revision,
      finish: () => {
        if (finished) return;
        finished = true;
        const current = stateFor(scopeKey);
        current.pending = Math.max(0, current.pending - 1);
        if (current.pending === 0) current.waiters.splice(0).forEach((resolve) => resolve());
      },
    };
  }

  async function guardedRead<T>(scopeKey: string, fetcher: () => Promise<T>): Promise<T | null> {
    const invokedRevision = stateFor(scopeKey).revision;
    const invokedState = stateFor(scopeKey);
    if (invokedState.pending > 0) {
      await new Promise<void>((resolve) => invokedState.waiters.push(resolve));
    }
    const fetchRevision = stateFor(scopeKey).revision;
    // A mutation started after this read was invoked. The caller's next timer
    // or explicit refresh will read the post-mutation state.
    if (fetchRevision !== invokedRevision) return null;
    const value = await fetcher();
    return stateFor(scopeKey).revision === fetchRevision ? value : null;
  }

  return { beginMutation, guardedRead };
}
