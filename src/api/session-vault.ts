import { isUserSession, type UserSession } from "./contracts";

export interface SessionSnapshot {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: UserSession;
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
    if (
      !snapshot.accessToken
      || !snapshot.refreshToken
      || !snapshot.tokenType
      || !isUserSession(snapshot.user)
    ) {
      throw new Error("INVALID_SESSION_SNAPSHOT");
    }
  }

  function persistAndCommit(snapshot: SessionSnapshot): void {
    const next = { ...snapshot, user: { ...snapshot.user } };
    if (storage) {
      try {
        storage.set({
          schema: 1,
          refreshToken: snapshot.refreshToken,
          tokenType: snapshot.tokenType,
          user: { ...snapshot.user },
        } satisfies PersistedSession);
      } catch (error) {
        current = null;
        revision += 1;
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
  }

  function clearAndAdvance(): void {
    current = null;
    revision += 1;
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
  return createSessionVault();
}
