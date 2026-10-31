// Explicit synthetic transport for the built-App browser test; no provider or production writes.
import assert from 'node:assert/strict';

const PIN = '/api/app/security/payment-password';
const externalBase = '/api/app/purchase-payment';
const money = cents => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
const cents = amount => BigInt(Math.round(Number(amount) * 100));
const ok = data => ({ code: 0, message: 'OK', data });

export function purchasePaymentUiFixture(origin, { balance = 0, pinMode = 'unavailable', dropCreate = false } = {}) {
  const quotes = new Map(), intents = new Map(), paidOrders = new Map();
  const evidence = { pinRequests: [], quotes: [], creates: [], queries: [], walletPayments: [], hosted: [], blockedRemote: [], orderReadbacks: 0, paidOrderReadbacks: [] };
  let sequence = 0, dropNext = dropCreate;
  const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  async function original(orderNo) {
    const response = await fetch(origin + '/__checkout/state');
    const state = await response.json();
    const row = state.orders.find(order => order.orderNo === orderNo);
    assert.ok(row, 'external intent must reference the original synthetic order');
    return structuredClone(row);
  }
  function noPin(body) {
    assert.doesNotMatch(JSON.stringify(body), /paymentPassword|credentialVersion|attemptNo/, 'external request must omit all PIN fields');
  }
  async function install(context) {
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (url.origin !== origin) {
        if (url.hostname === 'api.hdpayadmin.com') {
          evidence.hosted.push(url.pathname);
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Isolated hosted fixture</title><h1>HDPAY isolated hosted fixture</h1><p>No provider request or payment was made.</p>' });
        }
        evidence.blockedRemote.push(url.origin + url.pathname);
        return route.abort('blockedbyclient');
      }
      if (url.pathname.startsWith(PIN)) {
        evidence.pinRequests.push({ method, path: url.pathname });
        if (pinMode === 'unavailable') return json(route, { code: 503, message: 'PAYMENT_PASSWORD_UNAVAILABLE', data: null }, 503);
        return json(route, ok({ configured: true, credentialVersion: 1, lockedUntil: pinMode === 'locked' ? new Date(Date.now() + 900000).toISOString() : null,
          remainingAttempts: pinMode === 'locked' ? 0 : 5, serverTime: new Date().toISOString() }));
      }
      if (method === 'POST' && /\/api\/orders\/[^/]+\/pay$/.test(url.pathname)) {
        evidence.walletPayments.push({ path: url.pathname, key: request.headers()['idempotency-key'] });
        return route.continue();
      }
      if (url.pathname === externalBase + '-quotes') {
        const body = request.postDataJSON(); noPin(body);
        assert.equal(body.kind, 'ORDER_PAY'); assert.ok(['HDPAY_BANK', 'CREGIS_USDT_BSC'].includes(body.paymentMethod));
        const order = await original(body.payload.orderNo), subtotal = cents(order.amountUsdt);
        const channel = (subtotal * 125n + 5000n) / 10000n + 50n, network = body.paymentMethod === 'CREGIS_USDT_BSC' ? 25n : 0n;
        const quote = { paymentQuoteId: `PPQ-FIXTURE-${++sequence}`, kind: body.kind, paymentMethod: body.paymentMethod,
          network: body.paymentMethod === 'CREGIS_USDT_BSC' ? 'BSC' : 'VND_BANK', businessAmountUsdt: Number(order.amountUsdt).toFixed(6),
          roundingAdjustmentUsdt: '0.000000', pricingAsOf: new Date().toISOString(), subtotalUsdt: money(subtotal), channelFeeRatePct: '1.25', channelFeeFixed: '0.50',
          channelFeeUsdt: money(channel), networkConfirmFeeUsdt: money(network), totalUsdt: money(subtotal + channel + network), feePolicyVersion: 7,
          expiresAt: new Date(Date.now() + 900000).toISOString(), fxRateVndPerUsdt: body.paymentMethod === 'HDPAY_BANK' ? '25000.000000' : null,
          amountVnd: body.paymentMethod === 'HDPAY_BANK' ? String((subtotal + channel) * 250n) : null };
        quotes.set(quote.paymentQuoteId, { quote, payload: body.payload, order }); evidence.quotes.push({ body, quote });
        return json(route, ok(quote));
      }
      if (url.pathname === externalBase + '-intents' && method === 'POST') {
        const body = request.postDataJSON(); noPin(body);
        const key = request.headers()['idempotency-key'], source = quotes.get(body.paymentQuoteId);
        assert.ok(source && key, 'create must bind the issued quote and a durable command key');
        evidence.creates.push({ body, key });
        let intent = [...intents.values()].find(row => row.commandKey === key && row.kind === source.quote.kind);
        if (!intent) {
          const intentNo = `PPI-FIXTURE-${++sequence}`;
          intent = { ...source.quote, intentNo, commandKey: key, status: 'AWAITING_PAYMENT', reason: '', receipt: null, fulfilmentStatus: 'NOT_DELIVERED',
            paymentUrl: source.quote.paymentMethod === 'HDPAY_BANK' ? `https://api.hdpayadmin.com/pay/${intentNo}` : null,
            address: source.quote.paymentMethod === 'CREGIS_USDT_BSC' ? '0x' + String(sequence).padStart(40, '1') : null };
          intents.set(intentNo, intent);
        }
        if (dropNext) { dropNext = false; return route.abort('failed'); }
        return json(route, ok(intent));
      }
      if (url.pathname.startsWith(externalBase + '-intents') && method === 'GET') {
        const no = url.pathname.slice((externalBase + '-intents/').length);
        const intent = url.pathname === externalBase + '-intents'
          ? [...intents.values()].find(row => row.kind === url.searchParams.get('kind') && row.commandKey === url.searchParams.get('commandKey'))
          : intents.get(decodeURIComponent(no));
        evidence.queries.push({ path: url.pathname, kind: url.searchParams.get('kind'), key: url.searchParams.get('commandKey') });
        return json(route, intent ? ok(intent) : { code: 404, message: 'PURCHASE_PAYMENT_INTENT_NOT_FOUND', data: null }, intent ? 200 : 404);
      }
      if (url.pathname.startsWith('/api/app/payment-commands/')) {
        const [, , , , kind, key] = url.pathname.split('/');
        const intent = [...intents.values()].find(row => row.commandKey === decodeURIComponent(key));
        if (intent) return json(route, ok({ kind, commandKey: decodeURIComponent(key), status: intent.receipt ? 'SUCCEEDED' : intent.status === 'EXPIRED' ? 'REJECTED' : 'PROCESSING', canResumeSameKey: false,
          ...(intent.receipt ? { receipt: intent.receipt } : {}) }));
      }
      if (url.pathname === '/api/orders' && method === 'GET') {
        const response = await route.fetch(), body = await response.json(); evidence.orderReadbacks++;
        body.data.orders = body.data.orders.map(row => {
          const paid = paidOrders.get(row.orderNo);
          if (paid) evidence.paidOrderReadbacks.push({ orderNo: paid.orderNo, paymentStatus: paid.paymentStatus, canonicalStatus: paid.canonicalStatus });
          return paid ?? row;
        });
        return route.fulfill({ response, json: body });
      }
      if (url.pathname === '/api/devices/earnings') {
        const response = await route.fetch(), body = await response.json(); body.data.walletUsdt = balance;
        return route.fulfill({ response, json: body });
      }
      if (url.pathname === '/auth/users/logout') return json(route, ok({ loggedOut: true }));
      return route.continue();
    });
  }
  function deliver(intentNo) {
    const intent = intents.get(intentNo), source = quotes.get(intent.paymentQuoteId), now = Date.now();
    const order = { ...source.order, paymentStatus: 'PAID', orderStatus: 'COMPLETED', activationStatus: 'ACTIVATED', canonicalStatus: 'activated',
      paymentMethod: intent.paymentMethod, paymentNo: intent.intentNo, paidAt: now, activatedAt: now, targetDeviceId: 90301, targetDeviceInstanceNo: `${source.order.orderNo}-0-0` };
    paidOrders.set(order.orderNo, order);
    intent.status = 'DELIVERED'; intent.fulfilmentStatus = 'DELIVERED';
    intent.receipt = { orderNo: order.orderNo, paymentNo: intent.intentNo, paymentStatus: 'PAID', orderStatus: 'COMPLETED', activationStatus: 'ACTIVATED', canonicalStatus: 'activated',
      amountUsdt: intent.businessAmountUsdt, paymentSubtotalUsdt: intent.subtotalUsdt, walletDebitUsdt: '0.00', paymentMethod: intent.paymentMethod,
      walletBalanceAfterUsdt: null, idempotent: false, serverCanonical: true, source: 'server', sourceEnvironment: 'PRODUCTION', runId: '' };
    return intent.receipt;
  }
  function manualExtra(intentNo) { const intent = intents.get(intentNo); assert.ok(intent.receipt); intent.status = 'MANUAL_REVIEW'; intent.reason = 'EXTRA_ARRIVAL_AFTER_DELIVERY'; }
  return { install, evidence, intents, deliver, manualExtra, balance, pinMode };
}
