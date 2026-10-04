import { describe, expect, it } from "vitest";
import { restoreBundleCommand } from "./bundle-command";

describe("bundle command recovery", () => {
  it("reuses the frozen SKU order and quote after the cart is reordered", () => {
    expect(restoreBundleCommand(
      { key: "bundle:known", expectedAmountUsdt: 190.019, productNos: ["A", "B"] },
    )).toEqual({
      command: { key: "bundle:known", expectedAmountUsdt: 190.019, productNos: ["A", "B"] },
    });
  });

  it("marks this round's key-plus-amount row as recovery-only because its original SKU order is unknowable", () => {
    expect(restoreBundleCommand(
      { key: "bundle:current", expectedAmountUsdt: 190.019 },
    )).toEqual({
      recoveryKey: "bundle:current",
    });
  });

  it("marks a legacy string key as recovery-only without inventing an ordered payload", () => {
    expect(restoreBundleCommand("bundle:legacy")).toEqual({
      recoveryKey: "bundle:legacy",
    });
  });
});
