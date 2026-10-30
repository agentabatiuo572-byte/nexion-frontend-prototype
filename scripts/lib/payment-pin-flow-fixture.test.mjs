// Test-only fixture coverage. These assertions do not verify a real payment service.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaymentPinFlowFixture, paymentPinFixtureOtp } from './payment-pin-flow-fixture.mjs';

const base = '/api/app/security/payment-password';
const originalPin = '039417', changedPin = '493017', resetPin = '735190';

function harness(options) {
  const fixture = createPaymentPinFlowFixture(options);
  const send = (path, { method = 'GET', body = {}, key } = {}) => fixture.handle(new URL(path, 'http://127.0.0.1:8338'), {
    method: () => method,
    headers: () => key ? { 'idempotency-key': key } : {},
    postDataJSON: () => body,
  });
  const post = (path, body, key) => send(path, { method: 'POST', body, key });
  const setup = () => post(base + '/setup', { newPassword: originalPin, confirmPassword: originalPin }, 'setup');
  const change = (currentPassword, newPassword, key, expectedCredentialVersion = fixture.state.version) => post(base + '/change', {
    currentPassword, newPassword, confirmPassword: newPassword, expectedCredentialVersion, attemptNo: 'attempt-' + key,
  }, key);
  const challenge = () => post(base + '/reset/challenge', {}).data;
  const verify = challengeNo => post(base + '/reset/verify', { challengeNo, code: paymentPinFixtureOtp });
  const reset = (resetProof, key, newPassword = resetPin, expectedCredentialVersion = fixture.state.version) => post(base + '/reset', {
    resetProof, newPassword, confirmPassword: newPassword, expectedCredentialVersion,
  }, key);
  const order = () => {
    const quote = post('/api/orders/quote', { items: [{ productNo: 'stellarbox-s1', quantity: 2 }] }).data;
    return post('/api/orders/bundle', { promotionQuoteId: quote.quoteId }).data;
  };
  return { ...fixture, send, post, setup, change, challenge, verify, reset, order };
}

test('setup writes once, cannot replace a configured PIN, and its original receipt can be read back', () => {
  const h = harness();
  assert.equal(h.send(base).data.configured, false);
  const result = h.setup();
  assert.equal(result.status, 200);
  assert.equal(result.data.state.credentialVersion, 1);
  assert.deepEqual(h.setup(), result);
  assert.equal(h.state.setupWrites, 1);
  assert.deepEqual(h.send(base + '/commands/setup').data, result.data);
  assert.equal(h.post(base + '/setup', { newPassword: changedPin, confirmPassword: changedPin }, 'overwrite').message, 'PAYMENT_PASSWORD_ALREADY_CONFIGURED');
  assert.equal(h.state.password, originalPin);
  assert.equal(h.state.version, 1);
  assert.equal(h.send(base + '/commands/overwrite').data.status, 'REJECTED');
  assert.deepEqual(h.send(base + '/commands/unknown').data, { commandKey: 'unknown', status: 'NOT_SEEN', canResumeSameKey: false });
});

test('change advances version, rejects the old PIN and stale version, and replays receipts without another write or attempt', () => {
  const h = harness(); h.setup();
  const changed = h.change(originalPin, changedPin, 'change/receipt 1');
  assert.equal(changed.status, 200);
  assert.equal(changed.data.state.credentialVersion, 2);
  assert.equal(h.state.password, changedPin);
  assert.deepEqual(h.send(base + '/commands/' + encodeURIComponent('change/receipt 1')).data, changed.data);
  assert.deepEqual(h.change(originalPin, changedPin, 'change/receipt 1', 1), changed);
  assert.equal(h.state.version, 2);
  const stale = h.change(changedPin, resetPin, 'stale', 1);
  assert.equal(stale.message, 'PAYMENT_PASSWORD_VERSION_CONFLICT');
  assert.equal(h.state.attempts, 5);
  const rejected = h.change(originalPin, resetPin, 'wrong-old');
  assert.equal(rejected.message, 'PAYMENT_PASSWORD_INCORRECT');
  assert.equal(rejected.data.remainingAttempts, 4);
  assert.deepEqual(h.change(originalPin, resetPin, 'wrong-old'), rejected);
  assert.equal(h.state.attempts, 4);
  assert.equal(h.state.version, 2);
  assert.equal(h.state.password, changedPin);
  const receipt = h.send(base + '/commands/wrong-old').data;
  assert.equal(receipt.status, 'REJECTED');
  assert.equal(receipt.message, rejected.message);
  assert.deepEqual(receipt.state, rejected.data);
});

test('payment and change failures share the lock; locked writes stop until a fresh status after expiry', () => {
  let now = Date.parse('2026-10-31T00:00:00Z');
  const h = harness({ now: () => now }); h.setup();
  const order = h.order();
  const pay = paymentPassword => h.post('/api/orders/' + order.orderNo + '/pay', { paymentPassword, credentialVersion: h.state.version, attemptNo: 'payment-attempt' }, 'pay-lock');
  assert.equal(pay(resetPin).data.remainingAttempts, 4);
  for (let i = 0; i < 4; i++) h.change(resetPin, changedPin, 'wrong-' + i);
  const locked = h.send(base).data;
  assert.equal(locked.remainingAttempts, 0);
  assert.equal(Date.parse(locked.lockedUntil) - now, 30000);
  assert.equal(h.change(originalPin, changedPin, 'correct-but-locked').message, 'PAYMENT_PASSWORD_LOCKED');
  assert.equal(pay(originalPin).message, 'PAYMENT_PASSWORD_LOCKED');
  assert.equal(h.state.attempts, 0);
  assert.equal(h.state.payWrites, 0);
  assert.equal(h.state.version, 1);
  now += 30001;
  assert.equal(h.send(base).data.lockedUntil, null);
  assert.equal(h.send(base).data.remainingAttempts, 5);
  assert.equal(h.change(originalPin, changedPin, 'after-expiry').status, 200);
  assert.equal(h.send(base + '/commands/correct-but-locked').data.state.remainingAttempts, 0);
});

test('recovery uses the existing phone and a single-use challenge/proof; reset clears a lock and has a receipt', () => {
  const h = harness(); h.setup();
  for (let i = 0; i < 5; i++) h.change(resetPin, changedPin, 'lock-' + i);
  assert.ok(h.send(base).data.lockedUntil);
  assert.equal(h.post(base + '/reset/challenge', { phone: 'synthetic-new-phone' }).message, 'PAYMENT_PASSWORD_CHALLENGE_INVALID');
  const challenge = h.challenge();
  assert.equal(challenge.phoneMasked, '+86 *** 8001');
  assert.equal(Object.hasOwn(challenge, 'code'), false);
  assert.equal(h.post(base + '/reset/verify', { challengeNo: challenge.challengeNo, code: '999999' }).message, 'PAYMENT_PASSWORD_CODE_INVALID');
  const proof = h.verify(challenge.challengeNo);
  assert.equal(proof.status, 200);
  assert.equal(h.verify(challenge.challengeNo).message, 'PAYMENT_PASSWORD_CHALLENGE_EXPIRED');
  const reset = h.reset(proof.data.resetProof, 'reset');
  assert.equal(reset.status, 200);
  assert.equal(reset.data.state.credentialVersion, 2);
  assert.equal(reset.data.state.remainingAttempts, 5);
  assert.equal(reset.data.state.lockedUntil, null);
  assert.equal(h.state.password, resetPin);
  assert.deepEqual(h.send(base + '/commands/reset').data, reset.data);
  assert.deepEqual(h.reset(proof.data.resetProof, 'reset', resetPin, 1), reset);
  assert.equal(h.reset(proof.data.resetProof, 'reuse-proof', changedPin).message, 'PAYMENT_PASSWORD_PROOF_EXPIRED');
  assert.equal(h.state.version, 2);
  assert.equal(h.change(originalPin, changedPin, 'old-after-reset').message, 'PAYMENT_PASSWORD_INCORRECT');
});

test('expired or superseded recovery evidence never changes the credential', () => {
  let now = Date.parse('2026-10-31T00:00:00Z');
  const h = harness({ now: () => now }); h.setup();
  const expiredChallenge = h.challenge(); now += 600001;
  assert.equal(h.verify(expiredChallenge.challengeNo).message, 'PAYMENT_PASSWORD_CHALLENGE_EXPIRED');
  const proof = h.verify(h.challenge().challengeNo).data; now += 600001;
  assert.equal(h.reset(proof.resetProof, 'expired-proof').message, 'PAYMENT_PASSWORD_PROOF_EXPIRED');
  const supersededProof = h.verify(h.challenge().challengeNo).data;
  assert.equal(h.change(originalPin, changedPin, 'new-version').status, 200);
  assert.equal(h.reset(supersededProof.resetProof, 'superseded-proof').message, 'PAYMENT_PASSWORD_PROOF_EXPIRED');
  assert.equal(h.state.version, 2);
  assert.equal(h.state.password, changedPin);
});

test('invalid setup/change data does not write or increment credential version', () => {
  const h = harness();
  assert.equal(h.post(base + '/setup', { newPassword: originalPin, confirmPassword: changedPin }, 'mismatch').message, 'PAYMENT_PASSWORD_CONFIRM_MISMATCH');
  assert.equal(h.post(base + '/setup', { newPassword: '123456', confirmPassword: '123456' }, 'simple').message, 'PAYMENT_PASSWORD_TOO_SIMPLE');
  assert.equal(h.post(base + '/setup', { newPassword: 493017, confirmPassword: 493017 }, 'numeric').message, 'PAYMENT_PASSWORD_CONFIRM_MISMATCH');
  assert.equal(h.state.version, 0);
  h.setup();
  assert.equal(h.change(originalPin, originalPin, 'same').message, 'PAYMENT_PASSWORD_NEW_MUST_DIFFER');
  assert.equal(h.state.version, 1);
});

test('checkout dropNextPayment still commits exactly one debit, and payment receipts recover the paid order', () => {
  const h = harness(); h.setup();
  const order = h.order(), path = '/api/orders/' + order.orderNo + '/pay';
  assert.equal(order.quantity,2);
  const authorization = { paymentPassword: originalPin, credentialVersion: 1, attemptNo: 'checkout-attempt' };
  h.state.dropNextPayment = true;
  const paid = h.post(path, authorization, 'checkout-payment');
  assert.equal(paid.status, 200);
  assert.equal(paid.drop, true);
  assert.equal(h.state.dropNextPayment, false);
  assert.equal(h.state.payWrites, 1);
  assert.equal(h.state.balance, 7402);
  const receipt = h.send('/api/app/payment-commands/order-pay/checkout-payment').data;
  assert.equal(receipt.status, 'SUCCEEDED');
  assert.equal(receipt.receipt.paymentStatus, 'PAID');
  assert.equal(receipt.receipt.orderNo, order.orderNo);
  assert.equal(h.send('/api/promotion-commands/checkout-payment?operation=order-pay&targetId=' + order.orderNo).data.order.orderNo, order.orderNo);
  assert.equal(h.post(path, authorization, 'checkout-payment').data.paymentStatus, 'PAID');
  assert.equal(h.state.payWrites, 1);
  assert.equal(h.state.balance, 7402);
  assert.equal(h.send('/api/orders').data.orders[0].paymentStatus, 'PAID');
});
