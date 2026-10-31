import { describe, expect, it, vi } from 'vitest';
import { ApiError, isAmbiguousOutcome } from '@/api/errors';
import { parseProductCatalogPayload } from '@/api/product-catalog-contract';
import { assertCheckoutPurchaseStock, CheckoutPurchaseCheckError } from './checkout-purchase-check';

const runtime = vi.hoisted(() => ({ productCatalogApi: { catalog: vi.fn() } }));
vi.mock('@/api/runtime', () => runtime);

// Feed the real owning parser. The helper does not carry a second schema.
function catalog(overrides: Array<Record<string, unknown>> = [{}]) {
  return parseProductCatalogPayload({ source: 'nx_product', serverCanonical: true, sourceEnvironment: 'PRODUCTION', runId: '', revision: 'live',
    products: overrides.map((override, index) => ({ id: 'sku-' + index, name: 'Product ' + index, tier: 'Entry', tagline: '', dailyEarn: 0, dailyEarnNEX: 0, price: 1299, sold: 0, features: [], available: true, productType: 'DEVICE', inventoryMode: 'FINITE', stock: 5, ...override })) });
}

describe('fresh original-order stock check', () => {
  it('reads afresh every time and does not accept a previous successful snapshot', async () => {
    const api = { catalog: vi.fn().mockResolvedValueOnce(catalog()).mockResolvedValueOnce(catalog([{ stock: 0 }])) };
    const items = [{ productNo: 'sku-0', quantity: 1 }];
    await assertCheckoutPurchaseStock(items, api);
    await expect(assertCheckoutPurchaseStock(items, api)).rejects.toMatchObject({ reason: 'stock', productNo: 'sku-0', kind: 'business' });
    expect(api.catalog).toHaveBeenCalledTimes(2);
  });
  it('aggregates duplicate SKU quantities before comparing finite stock', async () => {
    const api = { catalog: vi.fn().mockResolvedValue(catalog([{ stock: 5 }])) };
    await expect(assertCheckoutPurchaseStock([{ productNo: 'sku-0', quantity: 2 }, { productNo: 'sku-0', quantity: 3 }], api)).resolves.toBeUndefined();
    await expect(assertCheckoutPurchaseStock([{ productNo: 'sku-0', quantity: 3 }, { productNo: 'sku-0', quantity: 3 }], api)).rejects.toMatchObject({ reason: 'stock' });
  });
  it('checks every original line, including finite Cloud Share, without repricing or mutating the inputs', async () => {
    const items = Object.freeze([Object.freeze({ productNo: 'sku-0', quantity: 1 }), Object.freeze({ productNo: 'sku-1', quantity: 2 })]);
    const snapshot = catalog([{}, { productType: 'SHARE', tier: 'Share', stock: 1, price: 9000 }]);
    await expect(assertCheckoutPurchaseStock(items, { catalog: async () => snapshot })).rejects.toMatchObject({ reason: 'stock', productNo: 'sku-1' });
    expect(items).toEqual([{ productNo: 'sku-0', quantity: 1 }, { productNo: 'sku-1', quantity: 2 }]); expect(snapshot.products[1].price).toBe(9000);
  });
  it('accepts explicitly unlimited Cloud Share and rejects zero finite stock', async () => {
    const unlimited = catalog([{ productType: 'SHARE', tier: 'Share', inventoryMode: 'UNLIMITED', stock: null }]);
    await expect(assertCheckoutPurchaseStock([{ productNo: 'sku-0', quantity: 6 }], { catalog: async () => unlimited })).resolves.toBeUndefined();
    await expect(assertCheckoutPurchaseStock([{ productNo: 'sku-0', quantity: 1 }], { catalog: async () => catalog([{ stock: 0 }]) })).rejects.toMatchObject({ reason: 'stock' });
  });
  it('rejects missing, off-sale and blocked products instead of guessing from an old order', async () => {
    const items = [{ productNo: 'sku-0', quantity: 1 }];
    for (const products of [[], [{ id: 'other' }], [{ available: false }], [{ purchaseBlocked: true, purchaseBlockedReason: 'SPEC_UNAVAILABLE' }]]) {
      await expect(assertCheckoutPurchaseStock(items, { catalog: async () => catalog(products) })).rejects.toMatchObject({ reason: 'unavailable', productNo: 'sku-0' });
    }
  });
  it('fails closed on read or owning-schema failures, preserves cause and cannot be mistaken for an unsettled payment', async () => {
    for (const cause of [new ApiError({ kind: 'network', message: 'NETWORK_UNAVAILABLE' }), new Error('catalog unavailable')]) {
      const rejected = await assertCheckoutPurchaseStock([{ productNo: 'sku-0', quantity: 1 }], { catalog: async () => { throw cause; } }).catch(error => error);
      expect(rejected).toBeInstanceOf(CheckoutPurchaseCheckError); expect(rejected.reason).toBe('read'); expect(rejected.cause).toBe(cause);
      expect(isAmbiguousOutcome(rejected)).toBe(false);
    }
    await expect(assertCheckoutPurchaseStock([{ productNo: 'sku-0', quantity: 1 }], { catalog: async () => catalog([{ inventoryMode: 'FINITE', stock: null }]) })).rejects.toMatchObject({ reason: 'read' });
  });
  it('rejects an empty original line set or aggregation overflow before a read', async () => {
    const api = { catalog: vi.fn() };
    await expect(assertCheckoutPurchaseStock([], api)).rejects.toMatchObject({ reason: 'items' });
    await expect(assertCheckoutPurchaseStock([{ productNo: 'sku-0', quantity: Number.MAX_SAFE_INTEGER }, { productNo: 'sku-0', quantity: 1 }], api)).rejects.toMatchObject({ reason: 'items' });
    expect(api.catalog).not.toHaveBeenCalled();
  });
  it('uses the existing production catalogue API by default', async () => {
    runtime.productCatalogApi.catalog.mockResolvedValueOnce(catalog());
    await assertCheckoutPurchaseStock([{ productNo: 'sku-0', quantity: 1 }]);
    expect(runtime.productCatalogApi.catalog).toHaveBeenCalledOnce();
  });
});
