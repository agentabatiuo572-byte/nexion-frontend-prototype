// Loopback-only demo state. No SMS, bank transfer or outbound request is made.
// Shapes are checked by the same parsers used by the App. Demo OTP: 123456.
import { randomBytes } from 'node:crypto';
import { secondaryDemo } from './prototype-demo-secondary.mjs';

const DAY = 86400000;
const proof = { source: 'server', sourceEnvironment: 'PRODUCTION', runId: '', serverCanonical: true };
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const snapshot = value => structuredClone(value);
export function bankDemo(url, state, request) {
  const path = url.pathname, method = request.method(), now = Date.now();
  if (!path.startsWith('/api/withdrawals/bank/') && !path.startsWith('/api/payout-addresses')) return undefined;
  const input = () => request.postDataJSON() || {};
  const key = request.headers?.()['idempotency-key'] || request.headers?.()['Idempotency-Key'];
  state.bankDemo ??= { quotes: {}, orders: {}, commands: {} };
  const demo = state.bankDemo;
  const command = (name, action) => {
    if (!key) fail('IDEMPOTENCY_KEY_REQUIRED', 400);
    const id = name + ':' + key, body = JSON.stringify(input());
    if (demo.commands[id]) {
      if (demo.commands[id].body !== body) fail('IDEMPOTENCY_CONFLICT');
      return snapshot(demo.commands[id].result);
    }
    const result = action();
    demo.commands[id] = { body, result: snapshot(result) };
    return result;
  };
  const challenge = type => {
    const challengeNo = type === 'bank' ? 'PAYOUT-BANK-' + randomBytes(16).toString('hex') : 'PAYOUT-' + randomBytes(12).toString('hex').toUpperCase();
    demo[type + 'Otp'] = { challengeNo, expiresAt: now + 300000 };
    return { ...proof, challengeNo, expiresInSeconds: 300, retryAfterSeconds: 60 };
  };
  const validateOtp = type => {
    const challenge = demo[type + 'Otp'];
    if (!challenge || challenge.expiresAt <= now || input().challengeNo !== challenge.challengeNo || input().code !== '123456') fail('OTP_INVALID', 400);
  };
  const config = () => {
    const base = secondaryDemo(new URL('/api/withdrawals/bank/config', url.origin), state, { method: () => 'GET' });
    const active = Object.values(demo.quotes).filter(row => !row.abandoned && !row.order && Date.parse(row.quote.expiresAt) > now);
    const intents = active.map(({ quote }) => ({ state: 'NOT_SUBMITTED', quoteNo: quote.quoteNo, withdrawalNo: null, expiresAt: quote.expiresAt, providerState: null }));
    return { ...base, ...(demo.beneficiary ? { beneficiary: demo.beneficiary } : {}), unresolvedIntent: !intents.length ? null : { state: intents.length > 1 ? 'MULTIPLE' : 'NOT_SUBMITTED', intents, quoteNo: intents.length === 1 ? intents[0].quoteNo : null, withdrawalNo: null } };
  };
  const orderView = row => {
    const settled = state.bankState === 'settled', rejected = state.bankState === 'rejected';
    return { ...snapshot(row), providerState: settled ? 'PAID' : rejected ? 'FAILED' : 'PENDING',
      withdrawal: { ...row.withdrawal, status: settled ? 'CONFIRMED' : rejected ? 'REFUNDED' : 'PROCESSING' },
      settlementEvidence: { status: settled ? 'paid' : rejected ? 'refunded' : 'unconfirmed', evidenceRef: settled || rejected ? 'DEMO-' + row.withdrawalNo : null, providerOrderId: null, providerStatus: null, checkedAt: new Date(now).toISOString(), amountUsdt: row.bank.amountUsdt } };
  };
  if (path === '/api/withdrawals/bank/config' && method === 'GET') return config();
  if (path === '/api/withdrawals/bank/beneficiary/otp' && method === 'POST') return challenge('bank');
  if (path === '/api/withdrawals/bank/beneficiary' && method === 'POST') return command('bind', () => {
    const body = input();
    if (config().beneficiary) validateOtp('bank');
    if (!/^\d{6,32}$/.test(body.account) || !String(body.holder || '').trim() || body.bankCode !== '' || body.accountRoutingConfirmed !== true) fail('BANK_DETAILS_INVALID', 400);
    demo.beneficiary = { bankCode: '', bankName: 'ACCOUNT_ROUTED', bankRoutingVerified: true, maskedAccount: '••••' + body.account.slice(-4), effectiveAt: new Date(now + DAY).toISOString(), nextChangeAt: new Date(now + 30 * DAY).toISOString(), beneficiaryNo: 'DEMO-BANK-2', canWithdraw: false };
    delete demo.bankOtp;
    return { beneficiary: snapshot(demo.beneficiary) };
  });
  if (path === '/api/withdrawals/bank/quotes' && method === 'POST') {
    const bank = config().beneficiary, amountUsdt = Number(input().amountUsdt);
    if (!bank?.canWithdraw || !Number.isFinite(amountUsdt) || amountUsdt < 10 || amountUsdt > 10000) fail('BANK_QUOTE_NOT_AVAILABLE', 400);
    const feeUsdt = Math.round(Math.max(1, Math.min(100, amountUsdt * .01)) * 1e6) / 1e6;
    const netUsdt = Math.round((amountUsdt - feeUsdt) * 1e6) / 1e6;
    const quote = { quoteNo: 'BQ-' + randomBytes(16).toString('hex'), amountUsdt, feeUsdt, netUsdt, rateVnd: 25000, amountVnd: Math.round(netUsdt * 25000), bankCode: bank.bankCode, bankName: bank.bankName, bankRoutingVerified: true, maskedAccount: bank.maskedAccount, expiresAt: new Date(now + 300000).toISOString() };
    demo.quotes[quote.quoteNo] = { quote };
    return snapshot(quote);
  }
  const quoteMatch = path.match(/^\/api\/withdrawals\/bank\/quotes\/(BQ-[a-f0-9]{32})(\/abandon)?$/);
  if (quoteMatch) {
    const row = demo.quotes[quoteMatch[1]];
    if (!row) fail('BANK_QUOTE_NOT_FOUND', 404);
    if (row.order) return orderView(row.order);
    if (quoteMatch[2] && method === 'POST') row.abandoned = true;
    if (row.abandoned) return { state: 'ABANDONED' };
    if (Date.parse(row.quote.expiresAt) <= now) return { state: 'EXPIRED' };
    return { state: 'NOT_SUBMITTED', quote: snapshot(row.quote) };
  }
  if (path === '/api/withdrawals/bank/orders' && method === 'POST') return command('withdraw', () => {
    const row = demo.quotes[input().quoteNo];
    if (!row || row.abandoned || Date.parse(row.quote.expiresAt) <= now) fail('BANK_QUOTE_EXPIRED');
    if (row.order) return orderView(row.order);
    const withdrawalNo = 'WD-DEMO' + (Object.keys(demo.orders).length + 1);
    row.order = { state: 'COMMITTED', withdrawalNo, withdrawal: { withdrawalNo, chain: 'BANK-VND', status: 'PROCESSING' }, providerState: 'PENDING', bank: snapshot(row.quote) };
    demo.orders[withdrawalNo] = row.order;
    return orderView(row.order);
  });
  if (path.startsWith('/api/withdrawals/bank/orders/') && method === 'GET') {
    const row = demo.orders[path.split('/').pop()];
    if (!row) fail('BANK_ORDER_NOT_FOUND', 404);
    return orderView(row);
  }
  if (path === '/api/payout-addresses/otp/send' && method === 'POST') return challenge('address');
  if (path === '/api/payout-addresses' && method === 'PUT') return command('address', () => {
    validateOtp('address');
    const body = input();
    const addressValid = body.network === 'USDT-TRC20'
      ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(body.address)
      : ['USDT-BEP20', 'USDT-ERC20'].includes(body.network) && /^0x[0-9a-fA-F]{40}$/.test(body.address);
    if (!addressValid) fail('PAYOUT_ADDRESS_INVALID', 400);
    demo.address = { ...proof, network: body.network, address: body.address, status: 'ACTIVE', effectiveAt: new Date(now + DAY).toISOString(), createdAt: new Date(now).toISOString(), nextChangeAllowedAt: new Date(now + 7 * DAY).toISOString(), changePending: true };
    delete demo.addressOtp;
    return snapshot(demo.address);
  });
  if (path === '/api/payout-addresses' && method === 'GET' && demo.address) return { ...proof, addresses: [snapshot(demo.address)], serverNowEpochMs: now, changeCooldownDays: 7, effectiveDelayHours: 24, inFlightWithdrawalBlocked: true };
}
