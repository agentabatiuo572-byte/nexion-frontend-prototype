import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface H3ObservationApi {
  productDetail(productNo: string): Promise<void>;
  secondaryMarket(): Promise<void>;
}

function accepted(value: unknown): void {
  if (!value || typeof value !== "object" || (value as { accepted?: unknown }).accepted !== true) {
    throw new ApiError({ kind: "protocol", message: "H3_OBSERVATION_RESPONSE_INVALID" });
  }
}

function productNo(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ApiError({ kind: "protocol", message: "H3_OBSERVATION_PRODUCT_INVALID" });
  return normalized;
}

/** H3 completion signals are server-deduplicated observations, never client rewards. */
export function createH3ObservationApi(client: ApiClient): H3ObservationApi {
  return {
    async productDetail(value: string): Promise<void> {
      accepted(await client.request<unknown>({
        method: "POST",
        path: `/api/store/products/${encodeURIComponent(productNo(value))}/detail-observation`,
        authenticated: true,
      }));
    },
    async secondaryMarket(): Promise<void> {
      accepted(await client.request<unknown>({
        method: "POST",
        path: "/api/genesis/secondary-market/observation",
        authenticated: true,
      }));
    },
  };
}
