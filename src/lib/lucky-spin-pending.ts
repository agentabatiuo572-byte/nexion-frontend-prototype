import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";
import { requireCryptoUuid } from "./secure-command-id";
import { normalizeAccountKey } from "@/store/account-cloud";

const KEY = "uvel-lucky-spin-pending-accounts-v1";
export interface PendingSpin { key: string; eventId: string; serverDate: string; }
type Pending = Record<string, PendingSpin>;

export function readPendingSpin(scope: string, event: string): PendingSpin | null {
  const raw = uni.getStorageSync(KEY);
  if (raw !== undefined && raw !== null && raw !== "" && (typeof raw !== "object" || Array.isArray(raw))) throw new Error("WHEEL_COMMAND_STORAGE_INVALID");
  const row = raw?.[normalizeAccountKey(scope)];
  if (row !== undefined && (!row || typeof row !== "object" || Array.isArray(row))) throw new Error("WHEEL_COMMAND_STORAGE_INVALID");
  const rows = readAccountRow<Pending>(KEY, scope, true);
  const entry = rows?.[event];
  if (entry === undefined) return null;
  if (!entry || typeof entry.key !== "string" || !entry.key || typeof entry.eventId !== "string" || !entry.eventId
    || typeof entry.serverDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.serverDate)) throw new Error("WHEEL_COMMAND_STORAGE_INVALID");
  return entry;
}
export function acquirePendingSpin(scope: string, event: string, eventId: string, serverDate: string): { entry: PendingSpin; created: boolean } {
  const current = readPendingSpin(scope, event);
  if (current) return { entry: current, created: false };
  const entry = { key: `lucky-spin:${requireCryptoUuid()}`, eventId, serverDate };
  if (!writeAccountRow(KEY, scope, { ...readAccountRow<Pending>(KEY, scope, true), [event]: entry })) throw new Error("WHEEL_COMMAND_STORAGE_UNAVAILABLE");
  const saved = readPendingSpin(scope, event);
  if (!saved) throw new Error("WHEEL_COMMAND_STORAGE_UNAVAILABLE");
  return { entry: saved, created: saved.key === entry.key };
}
export function finishPendingSpin(scope: string, event: string, key: string) {
  const rows = readAccountRow<Pending>(KEY, scope, true) ?? {};
  if (rows[event]?.key !== key) return;
  const next = { ...rows }; delete next[event];
  if (!writeAccountRow(KEY, scope, next) || readPendingSpin(scope, event)) throw new Error("WHEEL_COMMAND_STORAGE_UNAVAILABLE");
}
