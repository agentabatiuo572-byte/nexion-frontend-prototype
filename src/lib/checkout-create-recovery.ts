import type { CreateOrderRequest } from '@/api/order-api';
import { readAccountRow, writeAccountRow } from '@/store/account-scoped-storage';

const KEY = 'uvel-checkout-create-recovery-v1';
export interface PendingCheckoutCreate {
  request: CreateOrderRequest;
  intent: string;
  subtotal: number;
  discount: number;
  amount: number;
}
type Row = { creates: Record<string, PendingCheckoutCreate> };

/** Storage is the external boundary; restore the exact original request. */
export function readCheckoutCreate(accountKey: string, productNo: string): PendingCheckoutCreate | null {
  const entry = readAccountRow<Row>(KEY, accountKey, true)?.creates?.[productNo];
  if (!entry) return null;
  if (entry.request?.productNo !== productNo || entry.request.quantity !== 1
      || typeof entry.request.idempotencyKey !== 'string' || !entry.request.idempotencyKey
      || (entry.request.voucherId != null && typeof entry.request.voucherId !== 'string')
      || typeof entry.intent !== 'string' || !entry.intent
      || ![entry.subtotal, entry.discount, entry.amount].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
  }
  return entry;
}

export function rememberCheckoutCreate(accountKey: string, entry: PendingCheckoutCreate): void {
  const row = readAccountRow<Row>(KEY, accountKey, true);
  const old = readCheckoutCreate(accountKey, entry.request.productNo);
  if (old && old.request.idempotencyKey !== entry.request.idempotencyKey) throw new Error('CHECKOUT_RECOVERY_PENDING');
  if (!writeAccountRow(KEY, accountKey, { creates: { ...row?.creates, [entry.request.productNo]: entry } })
      || JSON.stringify(readCheckoutCreate(accountKey, entry.request.productNo)) !== JSON.stringify(entry)) {
    throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
  }
}

export function forgetCheckoutCreate(accountKey: string, entry: PendingCheckoutCreate): void {
  const row = readAccountRow<Row>(KEY, accountKey, true);
  if (row?.creates?.[entry.request.productNo]?.request.idempotencyKey !== entry.request.idempotencyKey) return;
  const creates = { ...row.creates }; delete creates[entry.request.productNo];
  if (!writeAccountRow(KEY, accountKey, { creates })) throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
}
