export const GENESIS_LISTING_MAX_PRICE_USDT = 100_000_000;

/** The listing contract accepts positive plain decimals with at most six places. */
export function parseGenesisListingPrice(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= GENESIS_LISTING_MAX_PRICE_USDT ? value : null;
}
