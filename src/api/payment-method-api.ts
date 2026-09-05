import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface PaymentMethodCard { tokenId: string; version: number; brand: "visa" | "mastercard" | "amex" | "unionpay" | "unknown"; last4: string; holder: string; status: "BOUND"; isDefault: boolean; boundAt: string; source: "mock" | "provider"; sandbox: boolean; providerCanonical: boolean; }
export interface PaymentMethodApi { list(): Promise<PaymentMethodCard[]>; bind(input: { providerToken: string; source: "mock" | "provider"; brand: PaymentMethodCard["brand"]; last4: string; holder: string; makeDefault: boolean; idempotencyKey: string }): Promise<PaymentMethodCard>; unbind(input: { tokenId: string; expectedVersion: number; idempotencyKey: string }): Promise<void>; setDefault(input: { tokenId: string; expectedVersion: number; idempotencyKey: string }): Promise<void>; }
const record = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
function card(v: unknown): PaymentMethodCard {
  const row = record(v);
  if (!row || typeof row.tokenId !== "string" || !/^\d+$/.test(row.tokenId) || typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 0 || !["visa", "mastercard", "amex", "unionpay", "unknown"].includes(String(row.brand)) || typeof row.last4 !== "string" || !/^\d{4}$/.test(row.last4) || typeof row.holder !== "string" || !row.holder.trim() || row.status !== "BOUND" || typeof row.isDefault !== "boolean" || typeof row.boundAt !== "string" || !Number.isFinite(Date.parse(row.boundAt)) || !["mock", "provider"].includes(String(row.source)) || typeof row.sandbox !== "boolean" || typeof row.providerCanonical !== "boolean" || row.providerCanonical === row.sandbox) throw new ApiError({ kind: "protocol", message: "PAYMENT_METHOD_RESPONSE_INVALID" });
  return row as unknown as PaymentMethodCard;
}
export function createPaymentMethodApi(client: ApiClient): PaymentMethodApi {
  return {
    async list() { const body = record(await client.request<unknown>({ method: "GET", path: "/api/payment-methods" })); if (!body || body.serverCanonical !== true || !Array.isArray(body.cards)) throw new ApiError({ kind: "protocol", message: "PAYMENT_METHOD_RESPONSE_INVALID" }); return body.cards.map(card); },
    async bind(input) { const body = record(await client.request<unknown>({ method: "POST", path: "/api/payment-methods/bind", idempotencyKey: input.idempotencyKey, body: { providerToken: input.providerToken, source: input.source, brand: input.brand, last4: input.last4, holder: input.holder, makeDefault: input.makeDefault } })); if (!body || body.serverCanonical !== true || body.receipt !== "CARD_BOUND" || body.source !== input.source || body.sandbox !== (input.source === "mock") || body.providerCanonical !== (input.source === "provider")) throw new ApiError({ kind: "protocol", message: "PAYMENT_METHOD_RECEIPT_INVALID" }); return card(body.card); },
    async unbind(input) {
      const body = record(await client.request<unknown>({ method: "POST", path: `/api/payment-methods/${encodeURIComponent(input.tokenId)}/unbind`, idempotencyKey: input.idempotencyKey, body: { expectedVersion: input.expectedVersion } }));
      if (!body || body.serverCanonical !== true || body.receipt !== "CARD_UNBOUND") throw new ApiError({ kind: "protocol", message: "PAYMENT_METHOD_RECEIPT_INVALID" });
    },
    async setDefault(input) {
      const body = record(await client.request<unknown>({ method: "POST", path: `/api/payment-methods/${encodeURIComponent(input.tokenId)}/default`, idempotencyKey: input.idempotencyKey, body: { expectedVersion: input.expectedVersion } }));
      if (!body || body.serverCanonical !== true || body.receipt !== "CARD_DEFAULT_SET") throw new ApiError({ kind: "protocol", message: "PAYMENT_METHOD_RECEIPT_INVALID" });
    },
  };
}
