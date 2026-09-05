import type { Product } from "@/mock/products";
import { isPhaseReached, type PhaseParams } from "./product-phase";

/**
 * Remote products carry a server-computed release decision. Mock products keep
 * the historical P1-P6 rule so the offline prototype remains deterministic.
 */
export function isProductAvailable(product: Product, currentPhase: PhaseParams): boolean {
  if (typeof product.available === "boolean") return product.available;
  return !product.unlocksAtPhase || isPhaseReached(currentPhase, product.unlocksAtPhase);
}
