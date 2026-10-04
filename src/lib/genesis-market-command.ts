import { parseGenesisListingPrice } from "./genesis-listing-price";

export type GenesisMarketOperation = "list" | "cancel" | "buy";
export type GenesisCommandOutcome = boolean | "recovered" | "local-retirement-pending";
export interface GenesisMarketCommand {
  version: 2;
  key: string;
  holdingNo: string;
  operation: GenesisMarketOperation;
  priceUsdt: number | null;
  createdAt: number;
  state: "pending" | "confirmed";
  legacySlot?: string;
}

/** Preserve legacy command keys without executing or guessing their outcomes. */
export function hydrateGenesisMarketCommands(
  stored: unknown, keys: Record<string, string>, account: string,
): Record<string, GenesisMarketCommand> {
  const commands: Record<string, GenesisMarketCommand> = Object.create(null);
  if (stored != null && (typeof stored !== "object" || Array.isArray(stored))) {
    throw new Error("GENESIS_COMMAND_JOURNAL_INVALID");
  }
  if (stored && typeof stored === "object") {
    for (const [id, raw] of Object.entries(stored)) {
      const row = raw as Partial<GenesisMarketCommand> | null;
      if (!row || row.version !== 2 || typeof row.key !== "string" || !row.key
        || typeof row.holdingNo !== "string" || !/^[A-Za-z0-9-]{3,128}$/.test(row.holdingNo)
        || !["list", "cancel", "buy"].includes(String(row.operation))
        || !["pending", "confirmed"].includes(String(row.state))
        || typeof row.createdAt !== "number" || !Number.isFinite(row.createdAt) || row.createdAt < 0
        || (row.operation === "list" && row.priceUsdt == null)) {
        throw new Error("GENESIS_COMMAND_JOURNAL_INVALID");
      }
      if (row.priceUsdt != null && parseGenesisListingPrice(String(row.priceUsdt)) === null) {
        throw new Error("GENESIS_COMMAND_JOURNAL_INVALID");
      }
      commands[id] = { ...row } as GenesisMarketCommand;
    }
  }
  for (const [slot, key] of Object.entries(keys)) {
    const prefix = `${account}|`;
    if (!slot.startsWith(prefix)) continue;
    const match = /^(list|cancel|buy)\|([A-Za-z0-9-]{3,128})(?::(.+))?$/.exec(slot.slice(prefix.length));
    if (!match && /^(list|cancel|buy)\|/.test(slot.slice(prefix.length))) throw new Error("GENESIS_COMMAND_JOURNAL_INVALID");
    if (!match || Object.values(commands).some((row) => row.legacySlot === slot)) continue;
    const price = match[3] === undefined ? null : parseGenesisListingPrice(match[3]);
    if (typeof key !== "string" || !key || (match[1] === "list" && price === null)) {
      throw new Error("GENESIS_COMMAND_JOURNAL_INVALID");
    }
    commands[slot] = { version: 2, key, holdingNo: match[2], operation: match[1] as GenesisMarketOperation,
      priceUsdt: price, createdAt: 0, state: "pending", legacySlot: slot };
  }
  return commands;
}
