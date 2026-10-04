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

function write(value: PendingTable) {
  uni.setStorageSync(STORAGE_KEY, value);
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

export function acquireProfileCommandKey(accountKey: string, expected: string, desired: string): string {
  const table = read();
  const id = slot(accountKey, expected, desired);
  const existing = table[id];
  if (typeof existing === "string" && existing) return existing;
  const next = randomKey();
  write({ ...table, [id]: next });
  return next;
}

export function finishProfileCommand(accountKey: string, expected: string, desired: string): void {
  const table = read();
  const id = slot(accountKey, expected, desired);
  if (!(id in table)) return;
  delete table[id];
  write(table);
}
