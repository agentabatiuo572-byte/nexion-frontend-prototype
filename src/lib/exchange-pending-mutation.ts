import { asApiError, isAmbiguousOutcome } from "../api/errors";

const STORAGE_KEY = "nexgrid-exchange-pending-mutations-v1";
const TERMINAL_STATUSES = new Set([
  "COMPLETED", "SUCCESS", "QUEUED", "CANCELLED",
  "FAILED", "USER_CAP", "PLATFORM_CAP", "GEO_BLOCKED",
]);

export interface ExchangeSwapIntent {
  direction: "USDT_TO_NEX" | "NEX_TO_USDT";
  fromAmount: number;
  queueIfCapped: boolean;
}

export interface ExchangeOrderLike {
  exchangeNo: string;
  fromAsset: "USDT" | "NEX";
  toAsset: "USDT" | "NEX";
  fromAmount: number;
  status: string;
}

export interface ExchangeStateLike {
  orders: ExchangeOrderLike[];
  order?: ExchangeOrderLike;
}

export interface ExchangePendingLease {
  accountKey: string;
  fingerprint: string;
  key: string;
  intent: ExchangeSwapIntent;
  baselineOrderNos: string[];
}

export interface PersistedExchangePending {
  version: 1;
  records: ExchangePendingLease[];
}

export interface ExchangePendingStorage {
  read(): unknown;
  write(value: PersistedExchangePending): void;
}

export class ExchangeOutcomeUnknownError extends Error {
  readonly authoritativeState?: ExchangeStateLike;

  constructor(authoritativeState?: ExchangeStateLike) {
    super("EXCHANGE_SWAP_OUTCOME_UNKNOWN");
    this.name = "ExchangeOutcomeUnknownError";
    this.authoritativeState = authoritativeState;
  }
}

function normalizedAccount(accountKey: string): string {
  return accountKey.trim().toLowerCase();
}

export function exchangeSwapFingerprint(accountKey: string, intent: ExchangeSwapIntent): string {
  return [
    normalizedAccount(accountKey),
    intent.direction,
    intent.fromAmount.toFixed(6),
    intent.queueIfCapped ? "QUEUE" : "REJECT",
  ].join(":");
}

function isIntent(value: unknown): value is ExchangeSwapIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (row.direction === "USDT_TO_NEX" || row.direction === "NEX_TO_USDT")
    && typeof row.fromAmount === "number" && Number.isFinite(row.fromAmount) && row.fromAmount > 0
    && typeof row.queueIfCapped === "boolean";
}

function hydrate(storage: ExchangePendingStorage): ExchangePendingLease[] {
  try {
    const value = storage.read();
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const envelope = value as Partial<PersistedExchangePending>;
    if (envelope.version !== 1 || !Array.isArray(envelope.records)) return [];
    return envelope.records.filter((record): record is ExchangePendingLease => !!record
      && typeof record === "object"
      && typeof record.accountKey === "string" && !!record.accountKey
      && typeof record.fingerprint === "string" && !!record.fingerprint
      && typeof record.key === "string" && !!record.key
      && isIntent(record.intent)
      && Array.isArray(record.baselineOrderNos)
      && record.baselineOrderNos.every((orderNo) => typeof orderNo === "string" && !!orderNo));
  } catch {
    return [];
  }
}

function defaultKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `G2-SWAP-${uuid}`;
}

function defaultStorage(): ExchangePendingStorage {
  return {
    read: () => uni.getStorageSync(STORAGE_KEY),
    write: (value) => uni.setStorageSync(STORAGE_KEY, value),
  };
}

export function createExchangePendingMutationStore(
  storage: ExchangePendingStorage = defaultStorage(),
  keyFactory: () => string = defaultKey,
) {
  function persist(records: ExchangePendingLease[]) {
    storage.write({ version: 1, records });
  }

  function acquire(accountKey: string, intent: ExchangeSwapIntent, baselineOrders: ExchangeOrderLike[]): ExchangePendingLease {
    const fingerprint = exchangeSwapFingerprint(accountKey, intent);
    const records = hydrate(storage);
    const existing = records.find((record) => record.fingerprint === fingerprint);
    if (existing) return existing;
    const created: ExchangePendingLease = {
      accountKey: normalizedAccount(accountKey),
      fingerprint,
      key: keyFactory(),
      intent: { ...intent },
      baselineOrderNos: baselineOrders.map((order) => order.exchangeNo),
    };
    persist([...records, created]);
    return created;
  }

  function forget(fingerprint: string) {
    persist(hydrate(storage).filter((record) => record.fingerprint !== fingerprint));
  }

  function peek(accountKey: string, intent: ExchangeSwapIntent): ExchangePendingLease | null {
    const fingerprint = exchangeSwapFingerprint(accountKey, intent);
    return hydrate(storage).find((record) => record.fingerprint === fingerprint) ?? null;
  }

  function list(accountKey: string): ExchangePendingLease[] {
    return hydrate(storage).filter(record => record.accountKey === normalizedAccount(accountKey)
      && record.fingerprint === exchangeSwapFingerprint(accountKey, record.intent));
  }

  return { acquire, forget, peek, list };
}

type ExchangePendingStore = ReturnType<typeof createExchangePendingMutationStore>;

function matchesIntent(order: ExchangeOrderLike, intent: ExchangeSwapIntent): boolean {
  const fromAsset = intent.direction === "USDT_TO_NEX" ? "USDT" : "NEX";
  const toAsset = intent.direction === "USDT_TO_NEX" ? "NEX" : "USDT";
  return order.fromAsset === fromAsset
    && order.toAsset === toAsset
    && Math.abs(order.fromAmount - intent.fromAmount) < 0.000001
    && TERMINAL_STATUSES.has(order.status.toUpperCase());
}

function outcomeUnknown(error: unknown): boolean {
  if (error instanceof ExchangeOutcomeUnknownError) return true;
  const message = error instanceof Error ? error.message : "";
  if ([
    "IDEMPOTENCY_REQUEST_IN_PROGRESS",
    "IDEMPOTENCY_RESULT_UNKNOWN",
    "SESSION_CHANGED_DURING_REQUEST",
  ].includes(message)) return true;
  const api = asApiError(error);
  if ([
    "IDEMPOTENCY_REQUEST_IN_PROGRESS",
    "IDEMPOTENCY_RESULT_UNKNOWN",
    "SESSION_CHANGED_DURING_REQUEST",
  ].includes(api.message)) return true;
  return isAmbiguousOutcome(error);
}

interface RecoveryOptions<T extends ExchangeStateLike> {
  pending: ExchangePendingStore;
  recover: (lease: ExchangePendingLease) => Promise<{ status: string; order?: ExchangeOrderLike }>;
  fetchState: () => Promise<T>;
  isCurrent: () => boolean;
}

/** Reads only the persisted command; pagination and equal amounts never establish ownership. */
export async function recoverExchangeSwap<T extends ExchangeStateLike>(
  options: RecoveryOptions<T> & { lease: ExchangePendingLease },
): Promise<{ snapshot: T; order: ExchangeOrderLike; recovered: true }> {
  const { lease } = options;
  const current = () => options.isCurrent()
    && options.pending.peek(lease.accountKey, lease.intent)?.key === lease.key;
  if (!current()) throw new ExchangeOutcomeUnknownError();
  try {
    const receipt = await options.recover(lease);
    if (!current() || receipt.status !== "SUCCEEDED" || !receipt.order || !matchesIntent(receipt.order, lease.intent)) {
      throw new ExchangeOutcomeUnknownError();
    }
    const snapshot = await options.fetchState();
    if (!current()) throw new ExchangeOutcomeUnknownError();
    options.pending.forget(lease.fingerprint);
    return { snapshot, order: receipt.order, recovered: true };
  } catch {
    throw new ExchangeOutcomeUnknownError();
  }
}

export async function executeExchangeSwap<T extends ExchangeStateLike>(options: RecoveryOptions<T> & {
  accountKey: string;
  intent: ExchangeSwapIntent;
  baseline: T;
  swap: (idempotencyKey: string) => Promise<T>;
}): Promise<{ snapshot: T; order: ExchangeOrderLike; recovered: boolean }> {
  const existing = options.pending.peek(options.accountKey, options.intent);
  if (existing) return recoverExchangeSwap({ ...options, lease: existing });
  if (!options.isCurrent()) throw new ExchangeOutcomeUnknownError();
  const lease = options.pending.acquire(options.accountKey, options.intent, options.baseline.orders);
  try {
    await options.swap(lease.key);
  } catch (error) {
    if (!outcomeUnknown(error)) {
      options.pending.forget(lease.fingerprint);
      throw error;
    }
    return recoverExchangeSwap({ ...options, lease });
  }
  const result = await recoverExchangeSwap({ ...options, lease });
  return { ...result, recovered: false };
}
