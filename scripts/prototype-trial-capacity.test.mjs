import test from 'node:test';
import assert from 'node:assert/strict';
import { demoFixture, demoDefaults } from './lib/prototype-demo-data.mjs';

function order(index, canonicalStatus = 'activated', sku = 'stellarbox-s1', quantity = 1) {
  return { orderNo: 'CAPACITY-' + index, canonicalStatus, lineItems: [{ sku, quantity }] };
}
function scenario(orders = [], extra = {}) {
  const state = { ...structuredClone(demoDefaults), createdOrders: orders, ...extra };
  const call = (path, method = 'GET', key = 'trial-capacity-test', body = {}) => demoFixture(
    new URL(path, 'http://127.0.0.1:59999'), 'zh', state,
    { method: () => method, headers: () => ({ 'idempotency-key': key }), postDataJSON: () => body },
  );
  return { state, call };
}

test('six actual devices reject both trial eligibility and the start command', () => {
  const { state, call } = scenario(Array.from({ length: 4 }, (_, i) => order(i)));
  assert.equal(call('/api/devices/earnings').devices.length, 6);
  for (const path of ['/api/trial/state', '/api/trial/eligibility']) {
    const result = call(path);
    assert.equal(result.canStart, false);
    assert.equal(result.eligibilityReason, 'capacity-full');
  }
  assert.throws(() => call('/api/trial/start', 'POST'), { message: 'TRIAL_CAPACITY_FULL', status: 409 });
  assert.equal(state.trialRow.state, 'ELIGIBLE');
  assert.equal(state.trialCommands, undefined);
});

test('the last free slot can be claimed once and a replay does not create another trial', () => {
  const { state, call } = scenario(Array.from({ length: 3 }, (_, i) => order(i)));
  assert.equal(call('/api/trial/eligibility').canStart, true);
  const first = call('/api/trial/start', 'POST');
  assert.equal(first.state, 'ACTIVE');
  assert.equal(call('/api/devices/earnings').devices.length + 1, 6);
  assert.deepEqual(call('/api/trial/start', 'POST'), first);
  assert.equal(state.trialRow.version, 2);
  assert.equal(call('/api/trial/eligibility').eligibilityReason, 'in-progress');
});

for (const status of ['placed', 'paid', 'provisioning']) {
  test(`${status} physical orders reserve slots before trial activation`, () => {
    const { call } = scenario([order(1, status, 'stellarbox-s1', 4)]);
    assert.equal(call('/api/devices/earnings').devices.length, 2);
    assert.equal(call('/api/trial/eligibility').eligibilityReason, 'capacity-full');
    assert.throws(() => call('/api/trial/start', 'POST'), { message: 'TRIAL_CAPACITY_FULL' });
  });
}

test('fulfilled orders do not count twice and released orders stop reserving capacity', () => {
  const pending = order(4, 'placed');
  const { call } = scenario([...Array.from({ length: 3 }, (_, i) => order(i)), pending]);
  assert.equal(call('/api/trial/eligibility').canStart, false);
  pending.canonicalStatus = 'activated';
  assert.equal(call('/api/devices/earnings').devices.length, 6);
  assert.equal(call('/api/trial/eligibility').canStart, false);
  for (const status of ['inventory', 'cancelled', 'expired', 'payment_failed', 'provisioning_failed', 'refunded']) {
    pending.canonicalStatus = status;
    assert.equal(call('/api/trial/eligibility').canStart, true, status);
  }
});

for (const status of ['activated', 'placed', 'paid', 'provisioning']) {
  test(`${status} Cloud Share counts every purchased share toward physical capacity`, () => {
    const { state, call } = scenario([order(4, status, 'cloud-share', 4)]);
    assert.equal(call('/api/devices/earnings').devices.filter(device => device.productCode === 'CLOUD-SHARE').length,
      status === 'activated' ? 4 : 0);
    assert.equal(call('/api/trial/eligibility').canStart, false);
    assert.throws(() => call('/api/trial/start', 'POST'), { message: 'TRIAL_CAPACITY_FULL', status: 409 });
    assert.equal(state.createdOrders.length, 1);
  });
}

test('a freed device slot is reflected in the next eligibility read', () => {
  const { state, call } = scenario(Array.from({ length: 4 }, (_, i) => order(i)));
  assert.equal(call('/api/trial/eligibility').canStart, false);
  state.retiredDeviceIds = [41];
  assert.equal(call('/api/trial/eligibility').canStart, true);
});

test('repeat-trial eligibility also respects actual capacity, and the forced full scenario remains available', () => {
  const full = scenario(Array.from({ length: 4 }, (_, i) => order(i)), { trialState: 'eligible-again' });
  assert.equal(full.call('/api/trial/eligibility').eligibilityReason, 'capacity-full');
  assert.throws(() => full.call('/api/trial/start', 'POST'), { message: 'TRIAL_CAPACITY_FULL' });
  const forced = scenario([], { trialState: 'capacity-full' });
  assert.equal(forced.call('/api/trial/eligibility').eligibilityReason, 'capacity-full');
});

test('a previously active over-capacity trial is preserved rather than silently removed', () => {
  const { state, call } = scenario(Array.from({ length: 4 }, (_, i) => order(i)), { trialState: 'active' });
  assert.equal(call('/api/trial/state').state, 'ACTIVE');
  assert.equal(state.trialRow.state, 'ACTIVE');
  assert.equal(call('/api/devices/earnings').devices.length, 6);
});

test('claiming the last slot also blocks a subsequent physical order without consuming a voucher', () => {
  const { state, call } = scenario(Array.from({ length: 3 }, (_, i) => order(i)), { voucherClaimed: true });
  call('/api/trial/start', 'POST');
  assert.throws(() => call('/api/orders', 'POST', 'new-order', { productNo: 'stellarbox-s1', quantity: 1, voucherId: 'V-DESIGN' }),
    { message: 'PROMOTION_CAPACITY_UNAVAILABLE', status: 409 });
  assert.equal(state.createdOrders.length, 3);
  assert.equal(state.voucherUsed, undefined);
  assert.equal(state.walletBalance, undefined);
  assert.equal(state.commands, undefined);
});

test('a reserved order can pay in the last slot without counting its own reservation twice', () => {
  const { call, state } = scenario(Array.from({ length: 3 }, (_, i) => order(i)));
  const created = call('/api/orders', 'POST', 'new-order', { productNo: 'stellarbox-s1', quantity: 1 });
  assert.equal(call('/api/trial/eligibility').canStart, false);
  const paid = call(`/api/orders/${created.orderNo}/pay`, 'POST', 'pay-order');
  assert.equal(paid.paymentStatus, 'PAID');
  assert.equal(call('/api/devices/earnings').devices.length, 6);
  assert.deepEqual(call(`/api/orders/${created.orderNo}/pay`, 'POST', 'pay-order'), paid);
  assert.equal(state.walletBalance, 52800.64 - 1299);
});

test('an old overbooked order cannot pay or change wallet and order state', () => {
  const pending = { ...order(4, 'placed'), orderNo: 'DEMO-ORDER-99', paymentStatus: 'PENDING', amountUsdt: 1299 };
  const { call, state } = scenario([...Array.from({ length: 3 }, (_, i) => order(i)), pending], { trialState: 'active', walletBalance: 10000 });
  assert.throws(() => call('/api/orders/DEMO-ORDER-99/pay', 'POST', 'pay-order'),
    { message: 'PROMOTION_CAPACITY_UNAVAILABLE', status: 409 });
  assert.equal(state.walletBalance, 10000);
  assert.equal(pending.canonicalStatus, 'placed');
  assert.equal(pending.paymentStatus, 'PENDING');
  assert.equal(state.commands, undefined);
});

test('bundle quantities and the grace trial slot are included in order capacity', () => {
  const { call, state } = scenario([order(1)], { trialState: 'grace' });
  assert.throws(() => call('/api/orders/bundle', 'POST', 'large-bundle', { items: [{ productNo: 'stellarbox-s1', quantity: 1 }, { productNo: 'cloud-share', quantity: 2 }] }),
    { message: 'PROMOTION_CAPACITY_UNAVAILABLE' });
  const created = call('/api/orders/bundle', 'POST', 'fitting-bundle', { items: [{ productNo: 'stellarbox-s1', quantity: 1 }, { productNo: 'cloud-share', quantity: 1 }] });
  assert.ok(created.orderNo);
  assert.equal(state.createdOrders.length, 2);
});

test('a full fleet rejects Cloud Share without consuming a voucher or wallet balance', () => {
  const { call, state } = scenario(Array.from({ length: 3 }, (_, i) => order(i)), { trialState: 'active', voucherClaimed: true });
  assert.throws(() => call('/api/orders', 'POST', 'share-order', { productNo: 'cloud-share', quantity: 1, voucherId: 'V-DESIGN' }),
    { message: 'PROMOTION_CAPACITY_UNAVAILABLE', status: 409 });
  assert.equal(state.voucherUsed, undefined);
  assert.equal(state.walletBalance, undefined);
  assert.equal(state.createdOrders.length, 3);
});

test('Cloud Share reserves the last slot once and payment replaces its own reservation', () => {
  const { call, state } = scenario(Array.from({ length: 3 }, (_, i) => order(i)));
  assert.throws(() => call('/api/orders', 'POST', 'too-many-shares', { productNo: 'cloud-share', quantity: 2 }),
    { message: 'PROMOTION_CAPACITY_UNAVAILABLE' });
  const created = call('/api/orders', 'POST', 'share-order', { productNo: 'cloud-share', quantity: 1 });
  assert.throws(() => call('/api/trial/start', 'POST', 'blocked-trial'), { message: 'TRIAL_CAPACITY_FULL' });
  const paid = call(`/api/orders/${created.orderNo}/pay`, 'POST', 'share-payment');
  assert.equal(paid.paymentStatus, 'PAID');
  assert.equal(call('/api/devices/earnings').devices.length, 6);
  assert.deepEqual(call(`/api/orders/${created.orderNo}/pay`, 'POST', 'share-payment'), paid);
  assert.equal(state.walletBalance, 52800.64 - 19.9);
});

test('cancelling a pending order releases its reservation for a trial', () => {
  const { call } = scenario(Array.from({ length: 3 }, (_, i) => order(i)));
  const created = call('/api/orders', 'POST', 'new-order', { productNo: 'stellarbox-s1', quantity: 1 });
  assert.equal(call('/api/trial/eligibility').canStart, false);
  call(`/api/orders/${created.orderNo}/cancel`, 'POST', 'cancel-order');
  assert.equal(call('/api/trial/start', 'POST').state, 'ACTIVE');
});

test('a full-capacity quote blocks confirmation with localized guidance before an order is submitted', () => {
  const { call, state } = scenario(Array.from({ length: 3 }, (_, i) => order(i)), { trialState: 'active' });
  const full = call('/api/orders/quote', 'POST', 'full-quote', { items: [{ productNo: 'stellarbox-s1', quantity: 1 }] });
  assert.equal(full.eligibility, 'INELIGIBLE');
  assert.ok(['zh', 'en', 'vi'].every(locale => full.warnings[0][locale].length > 0));
  const share = call('/api/orders/quote', 'POST', 'share-quote', { items: [{ productNo: 'cloud-share', quantity: 3 }] });
  assert.equal(share.eligibility, 'INELIGIBLE');
  assert.equal(state.createdOrders.length, 3);
});

test('a cancelled or expired trial releases capacity for an ordinary purchase', () => {
  for (const end of ['cancel', 'expire']) {
    const { call, state } = scenario(Array.from({ length: 3 }, (_, i) => order(i)), { trialState: 'active' });
    assert.equal(call('/api/trial/state').state, 'ACTIVE');
    if (end === 'cancel') call('/api/trial/cancel', 'POST', 'cancel-trial');
    else state.trialRow.startedAt = Date.now() - 30 * 86400000;
    const created = call('/api/orders', 'POST', 'new-order', { productNo: 'stellarbox-s1', quantity: 1 });
    assert.ok(created.orderNo);
    assert.ok(['CANCELLED', 'FAILED'].includes(state.trialRow.state));
  }
});
