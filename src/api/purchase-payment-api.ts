import type { ApiClient } from './api-client';
import { ApiError, asApiError } from './errors';
import { validateHostedPaymentUrl } from '@/lib/hosted-payment';

export const purchaseKinds = ['ORDER_PAY', 'TRIAL_CONVERT', 'TRADE_IN', 'CAPACITY_REPLACE', 'CAPACITY_KEEP'] as const;
export type PurchaseKind = typeof purchaseKinds[number];
export type ExternalPaymentMethod = 'HDPAY_BANK' | 'CREGIS_USDT_BSC';
export type PurchaseMethod = 'WALLET' | ExternalPaymentMethod;
export type PurchaseQuote = {
  paymentQuoteId: string; kind: PurchaseKind; paymentMethod: ExternalPaymentMethod; network: string | null;
  subtotalUsdt: string; channelFeeUsdt: string; networkConfirmFeeUsdt: string; totalUsdt: string;
  feePolicyVersion: number; expiresAt: string; fxRateVndPerUsdt: string | null; amountVnd: string | null;
};
export const purchasePaymentStatuses = ['CREATING', 'SUBMIT_UNKNOWN', 'AWAITING_PAYMENT', 'FUNDS_CONFIRMED', 'DELIVERED', 'MANUAL_REVIEW', 'EXPIRED'] as const;
export type PurchasePaymentStatus = typeof purchasePaymentStatuses[number];
export type PurchasePaymentIntent = {
  intentNo: string; commandKey: string; paymentQuoteId: string; kind: PurchaseKind; paymentMethod: ExternalPaymentMethod;
  network: string | null; status: PurchasePaymentStatus; subtotalUsdt: string; channelFeeUsdt: string;
  networkConfirmFeeUsdt: string; totalUsdt: string; amountVnd: string | null; paymentUrl: string | null;
  address: string | null; expiresAt: string; reason: string | null; receipt: unknown;
  fulfilmentStatus?: 'DELIVERED';
};
const invalid = () => new ApiError({ kind: 'protocol', message: 'PURCHASE_PAYMENT_RESPONSE_INVALID' });
const object = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
  return raw as Record<string, unknown>;
};
const text = (raw: unknown): string => { if (typeof raw !== 'string' || !raw.trim()) throw invalid(); return raw; };
const money = (raw: unknown): string => {
  if (typeof raw !== 'string' || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(raw)) throw invalid();
  return raw;
};
const timestamp = (raw: unknown): string => {
  const value = text(raw);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid();
  return value;
};
function common(raw: Record<string, unknown>) {
  if (!purchaseKinds.includes(raw.kind as PurchaseKind) || !['HDPAY_BANK', 'CREGIS_USDT_BSC'].includes(String(raw.paymentMethod))) throw invalid();
  const paymentMethod = raw.paymentMethod as ExternalPaymentMethod;
  const network = raw.network == null ? null : text(raw.network);
  if (paymentMethod === 'CREGIS_USDT_BSC' && !['BSC', 'BEP20', 'USDT-BSC'].includes(network ?? '')) throw invalid();
  const amountVnd = raw.amountVnd == null ? null : text(raw.amountVnd);
  if (paymentMethod === 'HDPAY_BANK' && (!amountVnd || !/^[1-9]\d*$/.test(amountVnd))) throw invalid();
  const subtotalUsdt = money(raw.subtotalUsdt), channelFeeUsdt = money(raw.channelFeeUsdt), networkConfirmFeeUsdt = money(raw.networkConfirmFeeUsdt), totalUsdt = money(raw.totalUsdt);
  if (Number(totalUsdt) <= 0 || paymentMethod === 'HDPAY_BANK' && Number(networkConfirmFeeUsdt) !== 0) throw invalid();
  // Compare in integer cents; these checks validate a complete server quote, not client pricing.
  const cents = (v: string) => { const [whole, fraction = ''] = v.split('.'); return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0')); };
  if (cents(subtotalUsdt) + cents(channelFeeUsdt) + cents(networkConfirmFeeUsdt) !== cents(totalUsdt)) throw invalid();
  return { kind: raw.kind as PurchaseKind, paymentMethod, network, subtotalUsdt, channelFeeUsdt, networkConfirmFeeUsdt, totalUsdt, amountVnd, expiresAt: timestamp(raw.expiresAt), paymentQuoteId: text(raw.paymentQuoteId) };
}
export function parsePurchaseQuote(value: unknown): PurchaseQuote {
  const raw = object(value), fields = common(raw);
  if (!Number.isSafeInteger(raw.feePolicyVersion) || Number(raw.feePolicyVersion) < 0) throw invalid();
  const fxRateVndPerUsdt = raw.fxRateVndPerUsdt == null ? null : text(raw.fxRateVndPerUsdt);
  if (fields.paymentMethod === 'HDPAY_BANK' && (!fxRateVndPerUsdt || !/^\d+(\.\d+)?$/.test(fxRateVndPerUsdt) || Number(fxRateVndPerUsdt) <= 0)) throw invalid();
  return { ...fields, feePolicyVersion: Number(raw.feePolicyVersion), fxRateVndPerUsdt };
}
export function parsePurchaseIntent(value: unknown): PurchasePaymentIntent {
  const raw = object(value), fields = common(raw);
  if (!purchasePaymentStatuses.includes(raw.status as PurchasePaymentStatus)) throw invalid();
  const paymentUrl = raw.paymentUrl == null ? null : text(raw.paymentUrl), address = raw.address == null ? null : text(raw.address);
  if (paymentUrl && (fields.paymentMethod !== 'HDPAY_BANK' || !validateHostedPaymentUrl(paymentUrl))) throw invalid();
  if (address && (fields.paymentMethod !== 'CREGIS_USDT_BSC' || !/^0x[0-9a-fA-F]{40}$/.test(address))) throw invalid();
  if ((raw.status === 'DELIVERED' || raw.fulfilmentStatus === 'DELIVERED') && (!raw.receipt || typeof raw.receipt !== 'object')) throw invalid();
  return { ...fields, intentNo: text(raw.intentNo), commandKey: text(raw.commandKey), status: raw.status as PurchasePaymentStatus,
    paymentUrl, address, reason: raw.reason == null || typeof raw.reason === 'string' && !raw.reason.trim() ? null : text(raw.reason), receipt: raw.receipt ?? null,
    ...(raw.fulfilmentStatus === 'DELIVERED' ? { fulfilmentStatus: 'DELIVERED' as const } : {}) };
}
export function createPurchasePaymentApi(client: ApiClient) {
  const base = '/api/app/purchase-payment';
  return {
    async quote(kind: PurchaseKind, paymentMethod: ExternalPaymentMethod, payload: Record<string, unknown>) {
      return parsePurchaseQuote(await client.request({ method: 'POST', path: `${base}-quotes`, body: { kind, paymentMethod, payload } }));
    },
    async create(paymentQuoteId: string, commandKey: string) {
      return parsePurchaseIntent(await client.request({ method: 'POST', path: `${base}-intents`, body: { paymentQuoteId }, idempotencyKey: commandKey, retryAfterAuth: false }));
    },
    async get(intentNo: string) { return parsePurchaseIntent(await client.request({ path: `${base}-intents/${encodeURIComponent(intentNo)}` })); },
    async find(kind: PurchaseKind, commandKey: string) {
      try { return parsePurchaseIntent(await client.request({ path: `${base}-intents?kind=${encodeURIComponent(kind)}&commandKey=${encodeURIComponent(commandKey)}` })); }
      catch (error) { if (asApiError(error).status === 404) return null; throw error; }
    },
  };
}
