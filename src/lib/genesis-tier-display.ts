export type GenesisTierDisplayState = "sold" | "current" | "upcoming";

export interface GenesisTierDisplaySource {
  id: string;
  from: number;
  to: number;
  priceUSDT: number;
}

export interface GenesisTierDisplayRow extends GenesisTierDisplaySource {
  state: GenesisTierDisplayState;
  left: number;
  seatsTotal: number;
}

export function deriveGenesisTierRows(
  tiers: readonly GenesisTierDisplaySource[],
  sold: number,
): GenesisTierDisplayRow[] {
  return tiers.map((tier) => ({
    ...tier,
    state: sold >= tier.to ? "sold" : sold >= tier.from ? "current" : "upcoming",
    left: Math.max(0, tier.to - Math.max(tier.from, sold)),
    seatsTotal: tier.to - tier.from,
  }));
}
