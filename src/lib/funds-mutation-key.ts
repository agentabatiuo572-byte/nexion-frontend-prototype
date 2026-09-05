/**
 * Durable idempotency intent registry for external-funds mutations.
 *
 * This storage contains command metadata only. Wallet balances, orders and
 * ledger entries remain server-authoritative and must never be hydrated from
 * this registry. A key is deterministic for account + environment + method +
 * payload fingerprint + generation, so a response-lost retry (including after
 * reload, or from another tab) cannot mint a second funds command.
 */
export type FundsMutationEnvironment = "SANDBOX";

export interface FundsMutationIdentity {
  accountKey: string;
  environment: FundsMutationEnvironment;
  method: string;
  fingerprint: string;
}

interface PendingFundsMutation extends FundsMutationIdentity {
  key: string;
  orderNo?: string;
}

interface FundsMutationState {
  schema: 1;
  pending: Record<string, PendingFundsMutation>;
  generations: Record<string, number>;
}

export interface FundsMutationStorage {
  read(): unknown;
  write(value: FundsMutationState): void;
}

const STORAGE_KEY = "nexgrid-funds-pending-mutations-v1";
const EMPTY_STATE = (): FundsMutationState => ({ schema: 1, pending: {}, generations: {} });

function normalized(identity: FundsMutationIdentity): FundsMutationIdentity {
  const accountKey = identity.accountKey.trim().toLowerCase();
  const method = identity.method.trim().toUpperCase();
  const fingerprint = identity.fingerprint.trim();
  if (!accountKey || identity.environment !== "SANDBOX" || !method || !fingerprint) {
    throw new Error("FUNDS_MUTATION_IDENTITY_INVALID");
  }
  return { accountKey, environment: identity.environment, method, fingerprint };
}

function scopeOf(identity: FundsMutationIdentity): string {
  const row = normalized(identity);
  return JSON.stringify([row.accountKey, row.environment, row.method, row.fingerprint]);
}

// Two independent 53-bit hashes make a compact deterministic 106-bit token.
// A hash collision is still fail-safe: the server binds the idempotency key to
// a request hash and rejects a different payload rather than executing it.
function hash53(value: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function stableKey(scope: string, generation: number): string {
  const material = `${scope}\u0000${generation}`;
  return `funds-${hash53(material, 0)}${hash53(material, 0x9e3779b9)}`;
}

function parsedState(value: unknown): FundsMutationState {
  const row = value && typeof value === "object" ? value as Partial<FundsMutationState> : null;
  if (!row || row.schema !== 1 || !row.pending || typeof row.pending !== "object"
      || !row.generations || typeof row.generations !== "object") return EMPTY_STATE();
  const pending: Record<string, PendingFundsMutation> = {};
  for (const [scope, candidate] of Object.entries(row.pending)) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Partial<PendingFundsMutation>;
    if (typeof item.key !== "string" || typeof item.accountKey !== "string"
        || item.environment !== "SANDBOX"
        || typeof item.method !== "string" || typeof item.fingerprint !== "string") continue;
    pending[scope] = {
      key: item.key,
      accountKey: item.accountKey,
      environment: item.environment,
      method: item.method,
      fingerprint: item.fingerprint,
      ...(typeof item.orderNo === "string" && item.orderNo ? { orderNo: item.orderNo } : {}),
    };
  }
  const generations: Record<string, number> = {};
  for (const [scope, generation] of Object.entries(row.generations)) {
    if (Number.isSafeInteger(generation) && Number(generation) >= 0) generations[scope] = Number(generation);
  }
  return { schema: 1, pending, generations };
}

// 🔴🔴 落盘失败的语义按「这次写发生在命令**发出之前**还是**之后**」分档 —— 本仓家规,
// 三个幂等键注册表(本文件 / vietqr-command-key / api/learning-attempt-key)共用这一段。
//
// ① 命令发出**之前**的写(getOrCreate):写不进去就**不发**(fail closed)。
//    落盘失败 = 这一笔没有重放保护:请求一超时就再也认不回那个键,用户一重试就是第二笔钱。
//    与 lib/withdraw-attempt.ts `rememberWithdrawAttempt` 逐字同一条规则(生产提现轨已按它
//    落地:写不进去就拒发)。那边靠布尔回报,这里返回值就是键本身、没有第二个通道,故抛域码;
//    抛在钱动之前,没有任何需要回滚的东西,现有调用方(runRecoverableFundsOperation /
//    页面 try-catch / 提现失败分诊)都会把它渲染成一次普通失败,不会有未捕获 rejection。
//
// ② 命令**已经发出之后**的写(bindOrder / finish / finishByOrder):一律**不许抛**。
//    此刻服务端可能已经扣了钱、建了单;一抛就把一笔**成功**的资金操作报成失败 ——
//    app.ts submitWithdrawal 的 `return canonical` 走不到 → 页面按失败分诊;
//    deposits.ts createSandboxTopup 的 records.value 拿不到那条记录 → 用户看不见自己的钱;
//    deposits.ts 那两处 `catch { finishVietQrCommand(...); throw cause }` 还会把真实错因
//    顶掉换成 QuotaExceededError。而退役失败的代价小得多:pending 键留着,最坏是下一笔
//    同额命令被服务端按幂等复用(欠执行,不是双花),且 refresh 的 finishByOrder 下一拍
//    还会再试一次。故按 store/account-scoped-storage.ts `writeAccountRow` 的家规如实回
//    布尔,调用方自己决定(现有调用方此刻结局都已定,忽略返回值即正确)。
//
// 🔴 别照抄 store/auth-otp.ts 的内存降级:那三张表是 mock 的 server 侧验证态、不是用户资产,
//    掉了刷新重来即可;这里掉了就是一个认不回来的资金命令。语义按「字段驱动什么」分档。
//
// 谁会撞上:本仓 mock 把账本 / 账号云 / 订单整套塞 localStorage,长期 dev/demo profile
// 撑满 5MB 后,最先写不进去的就是最晚出现的这条小记录(2026-08-19 实景复现于滑块表)。

/** 写盘。true = 真落盘了;false = 存储写不进去(配额满 / 站点数据被禁)。 */
function persisted(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

/**
 * 读盘。null = 存储**读不出来**,与「表里没有这一条」不是一回事 —— 命令已发出的那几个
 * 方法据此如实回 false,而不是把存储故障误判成「键不匹配」再抛出去(见上 ②)。
 */
function readState(storage: FundsMutationStorage): FundsMutationState | null {
  try {
    return parsedState(storage.read());
  } catch {
    return null;
  }
}

export class FundsMutationKeyRegistry {
  constructor(private readonly storage: FundsMutationStorage) {}

  /** 🔴 命令发出**之前**:键落不了盘就抛,这一笔不许发(fail closed,见上 ①)。 */
  getOrCreate(identity: FundsMutationIdentity): string {
    const item = normalized(identity);
    const scope = scopeOf(item);
    const state = parsedState(this.storage.read());
    const existing = state.pending[scope];
    if (existing) return existing.key;
    const generation = state.generations[scope] ?? 0;
    const key = stableKey(scope, generation);
    state.pending[scope] = { ...item, key };
    if (!persisted(() => this.storage.write(state))) throw new Error("FUNDS_MUTATION_KEY_UNPERSISTED");
    // Re-read after write so storage implementations with cross-context merge
    // semantics can return the one canonical pending key.
    return parsedState(this.storage.read()).pending[scope]?.key ?? key;
  }

  /** 命令**已发出**:false = orderNo 没记上(键仍在,可按 identity 退役)。不抛 —— 见上 ②。 */
  bindOrder(identity: FundsMutationIdentity, key: string, orderNo: string): boolean {
    const scope = scopeOf(identity);
    const state = readState(this.storage);
    if (!state) return false;
    const pending = state.pending[scope];
    // 真·键接错了仍然抛:那是调用方把两笔命令的键串了,不是存储故障。
    if (!pending || pending.key !== key) throw new Error("FUNDS_MUTATION_KEY_MISMATCH");
    state.pending[scope] = { ...pending, orderNo };
    return persisted(() => this.storage.write(state));
  }

  /** 命令**已发出**:false = 没退役(表里没有 / 存储读不出 / 写不进)。不抛 —— 见上 ②。 */
  finish(identity: FundsMutationIdentity, key: string): boolean {
    const scope = scopeOf(identity);
    const state = readState(this.storage);
    if (!state) return false;
    const pending = state.pending[scope];
    if (!pending || pending.key !== key) return false;
    delete state.pending[scope];
    state.generations[scope] = (state.generations[scope] ?? 0) + 1;
    return persisted(() => this.storage.write(state));
  }

  /** 命令**已发出**:false = 没退役。不抛 —— 见上 ②。 */
  finishByOrder(accountKey: string, environment: FundsMutationEnvironment, orderNo: string): boolean {
    const account = accountKey.trim().toLowerCase();
    const state = readState(this.storage);
    if (!state) return false;
    let changed = false;
    for (const [scope, pending] of Object.entries(state.pending)) {
      if (pending.accountKey !== account || pending.environment !== environment || pending.orderNo !== orderNo) continue;
      delete state.pending[scope];
      state.generations[scope] = (state.generations[scope] ?? 0) + 1;
      changed = true;
    }
    if (!changed) return false;
    return persisted(() => this.storage.write(state));
  }
}

const uniStorage: FundsMutationStorage = {
  read: () => uni.getStorageSync(STORAGE_KEY),
  write: (value) => uni.setStorageSync(STORAGE_KEY, value),
};
const registry = new FundsMutationKeyRegistry(uniStorage);

export function pendingFundsMutationKey(identity: FundsMutationIdentity): string {
  return registry.getOrCreate(identity);
}

/** false = orderNo 没记上(存储故障);命令已发出,调用方**不该**据此判失败 —— 见 ② 。 */
export function bindPendingFundsMutationOrder(identity: FundsMutationIdentity, key: string, orderNo: string): boolean {
  return registry.bindOrder(identity, key, orderNo);
}

export function finishPendingFundsMutation(identity: FundsMutationIdentity, key: string): boolean {
  return registry.finish(identity, key);
}

export function finishPendingFundsMutationByOrder(
  accountKey: string,
  environment: FundsMutationEnvironment,
  orderNo: string,
): boolean {
  return registry.finishByOrder(accountKey, environment, orderNo);
}

export function fundsAmountFingerprint(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("FUNDS_MUTATION_AMOUNT_INVALID");
  return amount.toFixed(6);
}

/**
 * Production is intentionally outside the durable sandbox registry: this app
 * has no production terminal-order readback with which to retire a persisted
 * key. Until that authority exists, a submitted production command uses a
 * cryptographically generated one-shot transport key and is never written to
 * the sandbox registry.
 */
export function createProductionFundsRequestKey(nonceFactory?: () => string): string {
  const nonce = nonceFactory?.() ?? (() => {
    const secure = globalThis.crypto;
    if (secure?.randomUUID) return secure.randomUUID();
    if (secure?.getRandomValues) {
      const words = secure.getRandomValues(new Uint32Array(4));
      return Array.from(words, (word) => word.toString(16).padStart(8, "0")).join("");
    }
    throw new Error("FUNDS_PRODUCTION_IDEMPOTENCY_RANDOM_UNAVAILABLE");
  })();
  const normalizedNonce = nonce.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (normalizedNonce.length < 8) throw new Error("FUNDS_PRODUCTION_IDEMPOTENCY_RANDOM_INVALID");
  return `funds-prod-${normalizedNonce}`;
}
