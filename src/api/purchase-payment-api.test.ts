import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api-client';
import { ApiError } from './errors';
import { createPurchasePaymentApi, parsePurchaseIntent, parsePurchaseQuote } from './purchase-payment-api';
const quote = (method = 'CREGIS_USDT_BSC') => ({ paymentQuoteId: 'Q-1', kind: 'ORDER_PAY', paymentMethod: method,
  network: method === 'CREGIS_USDT_BSC' ? 'BSC' : null, subtotalUsdt: '100.00', channelFeeUsdt: '1.75', networkConfirmFeeUsdt: method === 'CREGIS_USDT_BSC' ? '0.25' : '0.00',
  totalUsdt: method === 'CREGIS_USDT_BSC' ? '102.00' : '101.75', feePolicyVersion: 1, expiresAt: '2099-01-01T00:00:00Z',
  fxRateVndPerUsdt: method === 'HDPAY_BANK' ? '25000' : null, amountVnd: method === 'HDPAY_BANK' ? '2543750' : null });
const intent = () => ({ ...quote(), intentNo: 'PI-1', commandKey: 'purchase-1', status: 'AWAITING_PAYMENT', address: '0x' + '1'.repeat(40), paymentUrl: null, reason: null, receipt: null });
describe('external purchase contracts', () => {
  it('accepts exact server fee totals and HDPAY dong without charging a network fee', () => {
    expect(parsePurchaseQuote(quote()).totalUsdt).toBe('102.00');
    expect(parsePurchaseQuote(quote('HDPAY_BANK'))).toMatchObject({ amountVnd: '2543750', networkConfirmFeeUsdt: '0.00' });
  });
  it.each([
    { totalUsdt: '103.00' }, { channelFeeUsdt: null }, { networkConfirmFeeUsdt: '0.001' }, { subtotalUsdt: '-1.00' },
    { totalUsdt: '1e2' }, { expiresAt: '2099-01-01' }, { network: 'TRC20' },
  ])('rejects incomplete or inconsistent fees: %j', change => expect(() => parsePurchaseQuote({ ...quote(), ...change })).toThrow());
  it('rejects HDPAY network fees, fractional dong and untrusted hosted links', () => {
    expect(() => parsePurchaseQuote({ ...quote('HDPAY_BANK'), networkConfirmFeeUsdt: '1.00', totalUsdt: '102.75' })).toThrow();
    expect(() => parsePurchaseQuote({ ...quote('HDPAY_BANK'), amountVnd: '2543750.5' })).toThrow();
    expect(() => parsePurchaseIntent({ ...intent(), ...quote('HDPAY_BANK'), paymentUrl: 'https://api.hdpayadmin.com.attacker.test/pay', address: null })).toThrow();
  });
  it('does not treat pending as delivery and preserves a delivered order with extra funds under review', () => {
    expect(parsePurchaseIntent(intent()).receipt).toBeNull();
    expect(parsePurchaseIntent({ ...intent(), reason: '' }).reason).toBeNull();
    expect(() => parsePurchaseIntent({ ...intent(), status: 'DELIVERED' })).toThrow();
    expect(parsePurchaseIntent({ ...intent(), status: 'MANUAL_REVIEW', fulfilmentStatus: 'DELIVERED', receipt: { orderNo: 'ORD-1' } })).toMatchObject({ fulfilmentStatus: 'DELIVERED', receipt: { orderNo: 'ORD-1' } });
  });
  it('sends only quote identity and original key when creating an external payment', async () => {
    const request = vi.fn().mockResolvedValue(intent());
    const api = createPurchasePaymentApi({ request } as unknown as ApiClient);
    await api.create('Q-1', 'purchase-1');
    expect(request).toHaveBeenCalledWith({ method: 'POST', path: '/api/app/purchase-payment-intents', body: { paymentQuoteId: 'Q-1' }, idempotencyKey: 'purchase-1', retryAfterAuth: false });
    expect(JSON.stringify(request.mock.calls)).not.toMatch(/paymentPassword|credentialVersion|attemptNo/);
  });
  it('distinguishes an absent original intent from an unavailable lookup', async () => {
    const request = vi.fn().mockRejectedValueOnce(new ApiError({ kind: 'http', status: 404, message: 'NOT_FOUND' }))
      .mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'UNAVAILABLE' }));
    const api = createPurchasePaymentApi({ request } as unknown as ApiClient);
    expect(await api.find('ORDER_PAY', 'original-key')).toBeNull();
    await expect(api.find('ORDER_PAY', 'original-key')).rejects.toThrow();
  });
});
