import { describe, expect, it } from 'vitest';
import { parseGenesisListingPrice } from './genesis-listing-price';
import { formatGenesisPrice } from './genesis-marketplace-presentation';
import { isStakingVisibilityRoute } from './staking-visibility';

describe('prototype sync precise Genesis price contract', () => {
  it('keeps the same six-decimal price in entry, confirmation, listing and receipt display', () => {
    for (const [raw, value, display] of [
      ['0.000001', 0.000001, '0.000001'], ['12.345678', 12.345678, '12.345678'],
      ['1.200000', 1.2, '1.20'], ['100000000', 100000000, '100000000.00'],
    ] as const) {
      expect(parseGenesisListingPrice(raw)).toBe(value);
      expect(formatGenesisPrice(value)).toBe(display);
      expect(Number(display)).toBe(value);
    }
  });
  it('rejects invalid, over-precision and overflowing input instead of truncating to another amount', () => {
    for (const raw of ['', '0', '-1', '0.0000001', '1.2345678', '100000000.000001', 'Infinity', '1e2', '1,000', '12abc']) {
      expect(parseGenesisListingPrice(raw), raw).toBeNull();
    }
  });
});
describe('prototype sync staking visibility across navigation forms', () => {
  it('recognizes entry, rules and deep links while leaving adjacent wallet flows available', () => {
    for (const route of ['/staking', '/staking/how-it-works', '/pages/staking/staking', '/pages/staking/how-it-works', '/me/wallet/repurchase', '/me/wallet/repurchase/how', '/pages/me/wallet-repurchase', '/pages/me/wallet-repurchase-how']) {
      expect(isStakingVisibilityRoute(route), route).toBe(true);
      expect(isStakingVisibilityRoute(route + '?from=wallet'), route).toBe(true);
    }
    for (const route of ['/me/wallet', '/pages/me/wallet-bills', '/pages/me/wallet-deposit', '/pages/store/checkout']) expect(isStakingVisibilityRoute(route), route).toBe(false);
  });
});
