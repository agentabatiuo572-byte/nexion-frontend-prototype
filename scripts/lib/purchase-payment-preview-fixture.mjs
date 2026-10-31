// Local preview only: external purchase payments (bank page / USDT address) for the
// design walkthrough. Never imported by src. The bank page URL points at the real
// provider host (the App only frames trusted hosts), so that frame shows the provider's
// reply for an unknown order; no payment is created anywhere.
import {demoFixture} from './prototype-demo-data.mjs';

const base = '/api/app/purchase-payment';
const cents = value => Math.round(Number(value) * 100);
const money = value => (value / 100).toFixed(2);
// Seconds after the intent is created when the scenario moves on.
const ARRIVE_AFTER = 15000, DELIVER_AFTER = 25000;

export function createPurchasePaymentPreviewFixture(state, locale) {
  const quotes = new Map(), intents = new Map();
  let sequence = 0;
  const handles = path => path.startsWith(base);
  const ordersOf = (url, request) => demoFixture(new URL('/api/orders', url.origin), locale(), state, {...request, method: () => 'GET'}).orders;
  function settle(orderNo, status, intent) {
    state.orderStatuses ||= {};
    state.orderStatuses[orderNo] = status;
    const order = state.createdOrders?.find(row => row.orderNo === orderNo);
    if (!order) return;
    if (status === 'activated') Object.assign(order, {canonicalStatus: 'activated', paymentStatus: 'PAID', orderStatus: 'COMPLETED', activationStatus: 'ACTIVATED', paymentMethod: intent.paymentMethod, paymentNo: intent.intentNo, paidAt: Date.now(), activatedAt: Date.now()});
    else Object.assign(order, {canonicalStatus: 'expired', paymentStatus: 'EXPIRED', orderStatus: 'EXPIRED', activationStatus: 'WAITING_PAYMENT', closeReasonCode: 'PAYMENT_TIMEOUT'});
  }
  // The intent advances by elapsed time according to the preview panel's 外部付款结果.
  function advance(intent) {
    const age = Date.now() - intent.createdAt, scenario = state.paymentState ?? 'delivered', bank = intent.paymentMethod === 'HDPAY_BANK';
    if (!['AWAITING_PAYMENT', 'FUNDS_CONFIRMED'].includes(intent.status) || scenario === 'waiting' || scenario === 'urgent') return intent;
    if (age < ARRIVE_AFTER) return intent;
    if (scenario === 'expired') { settle(intent.orderNo, 'expired', intent); return Object.assign(intent, {status: 'EXPIRED', reason: 'PAYMENT_TIMEOUT'}); }
    if (scenario === 'bank-failed' && bank) return Object.assign(intent, {status: 'EXPIRED', reason: 'PAYMENT_FAILED'});
    if (scenario === 'mismatch') return Object.assign(intent, {status: 'MANUAL_REVIEW', reason: 'PAYMENT_AMOUNT_MISMATCH'});
    if (age < DELIVER_AFTER) return Object.assign(intent, {status: 'FUNDS_CONFIRMED'});
    if (scenario === 'delivery-failed') return Object.assign(intent, {status: 'MANUAL_REVIEW', reason: 'PURCHASE_PAYMENT_DELIVERY_BLOCKED'});
    settle(intent.orderNo, 'activated', intent);
    return Object.assign(intent, {status: 'DELIVERED', fulfilmentStatus: 'DELIVERED', receipt: {
      orderNo: intent.orderNo, paymentNo: intent.intentNo, paymentStatus: 'PAID', orderStatus: 'COMPLETED', activationStatus: 'ACTIVATED', canonicalStatus: 'activated',
      amountUsdt: intent.businessAmountUsdt, paymentSubtotalUsdt: intent.subtotalUsdt, walletDebitUsdt: '0.00', paymentMethod: intent.paymentMethod,
      walletBalanceAfterUsdt: null, idempotent: false, serverCanonical: true, source: 'server', sourceEnvironment: 'PRODUCTION', runId: ''}});
  }
  const view = intent => { const {createdAt, orderNo, ...row} = advance(intent); return row; };
  function handle(url, request) {
    const path = url.pathname, method = request.method();
    if (path === `${base}-policy` && method === 'GET') return {status: 200, message: 'OK', data: {version: 3, channels: [
      {paymentMethod: 'HDPAY_BANK', configured: true}, {paymentMethod: 'CREGIS_USDT_BSC', configured: true},
      {paymentMethod: 'CREGIS_USDT_ERC20', configured: state.paymentState !== 'erc20-off'}]}};
    if (path === `${base}-quotes` && method === 'POST') {
      const body = request.postDataJSON(), order = ordersOf(url, request).find(row => row.orderNo === body.payload?.orderNo);
      if (body.kind !== 'ORDER_PAY' || !order) return {status: 409, message: 'PURCHASE_PAYMENT_PRICING_CHANGED', data: null};
      if (body.paymentMethod === 'CREGIS_USDT_ERC20' && state.paymentState === 'erc20-off') return {status: 503, message: 'PURCHASE_PAYMENT_FEES_NOT_CONFIGURED', data: null};
      const bank = body.paymentMethod === 'HDPAY_BANK', erc20 = body.paymentMethod === 'CREGIS_USDT_ERC20';
      const subtotal = cents(order.amountUsdt), channel = Math.round(subtotal * 0.0125) + 50, network = bank ? 0 : erc20 ? 380 : 25;
      const quote = {paymentQuoteId: `PPQ-PREVIEW-${++sequence}`, kind: 'ORDER_PAY', paymentMethod: body.paymentMethod, network: bank ? 'VND_BANK' : erc20 ? 'ERC20' : 'BSC',
        businessAmountUsdt: Number(order.amountUsdt).toFixed(6), roundingAdjustmentUsdt: '0.000000', subtotalUsdt: money(subtotal), channelFeeUsdt: money(channel),
        networkConfirmFeeUsdt: money(network), totalUsdt: money(subtotal + channel + network), feePolicyVersion: 3, expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
        fxRateVndPerUsdt: bank ? '25000.000000' : null, amountVnd: bank ? String((subtotal + channel) * 250) : null};
      quotes.set(quote.paymentQuoteId, {quote, orderNo: order.orderNo, expiresAt: order.expiresAt});
      return {status: 200, message: 'OK', data: quote};
    }
    if (path === `${base}-intents` && method === 'POST') {
      const key = request.headers()['idempotency-key'], source = quotes.get(request.postDataJSON().paymentQuoteId);
      if (!source || !key) return {status: 409, message: 'PURCHASE_PAYMENT_QUOTE_EXPIRED', data: null};
      let intent = [...intents.values()].find(row => row.commandKey === key && row.paymentQuoteId === source.quote.paymentQuoteId);
      if (!intent) {
        const intentNo = `PPI-PREVIEW-${++sequence}`, urgent = state.paymentState === 'urgent';
        // The intent closes with the order (design: one 30-minute deadline).
        const expiresAt = urgent ? Date.now() + 4 * 60000 + 50000 : Number(source.expiresAt) || Date.now() + 15 * 60000;
        intent = {...source.quote, intentNo, commandKey: key, status: 'AWAITING_PAYMENT', reason: '', receipt: null, expiresAt: new Date(expiresAt).toISOString(),
          paymentUrl: source.quote.paymentMethod === 'HDPAY_BANK' ? `https://api.hdpayadmin.com/pay/${intentNo}` : null,
          address: source.quote.paymentMethod === 'HDPAY_BANK' ? null : '0x' + (source.quote.paymentMethod === 'CREGIS_USDT_ERC20' ? '7d3a' : '4b1f') + String(sequence).padStart(36, '0'),
          createdAt: Date.now(), orderNo: source.orderNo};
        intents.set(intentNo, intent);
      }
      return {status: 200, message: 'OK', data: view(intent)};
    }
    if (path === `${base}-intents` && method === 'GET') {
      const intent = [...intents.values()].find(row => row.kind === url.searchParams.get('kind') && row.commandKey === url.searchParams.get('commandKey'));
      return intent ? {status: 200, message: 'OK', data: view(intent)} : {status: 404, message: 'PURCHASE_PAYMENT_INTENT_NOT_FOUND', data: null};
    }
    const one = path.match(/^\/api\/app\/purchase-payment-intents\/([^/]+)$/);
    if (one && method === 'GET') {
      const intent = intents.get(decodeURIComponent(one[1]));
      return intent ? {status: 200, message: 'OK', data: view(intent)} : {status: 404, message: 'PURCHASE_PAYMENT_INTENT_NOT_FOUND', data: null};
    }
    return {status: 404, message: 'PURCHASE_PAYMENT_NOT_MODELED', data: null};
  }
  return {handles, handle};
}
