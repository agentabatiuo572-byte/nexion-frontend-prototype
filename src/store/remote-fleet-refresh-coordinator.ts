export interface RemoteFleetRefreshScope {
  accountKey: string;
  accountEpoch: number;
  mode: string;
  runId: string | null;
  runEpoch: number;
}

export interface RemoteFleetRefreshOptions {
  /** Only established read-only lifecycle paths may share an in-flight projection. */
  coalesce?: boolean;
  /** A committed mutation must read past any earlier in-flight fleet projection. */
  force?: boolean;
}

export interface RemoteFleetRefreshLease {
  key: string;
  revision: number;
  scope: RemoteFleetRefreshScope;
}

interface InFlight<T> {
  lease: RemoteFleetRefreshLease;
  request: Promise<T>;
}

function keyOf(scope: RemoteFleetRefreshScope): string {
  return JSON.stringify([
    scope.accountKey,
    scope.accountEpoch,
    scope.mode,
    scope.runId,
    scope.runEpoch,
  ]);
}

/**
 * Keeps only an identical remote projection read single-flight. It stores no
 * projection data: callers still receive and apply the server response.
 */
export function createRemoteFleetRefreshCoordinator() {
  let revision = 0;
  let active: RemoteFleetRefreshLease | null = null;
  let inFlight: InFlight<unknown> | null = null;

  function sameScope(left: RemoteFleetRefreshScope, right: RemoteFleetRefreshScope): boolean {
    return keyOf(left) === keyOf(right);
  }

  function refresh<T>(
    scope: RemoteFleetRefreshScope,
    execute: (lease: RemoteFleetRefreshLease) => Promise<T>,
    options: RemoteFleetRefreshOptions = {},
  ): Promise<T> {
    const key = keyOf(scope);
    if (options.coalesce && !options.force && inFlight?.lease.key === key) {
      return inFlight.request as Promise<T>;
    }

    const lease: RemoteFleetRefreshLease = { key, revision: ++revision, scope: { ...scope } };
    active = lease;
    const request = execute(lease);
    inFlight = { lease, request };
    const clear = () => {
      if (inFlight?.request === request) inFlight = null;
    };
    void request.then(clear, clear);
    return request;
  }

  function invalidate(scope?: RemoteFleetRefreshScope): void {
    if (scope && (!active || !sameScope(active.scope, scope))) return;
    revision += 1;
    active = null;
    inFlight = null;
  }

  function isCurrent(lease: RemoteFleetRefreshLease): boolean {
    return active?.key === lease.key && active.revision === lease.revision;
  }

  function hasInFlight(): boolean { return inFlight !== null; }

  return { refresh, invalidate, isCurrent, hasInFlight };
}
