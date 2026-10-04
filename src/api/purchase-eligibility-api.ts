import type { ApiClient } from "./api-client";
import type { ApiEnvironment } from "./runtime-config";

export const PURCHASE_ELIGIBILITY_SOURCE = "nx_product + nx_admin_device_sku + nx_user" as const;

export type PurchaseEligibilityPolicyName = "E1" | "F4B";
export type PurchaseEligibilityConditionKind = "rank" | "activeDirect" | "teamVolumeUsd" | "lifetimeQuota" | "monthlyQuota";

export interface PurchaseEligibilityCondition {
  kind: PurchaseEligibilityConditionKind;
  required: number;
  current: number;
  gap: number;
  met: boolean;
}

export interface PurchaseEligibilityPolicy {
  policy: PurchaseEligibilityPolicyName;
  eligible: boolean;
  decisionCode: string;
  mode: "ALL" | "EITHER";
  conditions: PurchaseEligibilityCondition[];
}

export interface PurchaseEligibilitySnapshot {
  productNo: string;
  eligible: boolean;
  decisionCode: string;
  policies: PurchaseEligibilityPolicy[];
  evaluatedAt: number;
  source: typeof PURCHASE_ELIGIBILITY_SOURCE;
  sourceEnvironment: "PRODUCTION";
  runId: string | null;
  serverCanonical: true;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function policies(value: unknown): value is PurchaseEligibilityPolicy[] {
  if (!Array.isArray(value)) return false;
  let e1Count = 0;
  let f4bCount = 0;
  return value.length >= 2 && value.every((policy) => {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) return false;
    const row = policy as Record<string, unknown>;
    if ((row.policy !== "E1" && row.policy !== "F4B")
        || typeof row.eligible !== "boolean" || typeof row.decisionCode !== "string" || !row.decisionCode
        || (row.mode !== "ALL" && row.mode !== "EITHER") || !Array.isArray(row.conditions)) return false;
    if (row.policy === "E1") e1Count++;
    else f4bCount++;
    return row.conditions.every((condition) => {
      if (!condition || typeof condition !== "object" || Array.isArray(condition)) return false;
      const item = condition as Record<string, unknown>;
      return ["rank", "activeDirect", "teamVolumeUsd", "lifetimeQuota", "monthlyQuota"].includes(String(item.kind))
        && finite(item.required) && finite(item.current) && finite(item.gap) && item.gap >= 0 && typeof item.met === "boolean";
    });
  }) && e1Count === 1 && f4bCount >= 1;
}

function parse(value: unknown, expectedProductNo: string, mode: ApiEnvironment): PurchaseEligibilitySnapshot {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
  const trustedProvenance = (mode === "dev" || mode === "prod")
    && row?.sourceEnvironment === "PRODUCTION" && row.runId === null;
  if (!row || row.productNo !== expectedProductNo || typeof row.eligible !== "boolean"
      || typeof row.decisionCode !== "string" || !row.decisionCode
      || !policies(row.policies)
      || typeof row.evaluatedAt !== "number" || !Number.isFinite(row.evaluatedAt)
      || row.source !== PURCHASE_ELIGIBILITY_SOURCE
      || row.serverCanonical !== true || !trustedProvenance) {
    throw new Error("PURCHASE_ELIGIBILITY_RESPONSE_INVALID");
  }
  return row as unknown as PurchaseEligibilitySnapshot;
}

export function createPurchaseEligibilityApi(client: ApiClient, mode: ApiEnvironment = "prod") {
  return {
    get: async (productNo: string) => {
      const normalized = productNo.trim();
      if (!normalized) throw new Error("PURCHASE_ELIGIBILITY_PRODUCT_REQUIRED");
      return parse(await client.request({
        method: "GET",
        path: `/api/store/purchase-eligibility?productNo=${encodeURIComponent(normalized)}`,
      }), normalized, mode);
    },
  };
}
