import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import {
  parseProductCatalogPayload,
  ProductCatalogContractError,
  type ProductCatalogSnapshot,
} from "./product-catalog-contract";

export type { ProductCatalogSnapshot } from "./product-catalog-contract";

export interface ProductCatalogApi {
  catalog(): Promise<ProductCatalogSnapshot>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "PRODUCT_CATALOG_RESPONSE_INVALID" });
}

export function createProductCatalogApi(client: ApiClient): ProductCatalogApi {
  return {
    async catalog(): Promise<ProductCatalogSnapshot> {
      const payload = await client.request<unknown>({
        method: "GET",
        path: "/api/store/catalog",
      });
      try {
        return parseProductCatalogPayload(payload);
      } catch (error) {
        if (error instanceof ProductCatalogContractError) return invalid();
        throw error;
      }
    },
  };
}
