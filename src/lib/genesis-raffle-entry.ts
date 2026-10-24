import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";
import { requireCryptoUuid } from "./secure-command-id";

const KEY = "uvel-genesis-raffle-entry-accounts-v1";
export interface PendingRaffleEntry { tickets: number; key: string; }
type Pending = Record<string, PendingRaffleEntry>;
export function pendingRaffleEntry(account: string, draw: string): PendingRaffleEntry | null {
  const entry = readAccountRow<Pending>(KEY, account, true)?.[draw];
  if (!entry) return null;
  if (!Number.isSafeInteger(entry.tickets) || entry.tickets <= 0 || typeof entry.key !== "string" || !entry.key) throw new Error("RAFFLE_ENTRY_STORAGE_INVALID");
  return entry;
}
export function acquireRaffleEntry(account: string, draw: string, tickets: number): PendingRaffleEntry {
  const current = pendingRaffleEntry(account, draw); if (current) return current;
  if (!Number.isSafeInteger(tickets) || tickets <= 0) throw new Error("RAFFLE_TICKETS_INVALID");
  const entry = { tickets, key: `genesis-raffle:${requireCryptoUuid()}` };
  if (!writeAccountRow(KEY, account, { ...readAccountRow<Pending>(KEY, account, true), [draw]: entry })) throw new Error("RAFFLE_ENTRY_STORAGE_UNAVAILABLE");
  const saved = pendingRaffleEntry(account, draw);
  if (!saved) throw new Error("RAFFLE_ENTRY_STORAGE_UNAVAILABLE");
  return saved;
}
export function finishRaffleEntry(account: string, draw: string, key: string) {
  const entries = readAccountRow<Pending>(KEY, account, true) ?? {};
  if (entries[draw]?.key !== key) return;
  const next = { ...entries }; delete next[draw];
  if (!writeAccountRow(KEY, account, next)) throw new Error("RAFFLE_ENTRY_STORAGE_UNAVAILABLE");
}
