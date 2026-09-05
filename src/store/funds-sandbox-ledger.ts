import type { FundsSandboxLedgerEntry } from "@/api/funds-sandbox-api";

export interface FundsSandboxBillProjection {
  id: string;
  type: "topup" | "withdraw";
  amount: number;
  symbol: "USDT";
  status: "posted" | "pending" | "failed";
  ts: number;
  memo: string;
  ref: string;
  balanceAfter: number;
  reservedAfter: number;
  source: "mock";
  sourceEnvironment: "SANDBOX";
  entryRole: string;
}

/**
 * Projects the append-only operational journal into user-visible available
 * balance movements. WITHDRAWAL_DEBIT consumes an already reserved amount: it
 * changes reserved funds only, so rendering it as another negative bill would
 * double-charge the same withdrawal. Its presence instead finalizes the prior
 * RESERVE row. A RELEASE remains visible as the compensating positive movement.
 */
export function projectFundsSandboxLedger(entries: FundsSandboxLedgerEntry[]): FundsSandboxBillProjection[] {
  const terminalDirection = new Map<string, FundsSandboxLedgerEntry["direction"]>();
  for (const entry of entries) {
    if (entry.direction === "OUT" || entry.direction === "RELEASE") {
      terminalDirection.set(entry.orderNo, entry.direction);
    }
  }

  return entries
    .filter((entry) => entry.direction !== "OUT")
    .map((entry) => {
      const credit = entry.direction === "IN" || entry.direction === "RELEASE";
      const terminal = terminalDirection.get(entry.orderNo);
      const status = entry.direction === "RESERVE"
        ? terminal === "OUT" ? "posted" : terminal === "RELEASE" ? "failed" : "pending"
        : "posted";
      return {
        id: entry.ledgerNo,
        type: entry.entryRole.startsWith("TOPUP_") ? "topup" : "withdraw",
        amount: credit ? entry.amount : -entry.amount,
        symbol: "USDT",
        status,
        ts: Date.parse(entry.createdAt),
        memo: `source=mock · SANDBOX · ${entry.entryRole}`,
        ref: entry.orderNo,
        balanceAfter: entry.availableAfter,
        reservedAfter: entry.reservedAfter,
        source: "mock",
        sourceEnvironment: "SANDBOX",
        entryRole: entry.entryRole,
      };
    });
}
