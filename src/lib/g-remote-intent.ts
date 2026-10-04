export interface RemoteIntentLease {
  fingerprint: string;
  key: string;
  pending: boolean;
}

interface RemoteIntentState {
  schema: 1;
  pending: Record<string, string>;
}

export interface RemoteIntentStorage {
  read(): unknown;
  write(value: RemoteIntentState): void;
}

const STORAGE_KEY = "nexgrid-g-remote-intents-v1";
const KEY_PATTERN = /^[a-z0-9._:-]{1,128}$/i;
const MAX_FINGERPRINT_LENGTH = 1024;

const empty = (): RemoteIntentState => ({ schema: 1, pending: {} });

function parse(value: unknown): RemoteIntentState {
  if (value === undefined || value === null || value === "") return empty();
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as { schema?: unknown; pending?: unknown }
    : null;
  if (!source || source.schema !== 1 || !source.pending
      || typeof source.pending !== "object" || Array.isArray(source.pending)) {
    throw new Error("REMOTE_INTENT_PERSIST_FAILED");
  }
  const pending: Record<string, string> = {};
  for (const [fingerprint, key] of Object.entries(source.pending as Record<string, unknown>)) {
    if (!fingerprint.length || fingerprint.length > MAX_FINGERPRINT_LENGTH
        || typeof key !== "string" || !KEY_PATTERN.test(key)) {
      throw new Error("REMOTE_INTENT_PERSIST_FAILED");
    }
    pending[fingerprint] = key;
  }
  return { schema: 1, pending };
}

function normalized(value: string, error: string): string {
  const result = value.trim().toLowerCase();
  if (!result || result.length > 128) throw new Error(error);
  return result;
}

function commandFingerprint(scope: string, accountKey: string, intent: string, payload: unknown): string {
  const encoded = JSON.stringify(payload);
  if (encoded === undefined || encoded.length > 512) throw new Error("REMOTE_INTENT_PAYLOAD_INVALID");
  const fingerprint = JSON.stringify([
    normalized(accountKey, "REMOTE_INTENT_ACCOUNT_INVALID"),
    scope,
    normalized(intent, "REMOTE_INTENT_NAME_INVALID"),
    encoded,
  ]);
  if (fingerprint.length > MAX_FINGERPRINT_LENGTH) throw new Error("REMOTE_INTENT_PAYLOAD_INVALID");
  return fingerprint;
}

function defaultNonce(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const uniStorage: RemoteIntentStorage = {
  read: () => uni.getStorageSync(STORAGE_KEY),
  write: (value) => uni.setStorageSync(STORAGE_KEY, value),
};

/**
 * Durable idempotency registry for G-domain money mutations.
 * Unknown outcomes keep their key across page/App reloads. A command is
 * removed only after its authoritative request returns successfully.
 */
export class RemoteIntentKeyRegistry {
  private readonly scope: string;
  private readonly inFlight = new Set<string>();

  constructor(
    scope: string,
    private readonly storage: RemoteIntentStorage = uniStorage,
    private readonly nonce: () => string = defaultNonce,
  ) {
    this.scope = normalized(scope, "REMOTE_INTENT_SCOPE_INVALID");
  }

  private read(): RemoteIntentState {
    try {
      return parse(this.storage.read());
    } catch {
      throw new Error("REMOTE_INTENT_PERSIST_FAILED");
    }
  }

  private write(state: RemoteIntentState): void {
    try {
      this.storage.write(state);
    } catch {
      throw new Error("REMOTE_INTENT_PERSIST_FAILED");
    }
  }

  /** Read unresolved payloads for recovery without creating or sending a command. */
  unresolved(accountKey: string, intent: string): unknown[] {
    const account = normalized(accountKey, "REMOTE_INTENT_ACCOUNT_INVALID");
    const name = normalized(intent, "REMOTE_INTENT_NAME_INVALID");
    return Object.keys(this.read().pending).flatMap((fingerprint) => {
      try {
        const parts: unknown = JSON.parse(fingerprint);
        if (!Array.isArray(parts) || parts.length !== 4) throw new Error();
        if (parts[0] !== account || parts[1] !== this.scope || parts[2] !== name) return [];
        if (typeof parts[3] !== "string") throw new Error();
        return [JSON.parse(parts[3]) as unknown];
      } catch {
        throw new Error("REMOTE_INTENT_PERSIST_FAILED");
      }
    });
  }

  acquire(accountKey: string, intent: string, payload: unknown): RemoteIntentLease {
    const intentName = normalized(intent, "REMOTE_INTENT_NAME_INVALID");
    const fingerprint = commandFingerprint(this.scope, accountKey, intentName, payload);
    const state = this.read();
    let key = state.pending[fingerprint];
    if (!key) {
      const token = this.nonce().trim();
      key = `${this.scope}-${intentName}-${token}`;
      if (!KEY_PATTERN.test(key)) throw new Error("REMOTE_INTENT_KEY_INVALID");
      state.pending[fingerprint] = key;
      this.write(state);
      if (this.read().pending[fingerprint] !== key) throw new Error("REMOTE_INTENT_PERSIST_FAILED");
    }
    const pending = this.inFlight.has(fingerprint);
    this.inFlight.add(fingerprint);
    return { fingerprint, key, pending };
  }

  complete(lease: RemoteIntentLease, settled: boolean): boolean {
    this.inFlight.delete(lease.fingerprint);
    if (!settled) return false;
    try {
      const state = this.read();
      if (state.pending[lease.fingerprint] !== lease.key) return false;
      delete state.pending[lease.fingerprint];
      this.write(state);
      return this.read().pending[lease.fingerprint] === undefined;
    } catch {
      // Cleanup cannot undo an acknowledged server success. If the old key
      // remains, the next attempt safely replays it instead of duplicating funds.
      return false;
    }
  }
}

export function createRemoteIntentGate(scope: string, nonce?: () => string) {
  return new RemoteIntentKeyRegistry(scope, uniStorage, nonce);
}
