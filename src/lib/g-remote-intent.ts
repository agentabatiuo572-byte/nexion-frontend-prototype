export interface RemoteIntentLease {
  fingerprint: string;
  key: string;
  pending: boolean;
}

/** Instance-owned idempotency controller for G-domain money mutations. */
export function createRemoteIntentGate(scope: string, nonce: () => string = () => Date.now().toString(36)) {
  const keys = new Map<string, string>();
  const pending = new Set<string>();
  let sequence = 0;
  function fingerprint(intent: string, payload: unknown) {
    return `${intent}:${JSON.stringify(payload)}`;
  }
  return {
    acquire(intent: string, payload: unknown): RemoteIntentLease {
      const value = fingerprint(intent, payload);
      const key = keys.get(value) ?? `${scope}-${intent.toUpperCase()}-${nonce()}-${++sequence}`;
      keys.set(value, key);
      if (pending.has(value)) return { fingerprint: value, key, pending: true };
      pending.add(value);
      return { fingerprint: value, key, pending: false };
    },
    // Unknown retains the key for safe replay; settled requests retire it.
    complete(value: string, settled: boolean) {
      pending.delete(value);
      if (settled) keys.delete(value);
    },
  };
}
