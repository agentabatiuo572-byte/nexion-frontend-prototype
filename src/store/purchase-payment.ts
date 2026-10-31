import { reactive } from 'vue';
import { apiClient } from '@/api/runtime';
import { asApiError } from '@/api/errors';
import { createPurchasePaymentApi, type PurchaseKind, type PurchaseMethod, type PurchasePaymentIntent, type PurchaseQuote } from '@/api/purchase-payment-api';
import { useApp } from './app';
import { readAccountRow, writeAccountRow, acquireAccountCommandKey, releaseAccountCommandKey } from './account-scoped-storage';
import { openHostedPaymentPage } from '@/lib/hosted-payment';
import { navTo } from '@/lib/route';
import { formatAmount } from '@/lib/amount-display';
import { validatePurchasePaymentReceipt } from '@/lib/purchase-payment-receipt';

export type PurchasePaymentContext = { kind: PurchaseKind; payload: Record<string, unknown>; amount: number | string; summary: string; current: () => boolean; commandKey?: () => string };
type PendingExternal = { fingerprint: string; kind: PurchaseKind; commandKey: string; paymentQuoteId: string; intentNo?: string; summary: string; lastStatus?: string; validated?: boolean; businessDelivered?: boolean };
type PendingRow = { records: Record<string, PendingExternal> };
export type PurchaseChoice = { method: 'WALLET' } | { method: 'EXTERNAL'; receipt: unknown; commandKey: string; accountKey: string };
const TABLE = 'uvel-purchase-payment-accounts-v1', KEYS = 'uvel-purchase-payment-keys-accounts-v1';
const api = createPurchasePaymentApi(apiClient);
const state = reactive({ open: false, accountKey: '', summary: '', amount: '' as string | number, method: 'WALLET' as PurchaseMethod,
  quote: null as PurchaseQuote | null, intent: null as PurchasePaymentIntent | null, pending: null as PendingExternal | null,
  loading: false, busy: false, error: false, unavailable: false, pendingReadError: false, revision: 0 });
let context: PurchasePaymentContext | null = null;
let resolveChoice: ((result: PurchaseChoice | null) => void) | null = null;
let requestVersion = 0;
const account = () => useApp().accountKey;
function rows(accountKey = account()): PendingRow { return readAccountRow<PendingRow>(TABLE, accountKey, true) ?? { records: {} }; }
function save(pending: PendingExternal, accountKey = state.accountKey) {
  const value = rows(accountKey);
  if (!writeAccountRow(TABLE, accountKey, { records: { ...value.records, [pending.commandKey]: pending } })) throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
  state.revision++;
}
function retire(pending: PendingExternal, accountKey: string) {
  const records = { ...rows(accountKey).records }; delete records[pending.commandKey];
  if (!writeAccountRow(TABLE, accountKey, { records })) throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
  releaseAccountCommandKey(KEYS, accountKey, pending.fingerprint, pending.commandKey);
  state.revision++;
}
function fingerprint(value: PurchasePaymentContext): string {
  const stable = (raw: unknown): unknown => raw && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.fromEntries(Object.keys(raw).sort().map(key => [key, stable((raw as Record<string, unknown>)[key])]))
    : Array.isArray(raw) ? raw.map(stable) : raw;
  return JSON.stringify([value.kind, stable(value.payload)]);
}
function owns(version: number, accountKey: string) { return state.open && requestVersion === version && account() === accountKey && state.accountKey === accountKey; }
function matches(intent: PurchasePaymentIntent, pending: PendingExternal) {
  if (intent.commandKey !== pending.commandKey || intent.kind !== pending.kind || intent.paymentQuoteId !== pending.paymentQuoteId
    || pending.intentNo && intent.intentNo !== pending.intentNo) throw new Error('PURCHASE_PAYMENT_RESPONSE_INVALID');
}
function accept(intent: PurchasePaymentIntent, pending: PendingExternal) {
  matches(intent, pending);
  const known = { ...pending, intentNo: intent.intentNo, lastStatus: intent.status, businessDelivered: intent.status === 'DELIVERED' || intent.fulfilmentStatus === 'DELIVERED' };
  save(known); state.pending = known; state.intent = intent; state.method = intent.paymentMethod;
  if (intent.status === 'DELIVERED' || intent.fulfilmentStatus === 'DELIVERED') {
    const payload = JSON.parse(known.fingerprint)[1] as Record<string, unknown>;
    validatePurchasePaymentReceipt(known.kind, payload, intent.receipt, intent);
    if (intent.status === 'MANUAL_REVIEW' && context === null) return;
    finish({ method: 'EXTERNAL', receipt: intent.receipt, commandKey: known.commandKey, accountKey: state.accountKey });
  }
}
function finish(result: PurchaseChoice | null) {
  requestVersion++; state.open = false; state.loading = false; state.busy = false;
  const done = resolveChoice; resolveChoice = null; context = null; done?.(result);
}
async function select(method: PurchaseMethod) {
  if (state.busy || state.pending || !context) return;
  state.method = method; state.quote = null; state.error = false; state.unavailable = false;
  const version = ++requestVersion, accountKey = state.accountKey, expected = context;
  if (method === 'WALLET') { state.loading = false; return; }
  state.loading = true;
  try {
    if (!expected.current()) throw new Error('PURCHASE_CONTEXT_CHANGED');
    const quote = await api.quote(expected.kind, method, expected.payload);
    if (!owns(version, accountKey)) return;
    if (quote.kind !== expected.kind || quote.paymentMethod !== method || formatAmount(quote.subtotalUsdt) !== formatAmount(expected.amount) || !expected.current()) throw new Error('PURCHASE_CONTEXT_CHANGED');
    state.quote = quote;
  } catch { if (owns(version, accountKey)) state.error = true; }
  finally { if (owns(version, accountKey)) state.loading = false; }
}
async function query() {
  const pending = state.pending;
  if (!pending || state.busy) return;
  const version = requestVersion, accountKey = state.accountKey;
  state.busy = true; state.error = false; state.unavailable = false;
  try {
    const result = pending.intentNo ? await api.get(pending.intentNo) : await api.find(pending.kind, pending.commandKey);
    if (!owns(version, accountKey)) return;
    if (result) accept(result, pending); else state.unavailable = true;
  } catch { if (owns(version, accountKey)) state.error = true; }
  finally { if (owns(version, accountKey)) state.busy = false; }
}
async function submitOriginal() {
  const pending = state.pending;
  if (!pending || state.busy) return;
  const version = requestVersion, accountKey = state.accountKey;
  state.busy = true; state.error = false; state.unavailable = false;
  try {
    const intent = await api.create(pending.paymentQuoteId, pending.commandKey);
    if (owns(version, accountKey)) accept(intent, pending);
  } catch (error) {
    if (owns(version, accountKey)) {
      state.error = true;
      // A definite HTTP/business refusal before an intent exists permits a new review;
      // ambiguous transport outcomes keep the original key and quote for read-only query.
      const cause = asApiError(error);
      const rejectedQuote = cause.kind === 'http' && cause.status === cause.code
        && (cause.status === 409 && ['PURCHASE_PAYMENT_FEE_POLICY_CHANGED', 'PURCHASE_PAYMENT_QUOTE_EXPIRED', 'PURCHASE_PAYMENT_PRICING_CHANGED'].includes(cause.message)
          || cause.status === 503 && cause.message === 'PURCHASE_PAYMENT_FEES_NOT_CONFIGURED');
      if (!pending.intentNo && (rejectedQuote || cause.kind === 'business' && !/UNKNOWN|PROCESSING/.test(cause.message))) {
        let existing: PurchasePaymentIntent | null;
        try { existing = await api.find(pending.kind, pending.commandKey); }
        catch { return; } // Keep the original identity when this recovery read also fails.
        if (!owns(version, accountKey)) return;
        if (existing) accept(existing, pending);
        else { retire(pending, accountKey); state.pending = null; state.quote = null; }
      }
    }
  } finally { if (owns(version, accountKey)) state.busy = false; }
}
async function confirm() {
  if (!context || state.loading || state.busy || state.pending || !context.current() || account() !== state.accountKey) return;
  if (state.method === 'WALLET') { finish({ method: 'WALLET' }); return; }
  const quote = state.quote;
  if (!quote || Date.parse(quote.expiresAt) <= Date.now()) { state.error = true; return; }
  const scope = fingerprint(context);
  const commandKey = context.commandKey?.() ?? acquireAccountCommandKey(KEYS, state.accountKey, scope, 'purchase');
  const original = rows(state.accountKey).records[commandKey];
  if (original) { state.pending = original; await query(); return; }
  const pending = { fingerprint: scope, kind: context.kind, commandKey, paymentQuoteId: quote.paymentQuoteId, summary: context.summary };
  save(pending); state.pending = pending;
  await submitOriginal();
}
export function requestPurchasePayment(value: PurchasePaymentContext): Promise<PurchaseChoice | null> {
  if (state.open) throw new Error('PURCHASE_PAYMENT_ALREADY_OPEN');
  const accountKey = account();
  const existing = Object.values(rows(accountKey).records).find(row => row.fingerprint === fingerprint(value) && row.lastStatus !== 'EXPIRED' && !(row.lastStatus === 'DELIVERED' && row.validated));
  context = value; requestVersion++;
  Object.assign(state, { open: true, accountKey, summary: value.summary, amount: value.amount, method: 'WALLET', quote: null, intent: null, pending: null, loading: false, busy: false, error: false, unavailable: false });
  const result = new Promise<PurchaseChoice | null>(resolve => { resolveChoice = resolve; });
  if (existing) { state.pending = existing; void query(); }
  return result;
}
async function resume(pending: PendingExternal) {
  if (state.open) return;
  requestVersion++; context = null;
  Object.assign(state, { open: true, accountKey: account(), summary: pending.summary, pending, intent: null, quote: null, busy: false, loading: false, error: false, unavailable: false });
  // No active purchase callback after reload. A delivered intent returns to the original order.
  resolveChoice = result => { if (result?.method === 'EXTERNAL' && result.receipt && typeof result.receipt === 'object') {
    acknowledgePurchasePayment(result);
    const orderNo = (result.receipt as { orderNo?: unknown }).orderNo;
    if (typeof orderNo === 'string' && orderNo) void navTo(`/pages/store/order-detail?id=${encodeURIComponent(orderNo)}`);
  } };
  await query();
}
export function usePurchasePayment() {
  return { state, select, confirm, query, submitOriginal, close: () => finish(null),
    pending: () => { state.revision; try { const records = Object.values(rows().records); state.pendingReadError = false; return records.filter(row => row.lastStatus !== 'EXPIRED' && !(row.lastStatus === 'DELIVERED' && row.validated)); } catch { state.pendingReadError = true; return []; } }, resume,
    records: () => { state.revision; try { return Object.values(rows().records); } catch { return []; } },
    viewOrder: () => { const intent = state.intent, pending = state.pending; if (!intent?.receipt || !pending) return; const orderNo = validatePurchasePaymentReceipt(pending.kind, JSON.parse(pending.fingerprint)[1], intent.receipt); finish(null); void navTo(`/pages/store/order-detail?id=${encodeURIComponent(orderNo)}`); },
    openBank: () => state.intent?.paymentUrl ? openHostedPaymentPage(state.intent.paymentUrl) : false,
  };
}
export function acknowledgePurchasePayment(result: Extract<PurchaseChoice, { method: 'EXTERNAL' }>) {
  const pending = rows(result.accountKey).records[result.commandKey];
  if (pending) save({ ...pending, validated: true, businessDelivered: true }, result.accountKey);
}
