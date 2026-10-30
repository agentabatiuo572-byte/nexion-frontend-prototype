export const CAPACITY_COMMAND_TABLE = "nexgrid-e3-capacity-commands-accounts-v1";
export type PendingKeepCommand = { intent: string; key: string; targetProductNo: string; payableUsdt: number };

export function parsePendingKeepCommand(table: unknown, accountKey: string, targetProductNo: string): PendingKeepCommand | null {
  const isRecord = (value: unknown): value is Record<string, unknown> => Object.prototype.toString.call(value) === "[object Object]";
  if (table === "" || table === null || table === undefined) return null;
  if (!isRecord(table)) throw new Error("CAPACITY_KEEP_COMMAND_STORAGE_INVALID");
  const row = table[normalizeAccountKey(accountKey)];
  if (row === undefined) return null;
  if (!isRecord(row) || !isRecord(row.commands)) throw new Error("CAPACITY_KEEP_COMMAND_STORAGE_INVALID");
  let original: PendingKeepCommand | null = null;
  for (const [intent, key] of Object.entries(row.commands)) {
    if (!intent.trim() || typeof key !== "string" || !key.trim()) throw new Error("CAPACITY_KEEP_COMMAND_STORAGE_INVALID");
    const fields = intent.split("|");
    if (fields[0] !== "keep" || fields[2] !== targetProductNo) continue;
    const payableUsdt = Number(fields[5]);
    if (fields.length !== 7 || !fields[5]?.trim() || !Number.isFinite(payableUsdt) || payableUsdt < 0) throw new Error("CAPACITY_KEEP_ORIGINAL_COMMAND_INVALID");
    if (original) throw new Error("CAPACITY_KEEP_ORIGINAL_COMMAND_AMBIGUOUS");
    original = { intent, key, targetProductNo, payableUsdt };
  }
  return original;
}

export function readPendingKeepCommand(accountKey: string, targetProductNo: string): PendingKeepCommand | null {
  return parsePendingKeepCommand(uni.getStorageSync(CAPACITY_COMMAND_TABLE), accountKey, targetProductNo);
}
import { normalizeAccountKey } from "@/store/account-cloud";

