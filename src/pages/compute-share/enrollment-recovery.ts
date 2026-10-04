export interface ComputeSharePendingEnrollment {
  requestedGpuModel: string;
  idempotencyKey: string;
  enrollmentNo?: string;
  /** Original pre-dispatch time; never renewed by a retry. Legacy records may lack it. */
  createdAt?: number;
}

export interface ComputeShareEnrollmentStorage {
  read(): unknown;
  write(value: unknown): void;
  remove(): void;
}

export type ComputeShareEnrollmentJournalRead =
  | { kind: "ok"; pending: ComputeSharePendingEnrollment | null }
  | { kind: "unavailable" };

export type ComputeShareEnrollmentJournalIntent =
  | { kind: "intent"; intent: ComputeSharePendingEnrollment; created: boolean }
  | { kind: "unavailable" };

export interface ComputeShareEnrollmentJournal {
  read(accountKey: string): ComputeShareEnrollmentJournalRead;
  save(accountKey: string, pending: ComputeSharePendingEnrollment): boolean;
  attachEnrollmentNo(accountKey: string, enrollmentNo: string): boolean;
  clear(accountKey: string): void;
  retainOrCreate(accountKey: string, requestedGpuModel: string, createKey: () => string): ComputeShareEnrollmentJournalIntent;
}

interface PersistedJournal {
  version: 1;
  byAccount: Record<string, ComputeSharePendingEnrollment>;
}

const JOURNAL_VERSION = 1 as const;

function normalizeAccount(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256) return null;
  return ["__proto__", "constructor", "prototype"].includes(normalized) ? null : normalized;
}

function normalizePending(value: unknown): ComputeSharePendingEnrollment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const requestedGpuModel = typeof row.requestedGpuModel === "string" ? row.requestedGpuModel.trim() : "";
  const idempotencyKey = typeof row.idempotencyKey === "string" ? row.idempotencyKey.trim() : "";
  const enrollmentNo = typeof row.enrollmentNo === "string" ? row.enrollmentNo.trim().toUpperCase() : undefined;
  if (requestedGpuModel.length < 3 || requestedGpuModel.length > 128 || !idempotencyKey || idempotencyKey.length > 128) {
    return null;
  }
  if (enrollmentNo && !/^CSE-[A-Z0-9]{1,64}$/.test(enrollmentNo)) return null;
  if (row.createdAt !== undefined && (typeof row.createdAt !== "number" || !Number.isSafeInteger(row.createdAt) || row.createdAt <= 0)) return null;
  return {
    requestedGpuModel, idempotencyKey,
    ...(enrollmentNo ? { enrollmentNo } : {}),
    ...(row.createdAt !== undefined ? { createdAt: row.createdAt as number } : {}),
  };
}

function parseJournal(value: unknown): PersistedJournal | null {
  if (value === "" || value === null || value === undefined) return { version: JOURNAL_VERSION, byAccount: {} };
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<PersistedJournal>;
  if (raw.version !== JOURNAL_VERSION || !raw.byAccount || typeof raw.byAccount !== "object" || Array.isArray(raw.byAccount)) {
    return null;
  }
  const byAccount = Object.create(null) as Record<string, ComputeSharePendingEnrollment>;
  for (const [account, pending] of Object.entries(raw.byAccount)) {
    const normalizedAccount = normalizeAccount(account);
    const normalizedPending = normalizePending(pending);
    // A journal describes uncommitted remote commands. Dropping one malformed row would
    // make its account look empty and permit a second command with a fresh key.
    if (!normalizedAccount || !normalizedPending) return null;
    byAccount[normalizedAccount] = normalizedPending;
  }
  return { version: JOURNAL_VERSION, byAccount };
}

function samePending(left: ComputeSharePendingEnrollment | null, right: ComputeSharePendingEnrollment): boolean {
  return !!left
    && left.requestedGpuModel === right.requestedGpuModel
    && left.idempotencyKey === right.idempotencyKey
    && left.enrollmentNo === right.enrollmentNo
    && left.createdAt === right.createdAt;
}

/**
 * Account-scoped durable recovery for a remote enrollment command. It uses Uni
 * storage so native clients retain the same key without depending on browser
 * localStorage. Every save is immediately read back before the caller submits.
 */
export function createComputeShareEnrollmentJournal(storage: ComputeShareEnrollmentStorage): ComputeShareEnrollmentJournal {
  function read(accountKey: string): ComputeShareEnrollmentJournalRead {
    const account = normalizeAccount(accountKey);
    if (!account) return { kind: "unavailable" };
    try {
      const journal = parseJournal(storage.read());
      return journal ? { kind: "ok", pending: journal.byAccount[account] ?? null } : { kind: "unavailable" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  function save(accountKey: string, pending: ComputeSharePendingEnrollment): boolean {
    const account = normalizeAccount(accountKey);
    const normalized = normalizePending(pending);
    if (!account || !normalized) return false;
    try {
      const journal = parseJournal(storage.read());
      if (!journal) return false;
      journal.byAccount[account] = normalized;
      storage.write(journal);
      const confirmed = read(account);
      return confirmed.kind === "ok" && samePending(confirmed.pending, normalized);
    } catch {
      return false;
    }
  }

  function attachEnrollmentNo(accountKey: string, enrollmentNo: string): boolean {
    const current = read(accountKey);
    const existing = current.kind === "ok" ? current.pending : null;
    const normalizedNo = enrollmentNo.trim().toUpperCase();
    if (!existing || !/^CSE-[A-Z0-9]{1,64}$/.test(normalizedNo)) return false;
    return save(accountKey, { ...existing, enrollmentNo: normalizedNo });
  }

  function clear(accountKey: string) {
    const account = normalizeAccount(accountKey);
    if (!account) return;
    try {
      const journal = parseJournal(storage.read());
      if (!journal) return;
      delete journal.byAccount[account];
      if (Object.keys(journal.byAccount).length === 0) storage.remove();
      else storage.write(journal);
    } catch {
      // A stale recovery record is safer than replacing its idempotency key.
    }
  }

  function retainOrCreate(accountKey: string, requestedGpuModel: string, createKey: () => string) {
    const current = read(accountKey);
    if (current.kind !== "ok") return { kind: "unavailable" } as ComputeShareEnrollmentJournalIntent;
    if (current.pending) return { kind: "intent", intent: current.pending, created: false } as ComputeShareEnrollmentJournalIntent;
    return {
      kind: "intent",
      intent: { requestedGpuModel: requestedGpuModel.trim(), idempotencyKey: createKey(), createdAt: Date.now() },
      created: true,
    } as ComputeShareEnrollmentJournalIntent;
  }

  return { read, save, attachEnrollmentNo, clear, retainOrCreate };
}
