import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
const ports = vi.hoisted(() => ({ request: vi.fn(), account: 'user:1', rows: new Map<string, unknown>(), nav: vi.fn() }));
vi.mock('@/api/runtime', () => ({ apiClient: { request: ports.request } }));
vi.mock('./app', () => ({ useApp: () => ({ accountKey: ports.account }) }));
vi.mock('@/lib/route', () => ({ navTo: ports.nav }));
vi.mock('./account-scoped-storage', () => ({
  readAccountRow: (table: string, account: string) => ports.rows.get(table + account) ?? null,
  writeAccountRow: (table: string, account: string, value: unknown) => { ports.rows.set(table + account, structuredClone(value)); return true; },
  acquireAccountCommandKey: () => 'synthetic-original-key', releaseAccountCommandKey: vi.fn(),
}));
const quote = { paymentQuoteId: 'Q-1', kind: 'ORDER_PAY', paymentMethod: 'CREGIS_USDT_BSC', network: 'BSC', subtotalUsdt: '100.00', channelFeeUsdt: '1.75', networkConfirmFeeUsdt: '0.25', totalUsdt: '102.00', feePolicyVersion: 1, expiresAt: '2099-01-01T00:00:00Z', fxRateVndPerUsdt: null, amountVnd: null };
const intent = { ...quote, intentNo: 'PI-1', commandKey: 'business-original-key', status: 'AWAITING_PAYMENT', address: '0x' + '1'.repeat(40), paymentUrl: null, reason: '', receipt: null };
const receipt = { orderNo: 'ORD-1', paymentNo: 'PAY-1', paymentStatus: 'PAID', orderStatus: 'COMPLETED', activationStatus: 'ACTIVATED', canonicalStatus: 'activated', amountUsdt: '100.000000', paymentSubtotalUsdt: '100.00', paymentMethod: 'CREGIS_USDT_BSC', walletBalanceAfterUsdt: null, idempotent: false, serverCanonical: true, source: 'server', sourceEnvironment: 'PRODUCTION', runId: '' };
const context = () => ({ kind: 'ORDER_PAY' as const, payload: { orderNo: 'ORD-1' }, amount: 100, summary: 'Synthetic device', current: () => true, commandKey: () => 'business-original-key' });
beforeEach(() => { vi.resetModules(); ports.request.mockReset(); ports.rows.clear(); ports.account = 'user:1'; ports.nav.mockReset(); });
describe('durable external payment orchestration', () => {
  it('shows a bank refund review after delivery for both the active flow and original-intent recovery', async () => {
    const frozen = { ...quote, paymentMethod: 'HDPAY_BANK', network: 'VND_BANK', networkConfirmFeeUsdt: '0.00',
      totalUsdt: '101.75', amountVnd: '2543750', fxRateVndPerUsdt: '25000' };
    const original = { ...intent, ...frozen, address: null, paymentUrl: 'https://api.hdpayadmin.com/pay/original' };
    const reviewed = { ...original, status: 'MANUAL_REVIEW', reason: 'PAYMENT_REFUNDED_REVIEW', fulfilmentStatus: 'DELIVERED',
      receipt: { ...receipt, paymentMethod: 'HDPAY_BANK' } };
    const { requestPurchasePayment, usePurchasePayment } = await import('./purchase-payment');
    const payment = usePurchasePayment();
    ports.request.mockResolvedValueOnce(frozen).mockResolvedValueOnce(original).mockResolvedValueOnce(reviewed);
    let resolved = false;
    const choice = requestPurchasePayment(context());
    void choice.then(() => { resolved = true; });
    await payment.select('HDPAY_BANK'); await payment.confirm(); await payment.query();
    expect(payment.state.notice).toBe('review');
    expect(payment.state.open).toBe(true);
    expect(payment.state.pending?.businessDelivered).toBe(true);
    expect(resolved).toBe(false);
    const saved = payment.state.pending!;
    payment.close(); expect(await choice).toBeNull();
    ports.request.mockResolvedValueOnce(reviewed);
    await payment.resume(saved);
    expect(payment.state.notice).toBe('review');
    expect(payment.state.open).toBe(true);
    expect(payment.state.intent?.fulfilmentStatus).toBe('DELIVERED');
    expect(ports.request.mock.calls.filter(([request]) => request.method === 'POST' && request.path.endsWith('-intents'))).toHaveLength(1);
    payment.close();
  });
  it('reloads an HDPAY intent with its original FX/raw amount/rounding without a quote or a second POST', async () => {
    const frozen = { ...quote, paymentMethod: 'HDPAY_BANK', network: 'VND_BANK', networkConfirmFeeUsdt: '0.00', totalUsdt: '101.75',
      fxRateVndPerUsdt: '25000.123456', amountVnd: '2543763', businessAmountUsdt: '99.995000', roundingAdjustmentUsdt: '0.005000' };
    const original = { ...intent, ...frozen, address: null, paymentUrl: 'https://api.hdpayadmin.com/pay/original' };
    const first = await import('./purchase-payment'), payment = first.usePurchasePayment();
    ports.request.mockResolvedValueOnce(frozen).mockResolvedValueOnce(original);
    const choice = first.requestPurchasePayment({ ...context(), amount: '99.995000' });
    await payment.select('HDPAY_BANK'); await payment.confirm();
    const pending = payment.pending()[0]!; payment.close(); expect(await choice).toBeNull();
    vi.resetModules(); ports.request.mockReset().mockResolvedValueOnce(original);
    const restored = (await import('./purchase-payment')).usePurchasePayment();
    await restored.resume(pending);
    expect(restored.state.quote).toBeNull();
    expect(restored.state.intent).toMatchObject({ intentNo: 'PI-1', commandKey: 'business-original-key', fxRateVndPerUsdt: '25000.123456',
      amountVnd: '2543763', businessAmountUsdt: '99.995000', roundingAdjustmentUsdt: '0.005000' });
    expect(ports.request).toHaveBeenCalledExactlyOnceWith({ path: '/api/app/purchase-payment-intents/PI-1' });
    restored.close();
  });
  it('selecting and confirming wallet never reads the external API or a PIN state', async () => {
    const { requestPurchasePayment, usePurchasePayment } = await import('./purchase-payment');
    const choice = requestPurchasePayment(context()); await usePurchasePayment().confirm();
    expect(await choice).toEqual({ method: 'WALLET' }); expect(ports.request).not.toHaveBeenCalled();
  });
  it('persists the original business key before creating and resolves only after confirmed delivery', async () => {
    const { requestPurchasePayment, usePurchasePayment, acknowledgePurchasePayment } = await import('./purchase-payment');
    ports.request.mockResolvedValueOnce(quote).mockImplementationOnce(async request => {
      expect(usePurchasePayment().pending()).toMatchObject([{ commandKey: 'business-original-key', paymentQuoteId: 'Q-1' }]);
      expect(request.body).toEqual({ paymentQuoteId: 'Q-1' }); return intent;
    }).mockResolvedValueOnce({ ...intent, status: 'DELIVERED', receipt });
    const choice = requestPurchasePayment(context()), payment = usePurchasePayment();
    await payment.select('CREGIS_USDT_BSC'); await payment.confirm();
    expect(payment.state.open).toBe(true); expect(payment.state.intent?.status).toBe('AWAITING_PAYMENT');
    await payment.query(); const outcome = await choice; expect(outcome).toMatchObject({ method: 'EXTERNAL', receipt });
    expect(payment.pending()).toHaveLength(1); // Retained until the caller's own receipt validation succeeds.
    if (outcome?.method === 'EXTERNAL') acknowledgePurchasePayment(outcome);
    expect(payment.pending()).toEqual([]); expect(ports.request.mock.calls.filter(([request]) => request.method === 'POST' && request.path.endsWith('-intents'))).toHaveLength(1);
    expect(JSON.stringify(ports.rows)).not.toMatch(/paymentPassword|credentialVersion|attemptNo/);
  });
  it('a lost create response survives close/reopen and lookup without another collection', async () => {
    const { requestPurchasePayment, usePurchasePayment } = await import('./purchase-payment');
    ports.request.mockResolvedValueOnce(quote).mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'LOST_RESPONSE' }))
      .mockResolvedValueOnce(intent);
    const first = requestPurchasePayment(context()), payment = usePurchasePayment();
    await payment.select('CREGIS_USDT_BSC'); await payment.confirm();
    expect(payment.state.pending?.commandKey).toBe('business-original-key'); payment.close(); expect(await first).toBeNull();
    const second = requestPurchasePayment(context());
    await vi.waitFor(() => expect(payment.state.intent?.intentNo).toBe('PI-1'));
    expect(ports.request.mock.calls.filter(([request]) => request.method === 'POST' && request.path.endsWith('-intents'))).toHaveLength(1);
    expect(ports.request.mock.calls.at(-1)?.[0].path).toContain('commandKey=business-original-key');
    payment.close(); expect(await second).toBeNull();
  });
  it('a late response cannot populate another account after leaving the payment', async () => {
    const { requestPurchasePayment, usePurchasePayment } = await import('./purchase-payment');
    let complete!: (value: unknown) => void;
    ports.request.mockResolvedValueOnce(quote).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const choice = requestPurchasePayment(context()), payment = usePurchasePayment(); await payment.select('CREGIS_USDT_BSC');
    const creating = payment.confirm(); ports.account = 'user:2'; payment.close(); complete(intent); await creating;
    expect(await choice).toBeNull(); expect(payment.pending()).toEqual([]);
    ports.account = 'user:1'; expect(payment.pending()).toMatchObject([{ commandKey: 'business-original-key' }]);
  });
  it('rejects a receipt from a different original command without clearing the pending record', async () => {
    const { requestPurchasePayment, usePurchasePayment } = await import('./purchase-payment');
    ports.request.mockResolvedValueOnce(quote).mockResolvedValueOnce({ ...intent, commandKey: 'other-key', status: 'DELIVERED', receipt: { orderNo: 'OTHER' } });
    const choice = requestPurchasePayment(context()), payment = usePurchasePayment(); await payment.select('CREGIS_USDT_BSC'); await payment.confirm();
    expect(payment.state.error).toBe(true); expect(payment.pending()).toHaveLength(1); payment.close(); expect(await choice).toBeNull();
  });
  it('keeps a delivered malformed receipt recoverable and does not resolve a purchase', async () => {
    const { requestPurchasePayment, usePurchasePayment } = await import('./purchase-payment');
    ports.request.mockResolvedValueOnce(quote).mockResolvedValueOnce({ ...intent, status: 'DELIVERED', receipt: {} });
    const choice = requestPurchasePayment(context()), payment = usePurchasePayment(); await payment.select('CREGIS_USDT_BSC'); await payment.confirm();
    expect(payment.state.open).toBe(true); expect(payment.state.error).toBe(true); expect(payment.pending()).toMatchObject([{ intentNo: 'PI-1', commandKey: 'business-original-key' }]);
    payment.close(); expect(await choice).toBeNull();
  });
  it('binds rounded external cents without modifying six-place business payloads', async () => {
    const { requestPurchasePayment, usePurchasePayment } = await import('./purchase-payment');
    ports.request.mockResolvedValueOnce({ ...quote, subtotalUsdt: '20.00', totalUsdt: '22.00' });
    const payload = { orderNo: 'ORD-1', expectedPayableUsdt: 19.995 }, choice = requestPurchasePayment({ ...context(), amount: 19.995, payload });
    const payment = usePurchasePayment(); await payment.select('CREGIS_USDT_BSC');
    expect(payment.state.error).toBe(false); expect(ports.request.mock.calls[0]![0].body.payload.expectedPayableUsdt).toBe(19.995);
    payment.close(); expect(await choice).toBeNull();
  });
});


it('rejects another rail with the same original key and quote before showing its address, including after reload', async () => {
  const ethereumQuote = { ...quote, paymentMethod: 'CREGIS_USDT_ERC20', network: 'ERC20' };
  const ethereumIntent = { ...intent, ...ethereumQuote, address: '0x' + 'e'.repeat(40) };
  ports.request.mockResolvedValueOnce(ethereumQuote).mockResolvedValueOnce(intent).mockResolvedValueOnce(intent).mockResolvedValueOnce(ethereumIntent);
  let store = await import('./purchase-payment'), payment = store.usePurchasePayment();
  const first = store.requestPurchasePayment(context());
  await payment.select('CREGIS_USDT_ERC20'); await payment.confirm();
  expect(payment.state.error).toBe(true); expect(payment.state.intent).toBeNull();
  expect(payment.pending()).toMatchObject([{ paymentMethod: 'CREGIS_USDT_ERC20', network: 'ERC20', commandKey: 'business-original-key', paymentQuoteId: 'Q-1' }]);
  payment.close(); expect(await first).toBeNull();
  vi.resetModules(); store = await import('./purchase-payment'); payment = store.usePurchasePayment();
  const restored = store.requestPurchasePayment(context());
  await vi.waitFor(() => expect(payment.state.error).toBe(true));
  expect(payment.state.intent).toBeNull();
  expect(payment.pending()).toMatchObject([{ paymentMethod: 'CREGIS_USDT_ERC20', network: 'ERC20' }]);
  await payment.query();
  expect(payment.state.intent).toMatchObject({ paymentMethod: 'CREGIS_USDT_ERC20', network: 'ERC20', address: ethereumIntent.address });
  expect(ports.request.mock.calls.filter(([request]) => request.method === 'POST' && request.path.endsWith('-intents'))).toHaveLength(1);
  payment.close(); expect(await restored).toBeNull();
});

it('rejects a changed network spelling for a known quote even when the rail is unchanged', async () => {
  ports.request.mockResolvedValueOnce(quote).mockResolvedValueOnce({ ...intent, network: 'BEP20' });
  const store = await import('./purchase-payment'), payment = store.usePurchasePayment();
  const result = store.requestPurchasePayment(context());
  await payment.select('CREGIS_USDT_BSC'); await payment.confirm();
  expect(payment.state.error).toBe(true); expect(payment.state.intent).toBeNull();
  expect(payment.pending()).toMatchObject([{ paymentMethod: 'CREGIS_USDT_BSC', network: 'BSC' }]);
  payment.close(); expect(await result).toBeNull();
});

it('binds legacy recovery rows to their first validated original intent without inventing the old rail', async () => {
  const ethereumIntent = { ...intent, paymentMethod: 'CREGIS_USDT_ERC20', network: 'ERC20', address: '0x' + 'e'.repeat(40) };
  const original = { fingerprint: JSON.stringify(['ORDER_PAY', context().payload]), kind: 'ORDER_PAY', commandKey: 'business-original-key', paymentQuoteId: 'Q-1', summary: 'Legacy order' };
  ports.rows.set('uvel-purchase-payment-accounts-v1user:1', { records: { 'business-original-key': original } });
  ports.request.mockResolvedValueOnce(ethereumIntent).mockResolvedValueOnce(intent);
  const store = await import('./purchase-payment'), payment = store.usePurchasePayment();
  const result = store.requestPurchasePayment(context());
  await vi.waitFor(() => expect(payment.state.intent?.network).toBe('ERC20'));
  expect(payment.pending()).toMatchObject([{ paymentMethod: 'CREGIS_USDT_ERC20', network: 'ERC20', intentNo: 'PI-1' }]);
  await payment.query();
  expect(payment.state.error).toBe(true);
  expect(payment.state.intent).toMatchObject({ paymentMethod: 'CREGIS_USDT_ERC20', network: 'ERC20', address: ethereumIntent.address });
  expect(ports.request.mock.calls.every(([request]) => request.method !== 'POST')).toBe(true);
  payment.close(); expect(await result).toBeNull();
});
