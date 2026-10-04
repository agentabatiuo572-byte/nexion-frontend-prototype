const STORAGE_KEY = "nexgrid-weekly-quest-pending-command-v1";

interface PendingWeeklyQuestCommand {
  slot: string;
  key: string;
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isCommand(value: unknown): value is PendingWeeklyQuestCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<PendingWeeklyQuestCommand>;
  return typeof row.slot === "string" && !!row.slot
    && typeof row.key === "string" && !!row.key;
}

function read(): PendingWeeklyQuestCommand[] {
  try {
    const value = uni.getStorageSync(STORAGE_KEY) as unknown;
    if (value === undefined || value === null || value === "") return [];
    const entries = (value as { entries?: unknown }).entries;
    if (Array.isArray(entries) && entries.every(isCommand)) return entries;
    throw new Error("invalid weekly quest pending command envelope");
  } catch {
    throw new Error("WEEKLY_QUEST_COMMAND_STORAGE_UNAVAILABLE");
  }
}

function write(entries: PendingWeeklyQuestCommand[]): void {
  try {
    if (!entries.length) uni.removeStorageSync(STORAGE_KEY);
    else uni.setStorageSync(STORAGE_KEY, { version: 1, entries });
  } catch {
    throw new Error("WEEKLY_QUEST_COMMAND_STORAGE_UNAVAILABLE");
  }
}

function commandSlot(accountKey: string, questCode: string, instanceKey: string): string {
  const account = accountKey.trim().toLowerCase();
  const quest = questCode.trim();
  const instance = instanceKey.trim();
  if (!account || !quest || !instance) throw new Error("WEEKLY_QUEST_COMMAND_SCOPE_INVALID");
  return `${fingerprint(account)}:${fingerprint(quest)}:${fingerprint(instance)}`;
}

export function acquireWeeklyQuestCommandKey(
  accountKey: string,
  questCode: string,
  instanceKey: string,
): string {
  const slot = commandSlot(accountKey, questCode, instanceKey);
  const pending = read();
  const existing = pending.find((entry) => entry.slot === slot);
  if (existing) return existing.key;
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const key = `app-weekly-quest:${id}`;
  write([...pending, { slot, key }]);
  return key;
}

export function peekWeeklyQuestCommandKey(
  accountKey: string,
  questCode: string,
  instanceKey: string,
): string | null {
  const slot = commandSlot(accountKey, questCode, instanceKey);
  return read().find((entry) => entry.slot === slot)?.key ?? null;
}

export function finishWeeklyQuestCommand(
  accountKey: string,
  questCode: string,
  instanceKey: string,
): void {
  const slot = commandSlot(accountKey, questCode, instanceKey);
  const pending = read();
  if (!pending.some((entry) => entry.slot === slot)) return;
  write(pending.filter((entry) => entry.slot !== slot));
}
