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

function write(value: PendingTable): void {
  uni.setStorageSync(STORAGE_KEY, value);
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
  write({ ...table, [id]: key });
  return key;
}

export function finishDeviceCommand(
  accountKey: string,
  operation: DeviceCommandOperation,
  deviceId: string,
  rowVersion: number,
): void {
  const table = read();
  const id = slot(accountKey, operation, deviceId, rowVersion);
  if (!(id in table)) return;
  delete table[id];
  write(table);
}
