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

function isPendingCommand(value: unknown): value is PendingCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<PendingCommand>;
  return typeof row.slot === "string" && !!row.slot && typeof row.key === "string" && !!row.key;
}

function read(): PendingCommand[] {
  try {
    const value = uni.getStorageSync(STORAGE_KEY) as unknown;
    if (value === undefined || value === null || value === "") return [];
    const entries = (value as { entries?: unknown }).entries;
    if (Array.isArray(entries) && entries.every(isPendingCommand)) return entries;
    if (entries === undefined && isPendingCommand(value)) return [value];
    throw new Error("Invalid pending commands");
  } catch { throw new Error("AMBASSADOR_COMMAND_STORAGE_UNAVAILABLE"); }
}

function write(entries: PendingCommand[]): void {
  if (!entries.length) uni.removeStorageSync(STORAGE_KEY);
  else uni.setStorageSync(STORAGE_KEY, { ...entries[entries.length - 1], version: 2, entries });
}

function commandSlot(accountKey: string, payload: string): string {
  const account = accountKey.trim().toLowerCase();
  if (!account) throw new Error("AMBASSADOR_COMMAND_SCOPE_INVALID");
  return `${fingerprint(account)}:${fingerprint(payload)}`;
}

export function acquireAmbassadorCommandKey(accountKey: string, payload: string): string {
  const slot = commandSlot(accountKey, payload);
  const pending = read();
  const existing = pending.find((entry) => entry.slot === slot);
  if (existing) return existing.key;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const key = `app-ambassador:${id}`;
  // Uncertain operations from other drafts/accounts must retain their replay key.
  write([...pending, { slot, key }]);
  return key;
}

export function finishAmbassadorCommand(accountKey: string, payload: string): void {
  const pending = read();
  const slot = commandSlot(accountKey, payload);
  if (!pending.some((entry) => entry.slot === slot)) return;
  write(pending.filter((entry) => entry.slot !== slot));
}
