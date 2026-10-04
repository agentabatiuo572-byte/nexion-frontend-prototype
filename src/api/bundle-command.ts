import { normalizeBundleExpectedAmountUsdt } from "./bundle-order-api";

export interface PendingBundleCommand {
  key: string;
  expectedAmountUsdt: number;
  productNos: string[];
}
export type BundleCommandRestore =
  | { command: PendingBundleCommand }
  | { recoveryKey: string };

function normalizedProducts(productNos: unknown): string[] | null {
  if (!Array.isArray(productNos) || !productNos.every((productNo) => typeof productNo === "string")) return null;
  const normalized = productNos.map((productNo) => productNo.trim());
  return normalized.length >= 2 && normalized.every(Boolean) && new Set(normalized).size === normalized.length
    ? normalized
    : null;
}

/** Only complete v2 commands prove the original order-sensitive payload.
 * Older rows retain their key for manual order recovery; they must never be
 * supplied with a guessed SKU order or sent to create/pay automatically. */
export function restoreBundleCommand(stored: unknown): BundleCommandRestore | null {
  if (typeof stored === "string" && stored.trim()) return { recoveryKey: stored.trim() };
  if (!stored || typeof stored !== "object") return null;
  const row = stored as Partial<PendingBundleCommand>;
  if (typeof row.key !== "string" || !row.key.trim()) return null;
  const expectedAmountUsdt = normalizeBundleExpectedAmountUsdt(row.expectedAmountUsdt ?? Number.NaN);
  const productNos = normalizedProducts(row.productNos);
  return expectedAmountUsdt === null || productNos === null
    ? { recoveryKey: row.key.trim() }
    : { command: { key: row.key.trim(), expectedAmountUsdt, productNos } };
}