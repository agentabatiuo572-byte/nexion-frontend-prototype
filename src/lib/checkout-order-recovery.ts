import type { CanonicalTradeinQuote, CanonicalTradeinResult } from "@/api/device-e3-api";
import type { CanonicalOrder, CanonicalOrderList, OrderApi } from "@/api/order-api";
import { readAccountRow, writeAccountRow, releaseAccountCommandKey } from "@/store/account-scoped-storage";

const KEY = "nexgrid-checkout-server-order-recovery-v1";
const COMMANDS_KEY = "nexgrid-remote-checkout-commands-v1";
type Pointer = { productNo: string; orderNo: string; intent: string; commandKey: string;
  tradeinQuote?: CanonicalTradeinQuote; tradeinResult?: CanonicalTradeinResult };
export type CheckoutTradeinRecovery = Pointer & { tradeinQuote: CanonicalTradeinQuote };
type Row = { orders: Record<string, Pointer> };
const terminal = new Set(["activated", "inventory", "cancelled", "expired", "refunded", "chargeback"]);

export function rememberCheckoutOrder(accountKey: string, pointer: Pointer): void {
  const row = readAccountRow<Row>(KEY, accountKey, true);
  if (row?.orders?.[pointer.productNo]?.tradeinQuote
      && row.orders[pointer.productNo].commandKey !== pointer.commandKey) throw new Error("CHECKOUT_RECOVERY_PENDING");
  if (!writeAccountRow(KEY, accountKey, { orders: { ...row?.orders, [pointer.productNo]: pointer } })
      || readAccountRow<Row>(KEY, accountKey)?.orders?.[pointer.productNo]?.orderNo !== pointer.orderNo
      || readAccountRow<Row>(KEY, accountKey)?.orders?.[pointer.productNo]?.commandKey !== pointer.commandKey) {
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

/** Pending RETIRE requests survive refresh with their original source version and key. */
export function readCheckoutTradein(accountKey: string, productNo: string): CheckoutTradeinRecovery | null {
  const pointer = readAccountRow<Row>(KEY, accountKey, true)?.orders?.[productNo];
  if (!pointer?.tradeinQuote) return null;
  const quote = pointer.tradeinQuote;
  if (pointer.productNo !== productNo || quote.targetProductNo !== productNo
      || !pointer.commandKey || !pointer.intent || !Number.isSafeInteger(quote.sourceRowVersion)
      || quote.sourceRowVersion < 0 || !["ACTIVE", "INACTIVE"].includes(quote.targetDeviceStatus)) {
    throw new Error("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
  }
  return pointer as CheckoutTradeinRecovery;
}

export function finishCheckoutTradein(accountKey: string, pointer: CheckoutTradeinRecovery): void {
  const current = readCheckoutTradein(accountKey, pointer.productNo);
  if (current?.commandKey !== pointer.commandKey) throw new Error("CHECKOUT_RECOVERY_SCOPE_CHANGED");
  const command = readAccountRow<{ commands: Record<string, string> }>(COMMANDS_KEY, accountKey, true)?.commands?.[pointer.intent];
  if (command && (command !== pointer.commandKey || !releaseAccountCommandKey(COMMANDS_KEY, accountKey, pointer.intent, pointer.commandKey))) {
    throw new Error("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
  }
  forgetCheckoutOrder(accountKey, pointer.productNo, pointer.orderNo);
  if (readCheckoutTradein(accountKey, pointer.productNo)) throw new Error("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
}

/** Recovery only navigates to the original server order; it never creates or pays. */
export async function recoverCheckoutOrder(accountKey: string, productNo: string, deps: {
  list: OrderApi["list"]; isCurrent(): boolean; isCurrentAccount(): boolean; navigate(url: string): Promise<boolean>;
}): Promise<boolean> {
  const pointer = readAccountRow<Row>(KEY, accountKey)?.orders?.[productNo];
  if (pointer?.tradeinQuote) {
    if (deps.isCurrent()) await deps.navigate(`/pages/store/checkout?product=${encodeURIComponent(productNo)}`);
    return true;
  }
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
  // Successful navigation may already have unloaded checkout. Retire only the
  // same account generation and receipt, never a newer recovery pointer.
  const current = readAccountRow<Row>(KEY, accountKey)?.orders?.[productNo];
  if (navigated && deps.isCurrentAccount() && found?.productNo === productNo && found.quantity === 1 && terminal.has(found.canonicalStatus)
      && current?.orderNo === pointer.orderNo && current.commandKey === pointer.commandKey && current.intent === pointer.intent) {
    releaseAccountCommandKey(COMMANDS_KEY, accountKey, pointer.intent, pointer.commandKey);
    forgetCheckoutOrder(accountKey, productNo, pointer.orderNo);
  }
  return true;
}
