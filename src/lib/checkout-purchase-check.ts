import { productCatalogApi } from '@/api/runtime';
import type { ProductCatalogApi } from '@/api/product-catalog-api';
import { ApiError } from '@/api/errors';

export type CheckoutPurchaseCheckReason = 'stock' | 'unavailable' | 'read' | 'items';
export interface CheckoutPurchaseItem { readonly productNo: string; readonly quantity: number }

const messages: Record<CheckoutPurchaseCheckReason, string> = {
  stock: 'CHECKOUT_STOCK_INSUFFICIENT', unavailable: 'CHECKOUT_PRODUCT_UNAVAILABLE',
  read: 'CHECKOUT_STOCK_READ_FAILED', items: 'CHECKOUT_PURCHASE_ITEMS_INVALID',
};

/** A pre-submit rejection: no payment POST has happened at this boundary. */
export class CheckoutPurchaseCheckError extends ApiError {
  readonly reason: CheckoutPurchaseCheckReason;
  readonly productNo?: string;
  readonly cause?: unknown;
  constructor(reason: CheckoutPurchaseCheckReason, productNo?: string, cause?: unknown) {
    super({ kind: 'business', message: messages[reason], retryable: reason === 'read' });
    this.name = 'CheckoutPurchaseCheckError';
    this.reason = reason; this.productNo = productNo; this.cause = cause;
  }
}

/** Uses canonical, already validated original order lines; never quotes or
 * changes their amount. The caller must recheck its account/runtime/order scope
 * after this await and before its payment POST. No directory cache is published.
 * The catalogue has no own-reservation field; pending orders receive no credit
 * for earlier holds. Reservation policy remains the backend's responsibility. */
export async function assertCheckoutPurchaseStock(
  items: readonly CheckoutPurchaseItem[],
  api: Pick<ProductCatalogApi, 'catalog'> = productCatalogApi,
): Promise<void> {
  if (!items.length) throw new CheckoutPurchaseCheckError('items');
  const wanted = new Map<string, number>();
  for (const item of items) {
    const quantity = (wanted.get(item.productNo) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) throw new CheckoutPurchaseCheckError('items', item.productNo);
    wanted.set(item.productNo, quantity);
  }
  // ProductCatalogApi owns HTTP/provenance/schema validation. Convert failures
  // here so an unread catalogue cannot look like an ambiguous payment write.
  const snapshot = await api.catalog().catch((cause: unknown) => { throw new CheckoutPurchaseCheckError('read', undefined, cause); });
  const products = new Map(snapshot.products.map(product => [product.id, product]));
  for (const [productNo, quantity] of wanted) {
    const product = products.get(productNo);
    if (!product || !product.available || product.purchaseBlocked) throw new CheckoutPurchaseCheckError('unavailable', productNo);
    if (product.inventoryMode === 'UNLIMITED') continue;
    if (product.inventoryMode !== 'FINITE') throw new CheckoutPurchaseCheckError('read', productNo);
    // The existing catalogue parser requires a nonnegative integer stock for
    // FINITE products, and permits UNLIMITED only for SHARE products.
    if (product.stock! < quantity) throw new CheckoutPurchaseCheckError('stock', productNo);
  }
}
