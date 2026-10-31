import { reactive } from 'vue';
import { apiClient } from '@/api/runtime';
import { asApiError } from '@/api/errors';
import { createPurchasePaymentApi, type ExternalPaymentMethod, type PurchaseKind, type PurchaseMethod, type PurchasePaymentIntent, type PurchaseQuote } from '@/api/purchase-payment-api';
import { useApp } from './app';
import { readAccountRow, writeAccountRow, acquireAccountCommandKey, releaseAccountCommandKey } from './account-scoped-storage';
import { clearOrderAction, readOrderAction } from '@/lib/order-command-fence';
import { navTo } from '@/lib/route';
import { formatAmount } from '@/lib/amount-display';
import { validatePurchasePaymentReceipt } from '@/lib/purchase-payment-receipt';
import { purchasePaymentTiming } from '@/lib/purchase-payment-timing';

/** `orderNo`, `deadlineAt` and `image` only feed the payment screens; `reorder` runs after a timed-out order. */
export type PurchasePaymentContext = { kind: PurchaseKind; payload: Record<string, unknown>; amount: number | string; summary: string; current: () => boolean; commandKey?: () => string;
  orderNo?: string; deadlineAt?: number | null; image?: string; reorder?: () => void };
type PendingExternal = { fingerprint: string; kind: PurchaseKind; commandKey: string; paymentQuoteId: string;
  paymentMethod?: PurchaseQuote['paymentMethod']; network?: PurchaseQuote['network'];
  intentNo?: string; summary: string; lastStatus?: string; validated?: boolean; businessDelivered?: boolean };
type PendingRow = { records: Record<string, PendingExternal> };
export type PurchaseChoice = { method: 'WALLET' } | { method: 'EXTERNAL'; receipt: unknown; commandKey: string; accountKey: string };
export type PurchaseStep = 'methods' | 'network' | 'bank';
export type PurchaseNotice = '' | 'reminder' | 'timeShort' | 'timeout' | 'bankFailed' | 'review' | 'late' | 'delivery' | 'leave' | 'changed';
const TABLE = 'uvel-purchase-payment-accounts-v1', KEYS = 'uvel-purchase-payment-keys-accounts-v1';
const POLL_MS = 5000, POLL_BACKOFF = [5000, 10000, 20000, 30000], SHORT_DEADLINE_MS = 5 * 60000;
const REVIEW_REASONS = ['PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_MULTIPLE_ARRIVALS', 'PAYMENT_BEFORE_ALLOCATION', 'PAYMENT_REORG_REVIEW', 'PAYMENT_TIME_UNVERIFIED', 'PAYMENT_REFUNDED_REVIEW'];
const api = createPurchasePaymentApi(apiClient);
const state = reactive({ open: false, accountKey: '', summary: '', amount: '' as string | number, method: 'WALLET' as PurchaseMethod,
  step: 'methods' as PurchaseStep, kind: 'ORDER_PAY' as PurchaseKind, orderNo: '', image: '', deadlineAt: null as number | null,
  policy: null as Partial<Record<ExternalPaymentMethod, boolean>> | null, notice: '' as PurchaseNotice, cashier: false,
  quote: null as PurchaseQuote | null, intent: null as PurchasePaymentIntent | null, pending: null as PendingExternal | null,
  loading: false, retrying: false, busy: false, error: false, unavailable: false, pendingReadError: false, revision: 0 });
let context: PurchasePaymentContext | null = null;
let resolveChoice: ((result: PurchaseChoice | null) => void) | null = null;
let requestVersion = 0, quoteFailures = 0, pollFailures = 0, paused = false, openCashierOnReady = false;
let quoteTimer: ReturnType<typeof setTimeout> | undefined, pollTimer: ReturnType<typeof setTimeout> | undefined;
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
    || pending.paymentMethod !== undefined && intent.paymentMethod !== pending.paymentMethod
    || pending.network !== undefined && intent.network !== pending.network
    || pending.intentNo && intent.intentNo !== pending.intentNo) throw new Error('PURCHASE_PAYMENT_RESPONSE_INVALID');
}
function settled(intent: PurchasePaymentIntent | null) {
  return !!intent && ['EXPIRED', 'MANUAL_REVIEW', 'DELIVERED'].includes(intent.status);
}
function accept(intent: PurchasePaymentIntent, pending: PendingExternal) {
  matches(intent, pending);
  // Legacy recovery rows have only the quote identity; bind their first validated original intent for subsequent reads.
  const known = { ...pending, paymentMethod: intent.paymentMethod, network: intent.network,
    intentNo: intent.intentNo, lastStatus: intent.status, businessDelivered: intent.status === 'DELIVERED' || intent.fulfilmentStatus === 'DELIVERED' };
  save(known); state.pending = known; state.intent = intent; state.method = intent.paymentMethod;
  if (intent.deadlineAt) state.deadlineAt = Date.parse(intent.deadlineAt);
  if (intent.status === 'DELIVERED' || intent.fulfilmentStatus === 'DELIVERED') {
    const payload = JSON.parse(known.fingerprint)[1] as Record<string, unknown>;
    validatePurchasePaymentReceipt(known.kind, payload, intent.receipt, intent);
    if (intent.status === 'DELIVERED') {
      finish({ method: 'EXTERNAL', receipt: intent.receipt, commandKey: known.commandKey, accountKey: state.accountKey });
      return;
    }
  }
  if (!purchasePaymentTiming(intent, Date.now(), state.deadlineAt).canPay) state.cashier = false;
  else if (openCashierOnReady && intent.paymentUrl) { openCashierOnReady = false; state.cashier = true; }
  // A failed bank attempt ends that intent; the backend reports it as EXPIRED with this reason.
  if (intent.status === 'EXPIRED') state.notice = intent.reason === 'PAYMENT_FAILED' ? 'bankFailed' : 'timeout';
  if (intent.status === 'MANUAL_REVIEW') state.notice = intent.reason === 'PAYMENT_LATE_REVIEW' ? 'late' : REVIEW_REASONS.includes(intent.reason ?? '') ? 'review' : 'delivery';
}
function stopTimers() { clearTimeout(quoteTimer); clearTimeout(pollTimer); quoteTimer = pollTimer = undefined; }
function finish(result: PurchaseChoice | null) {
  requestVersion++; stopTimers(); openCashierOnReady = false;
  Object.assign(state, { open: false, loading: false, retrying: false, busy: false, cashier: false, notice: '' });
  const done = resolveChoice; resolveChoice = null; context = null; done?.(result);
}
/** Reads continue on their own: every 5 s while the payment is open, backing off after failures, paused in the background. */
function schedule(version: number, accountKey: string, failed: boolean) {
  pollFailures = failed ? pollFailures + 1 : 0;
  clearTimeout(pollTimer); pollTimer = undefined;
  if (paused || !owns(version, accountKey) || !state.pending || settled(state.intent)) return;
  pollTimer = setTimeout(() => { if (owns(version, accountKey)) void (state.unavailable ? submitOriginal() : query()); },
    failed ? POLL_BACKOFF[Math.min(pollFailures - 1, POLL_BACKOFF.length - 1)]! : POLL_MS);
}
async function loadPolicy() {
  const accountKey = state.accountKey;
  try {
    const policy = await api.policy();
    if (state.open && state.accountKey === accountKey) state.policy = policy;
  } catch { /* Without the policy every channel stays selectable; its quote reports an unconfigured channel. */ }
}
function available(method: PurchaseMethod) { return method === 'WALLET' || !state.policy || state.policy[method] === true; }
async function select(method: PurchaseMethod, step?: PurchaseStep) {
  if (state.busy || state.pending || !context) return;
  if (state.deadlineAt !== null && state.deadlineAt <= Date.now()) { state.notice = 'changed'; return; }
  if (step) state.step = step;
  if (method !== state.method) quoteFailures = 0;
  state.method = method; state.quote = null; state.error = false; state.retrying = false; state.unavailable = false;
  clearTimeout(quoteTimer);
  const version = ++requestVersion, accountKey = state.accountKey, expected = context;
  if (method === 'WALLET' || !available(method)) { state.loading = false; return; }
  state.loading = true;
  try {
    if (!expected.current()) throw new Error('PURCHASE_CONTEXT_CHANGED');
    const quote = await api.quote(expected.kind, method, expected.payload);
    if (!owns(version, accountKey)) return;
    if (quote.kind !== expected.kind || quote.paymentMethod !== method || formatAmount(quote.subtotalUsdt) !== formatAmount(expected.amount) || !expected.current()) throw new Error('PURCHASE_CONTEXT_CHANGED');
    state.quote = quote; quoteFailures = 0;
    if (quote.deadlineAt) state.deadlineAt = Date.parse(quote.deadlineAt);
    // Swap in a fresh quote 30 s before this one lapses.
    // (setTimeout fires at once beyond 2^31-1 ms, so far-off expiries are capped.)
    quoteTimer = setTimeout(() => { if (owns(version, accountKey)) void select(method); }, Math.min(2147483647, Math.max(1000, Date.parse(quote.expiresAt) - Date.now() - 30000)));
  } catch (error) {
    if (!owns(version, accountKey)) return;
    if (error instanceof Error && error.message === 'PURCHASE_CONTEXT_CHANGED') { state.notice = 'changed'; return; }
    const cause = asApiError(error);
    if (cause.status === 503 && cause.message === 'PURCHASE_PAYMENT_FEES_NOT_CONFIGURED') { state.policy = { ...state.policy, [method]: false }; return; }
    state.retrying = true;
    quoteTimer = setTimeout(() => { if (owns(version, accountKey)) void select(method); }, Math.min(30000, 3000 * 2 ** quoteFailures++));
  } finally { if (owns(version, accountKey)) state.loading = false; }
}
function choose(option: 'WALLET' | 'HDPAY_BANK' | 'USDT') {
  if (option === 'WALLET') { state.step = 'methods'; void select('WALLET'); return; }
  if (option === 'HDPAY_BANK') { void select('HDPAY_BANK', 'bank'); return; }
  const network: ExternalPaymentMethod = state.method === 'CREGIS_USDT_ERC20' || !available('CREGIS_USDT_BSC') && available('CREGIS_USDT_ERC20') ? 'CREGIS_USDT_ERC20' : 'CREGIS_USDT_BSC';
  void select(network, 'network');
}
/** 前往付款: a short deadline warns first, then the pre-payment reminder; the intent is created only after the reminder. */
function proceed() {
  if (!state.quote || state.loading || state.busy) return;
  state.notice = state.deadlineAt !== null && state.deadlineAt - Date.now() < SHORT_DEADLINE_MS ? 'timeShort' : 'reminder';
}
async function query() {
  const pending = state.pending;
  if (!pending || state.busy) return;
  const version = requestVersion, accountKey = state.accountKey;
  let failed = false;
  state.busy = true; state.unavailable = false;
  try {
    const result = pending.intentNo ? await api.get(pending.intentNo) : await api.find(pending.kind, pending.commandKey);
    if (!owns(version, accountKey)) return;
    state.error = false;
    if (result) accept(result, pending); else state.unavailable = true;
  } catch { failed = true; if (owns(version, accountKey)) state.error = true; }
  finally { if (owns(version, accountKey)) { state.busy = false; schedule(version, accountKey, failed); } }
}
/** Resubmits the original quote under the original key; the server applies it at most once. */
async function submitOriginal() {
  const pending = state.pending;
  if (!pending || state.busy) return;
  const version = requestVersion, accountKey = state.accountKey;
  let failed = false, requote = false;
  state.busy = true; state.unavailable = false;
  try {
    const intent = await api.create(pending.paymentQuoteId, pending.commandKey);
    if (owns(version, accountKey)) { state.error = false; accept(intent, pending); }
  } catch (error) {
    failed = true;
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
        state.error = false;
        if (existing) accept(existing, pending);
        else { retire(pending, accountKey); state.pending = null; state.quote = null; state.intent = null; requote = true; }
      }
    }
  } finally {
    if (owns(version, accountKey)) { state.busy = false; if (requote) void select(state.method); else schedule(version, accountKey, failed); }
  }
}
async function confirm() {
  if (!context || state.loading || state.busy || state.pending || !context.current() || account() !== state.accountKey) return;
  state.notice = '';
  if (state.method === 'WALLET') { finish({ method: 'WALLET' }); return; }
  const quote = state.quote;
  if (quote?.deadlineAt && Date.parse(quote.deadlineAt) <= Date.now()) { state.notice = 'changed'; return; }
  if (!quote || Date.parse(quote.expiresAt) <= Date.now()) { void select(state.method); return; }
  const scope = fingerprint(context);
  const commandKey = context.commandKey?.() ?? acquireAccountCommandKey(KEYS, state.accountKey, scope, 'purchase');
  openCashierOnReady = quote.paymentMethod === 'HDPAY_BANK';
  clearTimeout(quoteTimer);
  const original = rows(state.accountKey).records[commandKey];
  if (original) { state.pending = original; await query(); return; }
  const pending = { fingerprint: scope, kind: context.kind, commandKey, paymentQuoteId: quote.paymentQuoteId,
    paymentMethod: quote.paymentMethod, network: quote.network, summary: context.summary };
  save(pending); state.pending = pending;
  await submitOriginal();
}
/** After a failed bank attempt: retire that intent and its key, then start a fresh choice.
 *  Only a key this flow can renew (its own, or the order's payment key) continues here; any other
 *  caller-owned key ends the flow so that page starts a new purchase. */
function restart(step: 'bank' | 'methods') {
  const pending = state.pending;
  if (!pending || state.busy || !context) return;
  const orderNo = typeof context.payload.orderNo === 'string' ? context.payload.orderNo : '';
  const orderKey = pending.kind === 'ORDER_PAY' && !!orderNo && readOrderAction(state.accountKey, orderNo)?.key === pending.commandKey;
  retire(pending, state.accountKey);
  if (!orderKey && context.commandKey) { finish(null); return; }
  if (orderKey) clearOrderAction(state.accountKey, orderNo, pending.commandKey, true);
  Object.assign(state, { pending: null, intent: null, quote: null, notice: '', cashier: false });
  if (step === 'bank') void select('HDPAY_BANK', 'bank'); else choose('WALLET');
}
function open(value: Pick<PurchasePaymentContext, 'summary' | 'kind' | 'orderNo' | 'image' | 'deadlineAt'> & { amount?: number | string }, pending: PendingExternal | null) {
  const accountKey = account();
  stopTimers(); requestVersion++; quoteFailures = pollFailures = 0; paused = false; openCashierOnReady = false;
  Object.assign(state, { open: true, accountKey, summary: value.summary, amount: value.amount ?? '', method: 'WALLET', step: 'methods', kind: value.kind,
    orderNo: value.orderNo ?? '', image: value.image ?? '', deadlineAt: value.deadlineAt ?? null, policy: null, notice: '', cashier: false,
    quote: null, intent: null, pending, loading: false, retrying: false, busy: false, error: false, unavailable: false });
}
export function requestPurchasePayment(value: PurchasePaymentContext): Promise<PurchaseChoice | null> {
  if (state.open) throw new Error('PURCHASE_PAYMENT_ALREADY_OPEN');
  const existing = Object.values(rows(account()).records).find(row => row.fingerprint === fingerprint(value) && row.lastStatus !== 'EXPIRED' && !(row.lastStatus === 'DELIVERED' && row.validated));
  context = value;
  open(value, existing ?? null);
  const result = new Promise<PurchaseChoice | null>(resolve => { resolveChoice = resolve; });
  if (existing) void query();
  return result;
}
async function resume(pending: PendingExternal) {
  if (state.open) return;
  context = null;
  const payload = JSON.parse(pending.fingerprint)[1] as Record<string, unknown>;
  open({ summary: pending.summary, kind: pending.kind, orderNo: pending.kind === 'ORDER_PAY' && typeof payload.orderNo === 'string' ? payload.orderNo : undefined }, pending);
  // No active purchase callback after reload. A delivered intent returns to the original order.
  resolveChoice = result => { if (result?.method === 'EXTERNAL' && result.receipt && typeof result.receipt === 'object') {
    acknowledgePurchasePayment(result);
    const orderNo = (result.receipt as { orderNo?: unknown }).orderNo;
    if (typeof orderNo === 'string' && orderNo) void navTo(`/pages/store/order-detail?id=${encodeURIComponent(orderNo)}`);
  } };
  await query();
}
function onOrderPage(orderNo: string) {
  const pages = getCurrentPages(), top = pages[pages.length - 1] as { route?: string; options?: Record<string, string> } | undefined;
  return top?.route === 'pages/store/order-detail' && top.options?.id === orderNo;
}
export function usePurchasePayment() {
  return { state, select, choose, proceed, confirm, query, submitOriginal, restart, loadPolicy, close: () => finish(null),
    back: () => choose('WALLET'), available,
    notify: (notice: PurchaseNotice) => { state.notice = notice; },
    openCashier: () => { if (state.intent?.paymentUrl && purchasePaymentTiming(state.intent, Date.now(), state.deadlineAt).canPay) state.cashier = true; },
    closeCashier: () => { state.cashier = false; paused = false; if (!state.busy) void query(); },
    pause: () => { paused = true; clearTimeout(pollTimer); pollTimer = undefined; },
    wake: () => { paused = false; if (state.open && state.pending && !state.busy && !settled(state.intent)) void (state.unavailable ? submitOriginal() : query()); },
    topup: () => {
      const orderNo = state.orderNo, total = Number(state.amount), deadlineAt = state.deadlineAt, summary = state.summary;
      finish(null);
      const query = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}&amount=${total}&name=${encodeURIComponent(summary)}${deadlineAt ? `&deadline=${deadlineAt}` : ''}` : '';
      void navTo(`/pages/me/wallet-topup${query}`);
    },
    openOrder: () => { const orderNo = state.orderNo; finish(null); if (orderNo && !onOrderPage(orderNo)) void navTo(`/pages/store/order-detail?id=${encodeURIComponent(orderNo)}`); },
    support: () => { finish(null); void navTo('/pages/me/support'); },
    reorder: () => { const again = context?.reorder; finish(null); again?.(); },
    pending: () => { state.revision; try { const records = Object.values(rows().records); state.pendingReadError = false; return records.filter(row => row.lastStatus !== 'EXPIRED' && !(row.lastStatus === 'DELIVERED' && row.validated)); } catch { state.pendingReadError = true; return []; } }, resume,
    records: () => { state.revision; try { return Object.values(rows().records); } catch { return []; } },
    viewOrder: () => { const intent = state.intent, pending = state.pending; if (!intent?.receipt || !pending) return; const orderNo = validatePurchasePaymentReceipt(pending.kind, JSON.parse(pending.fingerprint)[1], intent.receipt); finish(null); void navTo(`/pages/store/order-detail?id=${encodeURIComponent(orderNo)}`); },
  };
}
export function acknowledgePurchasePayment(result: Extract<PurchaseChoice, { method: 'EXTERNAL' }>) {
  const pending = rows(result.accountKey).records[result.commandKey];
  if (pending) save({ ...pending, validated: true, businessDelivered: true }, result.accountKey);
}
/** The order detail asks whether this order already has an external payment underway. */
export function pendingOrderPayment(accountKey: string, orderNo: string): PendingExternal | null {
  try {
    return Object.values(rows(accountKey).records).find(row => row.kind === 'ORDER_PAY' && JSON.parse(row.fingerprint)[1]?.orderNo === orderNo
      && !['EXPIRED', 'DELIVERED', 'MANUAL_REVIEW'].includes(row.lastStatus ?? '') && !row.businessDelivered) ?? null;
  } catch { return null; }
}
