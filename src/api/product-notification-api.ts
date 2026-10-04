import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";

export interface ProductNotification {
  serverCanonical: boolean;
  source: string;
  subscribed: boolean;
  revision: string;
  productNo: string;
  releaseState?: string;
  releasePhaseId?: string;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface ProductNotificationList {
  serverCanonical: boolean;
  source: string;
  subscriptions: ProductNotification[];
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface ProductNotificationApi {
  subscribe(productNo: string): Promise<ProductNotification>;
  unsubscribe(productNo: string): Promise<ProductNotification>;
  status(productNo: string): Promise<ProductNotification>;
  list(): Promise<ProductNotificationList>;
}

function validScope(sourceEnvironment: unknown, runId: unknown, mode: ApiEnvironment): boolean {
  return (mode === "dev" || mode === "prod")
    && sourceEnvironment === "PRODUCTION" && runId === "";
}

function validNotification(value: unknown, mode: ApiEnvironment): value is ProductNotification {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ProductNotification>;
  return row.serverCanonical === true
    && row.source === "nx_product"
    && typeof row.subscribed === "boolean"
    && typeof row.revision === "string"
    && typeof row.productNo === "string"
    && validScope(row.sourceEnvironment, row.runId, mode);
}

function parseNotification(value: unknown, mode: ApiEnvironment): ProductNotification {
  if (!validNotification(value, mode)) throw new ApiError({ kind: "protocol", message: "PRODUCT_NOTIFICATION_RESPONSE_INVALID" });
  return value;
}

function path(productNo: string): string {
  return `/api/store/notifications/${encodeURIComponent(productNo)}`;
}

export function createProductNotificationApi(client: ApiClient, mode: ApiEnvironment = "prod"): ProductNotificationApi {
  return {
    async subscribe(productNo) {
      return parseNotification(await client.request<unknown>({ method: "POST", path: path(productNo) }), mode);
    },
    async unsubscribe(productNo) {
      return parseNotification(await client.request<unknown>({ method: "DELETE", path: path(productNo) }), mode);
    },
    async status(productNo) {
      return parseNotification(await client.request<unknown>({ method: "GET", path: path(productNo) }), mode);
    },
    async list() {
      const value = await client.request<unknown>({ method: "GET", path: "/api/store/notifications" });
      if (!value || typeof value !== "object") throw new ApiError({ kind: "protocol", message: "PRODUCT_NOTIFICATION_RESPONSE_INVALID" });
      const row = value as Partial<ProductNotificationList>;
      if (row.serverCanonical !== true || row.source !== "nx_product"
          || !validScope(row.sourceEnvironment, row.runId, mode)
          || !Array.isArray(row.subscriptions)
          || row.subscriptions.some((item) => !validNotification(item, mode)
            || item.sourceEnvironment !== row.sourceEnvironment || item.runId !== row.runId)) {
        throw new ApiError({ kind: "protocol", message: "PRODUCT_NOTIFICATION_RESPONSE_INVALID" });
      }
      return row as ProductNotificationList;
    },
  };
}
