import type { CanonicalOrder, CanonicalOrderList, OrderApi } from "@/api/order-api";
import { readAccountRow, writeAccountRow, releaseAccountCommandKey } from "@/store/account-scoped-storage";

const KEY = "nexgrid-checkout-server-order-recovery-v1";
const COMMANDS_KEY = "nexgrid-remote-checkout-commands-v1";
type Pointer = { productNo: string; orderNo: string; intent: string; commandKey: string };
type Row = { orders: Record<string, Pointer> };
const terminal = new Set(["activated", "cancelled", "expired", "refunded", "chargeback"]);

export function rememberCheckoutOrder(accountKey: string, pointer: Pointer): void {
  const row = readAccountRow<Row>(KEY, accountKey);
  if (!writeAccountRow(KEY, accountKey, { orders: { ...row?.orders, [pointer.productNo]: pointer } })
      || readAccountRow<Row>(KEY, accountKey)?.orders?.[pointer.productNo]?.orderNo !== pointer.orderNo) {
    throw new Error("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
  }
}

export function forgetCheckoutOrder(accountKey: string, productNo: string, orderNo: string): void {
  const row = readAccountRow<Row>(KEY, accountKey);
  if (row?.orders?.[productNo]?.orderNo !== orderNo) return;
  const orders = { ...row.orders };
  delete orders[productNo];
  // A failed cleanup only retains the safe read-only recovery route.
  writeAccountRow(KEY, accountKey, { orders });
}

/** Recovery only navigates to the original server order; it never creates or pays. */
export async function recoverCheckoutOrder(accountKey: string, productNo: string, deps: {
  list: OrderApi["list"]; isCurrent(): boolean; navigate(url: string): Promise<boolean>;
}): Promise<boolean> {
  const pointer = readAccountRow<Row>(KEY, accountKey)?.orders?.[productNo];
  if (!pointer || pointer.productNo !== productNo || typeof pointer.orderNo !== "string" || !pointer.orderNo.trim()) return false;
  if (!deps.isCurrent()) return true;
  let found: CanonicalOrder | undefined;
  try {
    let cursor: string | null = null;
    const visited = new Set<string>();
    do {
      const page: CanonicalOrderList = await deps.list(cursor, 100);
      if (!deps.isCurrent()) return true;
      found = page.orders.find((order) => order.orderNo === pointer.orderNo);
      if (found) break;
      cursor = page.nextCursor ?? null;
      if (!cursor || visited.has(cursor)) break;
      visited.add(cursor);
    } while (cursor);
  } catch { /* The canonical order page offers a read-only retry during outages. */ }
  if (!deps.isCurrent()) return true;
  const navigated = await deps.navigate(`/pages/store/order-detail?id=${encodeURIComponent(pointer.orderNo)}`);
  if (navigated && deps.isCurrent() && found?.productNo === productNo && found.quantity === 1 && terminal.has(found.canonicalStatus)) {
    releaseAccountCommandKey(COMMANDS_KEY, accountKey, pointer.intent, pointer.commandKey);
    forgetCheckoutOrder(accountKey, productNo, pointer.orderNo);
  }
  return true;
}
