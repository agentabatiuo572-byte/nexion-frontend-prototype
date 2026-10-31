import { describe, expect, it } from 'vitest';
import { parsePurchaseIntent, parsePurchaseQuote } from '@/api/purchase-payment-api';
import { purchasePaymentTiming } from './purchase-payment-timing';

const deadlineAt = '2026-11-01T10:30:00Z';
const boundary = Date.parse(deadlineAt);
const fixture = (paymentMethod = 'CREGIS_USDT_BSC') => ({ kind: 'ORDER_PAY', paymentMethod,
  paymentQuoteId: 'Q-1', intentNo: 'I-1', commandKey: 'K-1', network: paymentMethod === 'HDPAY_BANK' ? null : paymentMethod === 'CREGIS_USDT_BSC' ? 'BSC' : 'ERC20',
  subtotalUsdt: '100.00', channelFeeUsdt: '0.00', networkConfirmFeeUsdt: '0.00', totalUsdt: '100.00',
  amountVnd: paymentMethod === 'HDPAY_BANK' ? '2500000' : null, fxRateVndPerUsdt: paymentMethod === 'HDPAY_BANK' ? '25000' : null,
  feePolicyVersion: 1, expiresAt: deadlineAt, deadlineAt,
  confirmationGraceEndsAt: new Date(boundary + (paymentMethod === 'CREGIS_USDT_BSC' ? 3 : 5) * 60000).toISOString(),
  paymentAllowed: true, status: 'AWAITING_PAYMENT', reason: null, receipt: null,
  address: paymentMethod === 'HDPAY_BANK' ? null : `0x${'1'.repeat(40)}`,
  paymentUrl: paymentMethod === 'HDPAY_BANK' ? 'https://api.hdpayadmin.com/pay/original' : null });

describe('one payment deadline with a separate confirmation window', () => {
  it.each(['CREGIS_USDT_BSC', 'CREGIS_USDT_ERC20', 'HDPAY_BANK'])('never extends %s payment time into confirmation grace', (method) => {
    const intent = parsePurchaseIntent(fixture(method));
    expect(purchasePaymentTiming(intent, boundary - 1).canPay).toBe(true);
    expect(purchasePaymentTiming(intent, boundary)).toMatchObject({ canPay: false, confirming: true, left: 0 });
    expect(purchasePaymentTiming(intent, Date.parse(intent.confirmationGraceEndsAt!))).toMatchObject({ canPay: false, confirming: true });
    expect(purchasePaymentTiming({ ...intent, status: 'EXPIRED' }, boundary).confirming).toBe(false);
  });

  it('honours an earlier documented provider expiration and a server payment prohibition', () => {
    const expirationTime = new Date(boundary - 60000).toISOString();
    const intent = parsePurchaseIntent({ ...fixture('HDPAY_BANK'), expirationTime });
    expect(purchasePaymentTiming(intent, boundary - 60000)).toMatchObject({ canPay: false, confirming: true, cutoff: boundary - 60000 });
    expect(purchasePaymentTiming({ ...intent, paymentAllowed: false }, boundary - 120000)).toMatchObject({ canPay: false, confirming: true });
  });

  it('rejects partial, malformed or extended timing instead of inventing a grace value', () => {
    for (const change of [{ deadlineAt: null }, { confirmationGraceEndsAt: undefined },
      { confirmationGraceEndsAt: '2026-11-01T10:40:00Z' }, { expiresAt: '2026-11-01T10:31:00Z' },
      { paymentAllowed: 'false' }, { expirationTime: 1793529000 }]) {
      expect(() => parsePurchaseIntent({ ...fixture(), ...change })).toThrow();
    }
    expect(() => parsePurchaseQuote({ ...fixture(), deadlineAt: null })).toThrow();
    expect(() => parsePurchaseIntent({ ...fixture(), expirationTime: deadlineAt })).toThrow();
  });
});
