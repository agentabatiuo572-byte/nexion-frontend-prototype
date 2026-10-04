import { describe, expect, it } from "vitest";
import { genesisOrderListItems } from "./genesis-order-list";

describe("Genesis orders list projection", () => {
  it("turns a canonical primary purchase into a paid order-list row", () => {
    expect(genesisOrderListItems([{
      orderNo: "GEN-SBX-1",
      orderType: "PRIMARY",
      quantity: 1,
      unitPriceUsdt: 10,
      amountUsdt: 10,
      royaltyUsdt: 0,
      completedAt: Date.parse("2026-08-27T00:00:00Z"),
    }], "创世节点", "数量")).toEqual([{
      kind: "genesis",
      id: "GEN-SBX-1",
      productName: "创世节点",
      quantity: 1,
      meta: "数量 × 1",
      total: 10,
      placedAt: Date.parse("2026-08-27T00:00:00Z"),
      status: "paid",
    }]);
  });
});
