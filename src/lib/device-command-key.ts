const STORAGE_KEY = "nexgrid-device-pending-commands-v1";

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
// 交出去,下次重试铸的是另一把键,服务端认不出同一次意图 → 执行**第二条**上下架命令。
/** 写盘。true = 真落盘了;false = 存储写不进去(配额满 / 站点数据被禁)。 */
function write(value: PendingTable): boolean {
  try {
    uni.setStorageSync(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

type DeviceCommandOperation = "activate" | "deactivate" | "deactivate-after-task";

function slot(accountKey: string, operation: DeviceCommandOperation, deviceId: string, rowVersion: number): string {
  const account = accountKey.trim().toLowerCase();
  if (!account || !deviceId || !Number.isSafeInteger(rowVersion) || rowVersion < 0) {
    throw new Error("DEVICE_COMMAND_SCOPE_INVALID");
  }
  return JSON.stringify([account, operation, deviceId, rowVersion]);
}

function nextKey(operation: DeviceCommandOperation): string {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `app-device:${operation}:${id}`;
}

/** 🔴 命令下发**之前**:键落不了盘就抛,这一次不许下发(fail closed)。 */
export function acquireDeviceCommandKey(
  accountKey: string,
  operation: DeviceCommandOperation,
  deviceId: string,
  rowVersion: number,
): string {
  const table = read();
  const id = slot(accountKey, operation, deviceId, rowVersion);
  if (typeof table[id] === "string" && table[id]) return table[id];
  const key = nextKey(operation);
  if (!write({ ...table, [id]: key })) throw new Error("DEVICE_COMMAND_KEY_UNPERSISTED");
  return key;
}

/** 命令**已下发**:false = 没退役。不抛 —— 设备可能已经上/下架,抛出去会把它报成失败。 */
export function finishDeviceCommand(
  accountKey: string,
  operation: DeviceCommandOperation,
  deviceId: string,
  rowVersion: number,
): boolean {
  const table = read();
  const id = slot(accountKey, operation, deviceId, rowVersion);
  if (!(id in table)) return false;
  delete table[id];
  return write(table);
}
