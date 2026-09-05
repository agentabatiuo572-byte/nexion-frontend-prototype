const STORAGE_KEY = "nexgrid-ambassador-pending-command-v1";

interface PendingCommand { slot: string; key: string }

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function read(): PendingCommand | null {
  try {
    const value = uni.getStorageSync(STORAGE_KEY) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Partial<PendingCommand>;
    return typeof row.slot === "string" && typeof row.key === "string" && row.key ? row as PendingCommand : null;
  } catch { return null; }
}

function commandSlot(accountKey: string, payload: string): string {
  const account = accountKey.trim().toLowerCase();
  if (!account) throw new Error("AMBASSADOR_COMMAND_SCOPE_INVALID");
  return `${fingerprint(account)}:${fingerprint(payload)}`;
}

// 🔴 落盘失败的分档语义(命令发出**之前**抛 / **之后**只回布尔)见 lib/funds-mutation-key.ts
// 那一整段头注 —— 同一条家规。本文件的键是**随机**的,比那边更不能放行:写没落盘却把键
// 交出去,下次重试铸的是另一把键,服务端认不出同一次意图 → 直接受理**第二份申请**。
/** 写盘。true = 真落盘了;false = 存储写不进去(配额满 / 站点数据被禁)。 */
function persisted(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    return false;
  }
}

/** 🔴 提交**之前**:键落不了盘就抛,这一次不许提交(fail closed)。 */
export function acquireAmbassadorCommandKey(accountKey: string, payload: string): string {
  const slot = commandSlot(accountKey, payload);
  const pending = read();
  if (pending?.slot === slot) return pending.key;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const key = `app-ambassador:${id}`;
  if (!persisted(() => uni.setStorageSync(STORAGE_KEY, { slot, key } satisfies PendingCommand))) {
    throw new Error("AMBASSADOR_COMMAND_KEY_UNPERSISTED");
  }
  return key;
}

/** 提交**之后**:false = 没退役。不抛 —— 申请可能已经受理,抛出去会把它报成失败。 */
export function finishAmbassadorCommand(accountKey: string, payload: string): boolean {
  const pending = read();
  if (pending?.slot !== commandSlot(accountKey, payload)) return false;
  return persisted(() => uni.removeStorageSync(STORAGE_KEY));
}
