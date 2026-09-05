const STORAGE_KEY = "nexgrid-profile-pending-commands-v1";

type PendingTable = Record<string, string>;

function read(): PendingTable {
  try {
    const value = uni.getStorageSync(STORAGE_KEY) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as PendingTable : {};
  } catch {
    return {};
  }
}

// 🔴 落盘失败的分档语义(命令发出**之前**抛 / **之后**只回布尔)见 lib/funds-mutation-key.ts
// 那一整段头注 —— 同一条家规。本文件的键是**随机**的,比那边更不能放行:写没落盘却把键
// 交出去,下次重试铸的是另一把键,服务端认不出同一次意图 → 执行**第二条**改名命令。
/** 写盘。true = 真落盘了;false = 存储写不进去(配额满 / 站点数据被禁)。 */
function write(value: PendingTable): boolean {
  try {
    uni.setStorageSync(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function slot(accountKey: string, expected: string, desired: string): string {
  let hash = 2166136261;
  for (const code of `${accountKey}|${expected}|${desired}`) {
    hash ^= code.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${accountKey}:${(hash >>> 0).toString(16)}`;
}

function randomKey(): string {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `app-profile:${id}`;
}

/** 🔴 命令发出**之前**:键落不了盘就抛,这一次不许发(fail closed)。 */
export function acquireProfileCommandKey(accountKey: string, expected: string, desired: string): string {
  const table = read();
  const id = slot(accountKey, expected, desired);
  const existing = table[id];
  if (typeof existing === "string" && existing) return existing;
  const next = randomKey();
  if (!write({ ...table, [id]: next })) throw new Error("PROFILE_COMMAND_KEY_UNPERSISTED");
  return next;
}

/** 命令**已发出**:false = 没退役。不抛 —— 昵称可能已经改成功,抛出去会把它报成失败。 */
export function finishProfileCommand(accountKey: string, expected: string, desired: string): boolean {
  const table = read();
  const id = slot(accountKey, expected, desired);
  if (!(id in table)) return false;
  delete table[id];
  return write(table);
}
