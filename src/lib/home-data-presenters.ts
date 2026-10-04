import { SPEC_UNAVAILABLE } from "@/api/product-catalog-contract";
import type { Product } from "@/mock/products";

export interface HomepageProductTrust {
  product: Product;
  gpu: string | null;
  datacenter: string | null;
  warranty: string | null;
}

function certifiedDisplayValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.toLowerCase() !== SPEC_UNAVAILABLE ? normalized : null;
}

export function selectHomepageProductTrust(products: readonly Product[]): HomepageProductTrust | null {
  const candidates = products.filter((product) => product.available !== false && !product.purchaseBlocked);
  const selected = candidates.map((product, index) => {
    const gpu = certifiedDisplayValue(product.gpu);
    const datacenter = certifiedDisplayValue(product.datacenter);
    const warranty = certifiedDisplayValue(product.warranty);
    return {
      index,
      score: Number(gpu !== null) + Number(datacenter !== null) + Number(warranty !== null),
      value: { product, gpu, datacenter, warranty },
    };
  }).sort((left, right) => right.score - left.score || left.index - right.index)[0];
  return selected?.value ?? null;
}
