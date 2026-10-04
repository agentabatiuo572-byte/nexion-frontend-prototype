import { describe, expect, it } from "vitest";
import { deriveGenesisTierRows } from "./genesis-tier-display";

const tiers = [
  { id: "t1", from: 0, to: 100, priceUSDT: 7999 },
  { id: "t2", from: 100, to: 550, priceUSDT: 9999 },
  { id: "t3", from: 550, to: 1000, priceUSDT: 11999 },
];

describe("Genesis tier display states", () => {
  it("keeps future tiers upcoming when nobody has purchased", () => {
    expect(deriveGenesisTierRows(tiers, 0).map(({ id, state }) => ({ id, state }))).toEqual([
      { id: "t1", state: "current" },
      { id: "t2", state: "upcoming" },
      { id: "t3", state: "upcoming" },
    ]);
  });

  it("marks only completed tiers sold as purchases progress", () => {
    expect(deriveGenesisTierRows(tiers, 100).map(({ id, state }) => ({ id, state }))).toEqual([
      { id: "t1", state: "sold" },
      { id: "t2", state: "current" },
      { id: "t3", state: "upcoming" },
    ]);
  });

  it("marks every tier sold only when total supply is exhausted", () => {
    expect(deriveGenesisTierRows(tiers, 1000).every(({ state }) => state === "sold")).toBe(true);
  });
});
