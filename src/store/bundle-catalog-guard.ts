import type { ProductCatalogStatus } from "./product-catalog";

/** Bundle pages may render local compatibility data only after a live snapshot is ready. */
export function bundleCatalogReady(remote: boolean, status: ProductCatalogStatus): boolean {
  return !remote || status === "ready";
}
