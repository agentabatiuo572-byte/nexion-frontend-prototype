export type DeveloperRotationRecoveryState = "PENDING" | "UNKNOWN";

interface RotationJournalRecord {
  webhookId: number;
  state: DeveloperRotationRecoveryState;
}

export interface DeveloperRotationJournalStatus {
  available: boolean;
  state: DeveloperRotationRecoveryState | null;
}

export type DeveloperRotationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "nexgrid-developer-rotation-journal:v1";

/** Native and H5 use the same Uni storage backend; values are JSON strings only. */
export const developerRotationUniStorage: DeveloperRotationStorage = {
  getItem: (_key) => {
    const value = uni.getStorageSync(STORAGE_KEY);
    if (value === "" || value === null || value === undefined) return null;
    if (typeof value !== "string") throw new Error("DEVELOPER_ROTATION_STORAGE_VALUE_INVALID");
    return value;
  },
  setItem: (_key, value) => { uni.setStorageSync(STORAGE_KEY, value); },
  removeItem: (_key) => { uni.removeStorageSync(STORAGE_KEY); },
};

type JournalRead = { available: true; records: Record<string, RotationJournalRecord> } | { available: false };

function read(storage: DeveloperRotationStorage | null): JournalRead {
  if (!storage) return { available: false };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null || raw === "") return { available: true, records: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { available: false };
    const records: Record<string, RotationJournalRecord> = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { available: false };
      const record = value as Record<string, unknown>;
      if (!Number.isSafeInteger(record.webhookId) || (record.webhookId as number) < 1
        || (record.state !== "PENDING" && record.state !== "UNKNOWN")) return { available: false };
      records[scope] = { webhookId: record.webhookId as number, state: record.state };
    }
    return { available: true, records };
  } catch {
    return { available: false };
  }
}

function writeAndReadBack(storage: DeveloperRotationStorage | null, records: Record<string, RotationJournalRecord>): boolean {
  if (!storage) return false;
  try {
    if (Object.keys(records).length === 0) {
      storage.removeItem(STORAGE_KEY);
      return read(storage).available;
    }
    const encoded = JSON.stringify(records);
    storage.setItem(STORAGE_KEY, encoded);
    const persisted = read(storage);
    return persisted.available && JSON.stringify(persisted.records) === encoded;
  } catch {
    return false;
  }
}

/**
 * Persists only a scope, webhook id, and uncertainty state. It deliberately
 * never stores a secret or idempotency key. A write must read back before a
 * rotation request can be sent, so uncertainty is never silently discarded.
 */
export function createDeveloperRotationJournal(storage: DeveloperRotationStorage | null, getScope: () => string) {
  const keyFor = (scope: string, webhookId: number) => `${scope}:${webhookId}`;
  const isCurrentScope = (scope: string): boolean => scope === getScope();
  const set = (scope: string, webhookId: number, state: DeveloperRotationRecoveryState): boolean => {
    if (!isCurrentScope(scope)) return false;
    const journal = read(storage);
    if (!journal.available) return false;
    journal.records[keyFor(scope, webhookId)] = { webhookId, state };
    return writeAndReadBack(storage, journal.records);
  };
  return {
    captureScope(): string { return getScope(); },
    isCurrentScope,
    statusFor(scope: string, webhookId: number): DeveloperRotationJournalStatus {
      if (!isCurrentScope(scope)) return { available: false, state: null };
      const journal = read(storage);
      return journal.available
        ? { available: true, state: journal.records[keyFor(scope, webhookId)]?.state ?? null }
        : { available: false, state: null };
    },
    markPending(scope: string, webhookId: number): boolean { return set(scope, webhookId, "PENDING"); },
    markUnknown(scope: string, webhookId: number): boolean { return set(scope, webhookId, "UNKNOWN"); },
    clear(scope: string, webhookId: number): boolean {
      if (!isCurrentScope(scope)) return false;
      const journal = read(storage);
      if (!journal.available) return false;
      delete journal.records[keyFor(scope, webhookId)];
      return writeAndReadBack(storage, journal.records);
    },
  };
}
