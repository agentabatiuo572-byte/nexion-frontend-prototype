export type GenesisFloorDeltaState = "unavailable" | "up" | "down" | "flat";

export interface GenesisFloorDeltaPresentation {
  state: GenesisFloorDeltaState;
  value: string;
}

export type GenesisMarketplaceTransactionKind = "PRIMARY" | "SECONDARY";

export interface GenesisMarketplaceActivityLabels {
  primary: string;
  secondary: string;
}

/**
 * The server owns the floor comparison. Keep an unavailable comparison neutral
 * and preserve its absence instead of turning it into a market direction.
 */
export function presentGenesisFloorDelta(deltaPct: number | null): GenesisFloorDeltaPresentation {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return { state: "unavailable", value: "—" };
  if (deltaPct > 0) return { state: "up", value: `+${deltaPct}%` };
  if (deltaPct < 0) return { state: "down", value: `${deltaPct}%` };
  return { state: "flat", value: "0%" };
}

/** A null rate is an unavailable server fact, never a 0% fallback. */
export function presentGenesisRoyalty(royaltyPct: number | null): string | null {
  if (royaltyPct === null || !Number.isFinite(royaltyPct) || royaltyPct < 0) return null;
  return `${royaltyPct}%`;
}

/** Full money is required in a confirmation. An unknown floor remains a bare
 * neutral marker, so template currency units can never turn it into "$—K". */
export function presentGenesisFloorPrice(floorUsdt: number | null): string {
  if (floorUsdt === null || !Number.isFinite(floorUsdt) || floorUsdt < 0) return "—";
  return `$${floorUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

/** Keep server transaction facts while replacing transport enums with public copy. */
export function presentGenesisMarketplaceActivityDescription(
  kind: GenesisMarketplaceTransactionKind,
  quantity: string,
  orderNo: string,
  labels: GenesisMarketplaceActivityLabels,
): string {
  const publicKind = kind === "PRIMARY" ? labels.primary : labels.secondary;
  return `${publicKind} · ${quantity} · ${orderNo}`;
}
