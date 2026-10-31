import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purchaseKinds } from '@/api/purchase-payment-api';
const ports = vi.hoisted(() => ({ request: vi.fn(), wallet: vi.fn() }));
vi.mock('@/api/runtime', () => ({ remoteApiEnabled: true }));
vi.mock('@/store/purchase-payment', () => ({ requestPurchasePayment: ports.request, acknowledgePurchasePayment: vi.fn() }));
vi.mock('./authorized-payment', () => ({ executePaymentWithPassword: ports.wallet }));
import { executeSelectedPurchase } from './selected-purchase-payment';
beforeEach(() => { ports.request.mockReset(); ports.wallet.mockReset(); });
describe('wallet-only PIN routing', () => {
  it.each(purchaseKinds)('%s external checkout never requests or checks a PIN', async kind => {
    const receipt = { orderNo: 'ORDER-1' }, parseReceipt = vi.fn(raw => raw as typeof receipt), walletCommand = vi.fn();
    ports.request.mockResolvedValue({ method: 'EXTERNAL', receipt });
    const result = await executeSelectedPurchase({ amount: 100, currency: 'USDT', summary: 'Device' }, walletCommand, () => true,
      { kind, payload: { orderNo: 'ORDER-1' }, parseReceipt });
    expect(result).toEqual(receipt); expect(parseReceipt).toHaveBeenCalledWith(receipt);
    expect(ports.wallet).not.toHaveBeenCalled(); expect(walletCommand).not.toHaveBeenCalled();
  });
  it('enters PIN only after wallet is explicitly chosen', async () => {
    ports.request.mockResolvedValue({ method: 'WALLET' }); ports.wallet.mockResolvedValue({ orderNo: 'ORDER-1' });
    const callback = vi.fn(), current = () => true, context = { amount: 100, currency: 'USDT', summary: 'Device' };
    await executeSelectedPurchase(context, callback, current, { kind: 'ORDER_PAY', payload: { orderNo: 'ORDER-1' }, parseReceipt: raw => raw });
    expect(ports.wallet).toHaveBeenCalledWith(context, callback, current);
  });
  it('uses PIN for zero-value rights without opening external methods', async () => {
    ports.wallet.mockResolvedValue({ orderNo: 'ZERO-1' });
    await executeSelectedPurchase({ amount: 0, currency: 'USDT', summary: 'Rights' }, vi.fn(), () => true,
      { kind: 'TRADE_IN', payload: {}, parseReceipt: raw => raw });
    expect(ports.request).not.toHaveBeenCalled(); expect(ports.wallet).toHaveBeenCalledOnce();
  });
  it('cancellation and a changed account/context cannot start a wallet command', async () => {
    ports.request.mockResolvedValue(null);
    expect(await executeSelectedPurchase({ amount: 100, currency: 'USDT', summary: 'Device' }, vi.fn(), () => true,
      { kind: 'ORDER_PAY', payload: {}, parseReceipt: raw => raw })).toBeNull();
    expect(await executeSelectedPurchase({ amount: 100, currency: 'USDT', summary: 'Device' }, vi.fn(), () => false,
      { kind: 'ORDER_PAY', payload: {}, parseReceipt: raw => raw })).toBeNull();
    expect(ports.wallet).not.toHaveBeenCalled(); expect(ports.request).toHaveBeenCalledOnce();
  });
});
