import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, ApiRequest, HttpResponse, HttpTransport } from '@/api/api-client';

const ports = vi.hoisted(() => ({ client: null as ApiClient | null, errors: [] as unknown[], rows: new Map<string, unknown>(), release: vi.fn() }));
vi.mock('@/api/runtime', () => ({ apiClient: { request: async (request: ApiRequest) => {
  try { return await ports.client!.request(request); } catch (error) { ports.errors.push(error); throw error; }
} } }));
vi.mock('./app', () => ({ useApp: () => ({ accountKey: 'user:http-recovery' }) }));
vi.mock('@/lib/route', () => ({ navTo: vi.fn() }));
vi.mock('./account-scoped-storage', () => ({
  readAccountRow: (table: string, account: string) => ports.rows.get(table + account) ?? null,
  writeAccountRow: (table: string, account: string, value: unknown) => { ports.rows.set(table + account, structuredClone(value)); return true; },
  acquireAccountCommandKey: () => 'unexpected-new-key', releaseAccountCommandKey: ports.release,
}));
const methods = ['CREGIS_USDT_BSC', 'CREGIS_USDT_ERC20', 'HDPAY_BANK'] as const;
const response = (status: number, code: number, message: string, data: unknown = null): HttpResponse => ({ status, headers: {}, data: JSON.stringify({ code, message, data }) });
const ok = (data: unknown) => response(200, 0, 'OK', data);
function quote(method: typeof methods[number], version = 1) {
  const bank = method === 'HDPAY_BANK';
  return { paymentQuoteId: `Q-http-${version}`, kind: 'ORDER_PAY', paymentMethod: method, network: bank ? 'VND_BANK' : method === 'CREGIS_USDT_ERC20' ? 'ERC20' : 'BSC',
    subtotalUsdt: '100.00', channelFeeUsdt: version === 1 ? '1.75' : '2.75', networkConfirmFeeUsdt: bank ? '0.00' : '0.25',
    totalUsdt: bank ? version === 1 ? '101.75' : '102.75' : version === 1 ? '102.00' : '103.00', feePolicyVersion: version,
    expiresAt: '2099-01-01T00:00:00Z', fxRateVndPerUsdt: bank ? '25000' : null, amountVnd: bank ? version === 1 ? '2543750' : '2568750' : null };
}
function intent(method: typeof methods[number], version = 1, delivered = false) {
  return { ...quote(method, version), intentNo: 'PI-original-http', commandKey: 'original-business-key', status: delivered ? 'DELIVERED' : 'AWAITING_PAYMENT',
    address: method !== 'HDPAY_BANK' ? '0x' + '1'.repeat(40) : null, paymentUrl: method === 'HDPAY_BANK' ? 'https://api.hdpayadmin.com/pay/original-http' : null,
    reason: '', receipt: delivered ? { orderNo: 'ORD-original', paymentNo: 'PI-original-http', paymentStatus: 'PAID', orderStatus: 'COMPLETED', activationStatus: 'ACTIVATED', canonicalStatus: 'activated',
      amountUsdt: '100.000000', paymentSubtotalUsdt: '100.00', walletDebitUsdt: '0.00', paymentMethod: method, walletBalanceAfterUsdt: null,
      idempotent: false, serverCanonical: true, source: 'server', sourceEnvironment: 'PRODUCTION', runId: '' } : null };
}
async function fixture(responses: Array<HttpResponse | Error>) {
  const { createApiClient } = await import('@/api/api-client');
  const { createSessionVault } = await import('@/api/session-vault');
  const vault = createSessionVault();
  vault.save({ accessToken: 'synthetic-http-session', refreshToken: 'synthetic-refresh', tokenType: 'Bearer',
    user: { userId: 7, countryCode: '+84', phone: '900000007', nickname: 'Synthetic fixture', onboardingComplete: true } });
  const transport = vi.fn<HttpTransport['request']>(async () => {
    const value = responses.shift(); if (!value) throw new Error('Unexpected transport request'); if (value instanceof Error) throw value; return value;
  });
  ports.client = createApiClient({ baseUrl: 'https://fixture.invalid', transport: { request: transport }, vault });
  const store = await import('./purchase-payment'), payment = store.usePurchasePayment();
  const context = { kind: 'ORDER_PAY' as const, payload: { orderNo: 'ORD-original' }, amount: 100, summary: 'Original order', current: () => true, commandKey: () => 'original-business-key' };
  return { ...store, payment, context, transport, responses };
}
beforeEach(() => { vi.resetModules(); ports.client = null; ports.rows.clear(); ports.errors.length = 0; ports.release.mockReset(); });

const refusals = [
  [409, 'PURCHASE_PAYMENT_FEE_POLICY_CHANGED'], [409, 'PURCHASE_PAYMENT_QUOTE_EXPIRED'],
  [409, 'PURCHASE_PAYMENT_PRICING_CHANGED'], [503, 'PURCHASE_PAYMENT_FEES_NOT_CONFIGURED'],
] as const;
describe.each(methods)('%s real HTTP envelope recovery', method => {
  it.each(refusals)('%s/%s permits a fresh quote only after lookup proves no original intent, preserving the business key', async (status, message) => {
    const h = await fixture([ok(quote(method)), response(status, status, message), response(404, 404, 'PURCHASE_PAYMENT_INTENT_NOT_FOUND'), ok(quote(method, 2)), ok(intent(method, 2))]);
    const result = h.requestPurchasePayment(h.context); await h.payment.select(method); await h.payment.confirm();
    expect(ports.errors[0]).toMatchObject({ kind: 'http', status, code: status, message });
    expect(h.transport.mock.calls[2]![0]).toMatchObject({ method: 'GET', url: 'https://fixture.invalid/api/app/purchase-payment-intents?kind=ORDER_PAY&commandKey=original-business-key' });
    expect(h.payment.pending()).toEqual([]); expect(h.payment.state.pending).toBeNull(); expect(h.payment.state.quote).toBeNull();
    expect(ports.release).toHaveBeenCalledWith(expect.any(String), 'user:http-recovery', expect.any(String), 'original-business-key');
    // The refused quote is replaced automatically; no manual re-query.
    await vi.waitFor(() => expect(h.payment.state.quote).toMatchObject({ paymentQuoteId: 'Q-http-2' })); await h.payment.confirm();
    const creates = h.transport.mock.calls.map(([request]) => request).filter(request => request.method === 'POST' && request.url.endsWith('-intents'));
    expect(creates).toHaveLength(2); expect(creates.map(request => request.headers['Idempotency-Key'])).toEqual(['original-business-key', 'original-business-key']);
    expect(creates.map(request => request.body)).toEqual([{ paymentQuoteId: 'Q-http-1' }, { paymentQuoteId: 'Q-http-2' }]);
    expect(h.payment.state.quote).toMatchObject({ paymentQuoteId: 'Q-http-2', feePolicyVersion: 2 });
    expect(h.payment.state.intent).toMatchObject({ paymentQuoteId: 'Q-http-2', channelFeeUsdt: '2.75' });
    h.payment.close(); expect(await result).toBeNull(); expect(h.responses).toEqual([]);
  });

  it('recovers an existing original intent returned by lookup without clearing or creating again', async () => {
    const h = await fixture([ok(quote(method)), response(409, 409, 'PURCHASE_PAYMENT_FEE_POLICY_CHANGED'), ok(intent(method, 1, true))]);
    const result = h.requestPurchasePayment(h.context); await h.payment.select(method); await h.payment.confirm();
    const outcome = await result; expect(outcome).toMatchObject({ method: 'EXTERNAL', commandKey: 'original-business-key', receipt: { orderNo: 'ORD-original' } });
    expect(ports.release).not.toHaveBeenCalled(); expect(h.payment.pending()).toMatchObject([{ intentNo: 'PI-original-http', commandKey: 'original-business-key' }]);
    if (outcome?.method === 'EXTERNAL') h.acknowledgePurchasePayment(outcome);
    expect(h.payment.pending()).toEqual([]); expect(h.transport).toHaveBeenCalledTimes(3); expect(h.responses).toEqual([]);
  });

  it('preserves the original key when the refusal lookup loses its response, then queries it without another create', async () => {
    const h = await fixture([ok(quote(method)), response(409, 409, 'PURCHASE_PAYMENT_FEE_POLICY_CHANGED'), new Error('Synthetic transport loss'), ok(intent(method))]);
    const result = h.requestPurchasePayment(h.context); await h.payment.select(method); await expect(h.payment.confirm()).resolves.toBeUndefined();
    expect(h.payment.state.busy).toBe(false); expect(h.payment.state.error).toBe(true); expect(h.payment.pending()).toMatchObject([{ commandKey: 'original-business-key', paymentQuoteId: 'Q-http-1' }]);
    expect(ports.errors[1]).toMatchObject({ kind: 'network' }); expect(ports.release).not.toHaveBeenCalled();
    await h.payment.query(); expect(h.payment.state.intent?.intentNo).toBe('PI-original-http');
    expect(h.transport.mock.calls[2]![0].url).toBe(h.transport.mock.calls[3]![0].url);
    expect(h.transport.mock.calls.filter(([request]) => request.url.endsWith('-intents') && request.method === 'POST')).toHaveLength(1);
    h.payment.close(); expect(await result).toBeNull(); expect(h.responses).toEqual([]);
  });
});

it.each([
  [409, 409, 'IDEMPOTENCY_KEY_CONFLICT'], [504, 504, 'GATEWAY_TIMEOUT'], [503, 503, 'PROVIDER_CREATE_OUTCOME_UNKNOWN'],
  [409, 422, 'PURCHASE_PAYMENT_FEE_POLICY_CHANGED'], [503, 409, 'PURCHASE_PAYMENT_FEES_NOT_CONFIGURED'],
])('HTTP %s/code%s %s remains fenced without retiring the original key', async (status, code, message) => {
  const h = await fixture([ok(quote('CREGIS_USDT_BSC')), response(status, code, message)]);
  const result = h.requestPurchasePayment(h.context); await h.payment.select('CREGIS_USDT_BSC'); await h.payment.confirm();
  expect(ports.errors[0]).toMatchObject({ kind: 'http', status, code, message });
  expect(h.transport).toHaveBeenCalledTimes(2); expect(ports.release).not.toHaveBeenCalled();
  expect(h.payment.pending()).toMatchObject([{ commandKey: 'original-business-key', paymentQuoteId: 'Q-http-1' }]);
  h.payment.close(); expect(await result).toBeNull(); expect(h.payment.pending()).toHaveLength(1); expect(h.responses).toEqual([]);
});
