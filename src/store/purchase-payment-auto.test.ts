import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
// The payment flow runs by itself: quotes, reads and resubmits are automatic and every outcome becomes one notice.
const ports = vi.hoisted(() => ({ request: vi.fn(), rows: new Map<string, unknown>(), clearOrder: vi.fn(), action: null as null | { key: string } }));
vi.mock('@/api/runtime', () => ({ apiClient: { request: ports.request } }));
vi.mock('./app', () => ({ useApp: () => ({ accountKey: 'user:auto', user: { usdtBalance: 0 } }) }));
vi.mock('@/lib/route', () => ({ navTo: vi.fn() }));
vi.mock('@/lib/order-command-fence', () => ({ readOrderAction: () => ports.action, clearOrderAction: ports.clearOrder }));
vi.mock('./account-scoped-storage', () => ({
  readAccountRow: (table: string, account: string) => ports.rows.get(table + account) ?? null,
  writeAccountRow: (table: string, account: string, value: unknown) => { ports.rows.set(table + account, structuredClone(value)); return true; },
  acquireAccountCommandKey: () => 'store-key', releaseAccountCommandKey: vi.fn(),
}));
const quote = (method = 'CREGIS_USDT_BSC', id = 'Q-1') => ({ paymentQuoteId: id, kind: 'ORDER_PAY', paymentMethod: method, network: method === 'HDPAY_BANK' ? 'VND_BANK' : 'BSC',
  subtotalUsdt: '100.00', channelFeeUsdt: '1.75', networkConfirmFeeUsdt: method === 'HDPAY_BANK' ? '0.00' : '0.25', totalUsdt: method === 'HDPAY_BANK' ? '101.75' : '102.00',
  feePolicyVersion: 1, expiresAt: new Date(Date.now() + 15 * 60000).toISOString(), fxRateVndPerUsdt: method === 'HDPAY_BANK' ? '25000' : null, amountVnd: method === 'HDPAY_BANK' ? '2543750' : null });
const intent = (status: string, reason = '', method = 'CREGIS_USDT_BSC', id = 'Q-1') => ({ ...quote(method, id), intentNo: `PI-${id}`, commandKey: 'order-key', status, reason, receipt: null,
  address: method === 'HDPAY_BANK' ? null : '0x' + '1'.repeat(40), paymentUrl: method === 'HDPAY_BANK' ? 'https://api.hdpayadmin.com/pay/1' : null });
const context = (deadlineAt: number | null = Date.now() + 20 * 60000) => ({ kind: 'ORDER_PAY' as const, payload: { orderNo: 'ORD-1' }, amount: 100, summary: 'Device', current: () => true,
  commandKey: () => 'order-key', orderNo: 'ORD-1', deadlineAt });
beforeEach(() => { vi.resetModules(); vi.useFakeTimers({ shouldAdvanceTime: true }); ports.request.mockReset(); ports.rows.clear(); ports.clearOrder.mockReset(); ports.action = null; });
afterEach(() => { vi.useRealTimers(); });
async function opened(deadlineAt?: number | null) {
  const store = await import('./purchase-payment'), payment = store.usePurchasePayment();
  void store.requestPurchasePayment(context(deadlineAt));
  return { store, payment };
}

describe('automatic external payment', () => {
  it.each([
    ['EXPIRED', 'PAYMENT_TIMEOUT', 'timeout'], ['EXPIRED', 'PAYMENT_FAILED', 'bankFailed'], ['MANUAL_REVIEW', 'PAYMENT_AMOUNT_MISMATCH', 'review'],
    ['MANUAL_REVIEW', 'PAYMENT_MULTIPLE_ARRIVALS', 'review'], ['MANUAL_REVIEW', 'PAYMENT_LATE_REVIEW', 'late'], ['MANUAL_REVIEW', 'PURCHASE_PAYMENT_DELIVERY_BLOCKED', 'delivery'],
  ])('%s/%s ends in the %s notice and stops reading', async (status, reason, notice) => {
    const { payment } = await opened();
    ports.request.mockResolvedValueOnce(quote()).mockResolvedValueOnce(intent('AWAITING_PAYMENT')).mockResolvedValueOnce(intent(status, reason));
    await payment.select('CREGIS_USDT_BSC'); await payment.confirm();
    expect(payment.state.notice).toBe('');
    await vi.advanceTimersByTimeAsync(5000);
    expect(payment.state.notice).toBe(notice);
    await vi.advanceTimersByTimeAsync(30000);
    expect(ports.request).toHaveBeenCalledTimes(3);
    payment.close();
  });

  it('reads every 5 s, pauses in the background and reads at once on return', async () => {
    const { payment } = await opened();
    ports.request.mockResolvedValueOnce(quote()).mockResolvedValue(intent('AWAITING_PAYMENT'));
    await payment.select('CREGIS_USDT_BSC'); await payment.confirm();
    await vi.advanceTimersByTimeAsync(10000);
    expect(ports.request).toHaveBeenCalledTimes(4);
    payment.pause(); await vi.advanceTimersByTimeAsync(20000);
    expect(ports.request).toHaveBeenCalledTimes(4);
    payment.wake(); await vi.advanceTimersByTimeAsync(0);
    expect(ports.request).toHaveBeenCalledTimes(5);
    payment.close(); await vi.advanceTimersByTimeAsync(20000);
    expect(ports.request).toHaveBeenCalledTimes(5);
  });

  it('backs off after failed reads and shows the offline state until a read succeeds', async () => {
    const { payment } = await opened();
    ports.request.mockResolvedValueOnce(quote()).mockResolvedValueOnce(intent('AWAITING_PAYMENT'))
      .mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'OFFLINE' })).mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'OFFLINE' }))
      .mockResolvedValue(intent('AWAITING_PAYMENT'));
    await payment.select('CREGIS_USDT_BSC'); await payment.confirm();
    await vi.advanceTimersByTimeAsync(5000); expect(payment.state.error).toBe(true);
    await vi.advanceTimersByTimeAsync(5000); expect(ports.request).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(9000); expect(ports.request).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000); expect(ports.request).toHaveBeenCalledTimes(5); expect(payment.state.error).toBe(false);
    payment.close();
  });

  it('retries a failed quote by itself with growing delays', async () => {
    const { payment } = await opened();
    ports.request.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'OFFLINE' })).mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'OFFLINE' }))
      .mockResolvedValueOnce(quote());
    await payment.select('CREGIS_USDT_BSC');
    expect(payment.state.retrying).toBe(true);
    await vi.advanceTimersByTimeAsync(3000); expect(ports.request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000); expect(ports.request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000); expect(ports.request).toHaveBeenCalledTimes(3);
    expect(payment.state.retrying).toBe(false); expect(payment.state.quote?.paymentQuoteId).toBe('Q-1');
    payment.close();
  });

  it('marks an unconfigured channel unavailable instead of retrying', async () => {
    const { payment } = await opened();
    const fresh = await import('@/api/errors'); // the store's own module instance after resetModules
    ports.request.mockRejectedValueOnce(new fresh.ApiError({ kind: 'http', status: 503, code: 503, message: 'PURCHASE_PAYMENT_FEES_NOT_CONFIGURED' }));
    await payment.select('CREGIS_USDT_ERC20');
    expect(payment.available('CREGIS_USDT_ERC20')).toBe(false); expect(payment.state.retrying).toBe(false);
    await vi.advanceTimersByTimeAsync(30000); expect(ports.request).toHaveBeenCalledTimes(1);
    payment.close();
  });

  it('warns first when the order closes within 5 minutes, otherwise shows the pre-payment reminder', async () => {
    const short = await opened(Date.now() + 4 * 60000);
    ports.request.mockResolvedValueOnce(quote());
    await short.payment.select('CREGIS_USDT_BSC'); short.payment.proceed();
    expect(short.payment.state.notice).toBe('timeShort'); short.payment.close();
    vi.resetModules();
    const roomy = await opened();
    ports.request.mockResolvedValueOnce(quote());
    await roomy.payment.select('CREGIS_USDT_BSC'); roomy.payment.proceed();
    expect(roomy.payment.state.notice).toBe('reminder'); expect(roomy.payment.state.pending).toBeNull();
    roomy.payment.close();
  });

  it('opens the bank page once the intent is ready and closes it when the intent leaves AWAITING_PAYMENT', async () => {
    const { payment } = await opened();
    ports.request.mockResolvedValueOnce(quote('HDPAY_BANK')).mockResolvedValueOnce(intent('AWAITING_PAYMENT', '', 'HDPAY_BANK')).mockResolvedValueOnce(intent('FUNDS_CONFIRMED', '', 'HDPAY_BANK'));
    await payment.select('HDPAY_BANK'); await payment.confirm();
    expect(payment.state.cashier).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(payment.state.cashier).toBe(false); expect(payment.state.intent?.status).toBe('FUNDS_CONFIRMED');
    payment.close();
  });

  it('after a failed bank attempt, paying again retires that intent and rotates the order key', async () => {
    const { payment } = await opened();
    ports.action = { key: 'order-key' };
    ports.request.mockResolvedValueOnce(quote('HDPAY_BANK')).mockResolvedValueOnce(intent('EXPIRED', 'PAYMENT_FAILED', 'HDPAY_BANK')).mockResolvedValueOnce(quote('HDPAY_BANK', 'Q-2'));
    await payment.select('HDPAY_BANK'); await payment.confirm();
    expect(payment.state.notice).toBe('bankFailed');
    payment.restart('bank'); await vi.advanceTimersByTimeAsync(0);
    expect(ports.clearOrder).toHaveBeenCalledWith('user:auto', 'ORD-1', 'order-key', true);
    expect(payment.pending()).toEqual([]); expect(payment.state.step).toBe('bank'); expect(payment.state.quote?.paymentQuoteId).toBe('Q-2');
    payment.close();
  });

  it('ends the flow after a failed bank attempt when the caller owns a key this flow cannot renew', async () => {
    const { store, payment } = await opened();
    ports.request.mockResolvedValueOnce(quote('HDPAY_BANK')).mockResolvedValueOnce(intent('EXPIRED', 'PAYMENT_FAILED', 'HDPAY_BANK'));
    await payment.select('HDPAY_BANK'); await payment.confirm();
    payment.restart('bank');
    expect(ports.clearOrder).not.toHaveBeenCalled(); expect(payment.state.open).toBe(false); expect(payment.pending()).toEqual([]);
    expect(store).toBeTruthy();
  });

  it('reports an external payment underway for its order only', async () => {
    const { store, payment } = await opened();
    ports.request.mockResolvedValueOnce(quote()).mockResolvedValueOnce(intent('AWAITING_PAYMENT'));
    await payment.select('CREGIS_USDT_BSC'); await payment.confirm(); payment.close();
    expect(store.pendingOrderPayment('user:auto', 'ORD-1')).toMatchObject({ commandKey: 'order-key', lastStatus: 'AWAITING_PAYMENT' });
    expect(store.pendingOrderPayment('user:auto', 'ORD-2')).toBeNull();
  });
});
