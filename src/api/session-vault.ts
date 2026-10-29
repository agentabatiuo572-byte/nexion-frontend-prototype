import { serverSessionContext, isUserSession, type UserSession, type ServerSessionContext } from "./contracts";
import { reportNativeSessionStage } from "./native-session-storage";
import { requireCryptoUuid } from "../lib/secure-command-id";
import { ApiError } from "./errors";

export type RefreshCredentialMode = "token" | "cookie";

export interface SessionSnapshot extends ServerSessionContext {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: UserSession;
  refreshCredentialMode?: RefreshCredentialMode;
  /** Per refresh-chain H5 key; never persisted. */
  sessionSyncKey?: string;
}

interface PersistedSession extends ServerSessionContext {
  schema: 1;
  refreshToken: string;
  tokenType: string;
  user: UserSession;
  /** Bound to refreshToken by the same encrypted, atomic storage record. */
  refreshRotationNonce?: string;
}

export interface KeyValueStorage {
  get(): unknown;
  set(value: unknown): void;
  remove(): void;
}

export interface SessionVault {
  subscribe?(listener: (previous: SessionSnapshot | null, next: SessionSnapshot | null, continuation: boolean) => void): () => void;
  /** Deferred native hydration runs only after the platform bridge is ready. */
  hydrate(): void;
  read(): SessionSnapshot | null;
  revision(): number;
  save(snapshot: SessionSnapshot): void;
  saveIfUnchanged(snapshot: SessionSnapshot, expectedRevision: number): boolean;
  /** Only a successful refresh may preserve authentication continuity. */
  refreshIfUnchanged(snapshot: SessionSnapshot, expectedRevision: number): boolean;
  isRefreshContinuation(expectedRevision: number): boolean;
  prepareRefreshRotation(): string;
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
    || (persisted.refreshRotationNonce !== undefined
      && (typeof persisted.refreshRotationNonce !== "string" || !/^[0-9a-f]{64}$/.test(persisted.refreshRotationNonce)))
  ) return null;
  return persisted as PersistedSession;
}

export function createSessionVault(storage?: KeyValueStorage, options?: { deferHydration?: boolean }): SessionVault {
  let current: SessionSnapshot | null = null;
  let revision = 0;
  let identityRevision = 0;
  let refreshRotationNonce: string | undefined;
  const listeners = new Set<(previous: SessionSnapshot | null, next: SessionSnapshot | null, continuation: boolean) => void>();
  const notify = (previous: SessionSnapshot | null, continuation = false) => {
    for (const listener of listeners) { try { listener(previous, current, continuation); } catch { /* Observers never decide authentication. */ } }
  };
  let hydrated = !storage;
  function hydrate(): void {
    if (hydrated || revision !== 0 || !storage) return;
    const storedValue = storage.get();
    const persisted = parsePersisted(storedValue);
    if (persisted) {
      refreshRotationNonce = persisted.refreshRotationNonce;
      current = {
        ...serverSessionContext(persisted),
        accessToken: "",
        refreshToken: persisted.refreshToken,
        tokenType: persisted.tokenType,
        user: persisted.user,
      };
    } else if (storedValue !== undefined && storedValue !== null && storedValue !== "") {
      reportNativeSessionStage("HYDRATE_PAYLOAD_REJECTED");
      storage.remove();
    }
    hydrated = true;
  }
  if (!options?.deferHydration) {
    try {
      hydrate();
    } catch {
      try {
        storage?.remove();
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
    const previous = current;
    hydrated = true;
    const sameIdentity = current?.user.userId === snapshot.user.userId;
    const next = { ...snapshot, user: { ...snapshot.user } };
    if (storage) {
      try {
        if (snapshot.refreshCredentialMode === "cookie") {
          storage.remove();
        } else {
          storage.set({
            ...serverSessionContext(snapshot),
            schema: 1,
            refreshToken: snapshot.refreshToken,
            tokenType: snapshot.tokenType,
            user: { ...snapshot.user },
          } satisfies PersistedSession);
        }
      } catch (error) {
        refreshRotationNonce = undefined;
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
    refreshRotationNonce = undefined;
    revision += 1;
    if (!refresh || !sameIdentity) identityRevision = revision;
    notify(previous, !!(refresh && sameIdentity && previous?.accessToken
      && previous.sessionChainId === snapshot.sessionChainId && previous.sessionGroup === snapshot.sessionGroup
      && previous.installationId === snapshot.installationId && previous.appSessionVersion === snapshot.appSessionVersion));
  }

  function clearAndAdvance(): void {
    const previous = current;
    hydrated = true;
    current = null;
    refreshRotationNonce = undefined;
    revision += 1;
    identityRevision = revision;
    notify(previous);
    if (!storage) return;
    storage.remove();
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hydrate,
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
      if (current?.sessionChainId && (snapshot.sessionChainId !== current.sessionChainId
          || snapshot.sessionGroup !== current.sessionGroup || snapshot.installationId !== current.installationId
          || snapshot.appSessionVersion !== current.appSessionVersion)) return false;
      persistAndCommit(snapshot, true);
      return true;
    },
    isRefreshContinuation(expectedRevision) {
      return current !== null && Number.isSafeInteger(expectedRevision)
        && expectedRevision >= identityRevision && expectedRevision < revision;
    },
    prepareRefreshRotation() {
      if (!current?.refreshToken || current.refreshCredentialMode === "cookie") {
        throw new ApiError({ kind: "auth", message: "AUTH_SESSION_REQUIRED" });
      }
      if (refreshRotationNonce) return refreshRotationNonce;
      try {
        // Existing helper uses Web Crypto or Android's SecureRandom-backed UUID.
        const nonce = (requireCryptoUuid() + requireCryptoUuid()).replace(/-/g, "").toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(nonce)) throw new Error("INVALID_ROTATION_NONCE");
        storage?.set({ ...serverSessionContext(current), schema: 1, refreshToken: current.refreshToken, tokenType: current.tokenType,
          user: { ...current.user }, refreshRotationNonce: nonce } satisfies PersistedSession);
        // Do not send before the adapter confirms persistence. A new login,
        // logout or successful successor commit replaces this entire record.
        refreshRotationNonce = nonce;
        return nonce;
      } catch {
        throw new ApiError({ kind: "configuration", message: "NATIVE_REFRESH_INTENT_UNAVAILABLE", retryable: true });
      }
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
 * H5 uses an HttpOnly cookie and in-memory access tokens. APP-PLUS may supply
 * an OS-encrypted refresh adapter, hydrated after plusready. Access tokens
 * never enter the persisted session format.
 */
export function createRuntimeSessionVault(storage?: KeyValueStorage): SessionVault {
  const vault = createSessionVault(storage, { deferHydration: !!storage });
  if (storage) return vault;
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
