import { describe, expect, it } from "vitest";
import { parseOrderLineItems } from "./order-line-items";

describe("canonical bundle line items", () => {
  it("accepts structured SKU lines with exact line totals", () => {
    expect(parseOrderLineItems([
      { sku: "RACK-P1", name: "Rack P1", quantity: 1, unitPriceUsdt: 120, lineAmountUsdt: 120 },
      { sku: "BOX-P2", name: "Box P2", quantity: 2, unitPriceUsdt: 30, lineAmountUsdt: 60 },
    ])).toEqual([
      { sku: "RACK-P1", name: "Rack P1", quantity: 1, unitPriceUsdt: 120, lineAmountUsdt: 120 },
      { sku: "BOX-P2", name: "Box P2", quantity: 2, unitPriceUsdt: 30, lineAmountUsdt: 60 },
    ]);
  });

  it("fails closed for free-form product summaries or inconsistent arithmetic", () => {
    expect(() => parseOrderLineItems(["RACK-P1 × 1"])).toThrow("ORDER_LINE_ITEMS_INVALID");
    expect(() => parseOrderLineItems([
      { sku: "RACK-P1", name: "Rack P1", quantity: 2, unitPriceUsdt: 120, lineAmountUsdt: 120 },
    ])).toThrow("ORDER_LINE_ITEMS_INVALID");
  });
});
