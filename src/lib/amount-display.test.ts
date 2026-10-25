import { describe, expect, it, vi } from "vitest";
import { formatAmount, formatGroupedAmount } from "./amount-display";

describe("amount display", () => {
  it('groups display amounts without Number coercion or changing the two-decimal rounding',()=>{
    expect(formatGroupedAmount('999999999999999999999999.995')).toBe('1,000,000,000,000,000,000,000,000.00');
    expect(formatGroupedAmount('-1299')).toBe('-1,299.00');expect(formatGroupedAmount(null)).toBe('-');
  });
  it("keeps two decimals when native number localization is unavailable", () => {
    const native = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(() => { throw new Error("UNAVAILABLE"); });
    try { expect(formatAmount("50.123456")).toBe("50.12"); expect(formatAmount(50)).toBe("50.00"); expect(native).not.toHaveBeenCalled(); }
    finally { native.mockRestore(); }
  });
  it.each([
    [50, "50.00"], ["200.000000", "200.00"], ["24.000000", "24.00"], ["176.000000", "176.00"],
    [0, "0.00"], ["0.000000", "0.00"], ["12.345678", "12.35"], ["99.995", "100.00"],
    [1.005, "1.01"], [-1.005, "-1.01"], ["-0.004999", "-0.00"], ["-0.000000", "0.00"], ["0.005000", "0.01"],
    [1e-7, "0.00"], [1e21, "1000000000000000000000.00"], [Number.MIN_VALUE, "0.00"],
    ["999999999999999999999999.995000", "1000000000000000000000000.00"],
  ] as const)("formats %s as %s without changing settlement precision", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });
  it.each([null, undefined, NaN, Infinity, -Infinity, "", "invalid", "1,000", "1e999999"])("keeps unavailable values distinct from zero: %s", (input) => {
    expect(formatAmount(input)).toBe("-");
  });
});
