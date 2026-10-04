import { isUserSession, type UserSession } from "./contracts";

export type RefreshCredentialMode = "token" | "cookie";

export interface SessionSnapshot {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: UserSession;
  refreshCredentialMode?: RefreshCredentialMode;
  /** Per refresh-chain H5 key; never persisted. */
  sessionSyncKey?: string;
}

interface PersistedSession {
  schema: 1;
  refreshToken: string;
  tokenType: string;
  user: UserSession;
}

export interface KeyValueStorage {
  get(): unknown;
  set(value: unknown): void;
  remove(): void;
}

export interface SessionVault {
  read(): SessionSnapshot | null;
  revision(): number;
  save(snapshot: SessionSnapshot): void;
  saveIfUnchanged(snapshot: SessionSnapshot, expectedRevision: number): boolean;
  /** Only a successful refresh may preserve authentication continuity. */
  refreshIfUnchanged(snapshot: SessionSnapshot, expectedRevision: number): boolean;
  isRefreshContinuation(expectedRevision: number): boolean;
  clear(): void;
  clearIfUnchanged(expectedRevision: number): boolean;
}

function parsePersisted(value: unknown): PersistedSession | null {
  if (!value || typeof value !== "object") return null;
  const persisted = value as Partial<PersistedSession>;
  if (
    persisted.schema !== 1
    || typeof persisted.refreshToken !== "string"
    || persisted.refreshToken.length === 0
    || typeof persisted.tokenType !== "string"
    || persisted.tokenType.length === 0
    || !isUserSession(persisted.user)
  ) return null;
  return persisted as PersistedSession;
}

export function createSessionVault(storage?: KeyValueStorage): SessionVault {
  let current: SessionSnapshot | null = null;
  let revision = 0;
  let identityRevision = 0;
  if (storage) {
    try {
      const storedValue = storage.get();
      const persisted = parsePersisted(storedValue);
      if (persisted) {
        current = {
          accessToken: "",
          refreshToken: persisted.refreshToken,
          tokenType: persisted.tokenType,
          user: persisted.user,
        };
      } else if (storedValue !== undefined && storedValue !== null && storedValue !== "") {
        storage.remove();
      }
    } catch {
      try {
        storage.remove();
      } catch {
        // A broken storage adapter must not create an authenticated state.
      }
    }
  }

  function validateSnapshot(snapshot: SessionSnapshot): void {
    const credentialMode = snapshot.refreshCredentialMode ?? "token";
    if (
      !snapshot.accessToken
      || (credentialMode === "token" && !snapshot.refreshToken)
      || (credentialMode === "cookie" && snapshot.refreshToken !== "")
      || !snapshot.tokenType
      || !isUserSession(snapshot.user)
    ) {
      throw new Error("INVALID_SESSION_SNAPSHOT");
    }
  }

  function persistAndCommit(snapshot: SessionSnapshot, refresh = false): void {
    const sameIdentity = current?.user.userId === snapshot.user.userId;
    const next = { ...snapshot, user: { ...snapshot.user } };
    if (storage) {
      try {
        if (snapshot.refreshCredentialMode === "cookie") {
          storage.remove();
        } else {
          storage.set({
            schema: 1,
            refreshToken: snapshot.refreshToken,
            tokenType: snapshot.tokenType,
            user: { ...snapshot.user },
          } satisfies PersistedSession);
        }
      } catch (error) {
        current = null;
        revision += 1;
        identityRevision = revision;
        try {
          storage.remove();
        } catch {
          // The adapter is unavailable; keep memory unauthenticated.
        }
        throw error;
      }
    }
    current = next;
    revision += 1;
    if (!refresh || !sameIdentity) identityRevision = revision;
  }

  function clearAndAdvance(): void {
    current = null;
    revision += 1;
    identityRevision = revision;
    if (!storage) return;
    try {
      storage.remove();
    } catch {
      // Memory is already cleared; never resurrect a failed local logout.
    }
  }

  return {
    read() {
      return current ? { ...current, user: { ...current.user } } : null;
    },
    revision() {
      return revision;
    },
    save(snapshot) {
      validateSnapshot(snapshot);
      persistAndCommit(snapshot);
    },
    saveIfUnchanged(snapshot, expectedRevision) {
      validateSnapshot(snapshot);
      if (revision !== expectedRevision) return false;
      persistAndCommit(snapshot);
      return true;
    },
    refreshIfUnchanged(snapshot, expectedRevision) {
      validateSnapshot(snapshot);
      if (revision !== expectedRevision || (current && current.user.userId !== snapshot.user.userId)) return false;
      persistAndCommit(snapshot, true);
      return true;
    },
    isRefreshContinuation(expectedRevision) {
      return current !== null && Number.isSafeInteger(expectedRevision)
        && expectedRevision >= identityRevision && expectedRevision < revision;
    },
    clear() {
      clearAndAdvance();
    },
    clearIfUnchanged(expectedRevision) {
      if (revision !== expectedRevision) return false;
      clearAndAdvance();
      return true;
    },
  };
}

/**
 * All targets deliberately receive an in-memory vault. H5 needs an HttpOnly
 * cookie and native targets need Keychain/Keystore before refresh credentials
 * may survive a process restart. Plain localStorage/uni storage is not an
 * acceptable credential store. Access tokens always remain in memory.
 */
export function createRuntimeSessionVault(): SessionVault {
  const vault = createSessionVault();
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined"
      || !globalThis.crypto?.subtle) return vault;

  // H5 tabs share the HttpOnly refresh cookie. Only peers holding the same
  // server-issued, in-memory chain key can read a rotated access token.
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel("nexgrid-user-session");
  } catch {
    return vault;
  }
  let lastUpdate = 0;
  const validKey = (key: unknown): key is string =>
    typeof key === "string" && /^[0-9a-f]{64}$/i.test(key);
  const cipherKey = async (key: string) => crypto.subtle.importKey(
    "raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
    "AES-GCM", false, ["encrypt", "decrypt"],
  );
  const publish = (snapshot: SessionSnapshot) => {
    if (snapshot.refreshCredentialMode !== "cookie" || !validKey(snapshot.sessionSyncKey)) return;
    void (async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await cipherKey(snapshot.sessionSyncKey!);
      const current = vault.read();
      if (current?.accessToken !== snapshot.accessToken || current.sessionSyncKey !== snapshot.sessionSyncKey) return;
      const updatedAt = Math.max(performance.timeOrigin + performance.now(), lastUpdate + 0.001);
      const plain = new TextEncoder().encode(JSON.stringify({ updatedAt, userId: snapshot.user.userId,
        accessToken: snapshot.accessToken }));
      const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
      if (vault.read()?.accessToken !== snapshot.accessToken) return;
      lastUpdate = updatedAt;
      channel.postMessage({ updatedAt, iv, sealed });
    })().catch(() => {});
  };
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { updatedAt?: unknown; iv?: unknown; sealed?: unknown } | null;
    const current = vault.read();
    if (!current || current.refreshCredentialMode !== "cookie"
        || !validKey(current.sessionSyncKey)
        || typeof message?.updatedAt !== "number" || !Number.isFinite(message.updatedAt)
        || message.updatedAt <= lastUpdate || !(message.iv instanceof Uint8Array)
        || message.iv.length !== 12 || !(message.sealed instanceof ArrayBuffer)) return;
    const updatedAt = message.updatedAt;
    void (async () => {
      const key = await cipherKey(current.sessionSyncKey!);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: message.iv as Uint8Array },
        key, message.sealed as ArrayBuffer);
      const data = JSON.parse(new TextDecoder().decode(plain)) as {
        updatedAt?: unknown; userId?: unknown; accessToken?: unknown;
      };
      const latest = vault.read();
      if (data.updatedAt !== updatedAt || data.userId !== current.user.userId
          || typeof data.accessToken !== "string" || !data.accessToken
          || !latest || latest.user.userId !== current.user.userId
          || latest.sessionSyncKey !== current.sessionSyncKey || updatedAt <= lastUpdate) return;
      lastUpdate = updatedAt;
      vault.refreshIfUnchanged({ ...latest, accessToken: data.accessToken }, vault.revision());
    })().catch(() => {});
  };
  return {
    ...vault,
    save(snapshot) { vault.save(snapshot); publish(snapshot); },
    saveIfUnchanged(snapshot, expectedRevision) {
      const saved = vault.saveIfUnchanged(snapshot, expectedRevision);
      if (saved) publish(snapshot);
      return saved;
    },
    refreshIfUnchanged(snapshot, expectedRevision) {
      const saved = vault.refreshIfUnchanged(snapshot, expectedRevision);
      if (saved) publish(snapshot);
      return saved;
    },
  };
}
