import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface StorefrontActivityItem {
  eventType: "ORDER_PAID";
  productName: string;
  occurredAt: string;
}

export interface StorefrontActivitySnapshot {
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  items: StorefrontActivityItem[];
  nextCursor: string | null;
}

export interface StorefrontSocialProof {
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  productName: string;
  cumulativeSales: number;
  windowDays: 7 | 30 | 90;
  windowSales: number;
}

export interface StorefrontActivityApi {
  activity(limit?: number, cursor?: string): Promise<StorefrontActivitySnapshot>;
  socialProof(productNo: string, windowDays?: 7 | 30 | 90): Promise<StorefrontSocialProof>;
}

function invalid(message: string): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(message);
  return value as Record<string, unknown>;
}

function environment(value: unknown, message: string): "PRODUCTION" | "SANDBOX" {
  if (value === "PRODUCTION" || value === "SANDBOX") return value;
  return invalid(message);
}

function nonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid(message);
  return value;
}

function parseActivity(value: unknown): StorefrontActivitySnapshot {
  const message = "STOREFRONT_ACTIVITY_RESPONSE_INVALID";
  const source = record(value, message);
  if (source.source !== "nx_order/nx_order_item/nx_product" || !Array.isArray(source.items)) return invalid(message);
  const items = source.items.map((raw) => {
    const row = record(raw, message);
    if (row.eventType !== "ORDER_PAID" || typeof row.productName !== "string" || !row.productName.trim()
        || typeof row.occurredAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(row.occurredAt)) {
      return invalid(message);
    }
    return { eventType: "ORDER_PAID" as const, productName: row.productName.trim(), occurredAt: row.occurredAt };
  });
  const nextCursor = source.nextCursor;
  if (nextCursor !== null && (typeof nextCursor !== "string" || nextCursor.length < 1 || nextCursor.length > 256)) {
    return invalid(message);
  }
  return {
    sourceEnvironment: environment(source.sourceEnvironment, message),
    items,
    nextCursor: nextCursor as string | null,
  };
}

function parseSocialProof(value: unknown): StorefrontSocialProof {
  const message = "STOREFRONT_SOCIAL_PROOF_RESPONSE_INVALID";
  const source = record(value, message);
  if (source.source !== "nx_product/nx_order/nx_order_item" || typeof source.productName !== "string"
      || !source.productName.trim() || ![7, 30, 90].includes(source.windowDays as number)) return invalid(message);
  return {
    sourceEnvironment: environment(source.sourceEnvironment, message),
    productName: source.productName.trim(),
    cumulativeSales: nonNegativeInteger(source.cumulativeSales, message),
    windowDays: source.windowDays as 7 | 30 | 90,
    windowSales: nonNegativeInteger(source.windowSales, message),
  };
}

function normalizeProductNo(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(normalized)) {
    throw new ApiError({ kind: "configuration", message: "STOREFRONT_PRODUCT_NO_INVALID" });
  }
  return normalized;
}

export function createStorefrontActivityApi(client: ApiClient): StorefrontActivityApi {
  return {
    async activity(limit = 20, cursor) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
        throw new ApiError({ kind: "configuration", message: "STOREFRONT_ACTIVITY_LIMIT_INVALID" });
      }
      const query = [`limit=${limit}`];
      if (cursor) query.push(`cursor=${encodeURIComponent(cursor)}`);
      return parseActivity(await client.request<unknown>({ path: `/api/storefront/activity?${query.join("&")}` }));
    },
    async socialProof(productNo, windowDays = 30) {
      if (![7, 30, 90].includes(windowDays)) {
        throw new ApiError({ kind: "configuration", message: "STOREFRONT_SOCIAL_PROOF_WINDOW_INVALID" });
      }
      const normalized = normalizeProductNo(productNo);
      return parseSocialProof(await client.request<unknown>({
        path: `/api/storefront/products/${encodeURIComponent(normalized)}/social-proof?windowDays=${windowDays}`,
      }));
    },
  };
}
