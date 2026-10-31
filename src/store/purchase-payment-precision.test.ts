import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paidOrderReceipt } from '@/api/order-api';

const ports = vi.hoisted(() => ({ request: vi.fn(), rows: new Map<string, unknown>() }));
vi.mock('@/api/runtime', () => ({ apiClient: { request: ports.request } }));
vi.mock('./app', () => ({ useApp: () => ({ accountKey: 'user:precision' }) }));
vi.mock('@/lib/route', () => ({ navTo: vi.fn() }));
vi.mock('./account-scoped-storage', () => ({
  readAccountRow: (table: string, account: string) => ports.rows.get(table + account) ?? null,
  writeAccountRow: (table: string, account: string, value: unknown) => { ports.rows.set(table + account, structuredClone(value)); return true; },
  acquireAccountCommandKey: () => 'original-precision-key', releaseAccountCommandKey: vi.fn(),
}));
const methods = ['CREGIS_USDT_BSC', 'CREGIS_USDT_ERC20', 'HDPAY_BANK'] as const;
function fixture(method: typeof methods[number], amount: string, charged: string) {
  const bank = method === 'HDPAY_BANK', total = (Number(charged) + (bank ? 1.75 : 2)).toFixed(2);
  const quote = { paymentQuoteId: 'Q-precision', kind: 'ORDER_PAY', paymentMethod: method, network: bank ? 'VND_BANK' : method === 'CREGIS_USDT_ERC20' ? 'ERC20' : 'BSC',
    businessAmountUsdt: amount, roundingAdjustmentUsdt: (Number(charged) - Number(amount)).toFixed(6), subtotalUsdt: charged,
    channelFeeUsdt: '1.75', networkConfirmFeeUsdt: bank ? '0.00' : '0.25', totalUsdt: total, feePolicyVersion: 1,
    expiresAt: '2099-01-01T00:00:00Z', fxRateVndPerUsdt: bank ? '25000' : null, amountVnd: bank ? String(Math.round(Number(total) * 25000)) : null };
  const receipt = { orderNo: 'ORD-precision', paymentNo: 'PAY-precision', paymentStatus: 'PAID', orderStatus: 'COMPLETED', activationStatus: 'ACTIVATED',
    canonicalStatus: 'activated', amountUsdt: amount, paymentSubtotalUsdt: charged, walletDebitUsdt: '0.00', paymentMethod: method,
    walletBalanceAfterUsdt: null, idempotent: false, serverCanonical: true, source: 'server', sourceEnvironment: 'PRODUCTION', runId: '' };
  const intent = { ...quote, intentNo: 'PI-precision', commandKey: 'original-precision-key', status: 'DELIVERED', fulfilmentStatus: 'DELIVERED',
    address: bank ? null : '0x' + '1'.repeat(40), paymentUrl: bank ? 'https://api.hdpayadmin.com/pay/precision' : null, reason: '', receipt };
  const context = { kind: 'ORDER_PAY' as const, payload: { orderNo: 'ORD-precision' }, amount, summary: 'Precision fixture', current: () => true, commandKey: () => 'original-precision-key' };
  return { quote, receipt, intent, context };
}
beforeEach(() => { vi.resetModules(); ports.request.mockReset(); ports.rows.clear(); });

describe.each(methods)('%s six-place business receipt and charged cents', method => {
  it.each([['19.995000', '20.00'], ['80.008000', '80.01']])('accepts raw %s charged %s only after original receipt validation', async (amount, charged) => {
    const { requestPurchasePayment, usePurchasePayment, acknowledgePurchasePayment } = await import('./purchase-payment');
    const f = fixture(method, amount, charged); ports.request.mockResolvedValueOnce(f.quote).mockResolvedValueOnce(f.intent);
    const result = requestPurchasePayment(f.context), payment = usePurchasePayment();
    await payment.select(method); expect(payment.state.error).toBe(false); await payment.confirm();
    const outcome = await result;
    expect(outcome).toMatchObject({ method: 'EXTERNAL', commandKey: 'original-precision-key', receipt: { amountUsdt: amount, paymentSubtotalUsdt: charged, walletDebitUsdt: '0.00' } });
    if (outcome?.method === 'EXTERNAL') expect(paidOrderReceipt(outcome.receipt).amountUsdt).toBe(Number(amount));
    expect(payment.pending()).toMatchObject([{ commandKey: 'original-precision-key', intentNo: 'PI-precision' }]);
    if (outcome?.method === 'EXTERNAL') acknowledgePurchasePayment(outcome);
    expect(payment.pending()).toEqual([]);
    expect(ports.request.mock.calls.map(([request]) => request.body)).toEqual([{ kind: 'ORDER_PAY', paymentMethod: method, payload: { orderNo: 'ORD-precision' } }, { paymentQuoteId: 'Q-precision' }]);
  });

  it.each(['malformed', 'different-order', 'charged-mismatch', 'excess-business-precision'])('retains original recovery identity after %s receipt and recovers without another create', async invalid => {
    const { requestPurchasePayment, usePurchasePayment, acknowledgePurchasePayment } = await import('./purchase-payment');
    const f = fixture(method, '80.008000', '80.01');
    const bad = invalid === 'malformed' ? {} : { ...f.receipt, ...(invalid === 'different-order' ? { orderNo: 'OTHER' } : invalid === 'charged-mismatch' ? { paymentSubtotalUsdt: '80.00' } : { amountUsdt: '80.0080001' }) };
    ports.request.mockResolvedValueOnce(f.quote).mockResolvedValueOnce({ ...f.intent, receipt: bad }).mockResolvedValueOnce(f.intent);
    const first = requestPurchasePayment(f.context), payment = usePurchasePayment(); await payment.select(method); await payment.confirm();
    expect(payment.state.open).toBe(true); expect(payment.state.error).toBe(true);
    expect(payment.pending()).toMatchObject([{ commandKey: 'original-precision-key', intentNo: 'PI-precision', paymentQuoteId: 'Q-precision' }]);
    payment.close(); expect(await first).toBeNull();
    const recovered = await requestPurchasePayment(f.context); expect(recovered).toMatchObject({ method: 'EXTERNAL', commandKey: 'original-precision-key' });
    if (recovered?.method === 'EXTERNAL') acknowledgePurchasePayment(recovered);
    expect(payment.pending()).toEqual([]);
    expect(ports.request.mock.calls.filter(([request]) => request.method === 'POST' && request.path.endsWith('-intents'))).toHaveLength(1);
    expect(ports.request.mock.calls.at(-1)?.[0].path).toBe('/api/app/purchase-payment-intents/PI-precision');
    expect(ports.request.mock.calls.some(([request]) => request.path.includes('payment-password'))).toBe(false);
  });
});

it('keeps the original identity when create is rejected and its follow-up lookup fails, then queries without another create', async () => {
  const { requestPurchasePayment, usePurchasePayment, acknowledgePurchasePayment } = await import('./purchase-payment');
  const { ApiError } = await import('@/api/errors');
  const f = fixture('CREGIS_USDT_BSC', '19.995000', '20.00');
  ports.request.mockResolvedValueOnce(f.quote)
    .mockRejectedValueOnce(new ApiError({ kind: 'business', message: 'PURCHASE_STOCK_UNAVAILABLE' }))
    .mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'LOOKUP_UNAVAILABLE' }))
    .mockResolvedValueOnce(f.intent);
  const result = requestPurchasePayment(f.context), payment = usePurchasePayment(); await payment.select('CREGIS_USDT_BSC');
  await expect(payment.confirm()).resolves.toBeUndefined();
  expect(payment.state.open).toBe(true); expect(payment.state.error).toBe(true);
  expect(payment.pending()).toMatchObject([{ commandKey: 'original-precision-key', paymentQuoteId: 'Q-precision' }]);
  await payment.query(); const recovered = await result;
  expect(recovered).toMatchObject({ method: 'EXTERNAL', commandKey: 'original-precision-key', receipt: { amountUsdt: '19.995000', paymentSubtotalUsdt: '20.00' } });
  if (recovered?.method === 'EXTERNAL') acknowledgePurchasePayment(recovered);
  expect(payment.pending()).toEqual([]);
  expect(ports.request.mock.calls.filter(([request]) => request.method === 'POST' && request.path.endsWith('-intents'))).toHaveLength(1);
  const lookups = ports.request.mock.calls.filter(([request]) => !request.method || request.method === 'GET');
  expect(lookups).toHaveLength(2); expect(lookups[0]![0].path).toBe(lookups[1]![0].path);
  expect(lookups[0]![0].path).toContain('commandKey=original-precision-key');
});
