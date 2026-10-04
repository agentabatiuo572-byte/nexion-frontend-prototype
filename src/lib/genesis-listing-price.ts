import { normalizeCommandAmount } from "./command-amount";

export const GENESIS_LISTING_MAX_PRICE_USDT = 100_000_000;

/** Matches the Genesis listing endpoint: a positive, plain decimal with at
 * most six fractional places. Invalid text is rejected instead of being
 * stripped into a different monetary command. */
export function parseGenesisListingPrice(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) return null;
  const value = normalizeCommandAmount(text);
  return value > 0 && value <= GENESIS_LISTING_MAX_PRICE_USDT ? value : null;
}
