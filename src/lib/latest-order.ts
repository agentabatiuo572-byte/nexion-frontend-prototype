/** Pagination and local inserts must not change the meaning of "latest". */
export function latestOrder<T extends { placedAt: number }>(orders: readonly T[]): T | null {
  return orders.reduce<T | null>((latest, order) =>
    Number.isFinite(order.placedAt) && (!latest || order.placedAt > latest.placedAt) ? order : latest, null);
}
