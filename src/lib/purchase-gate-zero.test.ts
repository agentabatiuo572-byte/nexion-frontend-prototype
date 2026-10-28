import { expect, test } from "vitest";
import { evaluatePurchaseGate, type PurchaseGate } from "@/mock/products";

test.each(["all", "either"] as const)("%s ignores zero minimums without bypassing a positive rank", mode => {
  const purchaseGate: PurchaseGate = { rankMin: 2, activeDirectMin: 0, teamComputePointsMin: 0, mode, enforce: true };
  const denied = evaluatePurchaseGate({ purchaseGate }, { rank: 1, activeDirect: 0, teamComputePoints: 0 });
  expect(denied.eligible).toBe(false);
  expect(denied.conditions.map(row => row.kind)).toEqual(["rank"]);
  expect(evaluatePurchaseGate({ purchaseGate }, { rank: 2, activeDirect: 0, teamComputePoints: 0 }).eligible).toBe(true);
  const zero = { ...purchaseGate, rankMin: 0 };
  expect(evaluatePurchaseGate({ purchaseGate: zero }, { rank: 0, activeDirect: 0, teamComputePoints: 0 })).toMatchObject({ eligible: true, blocked: false, conditions: [] });
  expect(evaluatePurchaseGate({ purchaseGate: { ...zero, quotaCap: 2, quotaSold: 2, quotaPeriod: "lifetime" } },
    { rank: 0, activeDirect: 0, teamComputePoints: 0 })).toMatchObject({ eligible: true, soldOut: true, blocked: true });
});
