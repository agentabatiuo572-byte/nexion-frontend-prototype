import { asApiError } from "../api/errors";

const STORAGE_KEY = "nexgrid-exchange-pending-mutations-v1";
const TERMINAL_STATUSES = new Set([
  "COMPLETED", "SUCCESS", "QUEUED", "CANCELLED",
  "USER_CAP", "PLATFORM_CAP", "GEO_BLOCKED",
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
  // 🔴 落盘失败的分档语义(命令发出**之前**抛 / **之后**只回布尔)见 lib/funds-mutation-key.ts
  // 那一整段头注 —— 同一条家规。兑换键是**随机**的:租约没落盘却把键交出去,下次重试铸的是
  // 另一把键,服务端认不出同一次兑换意图 → 直接成交**第二笔**。而释放写一抛,就把一笔
  // **已成交**的兑换报成失败。
  /** 写盘。true = 真落盘了;false = 存储写不进去(配额满 / 站点数据被禁)。 */
  function persist(records: ExchangePendingLease[]): boolean {
    try {
      storage.write({ version: 1, records });
      return true;
    } catch {
      return false;
    }
  }

  /** 🔴 兑换请求发出**之前**:租约落不了盘就抛,这一笔不许发(fail closed)。 */
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
    if (!persist([...records, created])) throw new Error("EXCHANGE_PENDING_KEY_UNPERSISTED");
    return created;
  }

  /** 请求**已发出**:false = 没释放。不抛 —— 兑换可能已经成交,抛出去会把它报成失败。 */
  function forget(fingerprint: string): boolean {
    return persist(hydrate(storage).filter((record) => record.fingerprint !== fingerprint));
  }

  function peek(accountKey: string, intent: ExchangeSwapIntent): ExchangePendingLease | null {
    const fingerprint = exchangeSwapFingerprint(accountKey, intent);
    return hydrate(storage).find((record) => record.fingerprint === fingerprint) ?? null;
  }

  return { acquire, forget, peek };
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

function reconcile(
  authority: ExchangeStateLike,
  lease: ExchangePendingLease,
  receiptOrder?: ExchangeOrderLike,
): ExchangeOrderLike | null {
  if (receiptOrder) {
    return authority.orders.find((order) => order.exchangeNo === receiptOrder.exchangeNo
      && matchesIntent(order, lease.intent)) ?? null;
  }
  const baseline = new Set(lease.baselineOrderNos);
  const matches = authority.orders.filter((order) => !baseline.has(order.exchangeNo)
    && matchesIntent(order, lease.intent));
  return matches.length === 1 ? matches[0] : null;
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
  if (api.kind === "network" || api.kind === "protocol") return true;
  if ([
    "IDEMPOTENCY_REQUEST_IN_PROGRESS",
    "IDEMPOTENCY_RESULT_UNKNOWN",
    "SESSION_CHANGED_DURING_REQUEST",
  ].includes(api.message)) return true;
  if (api.kind === "http") return !api.status || api.status >= 500;
  return false;
}

async function recoverFromAuthority<T extends ExchangeStateLike>(
  pending: ExchangePendingStore,
  lease: ExchangePendingLease,
  fetchState: () => Promise<T>,
): Promise<{ snapshot: T; order: ExchangeOrderLike; recovered: true }> {
  let authority: T;
  try {
    authority = await fetchState();
  } catch {
    throw new ExchangeOutcomeUnknownError();
  }
  const order = reconcile(authority, lease);
  if (!order) throw new ExchangeOutcomeUnknownError(authority);
  pending.forget(lease.fingerprint);
  return { snapshot: authority, order, recovered: true };
}

export async function executeExchangeSwap<T extends ExchangeStateLike>(options: {
  pending: ExchangePendingStore;
  accountKey: string;
  intent: ExchangeSwapIntent;
  baseline: T;
  swap: (idempotencyKey: string) => Promise<T>;
  fetchState: () => Promise<T>;
}): Promise<{ snapshot: T; order: ExchangeOrderLike; recovered: boolean }> {
  const lease = options.pending.acquire(options.accountKey, options.intent, options.baseline.orders);
  let receipt: T;
  try {
    receipt = await options.swap(lease.key);
  } catch (error) {
    if (!outcomeUnknown(error)) {
      options.pending.forget(lease.fingerprint);
      throw error;
    }
    return recoverFromAuthority(options.pending, lease, options.fetchState);
  }

  let authority: T;
  try {
    authority = await options.fetchState();
  } catch {
    throw new ExchangeOutcomeUnknownError();
  }
  const order = reconcile(authority, lease, receipt.order);
  if (!order) throw new ExchangeOutcomeUnknownError(authority);
  options.pending.forget(lease.fingerprint);
  return { snapshot: authority, order, recovered: false };
}
