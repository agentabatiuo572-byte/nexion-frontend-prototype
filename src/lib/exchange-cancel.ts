const STORAGE_VERSION = 1 as const;

export interface ExchangeCancelStorage {
  read(): unknown;
  write(value: ExchangeCancelEnvelope): void;
}

interface ExchangeCancelRecord {
  accountKey: string;
  exchangeNo: string;
  key: string;
}

interface ExchangeCancelEnvelope {
  version: typeof STORAGE_VERSION;
  records: ExchangeCancelRecord[];
}

export interface ExchangeCancelScope {
  accountKey: string;
  epoch: number;
}

const TERMINAL_STATUSES = new Set([
  "COMPLETED", "SUCCESS", "CANCELLED", "USER_CAP", "PLATFORM_CAP", "GEO_BLOCKED",
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function readRecords(storage: ExchangeCancelStorage): ExchangeCancelRecord[] {
  try {
    const raw = storage.read();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const envelope = raw as Partial<ExchangeCancelEnvelope>;
    if (envelope.version !== STORAGE_VERSION || !Array.isArray(envelope.records)) return [];
    return envelope.records.filter((row): row is ExchangeCancelRecord => !!row
      && typeof row === "object"
      && typeof row.accountKey === "string" && !!row.accountKey.trim()
      && typeof row.exchangeNo === "string" && !!row.exchangeNo.trim()
      && typeof row.key === "string" && !!row.key.trim());
  } catch {
    return [];
  }
}

function defaultKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `G2-CANCEL-${uuid}`;
}

// 🔴 落盘失败的分档语义(命令发出**之前**抛 / **之后**只回布尔)见 lib/funds-mutation-key.ts
// 那一整段头注 —— 同一条家规。撤单键是**随机**的:写没落盘却把键交出去,下次重试铸的是
// 另一把键,服务端认不出同一次撤单意图。而退役写一抛,wallet-exchange 那几处
// `finishExchangeCancelCommand(...)` 之后的 cancelDone 提示与返回值就全走不到 ——
// 单已经撤成了,用户却看到「结果未知」。
/** 写盘。true = 真落盘了;false = 存储写不进去(配额满 / 站点数据被禁)。 */
function persisted(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

export function exchangeOrderCanCancel(order: { status?: unknown } | null | undefined): boolean {
  const status = typeof order?.status === "string" ? order.status.trim().toUpperCase() : "";
  return status === "QUEUED" && !TERMINAL_STATUSES.has(status);
}

export function visibleQueuedExchangeOrders<T extends { status?: unknown }>(orders: readonly T[]): T[] {
  return orders.filter(exchangeOrderCanCancel);
}

export function isCurrentExchangeCancelScope(
  expected: ExchangeCancelScope,
  actual: ExchangeCancelScope,
): boolean {
  return expected.epoch === actual.epoch && normalize(expected.accountKey) === normalize(actual.accountKey);
}

export function acquireExchangeCancelCommand(
  storage: ExchangeCancelStorage,
  accountKey: string,
  exchangeNo: string,
  keyFactory: () => string = defaultKey,
): string {
  const account = normalize(accountKey);
  const order = exchangeNo.trim();
  const records = readRecords(storage);
  const existing = records.find((row) => normalize(row.accountKey) === account && row.exchangeNo === order);
  if (existing) return existing.key;
  const created = { accountKey: account, exchangeNo: order, key: keyFactory() };
  // 🔴 撤单请求发出**之前**:键落不了盘就抛,这一次不许发(fail closed)。
  if (!persisted(() => storage.write({ version: STORAGE_VERSION, records: [...records, created] }))) {
    throw new Error("EXCHANGE_CANCEL_KEY_UNPERSISTED");
  }
  return created.key;
}

export function finishExchangeCancelCommand(
  storage: ExchangeCancelStorage,
  accountKey: string,
  exchangeNo: string,
  key: string,
): boolean {
  const account = normalize(accountKey);
  const order = exchangeNo.trim();
  const records = readRecords(storage);
  const next = records.filter((row) => !(normalize(row.accountKey) === account
    && row.exchangeNo === order && row.key === key));
  if (next.length === records.length) return false;
  // 请求**已发出**:false = 没退役。不抛 —— 单可能已经撤成,抛出去会把它报成失败。
  return persisted(() => storage.write({ version: STORAGE_VERSION, records: next }));
}

export function createExchangeCancelStorage(): ExchangeCancelStorage {
  const key = "nexgrid-exchange-cancel-commands-v1";
  return {
    read: () => uni.getStorageSync(key),
    write: (value) => uni.setStorageSync(key, value),
  };
}
