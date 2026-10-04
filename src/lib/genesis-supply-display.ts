export interface GenesisSupplyDisplay {
  known: boolean;
  summary: string;
  progressWidth: string;
}

/**
 * Keeps an unavailable remote supply distinct from a real zero-supply series.
 * The public API is authoritative; until it has supplied a value, a numeric
 * sales counter would be a fabricated fact.
 */
export function genesisSupplyDisplay(sold: number, total: number, known: boolean): GenesisSupplyDisplay {
  if (!known) return { known: false, summary: "", progressWidth: "0%" };
  const safeSold = Math.max(0, sold);
  const safeTotal = Math.max(0, total);
  const pct = safeTotal > 0 ? Math.min(100, (safeSold / safeTotal) * 100) : 0;
  return {
    known: true,
    summary: `${safeSold.toLocaleString()} / ${safeTotal.toLocaleString()}`,
    progressWidth: `${pct}%`,
  };
}
