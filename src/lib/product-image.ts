// Text labels for approved catalog photos. These never select an image asset.
const PRODUCT_TIER_CODES: Record<string, string> = {
  "stellarbox-s1": "S1",
  "stellarbox-pro": "Pro",
  "stellarbox-pro-v2": "Pro v2",
  "stellarrack-p1": "Rack P1",
  "stellarrack-p2": "Rack P2",
};

export function productTierCode(productId: string, fallback: string): string {
  return PRODUCT_TIER_CODES[productId] ?? fallback;
}

/** Only the current catalog image may render; a failed URL stays hidden until it changes. */
export function catalogProductImageUrl(imageUrl: string | undefined, failedImageUrl: string): string | null {
  return imageUrl && imageUrl !== failedImageUrl ? imageUrl : null;
}
