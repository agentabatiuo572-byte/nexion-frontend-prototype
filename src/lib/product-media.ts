/** Bundled artwork only. This does not replace the server's product or holding identity. */
const ROOT = "/static/img/products/uvel-v3";

export const PRODUCT_MEDIA = {
  "stellarbox-s1": { src: `${ROOT}/stellarbox-s1.png`, tierCode: "S1" },
  "stellarbox-pro": { src: `${ROOT}/stellarbox-pro.png`, tierCode: "Pro" },
  "stellarbox-pro-v2": { src: `${ROOT}/stellarbox-pro-v2.png`, tierCode: "Pro v2" },
  "stellarrack-p1": { src: `${ROOT}/stellarrack-p1.png`, tierCode: "Rack P1" },
  "stellarrack-p2": { src: `${ROOT}/stellarrack-p2.png`, tierCode: "Rack P2" },
  "cloud-share": { src: `${ROOT}/cloud-share.png`, tierCode: "Cloud Share" },
} as const;

export type ProductMediaId = keyof typeof PRODUCT_MEDIA;

export function getProductMedia(id: string | null | undefined) {
  return id && Object.prototype.hasOwnProperty.call(PRODUCT_MEDIA, id)
    ? PRODUCT_MEDIA[id as ProductMediaId]
    : null;
}

// Genesis is an independent entitlement, never a seventh device SKU.
export const GENESIS_MEDIA = {
  showcase: `${ROOT}/genesis.png`,
  holding: `${ROOT}/genesis-holder-base.png`,
} as const;

/** Format a supplied display identity without deriving or changing a holding number. */
export function formatGenesisSerial(serial: string | number | null | undefined): string {
  if (serial === null || serial === undefined || serial === "") return "";
  return `No.${typeof serial === "number" ? String(serial).padStart(4, "0") : serial}`;
}
