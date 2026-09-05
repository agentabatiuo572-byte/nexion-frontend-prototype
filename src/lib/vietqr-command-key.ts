export interface VietQrCommandIdentity {
  accountKey: string;
  action: "CREATE" | "CANCEL";
  fingerprint: string;
}

interface PendingVietQrCommand extends VietQrCommandIdentity {
  key: string;
  intentNo?: string;
}

interface VietQrCommandState {
  schema: 1;
  pending: Record<string, PendingVietQrCommand>;
  generations: Record<string, number>;
}

export interface VietQrCommandStorage {
  read(): unknown;
  write(value: VietQrCommandState): void;
}

const STORAGE_KEY = "nexgrid-vietqr-command-keys-v1";
const empty = (): VietQrCommandState => ({ schema: 1, pending: {}, generations: {} });

function identityScope(identity: VietQrCommandIdentity): string {
  const accountKey = identity.accountKey.trim().toLowerCase();
  const fingerprint = identity.fingerprint.trim();
  if (!accountKey || !fingerprint || (identity.action !== "CREATE" && identity.action !== "CANCEL")) {
    throw new Error("VIETQR_COMMAND_IDENTITY_INVALID");
  }
  return JSON.stringify([accountKey, identity.action, fingerprint]);
}

function parse(value: unknown): VietQrCommandState {
  const source = value && typeof value === "object" ? value as Partial<VietQrCommandState> : null;
  if (!source || source.schema !== 1 || !source.pending || !source.generations) return empty();
  return {
    schema: 1,
    pending: source.pending as Record<string, PendingVietQrCommand>,
    generations: source.generations as Record<string, number>,
  };
}

function hash(value: string): string {
  let current = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    current = Math.imul(current ^ value.charCodeAt(index), 16777619);
  }
  return (current >>> 0).toString(36);
}

// 🔴 落盘失败的分档语义(命令发出**之前**抛 / **之后**只回布尔)见 lib/funds-mutation-key.ts
// 那一整段头注 —— 同一条家规,不在这里复述第二份。本文件同属钱面:VietQR 建单 / 撤单命令
// 一旦发出去,intentNo 与退役写就都落在「之后」,抛出去只会把成功的建单报成失败,或者把
// deposits.ts 那两处 `catch { finishVietQrCommand(...); throw cause }` 的真实错因顶掉。
/** 写盘。true = 真落盘了;false = 存储写不进去(配额满 / 站点数据被禁)。 */
function persisted(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

/** 读盘。null = 存储读不出来(≠「表里没有这一条」,只有后者才允许判失配)。 */
function readState(storage: VietQrCommandStorage): VietQrCommandState | null {
  try {
    return parse(storage.read());
  } catch {
    return null;
  }
}

export class VietQrCommandKeyRegistry {
  constructor(private readonly storage: VietQrCommandStorage) {}

  /** 🔴 命令发出**之前**:键落不了盘就抛,这一笔不许发(fail closed)。 */
  getOrCreate(identity: VietQrCommandIdentity): string {
    const scope = identityScope(identity);
    const state = parse(this.storage.read());
    const pending = state.pending[scope];
    if (pending) return pending.key;
    const generation = state.generations[scope] ?? 0;
    const key = `vietqr-${hash(`${scope}\u0000${generation}`)}-${hash(`${generation}\u0000${scope}`)}`;
    state.pending[scope] = { ...identity, accountKey: identity.accountKey.trim().toLowerCase(), key };
    if (!persisted(() => this.storage.write(state))) throw new Error("VIETQR_COMMAND_KEY_UNPERSISTED");
    return parse(this.storage.read()).pending[scope]?.key ?? key;
  }

  /** 命令**已发出**:false = intentNo 没记上(键仍在,可按 identity 退役)。不抛。 */
  bindIntent(identity: VietQrCommandIdentity, key: string, intentNo: string): boolean {
    const scope = identityScope(identity);
    const state = readState(this.storage);
    if (!state) return false;
    const pending = state.pending[scope];
    // 真·键接错 / intentNo 为空仍然抛:那是调用方的错,不是存储故障。
    if (!pending || pending.key !== key || !intentNo.trim()) throw new Error("VIETQR_COMMAND_KEY_MISMATCH");
    state.pending[scope] = { ...pending, intentNo: intentNo.trim() };
    return persisted(() => this.storage.write(state));
  }

  /** 命令**已发出**:false = 没退役(表里没有 / 存储读不出 / 写不进)。不抛。 */
  finish(identity: VietQrCommandIdentity, key: string): boolean {
    const scope = identityScope(identity);
    const state = readState(this.storage);
    if (!state) return false;
    if (state.pending[scope]?.key !== key) return false;
    delete state.pending[scope];
    state.generations[scope] = (state.generations[scope] ?? 0) + 1;
    return persisted(() => this.storage.write(state));
  }

  /** 命令**已发出**:false = 没退役。不抛。 */
  finishByIntent(accountKey: string, intentNo: string): boolean {
    const normalizedAccount = accountKey.trim().toLowerCase();
    const state = readState(this.storage);
    if (!state) return false;
    let changed = false;
    for (const [scope, pending] of Object.entries(state.pending)) {
      if (pending.accountKey !== normalizedAccount || pending.intentNo !== intentNo) continue;
      delete state.pending[scope];
      state.generations[scope] = (state.generations[scope] ?? 0) + 1;
      changed = true;
    }
    if (!changed) return false;
    return persisted(() => this.storage.write(state));
  }
}

const registry = new VietQrCommandKeyRegistry({
  read: () => uni.getStorageSync(STORAGE_KEY),
  write: (value) => uni.setStorageSync(STORAGE_KEY, value),
});

export const vietQrCommandKey = (identity: VietQrCommandIdentity) => registry.getOrCreate(identity);
export const bindVietQrIntent = (identity: VietQrCommandIdentity, key: string, intentNo: string) =>
  registry.bindIntent(identity, key, intentNo);
export const finishVietQrCommand = (identity: VietQrCommandIdentity, key: string) => registry.finish(identity, key);
export const finishVietQrCommandByIntent = (accountKey: string, intentNo: string) =>
  registry.finishByIntent(accountKey, intentNo);
