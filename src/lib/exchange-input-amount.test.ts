import { describe, expect, it } from "vitest";

import { canonicalExchangeAmount, sanitizeExchangeAmountInput } from "./exchange-input-amount";

describe("exchange amount editing", () => {
  it("keeps a trailing decimal while a user types 1.2 one character at a time", () => {
    let input = "";
    for (const character of "1.2") input = sanitizeExchangeAmountInput(input + character);

    expect(input).toBe("1.2");
    expect(canonicalExchangeAmount(input)).toBe("1.2");
  });

  it("only rounds to the two-decimal ledger precision at a command boundary", () => {
    expect(sanitizeExchangeAmountInput("12.345")).toBe("12.345");
    expect(canonicalExchangeAmount("12.345")).toBe("12.35");
  });

  it.each([
    ["1.005", "1.01"],
    ["2.675", "2.68"],
    ["1.335", "1.34"],
  ])("rounds exact decimal text %s without binary floating-point loss", (input, expected) => {
    expect(canonicalExchangeAmount(input)).toBe(expected);
  });
});
