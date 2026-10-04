export interface OrderLineItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceUsdt: number;
  lineAmountUsdt: number;
}

export function parseOrderLineItems(value: unknown): OrderLineItem[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("ORDER_LINE_ITEMS_INVALID");
  const items = value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("ORDER_LINE_ITEMS_INVALID");
    const row = raw as Record<string, unknown>;
    const sku = typeof row.sku === "string" ? row.sku.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const quantity = typeof row.quantity === "number" ? row.quantity : Number.NaN;
    const unitPriceUsdt = row.unitPriceUsdt;
    const lineAmountUsdt = row.lineAmountUsdt;
    if (!sku || !name || !Number.isSafeInteger(quantity) || quantity < 1
        || typeof unitPriceUsdt !== "number" || !Number.isFinite(unitPriceUsdt) || unitPriceUsdt < 0
        || typeof lineAmountUsdt !== "number" || !Number.isFinite(lineAmountUsdt) || lineAmountUsdt < 0
        || Math.abs(quantity * unitPriceUsdt - lineAmountUsdt) > 0.000001) {
      throw new Error("ORDER_LINE_ITEMS_INVALID");
    }
    return { sku, name, quantity, unitPriceUsdt, lineAmountUsdt };
  });
  if (new Set(items.map((item) => item.sku)).size !== items.length) throw new Error("ORDER_LINE_ITEMS_INVALID");
  return items;
}
