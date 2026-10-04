import type { GenesisTransaction } from "@/api/genesis-api";

export interface GenesisOrderListItem {
  kind: "genesis";
  id: string;
  productName: string;
  quantity: number;
  meta: string;
  total: number;
  placedAt: number;
  status: "paid";
}

/** Account-scoped Genesis transactions rendered in the shared "My orders" list. */
export function genesisOrderListItems(
  orders: readonly GenesisTransaction[],
  productName: string,
  quantityLabel: string,
): GenesisOrderListItem[] {
  return orders.map((order) => ({
    kind: "genesis",
    id: order.orderNo,
    productName,
    quantity: order.quantity,
    meta: `${quantityLabel} × ${order.quantity}`,
    total: order.amountUsdt,
    placedAt: order.completedAt,
    status: "paid",
  }));
}
